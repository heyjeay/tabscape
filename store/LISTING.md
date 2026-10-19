# Tabscape: Chrome Web Store listing

Copy these into the Developer Dashboard. Images are in this folder.

## Store listing

**Name:** Tabscape

**Summary** (132 characters max)

> Say hello to productivity: your go-to sites one click away on every new tab, with zero clutter and seriously good looks.

**Category:** Productivity

**Language:** English

**Description**

> Tabscape turns every new tab into a calm, good-looking start page with the sites you actually use.
>
> **New in 1.3.0: Customize to your heart's content**
> • A new settings drawer, with your page in clear view as you change it
> • 14 built-in fonts, with their own sizes for the greeting, section titles and links
> • More than one page: switch with the page bar, the arrow keys, a swipe or a scroll
> • Site icons or your own images next to links, and 8 hover animations
> • New bookmarks sort themselves into the right section (optional)
> • Fixed: sync now brings your links to a new computer
>
> **Your links, your way**
> • Pick from popular categories on first run (streaming, gaming, social, AI, shopping and more), or start from a ready-made set
> • Rename sections, recolour them, add and remove links, and drag links between sections
> • Changes save as you type
> • Spread your links over as many pages as you like
> • Bookmark a page and it's sorted into the right section automatically. Move it once and Tabscape remembers
>
> **A look you'll like**
> • Animated backgrounds drawn live: city lights, rain, starry night, fireflies and snowfall
> • Gradient wallpapers, or your own image or GIF
> • Dim and blur controls so your links always stay readable
> • Fonts and sizes for the greeting, section titles and links
> • Hover animations: fade, lift, expand, glow, slide, glitch or pixelate
> • Site icons, or your own image for any link
> • Put everything at the top, centre or bottom of the screen
>
> **Little touches**
> • A greeting with your name, the date and an optional clock
> • An optional search box (Google, DuckDuckGo or Bing)
> • Open links in the same tab or a new one
>
> **Private by design**
> Tabscape has no account and no servers. Your setup lives in your browser and follows you to your other computers through your own Chrome sync, if you want it to. Export a backup file any time to keep a copy.
>
> **Support and feature requests**
> Need help, or have an idea? Join the Tabscape Discord: https://discord.gg/T5bF56tvyj

## Graphics

| Field | File |
|---|---|
| Store icon (128×128) | `../public/icons/icon128.png` |
| Screenshots (1280×800) | `screenshots/1-new-tab.png` … `5-search-clock.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `promo-marquee-1400x560.png` |

## Privacy practices tab

**Single purpose**

> Replaces the new tab page with a customisable start page showing the user's links, a greeting and a background they choose.

**Permission justification:** `storage` saves the user's links and settings, and syncs them between their own browsers through Chrome sync when they leave "Sync across devices" on. The new tab page itself comes from `chrome_url_overrides`.

**Optional permission, `bookmarks`:** requested only when the user turns on "Sort new bookmarks into sections" in the settings panel, and released when they turn it off. Tabscape reads bookmarks added since the last check to place each one in a matching section of the user's new tab page. Bookmarks are processed locally and are never transmitted.

**Optional permission, `favicon`:** requested only when the user turns on "Use real site icons" in the settings panel, and released when they turn it off. Tabscape reads the icons the browser has already saved for the user's own links, to show next to each link on the new tab page. Nothing is fetched or transmitted.

**Remote code:** No, I am not using remote code. All scripts are packaged with the extension.

**Data usage:** tick nothing. Tabscape does not collect or transmit any user data to the developer or anyone else. Links and settings are stored in the browser, and copied between the user's own browsers only by Chrome sync (`chrome.storage.sync`), under their own Google account.

Then tick the three certifications (data not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** not required, since no user data is collected. If the dashboard asks for one anyway, a one-line policy works: "Tabscape does not collect, store remotely, or share any personal data. All settings stay on your device."

## Upload

Upload `tabscape-1.3.0.zip` from this folder. To make a new one after changes, bump `version` in `package.json`, then run `npm run build:extension` and zip the contents of `dist-extension/` (manifest at the top level of the zip).

## Firefox (addons.mozilla.org)

Submit at https://addons.mozilla.org/developers/addon/submit/ and choose **On this site**.

- **Upload:** a zip of the contents of `dist-firefox/` (`npm run build:firefox`).
- **Source code:** the add-on's JavaScript is built by Vite, so AMO asks for the source. Answer **Yes**, upload a zip of the repository (or link https://github.com/heyjeay/tabscape), and give these build steps:
  `npm ci` then `npm run build:firefox`; the add-on is in `dist-firefox/`. Built with Node 22.
- **Name, summary, description:** the same as above.
- **Categories:** "Tabs" and "Appearance".
- **Licence:** GNU General Public License v3.0.
- **Privacy policy:** https://heyjeay.github.io/tabscape/#privacy
- **Data collection:** already declared as none in the manifest.
- **Images:** the same icon and screenshots work. AMO doesn't use the promo tiles.

## What's new in 1.3.0: Customize to your heart's content

Paste into AMO's **Release notes** box. The Chrome Web Store has no release notes field; the full notes are in `CHANGELOG.md`.

```
Customize to your heart's content: the biggest update yet.

- New settings drawer: everything sorted into categories, and the page stays clear behind it so you see each change as you make it.
- Fonts and sizes: pick from 14 built-in fonts, with a separate font and size for the greeting, section titles and links.
- Pages: spread your links over more than one page. Switch with the page bar, the arrow keys, a trackpad swipe, or by scrolling. The page bar can hide itself when idle.
- Link icons: a colourful letter, or your own image, next to every link. (In Chrome, the real site icon too.)
- 8 hover animations: Fade, Lift, Expand, Glow, Slide, Glitch, Pixelate or None.
- Bookmarks sort themselves (optional): new bookmarks land in the right section, with Move to, Undo and New section right in the note. Tabscape learns where you move things.
- Move links between sections and pages while editing.
- Fixed: sync now brings your links to a new computer.
- Smoother page switching.

Bookmarks and real site icons each ask for permission only when you switch them on. Nothing is ever sent anywhere.
```
