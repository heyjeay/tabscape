<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Pencil, Plus, Search } from 'lucide-vue-next'
import LinkSection from '@/components/LinkSection.vue'
import CustomizePanel from '@/components/CustomizePanel.vue'
import AutoSortToast from '@/components/AutoSortToast.vue'
import PageBar from '@/components/PageBar.vue'
import WhatsNew from '@/components/WhatsNew.vue'
import { usePages } from '@/composables/usePages'
import { useAutoSortWatcher } from '@/composables/useAutoSort'
import { pageOf, useStartpage } from '@/composables/useStartpage'
import { useNow } from '@/composables/useNow'
import { SEARCH_URLS, type Position } from '@/lib/defaults'

const { state, addSection } = useStartpage()
const settings = state.settings
const now = useNow()

const editing = ref(false)

// Sort new bookmarks into sections, if that's turned on (customize panel → Bookmarks).
useAutoSortWatcher()
const searchInput = ref<HTMLInputElement | null>(null)

const pages = usePages()
/** Each page's sections. Every page is laid out at once, one on top of another, so the
 *  block keeps the height of the tallest and the header doesn't move as you switch. */
const sectionsOn = computed(() => {
  const on: Record<string, typeof state.sections> = {}
  for (const page of state.pages) on[page.id] = []
  for (const section of state.sections) on[pageOf(section)].push(section)
  return on
})
const here = computed(() => state.pages.findIndex(p => p.id === pages.current.value.id))
const place = (i: number) => (i < here.value ? 'before' : i > here.value ? 'after' : 'here')

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')

/** ← and → flip pages, unless you're typing. */
const flipWithArrows = (event: KeyboardEvent) => {
  if (state.pages.length < 2 || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
  if (event.key === 'ArrowRight') pages.next()
  else if (event.key === 'ArrowLeft') pages.prev()
}

/**
 * A sideways swipe on a trackpad flips pages, and so does scrolling up or down when
 * that's switched on (Customize → Layout). One flip per gesture: after a flip, and
 * while the page itself is scrolling, nothing flips until the wheel has been still a moment.
 */
let wheel = 0
let busy = false
let quiet: ReturnType<typeof setTimeout> | undefined
const holdUntilStill = (ms = 250) => {
  busy = true
  clearTimeout(quiet)
  quiet = setTimeout(() => { busy = false; wheel = 0 }, ms)
}
const flipWithWheel = (event: WheelEvent) => {
  if (state.pages.length < 2 || event.ctrlKey) return
  // Not in the settings drawer, or anything else that scrolls on its own.
  if (event.target instanceof Element && event.target.closest('[role="dialog"], select, textarea')) return
  const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY)
  if (!sideways && (!settings.scrollPages || editing.value)) return
  const delta = (sideways ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 40 : 1)
  if (!sideways) {
    // A page taller than the window scrolls first; it flips from the top or bottom edge.
    const doc = document.scrollingElement ?? document.documentElement
    const room = delta > 0 ? doc.scrollHeight - doc.clientHeight - doc.scrollTop : doc.scrollTop
    if (room > 1) { holdUntilStill(); return }
  }
  if (busy) { holdUntilStill(); return }
  wheel += delta
  clearTimeout(quiet)
  quiet = setTimeout(() => { wheel = 0 }, 250)
  if (Math.abs(wheel) < 60) return
  if (wheel > 0) pages.next()
  else pages.prev()
  wheel = 0
  holdUntilStill(600)
}

