/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  BasicRateLimiter,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  type AdvancedSearchForm,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type Form,
  type MangaProviding,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SettingsFormProviding,
  type SourceManga,
} from "@paperback/types";

import { ReadComicsAdvancedSearchForm } from "./forms/search";
import { Forms } from "./forms/settings";
import type { ComicMetadata, ParsedComicSummary, SearchMetadata } from "./models";
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
  implements
    SettingsFormProviding,
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    CloudflareBypassRequestProviding
{
  readonly name: string;
  public base_url: string;
  public defaultContentRating: ContentRating;
  requestManager: Requests;
  mainRateLimiter: BasicRateLimiter;
  cookieInterceptor: CookieStorageInterceptor;

  protected constructor(params: GenericParams) {
    this.name = params.name;
    this.base_url = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.requestManager = new Requests();
    // Wait 1 sec after 4 requests, this site is more aggressive about rate limiting than most.
    this.mainRateLimiter = new BasicRateLimiter("main", {
      numberOfRequests: 4,
      bufferInterval: 1,
      ignoreImages: true,
    });
    this.cookieInterceptor = new CookieStorageInterceptor({ storage: "stateManager" });
  }

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.cookieInterceptor.registerInterceptor();
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    this.cookieInterceptor.cookies = [...this.cookieInterceptor.cookies, ...cookies];
  }

  async getSettingsForm(): Promise<Form> {
    await filter.populateFilters(this);
    return new Forms(this);
  }

  async getAdvancedSearchForm(query: SearchQuery<SearchMetadata>): Promise<AdvancedSearchForm> {
    await filter.populateFilters(this);
    return new ReadComicsAdvancedSearchForm(query);
  }

  private hasAdvancedFilters(metadata: SearchMetadata | undefined): boolean {
    if (!metadata) return false;
    return (
      Object.values(metadata.categories ?? {}).includes("included") ||
      (metadata.status?.length ?? 0) > 0 ||
      (metadata.types?.length ?? 0) > 0 ||
      !!metadata.year ||
      !!metadata.author
    );
  }

  private filterHiddenCategories(items: ParsedComicSummary[]): ParsedComicSummary[] {
    const hidden = (Application.getState("hide_categories") as string[] | undefined) ?? [];
    if (hidden.length === 0) return items;
    const hiddenNames = new Set(
      filter
        .getCategoryFilter()
        .filter((category) => hidden.includes(category.id))
        .map((category) => category.value),
    );
    return items.filter((item) => !item.subtitle || !hiddenNames.has(item.subtitle));
  }

  async getSearchResults(
    query: SearchQuery<SearchMetadata>,
    metadata: ComicMetadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;

    if (query.title.length > 0) {
      const suggestions = await this.requestManager.getSearchSuggestions(this, query.title);
      const items = parsers.parseSearchSuggestions(suggestions);
      return { items: parsers.toSearchResultItems(items), metadata: undefined };
    }

    const html = this.hasAdvancedFilters(query.metadata)
      ? await this.requestManager.advancedSearch(this, page, query.metadata ?? {})
      : await this.requestManager.getComicList(this, page);

    const items = this.filterHiddenCategories(parsers.parseComicGrid(html));
    return {
      items: parsers.toSearchResultItems(items),
      metadata: items.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const html = await this.requestManager.getComicDetails(this, mangaId);
    const details = parsers.parseComicDetails(html);
    const sourceManga = parsers.buildMangaDetails(
      mangaId,
      `${this.base_url}/comic/${mangaId}`,
      details,
    );
    sourceManga.mangaInfo.contentRating = this.defaultContentRating;
    return sourceManga;
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const html = await this.requestManager.getComicDetails(this, sourceManga.mangaId);
    const entries = parsers.parseChapterList(html);
    return parsers.buildChapters(sourceManga, entries);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const html = await this.requestManager.getChapterPage(
      this,
      chapter.sourceManga.mangaId,
      chapter.chapterId,
    );
    const pages = parsers.parseChapterPages(html);
    return parsers.buildChapterDetails(chapter.sourceManga.mangaId, chapter.chapterId, pages);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const sections: DiscoverSection[] = [];
    if ((Application.getState("updates_section_enabled") as boolean | undefined) ?? true) {
      sections.push({
        id: "updates_section",
        title: "Latest Updates",
        type: DiscoverSectionType.chapterUpdates,
      });
    }
    if ((Application.getState("most_viewed_section_enabled") as boolean | undefined) ?? true) {
      sections.push({
        id: "most_viewed_section",
        title: "Most Viewed",
        type: DiscoverSectionType.simpleCarousel,
      });
    }
    if ((Application.getState("categories_section_enabled") as boolean | undefined) ?? true) {
      sections.push({
        id: "categories_section",
        title: "Categories",
        type: DiscoverSectionType.genres,
      });
    }
    return sections;
  }

  private buildCategoryDiscoverItems(): DiscoverSectionItem[] {
    const hidden = (Application.getState("hide_categories") as string[] | undefined) ?? [];
    return filter
      .getCategoryFilter()
      .filter((category) => !hidden.includes(category.id))
      .map((category) => ({
        type: "genresCarouselItem",
        name: category.value,
        searchQuery: {
          title: "",
          metadata: { categories: { [category.id]: "included" as const } },
        },
      }));
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata?: ComicMetadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;

    switch (section.id) {
      case "updates_section": {
        const html = await this.requestManager.getLatestReleases(this, page);
        const entries = parsers.parseLatestReleases(html);
        const { items } = parsers.buildLatestUpdatesSection(entries, { page: page + 1 });
        return { items, metadata: entries.length > 0 ? { page: page + 1 } : undefined };
      }
      case "most_viewed_section": {
        if (page > 1) return { items: [] };
        const html = await this.requestManager.getHomePage(this);
        const items = this.filterHiddenCategories(parsers.parseComicGrid(html));
        return { items: parsers.toDiscoverSimpleItems(items) };
      }
      case "categories_section":
        await filter.populateFilters(this);
        return { items: this.buildCategoryDiscoverItems() };
      default:
        return { items: [] };
    }
  }
}
