/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  HomeSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type HomePageSectionsProviding,
  type HomeSection,
  type PagedResults,
  type Request,
  type RequestManager,
  type SearchRequest,
  type SearchResultsProviding,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import type { CheerioAPI } from "cheerio";

import type { HomePageMetadata } from "../../common/models";
import { Requests } from "../../common/network";
import { Parsers } from "../../common/parsers";
import sourceInfo from "./pbconfig";

/**
 * The 0.8 app instantiates this class itself, passing in its own cheerio, and looks methods
 * up on this class directly. So: export the class (not an instance), keep every method an own
 * member of this class rather than an inherited one, and don't extend the deprecated `Source`
 * base class. Shared logic lives in common/ as plain collaborators, not a base class.
 */
export class XoxoComic
  implements
    ChapterProviding,
    SearchResultsProviding,
    HomePageSectionsProviding,
    CloudflareBypassRequestProviding
{
  readonly requestManager: RequestManager;
  private readonly baseUrl = sourceInfo.websiteBaseURL;
  private readonly requests: Requests;
  private readonly parsers: Parsers;

  constructor(private readonly cheerio: CheerioAPI) {
    this.requestManager = App.createRequestManager({
      requestsPerSecond: 4,
      requestTimeout: 20_000,
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
    this.requests = new Requests(this.baseUrl, this.requestManager);
    this.parsers = new Parsers(this.cheerio);
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/comic/${mangaId}`;
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await this.requests.getComicDetails(mangaId);
    return this.parsers.buildMangaDetails(mangaId, this.parsers.parseComicDetails(html));
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const html = await this.requests.getComicDetails(mangaId);
    return this.parsers.buildChapters(this.parsers.parseChapterList(html));
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const html = await this.requests.getChapterPages(mangaId, chapterId);
    const pages = this.parsers.parseChapterPages(html);
    return this.parsers.buildChapterDetails(mangaId, chapterId, pages);
  }

  async getSearchTags(): Promise<TagSection[]> {
    const html = await this.requests.getHomePage();
    return [
      App.createTagSection({
        id: "genres",
        label: "Genres",
        tags: this.parsers
          .parseGenres(html)
          .map((genre) => App.createTag({ id: genre.id, label: genre.value })),
      }),
    ];
  }

  async getSearchResults(
    query: SearchRequest,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    const page = metadata?.page ?? 1;
    const nextPage = { page: page + 1 };

    if (query.title) {
      const html = await this.requests.search(query.title, page);
      const items = this.parsers.parseSearchResults(html);
      return this.parsers.toPagedResults(items, items.length > 0 ? nextPage : undefined);
    }

    // Genres are their own listing pages, so only the first selected tag can be applied.
    const genreId = query.includedTags[0]?.id;
    const html = genreId
      ? await this.requests.getGenreListing(genreId, page)
      : await this.requests.getComicList(page);

    const items = this.parsers.parseComicRows(html);
    return this.parsers.toPagedResults(items, items.length > 0 ? nextPage : undefined);
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

    const browseSection = App.createHomeSection({
      id: "browse_section",
      title: "All Comics",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
      items: [],
    });
    sectionCallback(browseSection);

    const updates = this.parsers.parseLatestUpdates(await this.requests.getComicUpdates(1));
    updatesSection.items = this.parsers.toPartialSourceMangas(updates.map(({ manga }) => manga));
    sectionCallback(updatesSection);

    const browse = this.parsers.parseComicRows(await this.requests.getComicList(1));
    browseSection.items = this.parsers.toPartialSourceMangas(browse);
    sectionCallback(browseSection);
  }

  async getViewMoreItems(
    homepageSectionId: string,
    metadata: HomePageMetadata | undefined,
  ): Promise<PagedResults> {
    const page = metadata?.page ?? 1;
    const nextPage = { page: page + 1 };

    if (homepageSectionId === "updates_section") {
      const updates = this.parsers.parseLatestUpdates(await this.requests.getComicUpdates(page));
      return this.parsers.toPagedResults(
        updates.map(({ manga }) => manga),
        updates.length > 0 ? nextPage : undefined,
      );
    }

    if (homepageSectionId === "browse_section") {
      const items = this.parsers.parseComicRows(await this.requests.getComicList(page));
      return this.parsers.toPagedResults(items, items.length > 0 ? nextPage : undefined);
    }

    return App.createPagedResults({ results: [] });
  }

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({ url: this.baseUrl, method: "GET" });
  }
}

export const XoxoComicInfo = sourceInfo;
