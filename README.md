# Chris Comics Extensions

Paperback extensions for Chris's comic sources.

Built for **Paperback 0.8** (`@paperback/toolchain` + `@paperback/types` 0.8.7).

## Available Extensions

- [XoxoComic](https://xoxocomic.com)

## Installation

On a device with Paperback installed, open the [repository page][repo] and press
**Add to Paperback**, or add the base URL manually:

```
https://chumpz0.github.io/PB-ext/0.9/stable
```

[repo]: https://chumpz0.github.io/PB-ext/0.9/stable/

## Layout

- `common/` — shared collaborators (`Requests`, `Parsers`) that a source instantiates.
  Deliberately _not_ a base class: the 0.8 app looks methods up on the exported source
  class itself, so anything inherited is invisible to it.
- `src/<Source>/<Source>.ts` — one folder per source. Must export the source **class**
  (the app constructs it, passing in its own cheerio) plus a `<Source>Info` object.
- `patches/` — a `patch-package` patch pinning esbuild to an es2020 target and treating
  cheerio as an external, since the app supplies cheerio and its JS engine chokes on
  newer syntax.

## Development

```bash
npm install        # applies patches/ automatically
npm run conformance  # tsc + lint + format
npm run bundle       # writes bundles/
```

Pushing to a `<major>.<minor>/<channel>` branch bundles and deploys to GitHub Pages.
Bump `BASE_VERSION` in `common/config.ts` on every change, or installed copies won't update.
