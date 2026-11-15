// Sends a new version of the app's code to phones over the air (EAS Update), no TestFlight build
// needed: builds the start page into the app, then publishes to the production channel, named
// after the latest commit. Only builds with the same native side take it (see src/lib/updates.ts);
// a change to native code, app.json or the native modules still needs a new build.
//
//   npm run update:app            (from mobile/)
//   npm run update:app -- "What changed"

import { execSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const debug = false
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(mobile, '..')

const run = (command, args, cwd) => {
  if (debug) console.log('[update]', cwd, command, args.join(' '))
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const message = process.argv.slice(2).join(' ').trim() || execSync('git log -1 --pretty=%s', { cwd: root }).toString().trim()

run('npm', ['run', 'build:mobile'], root)
run('npx', ['eas-cli', 'update', '--channel', 'production', '--platform', 'ios', '--non-interactive', '--message', JSON.stringify(message)], mobile)
