import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Adds the extension's manifest to the build (the icons come along from public/).
 * The manifest takes its version from package.json, so there's one number to bump.
 * Firefox gets the same manifest plus its own settings: an add-on id, and the
 * data-collection declaration addons.mozilla.org asks every new add-on for.
 */
const browserExtension = (browser: 'chrome' | 'firefox'): Plugin => ({
  name: 'browser-extension',
  generateBundle() {
    const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, 'extension/manifest.json'), 'utf8'))
    const firefox = JSON.parse(readFileSync(path.resolve(__dirname, 'extension/firefox.json'), 'utf8'))
    const source = browser === 'firefox'
      ? {
          ...manifest,
          ...firefox,
          version,
          // Firefox has no favicon permission; links there show letters or people's own images.
          optional_permissions: (manifest.optional_permissions ?? []).filter((p: string) => p !== 'favicon')
        }
      : { ...manifest, version }
    this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(source, null, 2) })
  },
})

const { version: APP_VERSION } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

export default defineConfig(({ mode }) => {
  const extension = mode === 'extension' || mode === 'firefox'
  const site = mode === 'site'
  const OUT = { extension: 'dist-extension', firefox: 'dist-firefox', site: 'dist-site' } as Record<string, string>
  return {
    // Three ways to ship the same page:
    // - extension (Chrome) and firefox: browsers block inline scripts on extension pages, so the code stays in separate files.
    // - site: the website, a landing page at the root and the page itself as a live demo at /demo/.
    // - default: all the code inside index.html, since browsers won't load separate module
    //   scripts from file:// - this is what lets the page open with a double-click.
    plugins: [vue(), ...(extension ? [browserExtension(mode === 'firefox' ? 'firefox' : 'chrome')] : site ? [] : [viteSingleFile()])],
    root: site ? path.resolve(__dirname, 'site') : __dirname,
    publicDir: path.resolve(__dirname, 'public'),
    // Relative, so every build works from wherever it's served or opened.
    base: './',
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // The site's pages live in site/, but its styles are configured here.
    css: { postcss: __dirname },
    build: {
      outDir: path.resolve(__dirname, OUT[mode] ?? 'dist'),
      emptyOutDir: true,
      reportCompressedSize: false,
      rollupOptions: site
        ? { input: { main: path.resolve(__dirname, 'site/index.html'), demo: path.resolve(__dirname, 'site/demo/index.html') } }
        : undefined,
    },
    // Preview the extension build under the same script rules Chrome applies to extension pages.
    preview: extension
      ? { headers: { 'Content-Security-Policy': "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" } }
      : {},
  }
})
