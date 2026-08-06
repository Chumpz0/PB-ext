/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { ContentRating, SourceIntents, type SourceInfo } from "@paperback/types";

const BASE_VERSION = "0.1.0";

export const baseSourceInfo = {
  name: "",
  description: "",
  version: BASE_VERSION,
  icon: "icon.png",
  author: "Chris Walker",
  language: "en",
  contentRating: ContentRating.EVERYONE as ContentRating,
  websiteBaseURL: "",
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED |
    SourceIntents.SETTINGS_UI,
} satisfies SourceInfo;
