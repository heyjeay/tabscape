<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { Bookmark, X } from 'lucide-vue-next'
import { useStartpage } from '@/composables/useStartpage'
import { useAutoSort } from '@/composables/useAutoSort'

/**
 * "Saved Portal 2 to Gaming", after bookmarks are sorted: each with a Move to
 * menu and Undo, so a wrong guess is one click to fix. Moving teaches the
 * sorter (see moveLink), so the next bookmark from that site lands right.
 */
const { state, moveLink, removeLink } = useStartpage()
const { justAdded, dismiss } = useAutoSort()

/** Shown for this long, unless the pointer or keyboard is on the note. */
const SHOW_MS = 12_000
/** Rows shown at once; the rest are summarised. */
const MAX_ROWS = 3

const rows = computed(() =>
  justAdded.value
    .map(entry => {
      const section = state.sections.find(s => s.id === entry.sectionId)
      const link = section?.links.find(l => l.id === entry.linkId)
      return section && link ? { ...entry, name: link.name || link.url, sectionTitle: section.title } : null
    })
    .filter(<T,>(r: T | null): r is T => r !== null)
)

let timer: ReturnType<typeof setTimeout> | undefined
const stop = () => clearTimeout(timer)
const start = () => {
  stop()
  timer = setTimeout(dismiss, SHOW_MS)
}
watch(() => justAdded.value.length, n => (n ? start() : stop()), { immediate: true })
onBeforeUnmount(stop)

// Once every row is undone or gone, there's nothing left to say.
watch(() => rows.value.length, n => { if (!n && justAdded.value.length) dismiss() })

const move = (linkId: string, from: string, to: string) => {
  if (from === to) return
  moveLink(from, linkId, to, null)
  justAdded.value = justAdded.value.map(e => (e.linkId === linkId ? { ...e, sectionId: to } : e))
}

const undo = (linkId: string, sectionId: string) => {
  removeLink(sectionId, linkId)
  justAdded.value = justAdded.value.filter(e => e.linkId !== linkId)
}
</script>

<template>
  <!-- Centred by a layer of its own: the pop animation sets transform, which would fight translate-centring. -->
  <div class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
  <Transition name="pop">
    <div
      v-if="rows.length"
      class="glass pointer-events-auto w-full max-w-[440px] rounded-xl p-3 text-sm text-white"
      role="status"
      @mouseenter="stop"
      @mouseleave="start"
      @focusin="stop"
      @focusout="start"
    >
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
          <Bookmark :size="13" /> From your bookmarks
        </span>
        <button class="icon-btn -m-1" title="Close" aria-label="Close" @click="dismiss">
          <X :size="15" />
        </button>
      </div>

      <ul class="space-y-1.5">
        <li v-for="row in rows.slice(0, MAX_ROWS)" :key="row.linkId" class="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
          <!-- Already on the page: nothing was added, so say where it is instead of staying silent. -->
          <span v-if="row.existing" class="min-w-0 flex-1 truncate text-white/75">
            <span class="font-semibold text-white">{{ row.name }}</span> is already in <span class="font-semibold text-white">{{ row.sectionTitle }}</span>
          </span>
          <span v-if="!row.existing" class="min-w-0 flex-1 truncate">
            Saved <span class="font-semibold">{{ row.name }}</span> to
          </span>
          <select
            v-if="!row.existing"
            :value="row.sectionId"
            class="field max-w-[140px] !py-0.5 !text-xs"
            :aria-label="`Section for ${row.name}`"
            @change="move(row.linkId, row.sectionId, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="s in state.sections" :key="s.id" :value="s.id" class="bg-neutral-900">{{ s.title }}</option>
          </select>
          <button v-if="!row.existing" class="text-xs text-white/55 underline-offset-2 transition hover:text-white hover:underline" @click="undo(row.linkId, row.sectionId)">
            Undo
          </button>
        </li>
      </ul>
      <p v-if="rows.length > MAX_ROWS" class="px-1 pt-2 text-xs text-white/50">
        and {{ rows.length - MAX_ROWS }} more. Click the pencil to rearrange them.
      </p>
    </div>
  </Transition>
  </div>
</template>
