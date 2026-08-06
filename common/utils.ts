/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { type SourceStateManager } from "@paperback/types";
import * as cheerio from "cheerio";

import type { OptionItem } from "./models";

const FILTER_CACHE_SECONDS = 604800; // 1 week

export class FilterPreferences {
  private categoryFilter: OptionItem[] = [];

  getCategoryFilter(): OptionItem[] {
    return this.categoryFilter;
  }

  private extractOptions($: cheerio.CheerioAPI, selectName: string): OptionItem[] {
    const options: OptionItem[] = [];
    $(`select[name="${selectName}"] option`).each((_, el) => {
      const id = $(el).attr("value");
      const value = $(el).text().trim();
      if (id) options.push({ id, value });
    });
    return options;
  }

  async populateFilters(
    stateManager: SourceStateManager,
    fetchAdvancedSearchPage: () => Promise<string>,
    force = false,
  ): Promise<void> {
    const lastFetch = Number((await stateManager.retrieve("last-filter-fetch")) ?? 0);
    const cached = lastFetch + FILTER_CACHE_SECONDS > Date.now() / 1000;

    if (cached && !force) {
      const categories = (await stateManager.retrieve(".categories")) as OptionItem[] | undefined;
      if (categories) {
        this.categoryFilter = categories;
        return;
      }
    }

    const html = await fetchAdvancedSearchPage();
    const $ = cheerio.load(html);
    this.categoryFilter = this.extractOptions($, "categories[]");

    await stateManager.store(".categories", this.categoryFilter);
    await stateManager.store("last-filter-fetch", Date.now() / 1000);
  }
}
