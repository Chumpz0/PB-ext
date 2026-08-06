/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

export type OptionItem = {
  id: string;
  value: string;
};

export interface ParsedComicSummary {
  id: string;
  title: string;
  imageUrl: string;
  subtitle?: string;
}

export interface ParsedChapterEntry {
  id: string;
  chapterNum: number;
  title: string;
  publishDate?: Date;
}

export interface ParsedComicDetails {
  title: string;
  imageUrl: string;
  synopsis: string;
  author?: string;
  status?: string;
  type?: string;
  genres: OptionItem[];
  rating?: number;
}

export interface SearchSuggestion {
  value: string;
  data: string;
}

export type HomePageMetadata = {
  page: number;
};
