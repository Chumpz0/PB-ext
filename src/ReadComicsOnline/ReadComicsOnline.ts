/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  ContentRating,
  HomeSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type DUISection,
  type HomePageSectionsProviding,
  type HomeSection,
  type PagedResults,
  type Request,
  type RequestManager,
  type SearchRequest,
  type SearchResultsProviding,
  type SourceManga,
  type SourceStateManager,
  type TagSection,
} from "@paperback/types";
import type { CheerioAPI } from "cheerio";

import type { HomePageMetadata } from "../../common/models";
import { Requests } from "../../common/network";
import { Parsers } from "../../common/parsers";
import { FilterPreferences } from "../../common/utils";
import sourceInfo from "./pbconfig";

/**
 * The 0.8 app instantiates this class itself, passing in its own cheerio, and looks methods
 * up on this class directly. So: export the class (not an instance), keep every method an own
 * member of this class rather than an inherited one, and don't extend the deprecated `Source`
 * base class. Shared logic lives in common/ as plain collaborators, not a base class.
 */
export class ReadComicsOnline
  implements
    ChapterProviding,
    SearchResultsProviding,
    HomePageSectionsProviding,
    CloudflareBypassRequestProviding
{
  readonly requestManager: RequestManager;
  private readonly baseUrl = sourceInfo.websiteBaseURL;
  private readonly stateManager: SourceStateManager;
  private readonly requests: Requests;
  private readonly parsers: Parsers;
  private readonly filter: FilterPreferences;

  constructor(private readonly cheerio: CheerioAPI) {
    this.requestManager = App.createRequestManager({
      requestsPerSecond: 4,
      requestTimeout: 20_000,
      // Cloudflare challenges requests that don't look like a real browser, so send the
      // app's own user-agent and a same-site referer on everything.
      interceptor: {
        interceptRequest: async (request) => {
          request.headers = {
            // Spreading undefined is a no-op, so this stays safe if the app sends no headers.
            ...request.headers,
            "user-agent": await this.requestManager.getDefaultUserAgent(),
            referer: `${this.baseUrl}/`,
          };
          return request;
        },
        interceptResponse: async (response) => response,
      },
    });
    this.stateManager = App.createSourceStateManager();
    this.requests = new Requests(this.baseUrl, this.requestManager);
    this.parsers = new Parsers(this.cheerio);
    this.filter = new FilterPreferences(this.cheerio);
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/comic/${mangaId}`;
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await this.requests.getComicDetails(mangaId);
    const details = this.parsers.parseComicDetails(html);
    const sourceManga = this.parsers.buildMangaDetails(mangaId, details);
    sourceManga.mangaInfo.hentai = sourceInfo.contentRating !== ContentRating.EVERYONE;
    return sourceManga;
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const html = await this.requests.getComicDetails(mangaId);
    const entries = this.parsers.parseChapterList(html);
    return this.parsers.buildChapters(entries);
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const html = await this.requests.getChapterPage(mangaId, chapterId);
    const pages = this.parsers.parseChapterPages(html);
    return this.parsers.buildChapterDetails(mangaId, chapterId, pages);
  }

  async getSearchTags(): Promise<TagSection[]> {
    await this.filter.populateFilters(this.stateManager, () =>
      this.requests.getAdvancedSearchPage(),
    );
    return [
      App.createTagSection({
        id: "categories",
        label: "Categories",
        tags: this.filter
          .getCategoryFilter()
          .map((category) => App.createTag({ id: category.id, label: category.value })),
      }),
    ];
  }

  async supportsTagExclusion(): Promise<boolean> {
    return true;
  }

  async getSearchResults(
    query: SearchRequest,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    const page = metadata?.page ?? 1;

    if (query.title) {
      const suggestions = await this.requests.getSearchSuggestions(query.title);
      const items = this.parsers.parseSearchSuggestions(suggestions);
      return this.parsers.toPagedResults(items, undefined);
    }

    const includedCategoryIds = query.includedTags.map((tag) => tag.id);
    const excludedNames = new Set(query.excludedTags.map((tag) => tag.label));

    const html =
      includedCategoryIds.length > 0
        ? await this.requests.advancedSearch(page, includedCategoryIds)
        : await this.requests.getComicList(page);

    const items = this.parsers
      .parseComicGrid(html)
      .filter((item) => !item.subtitle || !excludedNames.has(item.subtitle));

    return this.parsers.toPagedResults(items, items.length > 0 ? { page: page + 1 } : undefined);
  }

  async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
    const updatesSection = App.createHomeSection({
      id: "updates_section",
      title: "Latest Updates",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
      items: [],
    });
    sectionCallback(updatesSection);

    const mostViewedSection = App.createHomeSection({
      id: "most_viewed_section",
      title: "Most Viewed",
      type: HomeSectionType.singleRowLarge,
      containsMoreItems: false,
      items: [],
    });
    sectionCallback(mostViewedSection);

    const updatesEntries = this.parsers.parseLatestReleases(
      await this.requests.getLatestReleases(1),
    );
    updatesSection.items = this.parsers.toPartialSourceMangas(
      updatesEntries.map(({ manga }) => manga),
    );
    sectionCallback(updatesSection);

    const mostViewed = this.parsers.parseComicGrid(await this.requests.getHomePage());
    mostViewedSection.items = this.parsers.toPartialSourceMangas(mostViewed);
    sectionCallback(mostViewedSection);
  }

  async getViewMoreItems(
    homepageSectionId: string,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    if (homepageSectionId !== "updates_section") {
      return App.createPagedResults({ results: [] });
    }

    const page = metadata?.page ?? 1;
    const entries = this.parsers.parseLatestReleases(await this.requests.getLatestReleases(page));
    return this.parsers.toPagedResults(
      entries.map(({ manga }) => manga),
      entries.length > 0 ? { page: page + 1 } : undefined,
    );
  }

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({ url: this.baseUrl, method: "GET" });
  }

  async getSourceMenu(): Promise<DUISection> {
    return App.createDUISection({
      id: "settings",
      isHidden: false,
      rows: async () => [
        App.createDUIButton({
          id: "reload_categories",
          label: "Reload Categories",
          onTap: async () => {
            await this.filter.populateFilters(
              this.stateManager,
              () => this.requests.getAdvancedSearchPage(),
              true,
            );
          },
        }),
      ],
    });
  }
}

export const ReadComicsOnlineInfo = sourceInfo;
