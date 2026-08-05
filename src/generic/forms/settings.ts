/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { ButtonRow, Form, NavigationRow, Section, SelectRow, ToggleRow } from "@paperback/types";

import { filter, type ReadComicsGeneric } from "../main";

export class Forms extends Form {
  source: ReadComicsGeneric;

  constructor(source: ReadComicsGeneric) {
    super();
    this.source = source;
  }

  override getSections() {
    return [
      Section("settings", [
        NavigationRow("home", {
          title: "Home Sections",
          subtitle: "Show or hide discover sections",
          form: new HomeSettings(),
        }),
        NavigationRow("content", {
          title: "Content Filters",
          subtitle: "Hide categories from browsing and search",
          form: new ContentSettings(),
        }),
        ButtonRow("reload_filters", {
          title: "Reload Categories/Status/Types",
          onSelect: Application.Selector(this as Forms, "refreshFilters"),
        }),
      ]),
    ];
  }

  async refreshFilters(): Promise<void> {
    await filter.populateFilters(this.source, true);
  }
}

class ContentSettings extends Form {
  categories = filter.getCategoryFilter().map(({ value, ...rest }) => ({ title: value, ...rest }));

  override getSections() {
    return [
      Section(
        {
          id: "hide_categories",
          footer:
            "Hidden categories are removed from browsing, search results, and discover sections.",
        },
        [
          SelectRow("hide_categories", {
            title: "Hidden Categories",
            value: this.getHiddenCategories(),
            options: this.categories,
            minItemCount: 0,
            maxItemCount: this.categories.length,
            onValueChange: Application.Selector(
              this as ContentSettings,
              "handleHiddenCategoriesChange",
            ),
          }),
        ],
      ),
    ];
  }

  getHiddenCategories(): string[] {
    return (Application.getState("hide_categories") as string[] | undefined) ?? [];
  }

  async handleHiddenCategoriesChange(value: string[]): Promise<void> {
    Application.setState(value, "hide_categories");
    this.reloadForm();
  }
}

class HomeSettings extends Form {
  override getSections() {
    return [
      Section(
        {
          id: "home_settings",
          footer: "Toggle which sections appear on the Home tab.",
        },
        [
          ToggleRow("updates_section_enabled", {
            title: "Latest Updates",
            value: this.getToggle("updates_section_enabled"),
            onValueChange: Application.Selector(this as HomeSettings, "handleUpdatesToggle"),
          }),
          ToggleRow("most_viewed_section_enabled", {
            title: "Most Viewed",
            value: this.getToggle("most_viewed_section_enabled"),
            onValueChange: Application.Selector(this as HomeSettings, "handleMostViewedToggle"),
          }),
          ToggleRow("categories_section_enabled", {
            title: "Browse by Category",
            value: this.getToggle("categories_section_enabled"),
            onValueChange: Application.Selector(this as HomeSettings, "handleCategoriesToggle"),
          }),
        ],
      ),
    ];
  }

  getToggle(key: string): boolean {
    return (Application.getState(key) as boolean | undefined) ?? true;
  }

  private async setToggle(key: string, value: boolean): Promise<void> {
    Application.setState(value, key);
    this.reloadForm();
    Application.invalidateDiscoverSections();
  }

  async handleUpdatesToggle(value: boolean): Promise<void> {
    await this.setToggle("updates_section_enabled", value);
  }
  async handleMostViewedToggle(value: boolean): Promise<void> {
    await this.setToggle("most_viewed_section_enabled", value);
  }
  async handleCategoriesToggle(value: boolean): Promise<void> {
    await this.setToggle("categories_section_enabled", value);
  }
}
