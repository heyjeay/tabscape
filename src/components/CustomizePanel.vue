<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  Bookmark, Check, Cloud, CloudOff, Download, Loader2, RotateCcw, SlidersHorizontal, Upload, Wand2
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { siDiscord } from 'simple-icons'
import BrandIcon from '@/components/BrandIcon.vue'
import WallpaperPicker from '@/components/WallpaperPicker.vue'
import { DISCORD_URL } from '@/config'
import { useStartpage } from '@/composables/useStartpage'
import { useAutoSort } from '@/composables/useAutoSort'
import { findWallpaper } from '@/lib/wallpapers'
import type { Position } from '@/lib/defaults'

const POSITIONS: { id: Position; name: string; icon: typeof Check }[] = [
  { id: 'top', name: 'Top', icon: AlignVerticalJustifyStart },
  { id: 'center', name: 'Centre', icon: AlignVerticalJustifyCenter },
  { id: 'bottom', name: 'Bottom', icon: AlignVerticalJustifyEnd }
]

const { state, exportData, importData, resetLinks, resetSettings, setSyncEnabled, restorePreSync } = useStartpage()
const router = useRouter()
const autoSort = useAutoSort()
const sortNotice = ref('')

/** The switch: turning on shows the browser's permission prompt, so it runs straight from the click. */
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
const settings = state.settings

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const notice = ref('')

const wallpaper = computed(() => findWallpaper(settings.background, settings.customImage))

