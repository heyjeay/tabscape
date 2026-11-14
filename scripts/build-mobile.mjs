// Puts the single-file start page (dist/index.html, from `vite build`) into the Expo app
// as a module, mobile/src/startpage.generated.ts, which the app loads into its web view.
// Usage: npm run build:mobile
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')
const out = path.join(root, 'mobile', 'src', 'startpage.generated.ts')

writeFileSync(out, `// Made by \`npm run build:mobile\` from the Tabscape start page. Don't edit it.
const startPageHtml: string = ${JSON.stringify(html)}
export default startPageHtml
`)
console.log(`[mobile] start page written to ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`)
