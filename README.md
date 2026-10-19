<p align="center">
  <img src="src/assets/logo.svg" width="96" alt="Tabscape logo">
</p>

<h1 align="center">Tabscape</h1>

<p align="center">Say hello to productivity: your go-to sites one click away on every new tab, with zero clutter and seriously good looks.</p>

<p align="center">
  <a href="https://heyjeay.github.io/tabscape/">Website</a> ·
  <a href="https://heyjeay.github.io/tabscape/demo/">Live demo</a>
</p>

![Tabscape](store/screenshots/1-new-tab.png)

## What it does

- **Set up in a minute:** pick sites from popular categories, or start from a ready-made set.
- **Your sites, your way:** rename and recolour sections, and drag links between them. Changes save as you type.
- **Bookmark it, it's sorted:** turn on bookmark sorting and new bookmarks land in the right section, by folder name or by site. Move one and it learns.
- **Backgrounds that breathe:** starry night, city lights, rain, fireflies and snowfall, drawn live on a canvas.
- **Make it yours:** 14 built-in fonts with their own sizes for the greeting, section titles and links, 8 hover animations, and site icons or your own images next to links.
- **Room for more:** spread your links over several pages, and flip between them with the page bar, the arrow keys, a swipe or a scroll.
- **The basics, your way:** a greeting with your name, an optional clock and search box, and your links at the top, centre or bottom.
- **Follows you around:** with Chrome sync on, your setup appears on any browser signed into your account.
- **Private by design:** no account, no servers, no tracking.

## Help and ideas

Need help, or have a feature you'd like? Join the [Tabscape Discord](https://discord.gg/T5bF56tvyj).

## Building

Needs Node 20 or newer.

```bash
npm install
npm run dev              # the new tab page, at http://localhost:5173
npm run build:extension  # the Chrome extension, in dist-extension/
npm run build:firefox    # the Firefox add-on, in dist-firefox/
npm run build:site       # the website and live demo, in dist-site/
npm run build            # a single index.html that opens with a double-click, in dist/
```

To try it in Chrome (or Edge, Brave, Opera), open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `dist-extension`.

To try it in Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and choose `dist-firefox/manifest.json`. It stays until Firefox restarts.

Built with Vue 3, Vite and Tailwind CSS. Pushing to `master` deploys the website to GitHub Pages.

## Contributing

Contributions are welcome: bug fixes, new backgrounds, new site categories, ideas. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get set up, and say hi on the [Discord](https://discord.gg/T5bF56tvyj) before starting anything big.

## Licence

Tabscape is free software under the [GNU General Public License v3.0 or later](LICENSE): use it, change it and share it, and share your changes back under the same licence.
The Tabscape name and logo aren't covered by the GPL. If you publish your own version, give it its own name and logo; see [TRADEMARKS.md](TRADEMARKS.md).
The bundled Google Sans Flex font is under the [SIL Open Font License](public/licenses/google-sans-flex-OFL.txt).
