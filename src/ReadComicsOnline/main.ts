/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Chris Walker */

import { ReadComicsGeneric } from "../generic/main";
import pbconfig from "./pbconfig";

const DOMAIN = "https://readcomicsonline.ru";

class ReadComicsOnlineExtension extends ReadComicsGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
    });
  }
}

export const ReadComicsOnline = new ReadComicsOnlineExtension();
