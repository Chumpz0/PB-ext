/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  ContentRating,
  SourceIntents,
  type ExtensionInfo,
  type SourceDeveloper,
} from "@paperback/types";

const BASE_VERSION = "0.1.0";

export const basePbConfig = {
  name: "",
  description: "",
  version: BASE_VERSION,
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE as ContentRating,
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [{ name: "Chris Walker" }] as SourceDeveloper[],
} satisfies ExtensionInfo;
