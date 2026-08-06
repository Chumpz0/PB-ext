/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { type Request, type RequestManager } from "@paperback/types";

export class Requests {
  constructor(
    private readonly baseUrl: string,
    private readonly requestManager: RequestManager,
  ) {}

  private async fetch(url: string): Promise<string> {
    const request: Request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 3);

    // Surface blocks explicitly; otherwise the parsers just find nothing in an error page
    // and every section renders empty with no hint of what went wrong.
    if (response.status === 403 || response.status === 503) {
      throw new Error(
        `CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${this.baseUrl}> and press the cloud icon.`,
      );
    }
    if (response.status === 404) {
      throw new Error(`The requested page ${url} was not found!`);
    }

    return response.data ?? "";
  }

  getHomePage(): Promise<string> {
    return this.fetch(this.baseUrl);
  }

  /** Alphabetical browse listing. */
  getComicList(page: number): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic-list?page=${page}`);
  }

  /** Recently updated comics, newest first. */
  getComicUpdates(page: number): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic-update?page=${page}`);
  }

  /** Genre listings live at their own top-level path, e.g. /action-comic. */
  getGenreListing(genreId: string, page: number): Promise<string> {
    return this.fetch(`${this.baseUrl}/${genreId}?page=${page}`);
  }

  search(keyword: string, page: number): Promise<string> {
    return this.fetch(
      `${this.baseUrl}/search-comic?keyword=${encodeURIComponent(keyword)}&page=${page}`,
    );
  }

  getComicDetails(comicId: string): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic/${comicId}`);
  }

  /**
   * The reader paginates one image per URL, but appending /all renders every page of the
   * issue in a single document, so a chapter costs one request instead of one per page.
   */
  getChapterPages(comicId: string, chapterId: string): Promise<string> {
    return this.fetch(`${this.baseUrl}/comic/${comicId}/${chapterId}/all`);
  }
}
