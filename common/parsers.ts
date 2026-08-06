/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  type Chapter,
  type ChapterDetails,
  type HomeSection,
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
  SearchSuggestion,
} from "./models";

function absoluteImageUrl(src: string): string {
  const trimmed = src.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
}

function slugFromComicHref(href: string): string {
  const afterComic = href.split("/comic/")[1] ?? "";
  return (afterComic.split("?")[0] ?? "").replace(/\/$/, "");
}

// Dates on the site render like "20 Mar. 2025" or relative strings like "Yesterday".
function parseChapterDate(text: string): Date {
  const cleaned = text.trim();
  if (/yesterday/i.test(cleaned)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }
  if (/today/i.test(cleaned) || !cleaned) return new Date();
  const parsed = new Date(cleaned.replace(".", ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export class Parsers {
  /**
   * cheerio is injected by the app rather than bundled: the 0.8 runtime hands each source
   * its own instance through the source constructor, and bundling a second copy bloats the
   * output and risks shipping syntax the app's JS engine can't parse.
   */
  constructor(private readonly cheerio: CheerioAPI) {}

  /**
   * Shared by /comic-list and the homepage "Most Viewed" widget: both render
   * comics as `.media` blocks with a title link and (usually) a cover image.
   */
  parseComicGrid(html: string): ParsedComicSummary[] {
    const $ = this.cheerio.load(html);
    const items: ParsedComicSummary[] = [];

    $(".media").each((_, el) => {
      const $el = $(el);
      const link = $el.find(".media-heading a").first();
      const id = slugFromComicHref(link.attr("href") ?? "");
      if (!id) return;

      let subtitle: string | undefined;
      $el.find(".media-body > div").each((__, div) => {
        const $div = $(div);
        if ($div.attr("id") || $div.find("a, i.fa-eye").length > 0) return;
        const text = $div.text().trim();
        if (text) subtitle = text;
      });

      items.push({
        id,
        title: link.text().trim(),
        imageUrl: absoluteImageUrl($el.find(".media-left img").attr("src") ?? ""),
        subtitle,
      });
    });

    return items;
  }

  parseSearchSuggestions(suggestions: SearchSuggestion[]): ParsedComicSummary[] {
    return suggestions.map((suggestion) => ({
      id: suggestion.data,
      title: this.cheerio.load(suggestion.value).text().trim(),
      imageUrl: "",
    }));
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

  parseLatestReleases(html: string): { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[] {
    const $ = this.cheerio.load(html);
    const results: { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[] = [];

    $(".manga-item").each((_, el) => {
      const $el = $(el);
      const mangaLink = $el.find(".manga-heading a").first();
      const mangaId = slugFromComicHref(mangaLink.attr("href") ?? "");
      if (!mangaId) return;

      const chapterLink = $el.find(".manga-chapter a").first();
      const chapterId = (chapterLink.attr("href") ?? "").split("/").pop() ?? "";

      results.push({
        manga: { id: mangaId, title: mangaLink.text().trim(), imageUrl: "" },
        chapter: {
          id: chapterId,
          chapterNum: Number(chapterId) || 0,
          title: chapterLink.text().trim(),
          publishDate: parseChapterDate($el.find("h3.manga-heading + small").first().text()),
        },
      });
    });

    return results;
  }

  parseComicDetails(html: string): ParsedComicDetails {
    const $ = this.cheerio.load(html);

    let author: string | undefined;
    let status: string | undefined;
    let type: string | undefined;
    const genres: OptionItem[] = [];

    $(".dl-horizontal dt").each((_, dt) => {
      const $dt = $(dt);
      const label = $dt.text().trim().toLowerCase();
      const dd = $dt.next("dd");
      if (label === "type") type = dd.text().trim();
      else if (label === "status") status = dd.text().trim();
      else if (label.startsWith("author"))
        author = dd.find("a").first().text().trim() || dd.text().trim();
    });

    $("dd.tag-links a").each((_, a) => {
      const $a = $(a);
      const slug = ($a.attr("href") ?? "").split("/").pop() ?? "";
      if (slug) genres.push({ id: slug, value: $a.text().trim() });
    });

    const ratingAttr = $("[data-score]").first().attr("data-score");

    return {
      title: $(".listmanga-header")
        .first()
        .text()
        .replace(/Chapters$/i, "")
        .trim(),
      imageUrl: absoluteImageUrl($(".boxed img").first().attr("src") ?? ""),
      synopsis: $(".manga.well p").first().text().trim(),
      author,
      status,
      type,
      genres,
      rating: ratingAttr ? Number(ratingAttr) : undefined,
    };
  }

  parseChapterList(html: string): ParsedChapterEntry[] {
    const $ = this.cheerio.load(html);
    const entries: ParsedChapterEntry[] = [];

    $(".chapters > li").each((_, li) => {
      const $li = $(li);
      const link = $li.find(".chapter-title-rtl a").first();
      const id = (link.attr("href") ?? "").split("/").pop() ?? "";
      if (!id) return;

      entries.push({
        id,
        chapterNum: Number(id) || 0,
        title: link.text().trim(),
        publishDate: parseChapterDate($li.find(".date-chapter-title-rtl").first().text()),
      });
    });

    return entries;
  }

  parseChapterPages(html: string): string[] {
    const $ = this.cheerio.load(html);
    return $("#all .imagecnt img")
      .map((_, img) => $(img).attr("data-src") ?? $(img).attr("src") ?? "")
      .get()
      .map((src) => absoluteImageUrl(src))
      .filter((src) => src.length > 0);
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
        titles: [details.title],
        rating: details.rating,
        tags: tagSections,
        additionalInfo: details.type ? { Type: details.type } : undefined,
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

  buildLatestUpdatesHomeSection(
    id: string,
    title: string,
    entries: { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[],
    containsMoreItems: boolean,
  ): HomeSection {
    return App.createHomeSection({
      id,
      title,
      type: "singleRowNormal",
      containsMoreItems,
      items: entries.map(({ manga }) =>
        App.createPartialSourceManga({
          mangaId: manga.id,
          title: manga.title,
          image: manga.imageUrl,
        }),
      ),
    });
  }

  toPagedResults(items: ParsedComicSummary[], metadata: unknown): PagedResults {
    return App.createPagedResults({ results: this.toPartialSourceMangas(items), metadata });
  }
}
