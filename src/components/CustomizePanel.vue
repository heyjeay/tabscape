<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  Bookmark, Check, Cloud, CloudOff, Download, Image as ImageIcon, LayoutTemplate, LifeBuoy, Link2,
  Loader2, RotateCcw, SlidersHorizontal, Sparkles, Type, Upload, Wand2, X
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { siDiscord, siGithub } from 'simple-icons'
import BrandIcon from '@/components/BrandIcon.vue'
import FontPicker from '@/components/FontPicker.vue'
import WallpaperPicker from '@/components/WallpaperPicker.vue'
import { DISCORD_URL, GITHUB_URL } from '@/config'
import { useStartpage } from '@/composables/useStartpage'
import { useAutoSort } from '@/composables/useAutoSort'
import { useFavicons } from '@/composables/useFavicons'
import { useWhatsNew } from '@/composables/useWhatsNew'
import { WHATS_NEW } from '@/lib/whatsNew'
import { findWallpaper } from '@/lib/wallpapers'
import { HOVER_STYLES, type Position } from '@/lib/defaults'

/**
 * Settings, in a drawer that slides in from the right: categories down the
 * left, that category's settings on the right. On narrow screens the
 * categories become a row of tabs along the top.
 */
const POSITIONS: { id: Position; name: string; icon: typeof Check }[] = [
  { id: 'top', name: 'Top', icon: AlignVerticalJustifyStart },
  { id: 'center', name: 'Centre', icon: AlignVerticalJustifyCenter },
  { id: 'bottom', name: 'Bottom', icon: AlignVerticalJustifyEnd }
]

const { state, exportData, importData, resetLinks, resetSettings, setSyncEnabled, restorePreSync } = useStartpage()
const settings = state.settings
const router = useRouter()
const autoSort = useAutoSort()
const favicons = useFavicons()
const whatsNew = useWhatsNew()
const showWhatsNew = () => {
  close()
  whatsNew.show()
}

type CategoryId = 'background' | 'layout' | 'fonts' | 'links' | 'bookmarks' | 'sync' | 'help'
const CATEGORIES = computed(() => [
  { id: 'background' as const, name: 'Background', icon: ImageIcon },
  { id: 'layout' as const, name: 'Layout', icon: LayoutTemplate },
  { id: 'fonts' as const, name: 'Fonts', icon: Type },
  { id: 'links' as const, name: 'Links', icon: Link2 },
  ...(autoSort.supported ? [{ id: 'bookmarks' as const, name: 'Bookmarks', icon: Bookmark }] : []),
  { id: 'sync' as const, name: state.sync.available ? 'Sync & backup' : 'Backup', icon: Cloud },
  { id: 'help' as const, name: 'Help & about', icon: LifeBuoy }
])

const open = ref(false)
/** Reopening comes back to the category you were last in. */
const category = ref<CategoryId>('background')
const current = computed(() => CATEGORIES.value.find(c => c.id === category.value) ?? CATEGORIES.value[0])

const trigger = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

const close = () => { open.value = false }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }

