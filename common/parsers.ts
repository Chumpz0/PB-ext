/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  type Chapter,
  type ChapterDetails,
  type PagedResults,
  type PartialSourceManga,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import type { CheerioAPI } from "cheerio";

import type {
  OptionItem,
  ParsedChapterEntry,
  ParsedComicDetails,
  ParsedComicSummary,
} from "./models";

/** The markup indents multi-value fields across lines, so collapse runs of whitespace. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * These share the genre URL shape (/<name>-comic) but are navigation filters, not genres.
 */
const NON_GENRE_IDS = new Set([
  "hot-comic",
  "follow-comic",
  "new-comic",
  "popular-comic",
  "completed-comic",
  "ongoing-comic",
]);

/** Covers are lazy-loaded: `src` holds a placeholder, the real URL is in `data-original`. */
function imageFrom($img: { attr(name: string): string | undefined }): string {
  const src = ($img.attr("data-original") ?? $img.attr("src") ?? "").trim();
  return src.startsWith("data:") ? "" : src;
}

/** `https://host/comic/absolute-catwoman` -> `absolute-catwoman` */
function comicIdFromHref(href: string): string {
  const after = href.split("/comic/")[1] ?? "";
  return (after.split("?")[0] ?? "").replace(/\/$/, "").split("/")[0] ?? "";
}

/** `https://host/comic/absolute-catwoman/issue-1` -> `issue-1` */
function chapterIdFromHref(href: string): string {
  const after = href.split("/comic/")[1] ?? "";
  const parts = (after.split("?")[0] ?? "").replace(/\/$/, "").split("/");
  return parts[1] ?? "";
}

function chapterNumberFrom(text: string): number {
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  return match?.[1] ? Number(match[1]) : 0;
}

