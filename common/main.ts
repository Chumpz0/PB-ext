/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  ContentRating,
  HomeSectionType,
  Source,
  type Chapter,
  type ChapterDetails,
  type CloudflareBypassRequestProviding,
  type DUISection,
  type HomePageSectionsProviding,
  type HomeSection,
  type PagedResults,
  type Request,
  type RequestManager,
  type SearchRequest,
  type SourceManga,
  type SourceStateManager,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

import type { HomePageMetadata } from "./models";
import { Requests } from "./network";
import { Parsers } from "./parsers";
import { FilterPreferences } from "./utils";

export const filter = new FilterPreferences();
export const parsers = new Parsers();

export interface GenericParams {
  name: string;
  domain: string;
  contentRating?: ContentRating;
}

export abstract class ReadComicsGeneric
  extends Source
  implements HomePageSectionsProviding, CloudflareBypassRequestProviding
{
  readonly name: string;
  readonly baseUrl: string;
  readonly defaultContentRating: ContentRating;
  private _requestManager?: RequestManager;
  private _requests?: Requests;
  private _stateManager?: SourceStateManager;

  protected constructor(params: GenericParams) {
    // The deprecated `Source` base class wants a loaded CheerioAPI instance; we never touch
    // `this.cheerio` (parsers.ts calls `cheerio.load()` directly), so this only satisfies the type.
    super(cheerio as unknown as CheerioAPI);
    this.name = params.name;
    this.baseUrl = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
  }

  /**
   * `App.*` factories only exist inside the app's JS runtime. The toolchain's own `bundle`
   * command evaluates this whole module in plain Node just to read metadata off the
   * `...Info` export, so nothing in the constructor may touch `App` — these have to stay
   * lazy and only run once a real request is made from inside the app.
   */
  override get requestManager(): RequestManager {
    this._requestManager ??= App.createRequestManager({
      requestsPerSecond: 4,
      requestTimeout: 20_000,
    });
    return this._requestManager;
  }

  private get requests(): Requests {
    this._requests ??= new Requests(this.baseUrl, this.requestManager);
    return this._requests;
  }

  private get stateManager(): SourceStateManager {
    this._stateManager ??= App.createSourceStateManager();
    return this._stateManager;
  }

  override getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/comic/${mangaId}`;
  }

  override async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await this.requests.getComicDetails(mangaId);
    const details = parsers.parseComicDetails(html);
    const sourceManga = parsers.buildMangaDetails(mangaId, details);
    sourceManga.mangaInfo.hentai = this.defaultContentRating !== ContentRating.EVERYONE;
    return sourceManga;
  }

  override async getChapters(mangaId: string): Promise<Chapter[]> {
    const html = await this.requests.getComicDetails(mangaId);
    const entries = parsers.parseChapterList(html);
    return parsers.buildChapters(entries);
  }

  override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const html = await this.requests.getChapterPage(mangaId, chapterId);
    const pages = parsers.parseChapterPages(html);
    return parsers.buildChapterDetails(mangaId, chapterId, pages);
  }

  override async getSearchTags(): Promise<TagSection[]> {
    await filter.populateFilters(this.stateManager, () => this.requests.getAdvancedSearchPage());
    return [
      App.createTagSection({
        id: "categories",
        label: "Categories",
        tags: filter
          .getCategoryFilter()
          .map((category) => App.createTag({ id: category.id, label: category.value })),
      }),
    ];
  }

  override async supportsTagExclusion(): Promise<boolean> {
    return true;
  }

  override async getSearchResults(
    query: SearchRequest,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    const page = metadata?.page ?? 1;

    if (query.title) {
      const suggestions = await this.requests.getSearchSuggestions(query.title);
      const items = parsers.parseSearchSuggestions(suggestions);
      return parsers.toPagedResults(items, undefined);
    }

    const includedCategoryIds = query.includedTags.map((tag) => tag.id);
    const excludedNames = new Set(query.excludedTags.map((tag) => tag.label));

    const html =
      includedCategoryIds.length > 0
        ? await this.requests.advancedSearch(page, includedCategoryIds)
        : await this.requests.getComicList(page);

    const items = parsers
      .parseComicGrid(html)
      .filter((item) => !item.subtitle || !excludedNames.has(item.subtitle));

    return parsers.toPagedResults(items, items.length > 0 ? { page: page + 1 } : undefined);
  }

  override async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
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

    const updatesEntries = parsers.parseLatestReleases(await this.requests.getLatestReleases(1));
    updatesSection.items = parsers.toPartialSourceMangas(updatesEntries.map(({ manga }) => manga));
    sectionCallback(updatesSection);

    const mostViewed = parsers.parseComicGrid(await this.requests.getHomePage());
    mostViewedSection.items = parsers.toPartialSourceMangas(mostViewed);
    sectionCallback(mostViewedSection);
  }

  override async getViewMoreItems(
    homepageSectionId: string,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    if (homepageSectionId !== "updates_section") {
      return App.createPagedResults({ results: [] });
    }

    const page = metadata?.page ?? 1;
    const entries = parsers.parseLatestReleases(await this.requests.getLatestReleases(page));
    return parsers.toPagedResults(
      entries.map(({ manga }) => manga),
      entries.length > 0 ? { page: page + 1 } : undefined,
    );
  }

  override async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({ url: this.baseUrl, method: "GET" });
  }

  override async getSourceMenu(): Promise<DUISection> {
    return App.createDUISection({
      id: "settings",
      isHidden: false,
      rows: async () => [
        App.createDUIButton({
          id: "reload_categories",
          label: "Reload Categories",
          onTap: async () => {
            await filter.populateFilters(
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
