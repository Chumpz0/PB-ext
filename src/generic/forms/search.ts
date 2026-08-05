/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  AdvancedSearchForm,
  InputRow,
  type FormSectionElement,
  type SearchQuery,
  Section,
  SelectRow,
  StepperRow,
  TriStateSelectRow,
} from "@paperback/types";

import { filter } from "../main";
import type { SearchMetadata } from "../models";

export class ReadComicsAdvancedSearchForm extends AdvancedSearchForm {
  private searchMetadata: SearchMetadata;

  constructor(searchQuery: SearchQuery<SearchMetadata>) {
    super();
    this.searchMetadata = searchQuery.metadata ?? {};
  }

  override getSearchQueryMetadata(): SearchMetadata {
    return this.searchMetadata;
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("categories", [
        TriStateSelectRow("categories", {
          title: "Categories",
          value: this.searchMetadata.categories ?? {},
          layout: "list",
          allowExclusion: false,
          allowEmptySelection: true,
          items: filter.getCategoryFilter().map((item) => ({ id: item.id, title: item.value })),
          onValueChange: Application.Selector(
            this as ReadComicsAdvancedSearchForm,
            "handleCategoriesChange",
          ),
        }),
      ]),
      Section("status", [
        SelectRow("status", {
          title: "Status",
          value: this.searchMetadata.status ?? [],
          layout: "list",
          minItemCount: 0,
          maxItemCount: filter.getStatusFilter().length,
          items: filter.getStatusFilter().map((item) => ({ id: item.id, title: item.value })),
          onValueChange: Application.Selector(
            this as ReadComicsAdvancedSearchForm,
            "handleStatusChange",
          ),
        }),
      ]),
      Section("types", [
        SelectRow("types", {
          title: "Types",
          value: this.searchMetadata.types ?? [],
          layout: "list",
          minItemCount: 0,
          maxItemCount: filter.getTypeFilter().length,
          items: filter.getTypeFilter().map((item) => ({ id: item.id, title: item.value })),
          onValueChange: Application.Selector(
            this as ReadComicsAdvancedSearchForm,
            "handleTypesChange",
          ),
        }),
      ]),
      Section("year", [
        StepperRow("year", {
          title: "Year of release",
          value: this.searchMetadata.year ?? 0,
          minValue: 0,
          maxValue: new Date().getFullYear(),
          stepValue: 1,
          loopOver: false,
          onValueChange: Application.Selector(
            this as ReadComicsAdvancedSearchForm,
            "handleYearChange",
          ),
        }),
      ]),
      Section("author", [
        InputRow("author", {
          title: "Author",
          value: this.searchMetadata.author ?? "",
          onValueChange: Application.Selector(
            this as ReadComicsAdvancedSearchForm,
            "handleAuthorChange",
          ),
        }),
      ]),
    ];
  }

  async handleCategoriesChange(value: Record<string, "included" | "excluded">): Promise<void> {
    this.searchMetadata.categories = value;
  }
  async handleStatusChange(value: string[]): Promise<void> {
    this.searchMetadata.status = value;
  }
  async handleTypesChange(value: string[]): Promise<void> {
    this.searchMetadata.types = value;
  }
  async handleYearChange(value: number): Promise<void> {
    this.searchMetadata.year = value;
  }
  async handleAuthorChange(value: string): Promise<void> {
    this.searchMetadata.author = value;
  }
}