/** Dates render as MM/DD/YYYY. */
function parseDate(text: string): Date | undefined {
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text.trim());
  if (!match) return undefined;
  const parsed = new Date(`${match[3]}-${match[1]}-${match[2]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export class Parsers {
  /**
   * cheerio is injected by the app rather than bundled: the 0.8 runtime hands each source
   * its own instance through the source constructor, and bundling a second copy bloats the
   * output and risks shipping syntax the app's JS engine can't parse.
   */
  constructor(private readonly cheerio: CheerioAPI) {}

  /**
   * Row listings (/comic-list, /comic-update, genre pages) share one shape: an `li.row`
   * holding the comic link plus a hidden hover tooltip that carries the cover image.
   */
  parseComicRows(html: string): ParsedComicSummary[] {
    const $ = this.cheerio.load(html);
    const items: ParsedComicSummary[] = [];

    $("li.row").each((_, el) => {
      const $el = $(el);
      const link = $el.find("h3 a").first();
      const id = comicIdFromHref(link.attr("href") ?? "");
      if (!id) return;

      items.push({
        id,
        title: normalize(link.text()),
        imageUrl: imageFrom($el.find(".box_tootip .box_img img").first()),
        subtitle: normalize($el.find(".col-xs-3").first().text()) || undefined,
      });
    });

    return items;
  }

  /** Search results use a card grid rather than the row layout. */
  parseSearchResults(html: string): ParsedComicSummary[] {
    const $ = this.cheerio.load(html);
    const items: ParsedComicSummary[] = [];

    $(".item").each((_, el) => {
      const $el = $(el);
      const link = $el.find("figcaption h3 a").first();
      const id = comicIdFromHref(link.attr("href") ?? "");
      if (!id) return;

      items.push({
        id,
        title: normalize(link.text()),
        imageUrl: imageFrom($el.find(".image img").first()),
      });
    });

    return items;
  }

  /** /comic-update rows also carry the newest issue, used for the chapter-updates section. */
  parseLatestUpdates(html: string): { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[] {
    const $ = this.cheerio.load(html);
    const results: { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[] = [];

    $("li.row").each((_, el) => {
      const $el = $(el);
      const comicLink = $el.find("h3 a").first();
      const comicId = comicIdFromHref(comicLink.attr("href") ?? "");
      if (!comicId) return;

      const chapterLink = $el.find(".hlb-list a").first();
      const chapterHref = chapterLink.attr("href") ?? "";
      const chapterId = chapterIdFromHref(chapterHref);
      if (!chapterId) return;

      results.push({
        manga: {
          id: comicId,
          title: normalize(comicLink.text()),
          imageUrl: imageFrom($el.find(".box_tootip .box_img img").first()),
        },
        chapter: {
          id: chapterId,
          chapterNum: chapterNumberFrom(chapterId),
          title: normalize(chapterLink.text()),
          publishDate: parseDate($el.find(".col-xs-3").first().text()),
        },
      });
    });

    return results;
  }

  /** Genre links are plain top-level paths, e.g. /action-comic. */
  parseGenres(html: string): OptionItem[] {
    const $ = this.cheerio.load(html);
    const seen = new Set<string>();
    const genres: OptionItem[] = [];

    $("a[href*='-comic']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href") ?? "";
      if (href.includes("/comic/") || href.includes("comic-list")) return;

      const id = (href.split("/").pop() ?? "").split("?")[0] ?? "";
      const label = normalize($el.text());
      if (!id.endsWith("-comic") || !label || seen.has(id) || NON_GENRE_IDS.has(id)) return;

      seen.add(id);
      genres.push({ id, value: label });
    });

    return genres;
  }

  parseComicDetails(html: string): ParsedComicDetails {
    const $ = this.cheerio.load(html);
    const info = $(".detail-info");

    const genres: OptionItem[] = [];
    info.find("li.kind a").each((_, el) => {
      const $el = $(el);
      const id = ($el.attr("href") ?? "").split("/").pop() ?? "";
      const label = normalize($el.text());
      if (id && label) genres.push({ id, value: label });
    });

    const altName = normalize(info.find("li.othername .other-name").text());

    return {
      // The heading is "<Name> Comic"; drop the suffix the site appends.
      title: $("h1.title-detail")
        .first()
        .text()
        .trim()
        .replace(/Comic$/i, "")
        .trim(),
      imageUrl: imageFrom(info.find(".col-image img").first()),
      synopsis: normalize($(".detail-content p").first().text()),
      author: normalize(info.find("li.author p.col-xs-8").text()) || undefined,
      status: normalize(info.find("li.status p.col-xs-8").text()) || undefined,
      genres,
      altTitles: altName ? [altName] : [],
    };
  }

  parseChapterList(html: string): ParsedChapterEntry[] {
    const $ = this.cheerio.load(html);
    const entries: ParsedChapterEntry[] = [];

    $(".list-chapter li.row").each((_, el) => {
      const $el = $(el);
      const link = $el.find(".chapter a").first();
      const id = chapterIdFromHref(link.attr("href") ?? "");
      if (!id) return;

      const title = normalize(link.text());
      entries.push({
        id,
        chapterNum: chapterNumberFrom(title) || chapterNumberFrom(id),
        title,
        publishDate: parseDate($el.find(".col-xs-3").first().text()),
      });
    });

    return entries;
  }

  /** Requires the /all view; each page image keeps its URL in `data-original`. */
  parseChapterPages(html: string): string[] {
    const $ = this.cheerio.load(html);
    return $(".page-chapter img")
      .map((_, img) => imageFrom($(img)))
      .get()
      .filter((src) => src.length > 0);
  }

  toPartialSourceMangas(items: ParsedComicSummary[]): PartialSourceManga[] {
    return items.map((item) =>
      App.createPartialSourceManga({
        mangaId: item.id,
        title: item.title,
        image: item.imageUrl,
        subtitle: item.subtitle,
      }),
    );
  }

  toPagedResults(items: ParsedComicSummary[], metadata: unknown): PagedResults {
    return App.createPagedResults({ results: this.toPartialSourceMangas(items), metadata });
  }

  buildMangaDetails(comicId: string, details: ParsedComicDetails): SourceManga {
    const tagSections: TagSection[] = [
      App.createTagSection({
        id: "genres",
        label: "Genres",
        tags: details.genres.map((genre) => App.createTag({ id: genre.id, label: genre.value })),
      }),
    ];
    return App.createSourceManga({
      id: comicId,
      mangaInfo: App.createMangaInfo({
        image: details.imageUrl,
        author: details.author,
        artist: details.author,
        desc: details.synopsis,
        status: details.status ?? "Unknown",
        hentai: false,
        titles: [details.title, ...details.altTitles],
        tags: tagSections,
      }),
    });
  }

  buildChapters(entries: ParsedChapterEntry[]): Chapter[] {
    return entries.map((entry, index) =>
      App.createChapter({
        id: entry.id,
        chapNum: entry.chapterNum,
        name: entry.title,
        time: entry.publishDate,
        langCode: "🇬🇧",
        sortingIndex: index,
      }),
    );
  }

  buildChapterDetails(mangaId: string, chapterId: string, pages: string[]): ChapterDetails {
    return App.createChapterDetails({ id: chapterId, mangaId, pages });
  }
}