// A new page starts at its top.
watch(here, () => { if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' }) })

onMounted(() => {
  window.addEventListener('keydown', flipWithArrows)
  window.addEventListener('wheel', flipWithWheel, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', flipWithArrows)
  window.removeEventListener('wheel', flipWithWheel)
  clearTimeout(quiet)
})

const focusSearchOnSlash = (event: KeyboardEvent) => {
  if (event.key !== '/' || !settings.search) return

  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return

  event.preventDefault()
  searchInput.value?.focus()
}

onMounted(() => window.addEventListener('keydown', focusSearchOnSlash))
onBeforeUnmount(() => window.removeEventListener('keydown', focusSearchOnSlash))

/** Where the block sits. Editing always works from the top, so the cards don't jump as they grow. */
const ALIGN: Record<Position, string> = {
  top: 'content-start',
  center: 'content-center pt-10',
  bottom: 'content-end pt-10'
}
const query = ref('')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ordinal = (n: number) =>
  n + (n > 0 ? ['th', 'st', 'nd', 'rd'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '')

const greeting = computed(() => {
  const hour = now.value.getHours()
  const part = hour >= 22 || hour < 5 ? 'Night' : hour >= 5 && hour < 12 ? 'Morning' : hour >= 12 && hour < 18 ? 'Afternoon' : 'Evening'
  const name = settings.name.trim()
  return `Good ${part}${name ? `, ${name}` : ''}.`
})

const date = computed(() => `${MONTHS[now.value.getMonth()]} ${ordinal(now.value.getDate())}`)

const time = computed(() =>
  settings.clock === 'off'
    ? ''
    : now.value.toLocaleTimeString([], {
      hour: settings.clock === '12h' ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12: settings.clock === '12h'
    })
)

const subtitle = computed(() => [settings.date ? date.value : '', time.value].filter(Boolean).join(' · '))

const search = () => {
  const q = query.value.trim()
  if (q) window.location.href = SEARCH_URLS[settings.engine] + encodeURIComponent(q)
}

const newSection = async () => {
  const section = addSection(pages.current.value.id)
  await nextTick()
  document.querySelector<HTMLInputElement>(`[data-section="${section.id}"] input`)?.select()
}
</script>

<template>
  <main
    class="flex min-h-screen flex-wrap items-start justify-center"
    :style="{ paddingBottom: editing || state.pages.length > 1 ? '5.5rem' : '2.5rem' }"
    :class="editing ? 'content-start' : ALIGN[settings.position] ?? 'content-start'"
  >
    <!-- Tools, in the corner, out of the way until they're wanted. -->
    <div class="fixed right-4 top-3 z-30 flex items-center gap-1">
      <button
        v-if="editing"
        class="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 shadow-lg transition hover:bg-white/85"
        @click="editing = false"
      >
        <Check :size="15" /> Done
      </button>
      <button
        v-else
        class="icon-btn"
        title="Edit links"
        aria-label="Edit links"
        @click="editing = true"
      >
        <Pencil :size="17" />
      </button>
      <CustomizePanel />
    </div>

    <h1
      v-if="settings.greeting"
      class="tl-head m-0 w-full text-center font-bold leading-tight"
      style="font-size: calc(60px * var(--tl-head-scale, 1))"
    >
      {{ greeting }}
    </h1>
    <h1 v-if="subtitle" class="tl-head my-[0.67em] w-full text-center font-bold" style="font-size: calc(30px * var(--tl-head-scale, 1))">
      {{ subtitle }}
    </h1>
    <!-- Keep the columns clear of the corner tools when the header is switched off. -->
    <div v-if="!settings.greeting && !subtitle" class="h-16 w-full" />

    <form v-if="settings.search" class="mb-2 flex w-full justify-center px-5" @submit.prevent="search">
      <label class="flex w-full max-w-xl items-center gap-3 rounded-full bg-white/10 px-5 py-3 ring-1 ring-white/15 backdrop-blur-md transition focus-within:bg-white/15 focus-within:ring-white/35">
        <Search :size="18" class="shrink-0 text-white/60" />
        <input
          ref="searchInput"
          v-model="query"
          class="w-full bg-transparent text-white outline-none placeholder:text-white/45"
          placeholder="Search the web"
          aria-label="Search the web"
        >
      </label>
    </form>

    <p v-if="editing" class="w-full px-5 text-center text-sm text-white/60">
      Changes save as you type. Drag the handle to reorder links, or drop them into another section.
    </p>

    <!-- Every page in the same spot; the one showing is in front, the rest wait off to
         either side (style.css, .tl-page) and slide in the way you're going. -->
    <div class="grid w-full overflow-x-clip">
    <div
      v-for="(page, p) in state.pages"
      :key="page.id"
      class="tl-page flex w-full flex-wrap items-start justify-center [grid-area:1/1]"
      :data-place="place(p)"
      :inert="place(p) !== 'here'"
    >
      <LinkSection
        v-for="(section, i) in sectionsOn[page.id]"
        :key="section.id"
        :data-section="section.id"
        :section="section"
        :editing="editing"
        :new-tab="settings.newTab"
        :first="i === 0"
        :last="i === sectionsOn[page.id].length - 1"
      />

      <button
        v-if="editing"
        class="m-5 flex h-40 w-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/25 text-white/60 transition hover:border-white/60 hover:bg-white/5 hover:text-white"
        @click="newSection"
      >
        <Plus :size="22" /> Add section
      </button>

      <p v-if="!editing && !sectionsOn[page.id].length" class="mt-10 text-white/60">
        {{ state.pages.length > 1 ? 'This page is empty. Press the pencil to add sections.' : 'No links yet - press the pencil in the corner to add some.' }}
      </p>
    </div>
    </div>
    <PageBar :editing="editing" />
    <AutoSortToast />
    <WhatsNew />
  </main>
</template>
