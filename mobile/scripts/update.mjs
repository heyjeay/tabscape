// Sends a new version of the app's code to phones over the air (EAS Update), no TestFlight build
// needed. It runs on GitHub (.github/workflows/ios-update.yml), not here: an update only reaches
// builds with the same runtime version (a fingerprint of the app's native side), and this Windows
// checkout's line endings fingerprint differently from GitHub's, where the builds are made. So
// what's published is what's pushed: push first. A change to native code, app.json or the native
// modules still needs a new build (the ios-testflight workflow).
//
//   npm run update:app            (from mobile/; the latest commit's title is the message)
//   npm run update:app -- "What changed"

import { execSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const debug = false
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const git = command => execSync(`git ${command}`, { cwd: root }).toString().trim()

// Only what's on GitHub is published, so say so if this checkout has commits it hasn't got.
git('fetch -q origin')
const branch = git('rev-parse --abbrev-ref HEAD')
const ahead = Number(git(`rev-list --count origin/${branch}..HEAD`))
if (ahead > 0) {
  console.error(`${ahead} commit${ahead === 1 ? '' : 's'} here aren't on GitHub yet; the update is made from GitHub, so push first.`)
  process.exit(1)
}

const message = process.argv.slice(2).join(' ').trim()
const args = ['workflow', 'run', 'ios-update.yml', '--ref', branch, ...(message ? ['-f', `message=${message}`] : [])]
if (debug) console.log('[update] gh', args.join(' '))
const result = spawnSync('gh', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('Started on GitHub: gh run watch, or the Actions tab, shows it. Phones get it the next time Tabscape opens or comes back into view.')
