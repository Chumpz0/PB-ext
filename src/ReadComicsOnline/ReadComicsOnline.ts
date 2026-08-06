/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { ReadComicsGeneric } from "../../common/main";
import sourceInfo from "./pbconfig";

class ReadComicsOnlineExtension extends ReadComicsGeneric {
  constructor() {
    super({
      domain: sourceInfo.websiteBaseURL,
      name: sourceInfo.name,
      contentRating: sourceInfo.contentRating,
    });
  }
}

export const ReadComicsOnline = new ReadComicsOnlineExtension();
export const ReadComicsOnlineInfo = sourceInfo;
