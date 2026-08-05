/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { CloudflareError, URL, type Response } from "@paperback/types";

import type { ReadComicsGeneric } from "./main";
import type { SearchMetadata, SearchSuggestion } from "./models";

const CLOUDFLARE_CHALLENGE_MARKERS = [
  "cdn-cgi/challenge-platform",
  "Just a moment",
  "challenges.cloudflare.com",
];

function buildFormEncoded(pairs: [string, string][]): string {
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export class Requests {
  /**
   * The site returns a plain 403/503 HTML challenge page (not a normal error page) when
   * Cloudflare intercepts a request. That's the signal to ask the app to run the bypass flow.
   */
  private isChallengeResponse(response: Response, html: string): boolean {
    if (response.status !== 403 && response.status !== 503) return false;
    return CLOUDFLARE_CHALLENGE_MARKERS.some((marker) => html.includes(marker));
  }

  async fetchPage(
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> },
  ) {
    const [response, data] = await Application.scheduleRequest({
      url,
      method: init?.method ?? "GET",
      body: init?.body,
      headers: init?.headers,
    });
    const html = Application.arrayBufferToUTF8String(data);
    if (this.isChallengeResponse(response, html)) {
      throw new CloudflareError(
        { url, method: init?.method ?? "GET" },
        "Cloudflare challenge encountered",
      );
    }
    return html;
  }

  buildComicListUrl(source: ReadComicsGeneric, page: number, categoryId?: string): string {
    const url = new URL(source.base_url).addPathComponent("comic-list");
    url.setQueryItem("page", page.toString());
    if (categoryId) url.setQueryItem("cat", categoryId);
    return url.toString();
  }

  buildLatestReleaseUrl(source: ReadComicsGeneric, page: number): string {
    const url = new URL(source.base_url).addPathComponent("latest-release");
    url.setQueryItem("page", page.toString());
    return url.toString();
  }

  async getComicList(
    source: ReadComicsGeneric,
    page: number,
    categoryId?: string,
  ): Promise<string> {
    return this.fetchPage(this.buildComicListUrl(source, page, categoryId));
  }

  async getLatestReleases(source: ReadComicsGeneric, page: number): Promise<string> {
    return this.fetchPage(this.buildLatestReleaseUrl(source, page));
  }

  async getHomePage(source: ReadComicsGeneric): Promise<string> {
    return this.fetchPage(source.base_url);
  }

  async getComicDetails(source: ReadComicsGeneric, comicId: string): Promise<string> {
    return this.fetchPage(`${source.base_url}/comic/${comicId}`);
  }

  async getChapterPage(
    source: ReadComicsGeneric,
    comicId: string,
    chapterId: string,
  ): Promise<string> {
    return this.fetchPage(`${source.base_url}/comic/${comicId}/${chapterId}`);
  }

  /**
   * The site's search box hits a devbridge-autocomplete JSON endpoint directly, no CSRF
   * token required. This only supports a title keyword, not the advanced filters below.
   */
  async getSearchSuggestions(
    source: ReadComicsGeneric,
    query: string,
  ): Promise<SearchSuggestion[]> {
    const url = new URL(source.base_url).addPathComponent("search");
    url.setQueryItem("query", query);
    const raw = JSON.parse(await this.fetchPage(url.toString())) as
      | { suggestions?: SearchSuggestion[] }
      | SearchSuggestion[];
    return Array.isArray(raw) ? raw : (raw.suggestions ?? []);
  }

  /**
   * Advanced (filter-only) search posts to /advSearchFilter with a CSRF token that's
   * embedded directly in a <script> block on /advanced-search, so it has to be re-scraped
   * per request (no static meta[name=csrf-token] tag on this site).
   */
  private async getAdvancedSearchToken(source: ReadComicsGeneric): Promise<string> {
    const html = await this.fetchPage(`${source.base_url}/advanced-search`);
    const match = /_token:\s*'([^']+)'/.exec(html);
    if (!match?.[1]) {
      throw new Error("Unable to find the advanced search CSRF token");
    }
    return match[1];
  }

  async advancedSearch(
    source: ReadComicsGeneric,
    page: number,
    metadata: SearchMetadata,
  ): Promise<string> {
    const token = await this.getAdvancedSearchToken(source);

    const innerPairs: [string, string][] = [];
    for (const [id, state] of Object.entries(metadata.categories ?? {})) {
      if (state === "included") innerPairs.push(["categories[]", id]);
    }
    for (const status of metadata.status ?? []) innerPairs.push(["status[]", status]);
    for (const type of metadata.types ?? []) innerPairs.push(["types[]", type]);
    if (metadata.year) innerPairs.push(["release", metadata.year.toString()]);
    if (metadata.author) innerPairs.push(["author", metadata.author]);

    const body = buildFormEncoded([
      ["params", buildFormEncoded(innerPairs)],
      ["page", page.toString()],
      ["_token", token],
    ]);

    return this.fetchPage(`${source.base_url}/advSearchFilter`, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  }
}
