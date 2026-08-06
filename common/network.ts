/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { type Request, type RequestManager } from "@paperback/types";

import type { SearchSuggestion } from "./models";

function buildFormEncoded(pairs: [string, string][]): string {
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export class Requests {
  constructor(
    private readonly baseUrl: string,
    private readonly requestManager: RequestManager,
  ) {}

  private async fetch(
    url: string,
    init?: { method?: string; data?: string; headers?: Record<string, string> },
  ): Promise<string> {
    const request: Request = App.createRequest({
      url,
      method: init?.method ?? "GET",
      data: init?.data,
      headers: init?.headers,
    });
    const response = await this.requestManager.schedule(request, 3);
    return response.data ?? "";
  }

  async getComicList(page: number, categoryId?: string): Promise<string> {
    const query = categoryId ? `page=${page}&cat=${categoryId}` : `page=${page}`;
    return this.fetch(`${this.baseUrl}/comic-list?${query}`);
  }

  async getLatestReleases(page: number): Promise<string> {
    return this.fetch(`${this.baseUrl}/latest-release?page=${page}`);
  }

  async getHomePage(): Promise<string> {
    return this.fetch(this.baseUrl);
  }

  async getComicDetails(comicId: string): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic/${comicId}`);
  }

  async getChapterPage(comicId: string, chapterId: string): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic/${comicId}/${chapterId}`);
  }

  /**
   * The site's search box hits a devbridge-autocomplete JSON endpoint directly, no CSRF
   * token required. This only supports a title keyword, not the category filters below.
   */
  async getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
    const raw = JSON.parse(
      await this.fetch(`${this.baseUrl}/search?query=${encodeURIComponent(query)}`),
    ) as { suggestions?: SearchSuggestion[] } | SearchSuggestion[];
    return Array.isArray(raw) ? raw : (raw.suggestions ?? []);
  }

  async getAdvancedSearchPage(): Promise<string> {
    return this.fetch(`${this.baseUrl}/advanced-search`);
  }

  /**
   * Category (tag) filtered search posts to /advSearchFilter with a CSRF token that's
   * embedded directly in a <script> block on /advanced-search, so it has to be re-scraped
   * per request (no static meta[name=csrf-token] tag on this site).
   */
  private async getAdvancedSearchToken(): Promise<string> {
    const html = await this.getAdvancedSearchPage();
    const match = /_token:\s*'([^']+)'/.exec(html);
    if (!match?.[1]) {
      throw new Error("Unable to find the advanced search CSRF token");
    }
    return match[1];
  }

  async advancedSearch(page: number, categoryIds: string[]): Promise<string> {
    const token = await this.getAdvancedSearchToken();

    const innerPairs: [string, string][] = categoryIds.map((id) => ["categories[]", id]);
    const body = buildFormEncoded([
      ["params", buildFormEncoded(innerPairs)],
      ["page", page.toString()],
      ["_token", token],
    ]);

    return this.fetch(`${this.baseUrl}/advSearchFilter`, {
      method: "POST",
      data: body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  }
}