// Close on a click elsewhere, or Escape. Listening only while open.
const onDown = (e: MouseEvent) => {
  if (!root.value?.contains(e.target as Node)) open.value = false
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false
}
const unlisten = () => {
  window.removeEventListener('mousedown', onDown, true)
  window.removeEventListener('keydown', onKey)
}
watch(open, isOpen => {
  notice.value = ''
  if (isOpen) {
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
  } else {
    unlisten()
  }
})
onBeforeUnmount(unlisten)

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
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="icon-btn"
      :class="open ? 'bg-white/15 !text-white' : ''"
      title="Customize this page"
      aria-label="Customize this page"
      @click="open = !open"
    >
      <SlidersHorizontal :size="18" />
    </button>

    <Transition name="pop">
      <div
        v-if="open"
        class="glass absolute right-0 top-11 z-40 max-h-[80vh] w-[340px] overflow-y-auto rounded-xl p-3 text-left text-white"
      >
        <h3 class="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Background</h3>
        <WallpaperPicker class="grid-cols-3" />

        <div v-if="settings.background !== 'none'" class="mt-3 space-y-2 px-1">
          <div>
            <div class="flex items-center justify-between pb-1 text-xs">
              <span class="text-white/70">Dim</span>
              <button class="text-[11px] text-white/45 transition-colors hover:text-white" @click="settings.dim = -1">
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
          <label v-if="wallpaper.scene" class="flex cursor-pointer items-center justify-between text-xs">
            <span class="text-white/70">Animate</span>
            <input v-model="settings.animate" type="checkbox" class="switch">
          </label>
          <div v-if="wallpaper.image">
            <div class="flex items-center justify-between pb-1 text-xs">
              <span class="text-white/70">Blur</span>
              <span class="text-[11px] text-white/45">{{ settings.blur }}px</span>
            </div>
            <input v-model.number="settings.blur" type="range" min="0" max="20" step="1" class="w-full accent-sky-500" aria-label="Blur">
          </div>
        </div>

        <h3 class="mt-4 border-t border-white/10 px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-white/45">Page</h3>
        <div class="space-y-2.5 px-1 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-white/70">Position</span>
            <div class="flex rounded-md bg-white/10 p-0.5 ring-1 ring-white/10" role="radiogroup" aria-label="Position">
              <button
                v-for="option in POSITIONS"
                :key="option.id"
                role="radio"
                :aria-checked="settings.position === option.id"
                :title="option.name"
                class="flex items-center gap-1 rounded px-2 py-1 transition-colors"
                :class="settings.position === option.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'"
                @click="settings.position = option.id"
              >
                <component :is="option.icon" :size="13" /> {{ option.name }}
              </button>
            </div>
          </div>

          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-white/70">Greeting</span>
            <input v-model="settings.greeting" type="checkbox" class="switch">
          </label>
          <input
            v-if="settings.greeting"
            v-model="settings.name"
            class="field w-full !text-xs"
            placeholder="Your name (optional)"
            aria-label="Your name"
          >

          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-white/70">Date</span>
            <input v-model="settings.date" type="checkbox" class="switch">
          </label>

          <label class="flex items-center justify-between">
            <span class="text-white/70">Clock</span>
            <select v-model="settings.clock" class="field !py-0.5 !text-xs">
              <option value="off" class="bg-neutral-900">Hidden</option>
              <option value="12h" class="bg-neutral-900">12-hour</option>
              <option value="24h" class="bg-neutral-900">24-hour</option>
            </select>
          </label>

          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-white/70">Search field</span>
            <input v-model="settings.search" type="checkbox" class="switch">
          </label>
          <label v-if="settings.search" class="flex items-center justify-between">
            <span class="text-white/70">Search with</span>
            <select v-model="settings.engine" class="field !py-0.5 !text-xs">
              <option value="google" class="bg-neutral-900">Google</option>
              <option value="duckduckgo" class="bg-neutral-900">DuckDuckGo</option>
              <option value="bing" class="bg-neutral-900">Bing</option>
            </select>
          </label>

          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-white/70">Open links in a new tab</span>
            <input v-model="settings.newTab" type="checkbox" class="switch">
          </label>
        </div>

        <template v-if="autoSort.supported">
          <h3 class="mt-4 border-t border-white/10 px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-white/45">Bookmarks</h3>
          <div class="space-y-2 px-1 text-xs">
            <label class="flex cursor-pointer items-center justify-between gap-3">
              <span class="flex items-center gap-1.5 text-white/70"><Bookmark :size="13" /> Sort new bookmarks into sections</span>
              <input
                type="checkbox"
                class="switch"
                :checked="autoSort.enabled.value"
                @change="toggleAutoSort(($event.target as HTMLInputElement).checked); ($event.target as HTMLInputElement).checked = autoSort.enabled.value"
              >
            </label>
            <p class="text-[11px] leading-snug text-white/45">
              Bookmark a page and it appears here: in the section named like its bookmark folder, or with similar sites, or under Saved.
              Move it once and that site goes there from then on.
            </p>
            <div v-if="autoSort.enabled.value" class="flex flex-wrap gap-1.5">
              <button class="field !text-xs hover:bg-white/20" @click="sortRecentNow">Sort my last 20 bookmarks</button>
              <button v-if="learnedCount" class="field !text-xs hover:bg-white/20" @click="forgetRules">
                Forget {{ learnedCount }} learned {{ learnedCount === 1 ? 'move' : 'moves' }}
              </button>
            </div>
            <p v-if="sortNotice" class="text-[11px] text-white/70">{{ sortNotice }}</p>
          </div>
        </template>

        <template v-if="state.sync.available">
          <h3 class="mt-4 border-t border-white/10 px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-white/45">Sync</h3>
          <div class="space-y-1.5 px-1 text-xs">
            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-white/70">Sync across devices</span>
              <input
                type="checkbox"
                class="switch"
                :checked="state.sync.enabled"
                @change="setSyncEnabled(($event.target as HTMLInputElement).checked)"
              >
            </label>
            <p class="flex items-center gap-1.5 text-[11px] leading-snug text-white/45">
              <template v-if="!state.sync.enabled">
                <CloudOff :size="12" class="shrink-0" /> Your setup stays on this computer.
              </template>
              <template v-else-if="state.sync.status === 'error'">
                <CloudOff :size="12" class="shrink-0 text-amber-300" /> <span class="text-amber-200/90">{{ state.sync.message }}</span>
              </template>
              <template v-else-if="state.sync.status === 'syncing'">
                <Loader2 :size="12" class="shrink-0 animate-spin" /> Syncing...
              </template>
              <template v-else>
                <Cloud :size="12" class="shrink-0 text-emerald-300" /> Follows you to any browser signed into your account.
              </template>
            </p>
            <button
              v-if="state.sync.canRestore"
              class="text-left text-[11px] text-sky-300 underline-offset-2 hover:underline"
              @click="restorePreSync"
            >
              Sync replaced this computer's links. Put them back
            </button>
          </div>
        </template>

        <h3 class="mt-4 border-t border-white/10 px-1 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-white/45">Backup</h3>
        <p class="px-1 pb-2 text-[11px] leading-snug text-white/45">
          Export your links and settings to keep a copy, or to move them to a browser that doesn't sync.
        </p>
        <div class="flex flex-wrap gap-1.5 px-1">
          <button class="field flex items-center gap-1 !text-xs hover:bg-white/20" @click="download">
            <Download :size="13" /> Export
          </button>
          <button class="field flex items-center gap-1 !text-xs hover:bg-white/20" @click="fileInput?.click()">
            <Upload :size="13" /> Import
          </button>
          <button class="field ml-auto flex items-center gap-1 !text-xs hover:bg-white/20 hover:!text-red-300" @click="reset">
            <RotateCcw :size="13" /> Reset all
          </button>
          <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="upload">
        </div>
        <button
          class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-white/10 px-2 py-1.5 text-xs text-white/80 ring-1 ring-white/10 transition hover:bg-white/20 hover:text-white"
          @click="open = false; router.push({ name: 'welcome' })"
        >
          <Wand2 :size="13" /> Run setup again
        </button>
        <a
          :href="DISCORD_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 flex items-center gap-2.5 rounded-lg bg-[#5865F2]/15 px-3 py-2.5 text-xs text-white/80 ring-1 ring-[#5865F2]/40 transition hover:bg-[#5865F2]/25 hover:text-white"
        >
          <BrandIcon :path="siDiscord.path" :size="18" class="shrink-0 text-[#8b93ff]" />
          <span><span class="font-semibold text-white">Help or ideas?</span> Join the Discord for support and to suggest features.</span>
        </a>
        <p v-if="notice" class="px-1 pt-2 text-[11px] text-white/70">{{ notice }}</p>
      </div>
    </Transition>
  </div>
</template>