// Escape closes it while it's open; focus moves in on open and back to the button on close.
watch(open, async isOpen => {
  notice.value = ''
  if (isOpen) {
    window.addEventListener('keydown', onKey)
    await nextTick()
    closeButton.value?.focus()
  } else {
    window.removeEventListener('keydown', onKey)
    trigger.value?.focus()
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const wallpaper = computed(() => findWallpaper(settings.background, settings.customImage))

/** Real site icons need a permission, so turning them on runs straight from the click. */
const iconNotice = ref('')
const toggleFavicons = async (on: boolean) => {
  iconNotice.value = ''
  if (!on) return favicons.disable()
  if (!(await favicons.enable())) iconNotice.value = 'Icon access wasn\'t allowed, so links keep their letters.'
}

/** Sorting needs the bookmarks permission, so turning it on runs straight from the click. */
const sortNotice = ref('')
const toggleAutoSort = async (on: boolean) => {
  sortNotice.value = ''
  if (!on) return autoSort.disable()
  if (!(await autoSort.enable())) sortNotice.value = 'Bookmark access wasn\'t allowed, so sorting stays off.'
}
const sortRecentNow = async () => {
  const count = await autoSort.sortRecent(20)
  sortNotice.value = count ? `Sorted ${count} bookmark${count === 1 ? '' : 's'}.` : 'Your recent bookmarks are already on the page.'
}
const learnedCount = computed(() => Object.keys(settings.sortRules).length)
const forgetRules = () => {
  settings.sortRules = {}
  sortNotice.value = 'Forgot where you moved things. Sorting is back to its defaults.'
}

const fileInput = ref<HTMLInputElement | null>(null)
const notice = ref('')

const download = () => {
  const blob = new Blob([exportData()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tabscape-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  // Free the blob once the download has it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const upload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    importData(await file.text())
    notice.value = 'Imported.'
  } catch {
    notice.value = "That file isn't a Tabscape export."
  }
}

const reset = () => {
  if (!confirm('Put the links and the look back to how they were? Your edits will be lost.')) return
  resetLinks()
  resetSettings()
}

const runSetup = () => {
  close()
  router.push({ name: 'welcome' })
}

const version = __APP_VERSION__
</script>

<template>
  <button
    ref="trigger"
    class="icon-btn"
    :class="open ? 'bg-white/15 !text-white' : ''"
    title="Customize this page"
    aria-label="Customize this page"
    :aria-expanded="open"
    @click="open = !open"
  >
    <SlidersHorizontal :size="18" />
  </button>

  <Teleport to="body">
    <Transition name="fade">
      <!-- Clear, not dimmed or blurred: the page shows each change as you make it. A click on it still closes. -->
      <div v-if="open" class="fixed inset-0 z-50" aria-hidden="true" @click="close" />
    </Transition>

    <Transition name="drawer">
      <aside
        v-if="open"
        class="glass fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col text-white sm:flex-row"
        role="dialog"
        aria-modal="true"
        aria-label="Customize"
      >
        <!-- Categories: a column on the left, or tabs along the top on narrow screens. -->
        <nav class="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-3 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
          <p class="hidden px-2 pb-3 text-lg font-bold sm:block">Customize</p>
          <button
            v-for="c in CATEGORIES"
            :key="c.id"
            :data-category="c.id"
            class="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition"
            :class="category === c.id ? 'bg-white/15 font-medium text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'"
            :aria-current="category === c.id ? 'true' : undefined"
            @click="category = c.id"
          >
            <component :is="c.icon" :size="16" class="shrink-0" /> {{ c.name }}
          </button>
        </nav>

        <div class="flex min-h-0 flex-1 flex-col">
          <header class="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 class="text-xl font-bold">{{ current.name }}</h2>
            <button ref="closeButton" class="icon-btn" title="Close" aria-label="Close settings" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 pb-8 pt-2 text-sm">
            <!-- Background -->
            <section v-if="category === 'background'" class="space-y-5">
              <WallpaperPicker class="grid-cols-3" tile="h-16" />
              <div v-if="settings.background !== 'none'" class="space-y-4">
                <div>
                  <div class="flex items-center justify-between pb-1.5">
                    <span class="text-white/80">Dim</span>
                    <button class="text-xs text-white/45 transition-colors hover:text-white" @click="settings.dim = -1">
                      {{ settings.dim < 0 ? 'Auto' : 'Reset to auto' }}
                    </button>
                  </div>
                  <input
                    type="range" min="0" max="0.7" step="0.05"
                    :value="settings.dim < 0 ? wallpaper.scrim : settings.dim"
                    class="w-full accent-sky-500"
                    aria-label="Dim"
                    @input="settings.dim = Number(($event.target as HTMLInputElement).value)"
                  >
                </div>
                <div v-if="wallpaper.image">
                  <div class="flex items-center justify-between pb-1.5">
                    <span class="text-white/80">Blur</span>
                    <span class="text-xs text-white/45">{{ settings.blur }}px</span>
                  </div>
                  <input v-model.number="settings.blur" type="range" min="0" max="20" step="1" class="w-full accent-sky-500" aria-label="Blur">
                </div>
                <label v-if="wallpaper.scene" class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Animate</span>
                  <input v-model="settings.animate" type="checkbox" class="switch">
                </label>
              </div>
            </section>

            <!-- Layout -->
            <section v-else-if="category === 'layout'" class="space-y-5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-white/80">Position on the screen</span>
                <div class="flex rounded-md bg-white/10 p-0.5 ring-1 ring-white/10" role="radiogroup" aria-label="Position">
                  <button
                    v-for="option in POSITIONS"
                    :key="option.id"
                    role="radio"
                    :aria-checked="settings.position === option.id"
                    class="flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors"
                    :class="settings.position === option.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'"
                    @click="settings.position = option.id"
                  >
                    <component :is="option.icon" :size="14" /> {{ option.name }}
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Greeting</span>
                  <input v-model="settings.greeting" type="checkbox" class="switch">
                </label>
                <input
                  v-if="settings.greeting"
                  v-model="settings.name"
                  class="field w-full"
                  placeholder="Your name (optional)"
                  aria-label="Your name"
                >
              </div>

              <div class="space-y-2">
                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Date</span>
                  <input v-model="settings.date" type="checkbox" class="switch">
                </label>
                <label v-if="settings.date" class="flex cursor-pointer items-center justify-between pl-4">
                  <span class="text-white/60">Show weekday</span>
                  <input v-model="settings.weekday" type="checkbox" class="switch">
                </label>
              </div>

              <label class="flex items-center justify-between">
                <span class="text-white/80">Clock</span>
                <select v-model="settings.clock" class="field">
                  <option value="off" class="bg-neutral-900">Hidden</option>
                  <option value="12h" class="bg-neutral-900">12-hour</option>
                  <option value="24h" class="bg-neutral-900">24-hour</option>
                </select>
              </label>

              <div class="space-y-2">
                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Search field</span>
                  <input v-model="settings.search" type="checkbox" class="switch">
                </label>
                <label v-if="settings.search" class="flex items-center justify-between pl-4">
                  <span class="text-white/60">Search with</span>
                  <select v-model="settings.engine" class="field">
                    <option value="google" class="bg-neutral-900">Google</option>
                    <option value="duckduckgo" class="bg-neutral-900">DuckDuckGo</option>
                    <option value="bing" class="bg-neutral-900">Bing</option>
                  </select>
                </label>
              </div>

              <label class="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span class="block text-white/80">Scroll to switch pages</span>
                  <span class="block text-xs text-white/50">With more than one page, scroll down for the next page and up for the one before.</span>
                </span>
                <input v-model="settings.scrollPages" type="checkbox" class="switch">
              </label>

              <label class="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span class="block text-white/80">Hide the page switcher when idle</span>
                  <span class="block text-xs text-white/50">It slides away after a few seconds, and comes back when you point near the bottom or switch pages.</span>
                </span>
                <input v-model="settings.hidePageBar" type="checkbox" class="switch">
              </label>
            </section>

            <!-- Fonts -->
            <section v-else-if="category === 'fonts'" class="space-y-7">
              <FontPicker
                v-model:font="settings.headerFont"
                v-model:size="settings.headerSize"
                label="Greeting and date"
                sample="Good Morning."
              />
              <FontPicker
                v-model:font="settings.titleFont"
                v-model:size="settings.titleSize"
                label="Section titles"
                sample="Gaming"
              />
              <FontPicker
                v-model:font="settings.linkFont"
                v-model:size="settings.linkSize"
                label="Links"
                sample="Your links"
              />
            </section>

            <!-- Links -->
            <section v-else-if="category === 'links'" class="space-y-6">
              <div>
                <p class="text-white/80">Hover animation</p>
                <p class="pb-2 text-xs text-white/45">Point at one to see it.</p>
                <!-- Each choice plays its own effect when you point at it (.tl-preview in style.css). -->
                <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Link hover">
                  <button
                    v-for="style in HOVER_STYLES"
                    :key="style.id"
                    role="radio"
                    :aria-checked="settings.hover === style.id"
                    class="tl-preview rounded-lg px-2 py-2.5 ring-1 transition-colors"
                    :class="settings.hover === style.id ? 'bg-white/15 ring-sky-400' : 'ring-white/10 hover:bg-white/5'"
                    @click="settings.hover = style.id"
                  >
                    <span class="tl-link" :data-hover="style.id" style="--accent: #38bdf8; --accent2: #f472b6">{{ style.name }}</span>
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Site icons</span>
                  <input v-model="settings.icons" type="checkbox" class="switch">
                </label>
                <template v-if="settings.icons">
                  <label v-if="favicons.supported" class="flex cursor-pointer items-center justify-between pl-4">
                    <span class="text-white/60">Use real site icons</span>
                    <input
                      type="checkbox"
                      class="switch"
                      :checked="favicons.enabled.value"
                      @change="toggleFavicons(($event.target as HTMLInputElement).checked); ($event.target as HTMLInputElement).checked = favicons.enabled.value"
                    >
                  </label>
                  <p class="pl-4 text-xs leading-snug text-white/45">
                    <template v-if="favicons.supported">Real icons come from your browser's own cache of sites you've visited, so nothing is downloaded. Otherwise links show a letter.</template>
                    <template v-else>Links show a letter in their section's colours.</template>
                    To use your own image, click a link's icon while editing.
                  </p>
                  <p v-if="iconNotice" class="pl-4 text-xs text-amber-200/90">{{ iconNotice }}</p>
                </template>
              </div>

              <label class="flex cursor-pointer items-center justify-between">
                <span class="text-white/80">Open links in a new tab</span>
                <input v-model="settings.newTab" type="checkbox" class="switch">
              </label>
            </section>

            <!-- Bookmarks -->
            <section v-else-if="category === 'bookmarks'" class="space-y-3">
              <label class="flex cursor-pointer items-center justify-between gap-3">
                <span class="text-white/80">Sort new bookmarks into sections</span>
                <input
                  type="checkbox"
                  class="switch"
                  :checked="autoSort.enabled.value"
                  @change="toggleAutoSort(($event.target as HTMLInputElement).checked); ($event.target as HTMLInputElement).checked = autoSort.enabled.value"
                >
              </label>
              <p class="text-xs leading-relaxed text-white/45">
                Bookmark a page and it appears on your new tab: in the section named like its bookmark folder, or with similar sites,
                or under Saved. Move it once and that site goes there from then on. Your browser asks for bookmark access when you turn this on.
              </p>
              <div v-if="autoSort.enabled.value" class="flex flex-wrap gap-2 pt-1">
                <button class="field hover:bg-white/20" @click="sortRecentNow">Sort my last 20 bookmarks</button>
                <button v-if="learnedCount" class="field hover:bg-white/20" @click="forgetRules">
                  Forget {{ learnedCount }} learned {{ learnedCount === 1 ? 'move' : 'moves' }}
                </button>
              </div>
              <p v-if="sortNotice" class="text-xs text-white/70">{{ sortNotice }}</p>
            </section>

            <!-- Sync & backup -->
            <section v-else-if="category === 'sync'" class="space-y-6">
              <div v-if="state.sync.available" class="space-y-2">
                <label class="flex cursor-pointer items-center justify-between">
                  <span class="text-white/80">Sync across devices</span>
                  <input
                    type="checkbox"
                    class="switch"
                    :checked="state.sync.enabled"
                    @change="setSyncEnabled(($event.target as HTMLInputElement).checked)"
                  >
                </label>
                <p class="flex items-center gap-1.5 text-xs leading-snug text-white/45">
                  <template v-if="!state.sync.enabled">
                    <CloudOff :size="13" class="shrink-0" /> Your setup stays on this computer.
                  </template>
                  <template v-else-if="state.sync.status === 'error'">
                    <CloudOff :size="13" class="shrink-0 text-amber-300" /> <span class="text-amber-200/90">{{ state.sync.message }}</span>
                  </template>
                  <template v-else-if="state.sync.status === 'syncing'">
                    <Loader2 :size="13" class="shrink-0 animate-spin" /> Syncing...
                  </template>
                  <template v-else>
                    <Cloud :size="13" class="shrink-0 text-emerald-300" /> Follows you to any browser signed into your account.
                  </template>
                </p>
                <p class="text-xs text-white/45">Your own link images stay on this computer; Export takes them along.</p>
                <button
                  v-if="state.sync.canRestore"
                  class="text-left text-xs text-sky-300 underline-offset-2 hover:underline"
                  @click="restorePreSync"
                >
                  Sync replaced this computer's links. Put them back
                </button>
              </div>

              <div class="space-y-2">
                <p class="text-white/80">Backup</p>
                <p class="text-xs leading-snug text-white/45">
                  Export your links, pages, images and settings to keep a copy, or to move them to a browser that doesn't sync.
                </p>
                <div class="flex flex-wrap gap-2 pt-1">
                  <button class="field flex items-center gap-1.5 hover:bg-white/20" @click="download">
                    <Download :size="14" /> Export
                  </button>
                  <button class="field flex items-center gap-1.5 hover:bg-white/20" @click="fileInput?.click()">
                    <Upload :size="14" /> Import
                  </button>
                  <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="upload">
                </div>
                <p v-if="notice" class="text-xs text-white/70">{{ notice }}</p>
              </div>

              <div class="space-y-2 border-t border-white/10 pt-5">
                <p class="text-white/80">Start over</p>
                <div class="flex flex-wrap gap-2">
                  <button class="field flex items-center gap-1.5 hover:bg-white/20" @click="runSetup">
                    <Wand2 :size="14" /> Run setup again
                  </button>
                  <button class="field flex items-center gap-1.5 hover:bg-white/20 hover:!text-red-300" @click="reset">
                    <RotateCcw :size="14" /> Reset all
                  </button>
                </div>
              </div>
            </section>

            <!-- Help & about -->
            <section v-else-if="category === 'help'" class="space-y-5">
              <a
                :href="DISCORD_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-3 rounded-xl bg-[#5865F2]/15 px-4 py-3.5 text-white/80 ring-1 ring-[#5865F2]/40 transition hover:bg-[#5865F2]/25 hover:text-white"
              >
                <BrandIcon :path="siDiscord.path" :size="22" class="shrink-0 text-[#8b93ff]" />
                <span><span class="font-semibold text-white">Help or ideas?</span> Join the Discord for support and to suggest features.</span>
              </a>
              <a
                :href="GITHUB_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-3 rounded-xl bg-white/[.06] px-4 py-3.5 text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
              >
                <BrandIcon :path="siGithub.path" :size="22" class="shrink-0" />
                <span><span class="font-semibold text-white">Tabscape is open source.</span> Report a bug, or help build it.</span>
              </a>

              <div>
                <p class="pb-2 text-white/80">Shortcuts</p>
                <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs text-white/60">
                  <dt><kbd class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/80">/</kbd></dt>
                  <dd>Jump to the search field</dd>
                  <dt><kbd class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/80">←</kbd> <kbd class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/80">→</kbd></dt>
                  <dd>Switch pages (or swipe sideways on a trackpad{{ settings.scrollPages ? ', or scroll' : '' }})</dd>
                  <dt><kbd class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/80">Esc</kbd></dt>
                  <dd>Close this panel</dd>
                </dl>
              </div>

              <div class="flex items-center justify-between gap-3">
                <p class="text-xs text-white/40">Tabscape {{ version }} · GPL-3.0</p>
                <button class="flex items-center gap-1.5 text-xs text-sky-300 transition hover:text-sky-200" @click="showWhatsNew">
                  <Sparkles :size="13" /> What’s new in {{ WHATS_NEW.version }}
                </button>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
