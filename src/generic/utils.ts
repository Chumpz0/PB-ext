/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import * as cheerio from "cheerio";

import type { ReadComicsGeneric } from "./main";
import type { OptionItem } from "./models";

const FILTER_CACHE_SECONDS = 604800; // 1 week

export class FilterPreferences {
  private categoryFilter: OptionItem[] = [];
  private statusFilter: OptionItem[] = [];
  private typeFilter: OptionItem[] = [];

  getCategoryFilter(): OptionItem[] {
    return this.categoryFilter;
  }

  getStatusFilter(): OptionItem[] {
    return this.statusFilter;
  }

  getTypeFilter(): OptionItem[] {
    return this.typeFilter;
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

  async populateFilters(source: ReadComicsGeneric, force = false): Promise<void> {
    const lastFetch = Number(Application.getState("last-filter-fetch") ?? 0);
    const cached = lastFetch + FILTER_CACHE_SECONDS > Date.now() / 1000;

    if (cached && !force) {
      const categories = Application.getState(".categories") as string | undefined;
      const status = Application.getState(".status") as string | undefined;
      const types = Application.getState(".types") as string | undefined;
      if (categories && status && types) {
        this.categoryFilter = JSON.parse(categories) as OptionItem[];
        this.statusFilter = JSON.parse(status) as OptionItem[];
        this.typeFilter = JSON.parse(types) as OptionItem[];
        return;
      }
    }

    const html = await source.requestManager.fetchPage(`${source.base_url}/advanced-search`);
    const $ = cheerio.load(html);

    this.categoryFilter = this.extractOptions($, "categories[]");
    this.statusFilter = this.extractOptions($, "status[]");
    this.typeFilter = this.extractOptions($, "types[]");

    Application.setState(JSON.stringify(this.categoryFilter), ".categories");
    Application.setState(JSON.stringify(this.statusFilter), ".status");
    Application.setState(JSON.stringify(this.typeFilter), ".types");
    Application.setState(String(Date.now() / 1000), "last-filter-fetch");
  }
}
