/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import {
  ContentRating,
  type Chapter,
  type ChapterDetails,
  type ChapterUpdatesCarouselItem,
  type DiscoverSectionItem,
  type SearchResultItem,
  type SourceManga,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";

import type {
  ComicMetadata,
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
function parseChapterDate(text: string): Date | undefined {
  const cleaned = text.trim();
  if (!cleaned) return undefined;
  if (/yesterday/i.test(cleaned)) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }
  if (/today/i.test(cleaned)) return new Date();
  const parsed = new Date(cleaned.replace(".", ""));
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export class Parsers {
  /**
   * Shared by /comic-list and the homepage "Most Viewed" widget: both render
   * comics as `.media` blocks with a title link and (usually) a cover image.
   */
  parseComicGrid(html: string): ParsedComicSummary[] {
    const $ = cheerio.load(html);
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
      title: suggestion.value.replace(/<\/?[^>]+>/g, ""),
      imageUrl: "",
    }));
  }

  toSearchResultItems(items: ParsedComicSummary[]): SearchResultItem[] {
    return items.map((item) => ({
      mangaId: item.id,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
      contentRating: ContentRating.EVERYONE,
    }));
  }

  toDiscoverSimpleItems(items: ParsedComicSummary[]): DiscoverSectionItem[] {
    return items.map((item) => ({
      type: "simpleCarouselItem",
      mangaId: item.id,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
      contentRating: ContentRating.EVERYONE,
    }));
  }

  parseLatestReleases(html: string): { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[] {
    const $ = cheerio.load(html);
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
    const $ = cheerio.load(html);

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
    const $ = cheerio.load(html);
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
    const $ = cheerio.load(html);
    return $("#all .imagecnt img")
      .map((_, img) => $(img).attr("data-src") ?? $(img).attr("src") ?? "")
      .get()
      .map((src) => absoluteImageUrl(src))
      .filter((src) => src.length > 0);
  }

  buildMangaDetails(comicId: string, shareUrl: string, details: ParsedComicDetails): SourceManga {
    const tagSections: TagSection[] = [
      {
        id: "genres",
        title: "Genres",
        tags: details.genres.map((genre) => ({ id: genre.id, title: genre.value })),
      },
    ];
    return {
      mangaId: comicId,
      mangaInfo: {
        primaryTitle: details.title,
        thumbnailUrl: details.imageUrl,
        synopsis: details.synopsis,
        author: details.author,
        status: details.status,
        contentRating: ContentRating.EVERYONE,
        tagGroups: tagSections,
        secondaryTitles: [],
        rating: details.rating,
        additionalInfo: details.type ? { Type: details.type } : undefined,
        shareUrl,
      },
    };
  }

  buildChapters(sourceManga: SourceManga, entries: ParsedChapterEntry[]): Chapter[] {
    return entries.map((entry) => ({
      chapterId: entry.id,
      sourceManga,
      langCode: "🇬🇧",
      chapNum: entry.chapterNum,
      title: entry.title,
      publishDate: entry.publishDate,
    }));
  }

  buildChapterDetails(mangaId: string, chapterId: string, pages: string[]): ChapterDetails {
    return { id: chapterId, mangaId, pages };
  }

  buildLatestUpdatesSection(
    entries: { manga: ParsedComicSummary; chapter: ParsedChapterEntry }[],
    metadata: ComicMetadata,
  ): { items: DiscoverSectionItem[]; metadata: ComicMetadata } {
    const items: ChapterUpdatesCarouselItem[] = entries.map(({ manga, chapter }) => ({
      type: "chapterUpdatesCarouselItem",
      mangaId: manga.id,
      chapterId: chapter.id,
      title: manga.title,
      subtitle: chapter.title,
      imageUrl: manga.imageUrl,
      publishDate: chapter.publishDate,
      contentRating: ContentRating.EVERYONE,
    }));
    return { items, metadata };
  }
}
