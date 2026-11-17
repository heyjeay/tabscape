// Regression test for issue #12: links and buttons need a visible keyboard focus ring.
// Reads the stylesheet directly, so it needs no browser and no build step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '') // ignore comments

test('links, buttons and summaries get a :focus-visible outline', () => {
  const rule = css.match(/:where\(([^)]*)\)\s*:focus-visible\s*\{([^}]*)\}/)
  assert.ok(rule, 'expected a :focus-visible outline rule in src/style.css')
  const [, selectors, body] = rule
  for (const tag of ['a', 'button', 'summary']) {
    assert.match(selectors, new RegExp(`\\b${tag}\\b`), `selector list should include ${tag}`)
  }
  assert.match(body, /outline:\s*(?!none)\S/, 'the focus-visible rule should set a visible outline')
})
