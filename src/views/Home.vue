<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Pencil, Plus, Search } from 'lucide-vue-next'
import LinkSection from '@/components/LinkSection.vue'
import CustomizePanel from '@/components/CustomizePanel.vue'
import { useStartpage } from '@/composables/useStartpage'
import { useNow } from '@/composables/useNow'
import { SEARCH_URLS, type Position } from '@/lib/defaults'

const { state, addSection } = useStartpage()
const settings = state.settings
const now = useNow()

const editing = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

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
  const part = hour >= 5 && hour < 12 ? 'Morning' : hour >= 12 && hour < 18 ? 'Afternoon' : 'Evening'
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
  const section = addSection()
  await nextTick()
  document.querySelector<HTMLInputElement>(`[data-section="${section.id}"] input`)?.select()
}
</script>

<template>
  <main
    class="flex min-h-screen flex-wrap items-start justify-center pb-10"
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

    <h1 v-if="settings.greeting" class="m-0 w-full text-center text-[60px] font-bold leading-tight">
      {{ greeting }}
    </h1>
    <h1 v-if="subtitle" class="my-[0.67em] w-full text-center text-[30px] font-bold">
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

    <div class="flex w-full flex-wrap items-start justify-center">
      <LinkSection
        v-for="(section, i) in state.sections"
        :key="section.id"
        :data-section="section.id"
        :section="section"
        :editing="editing"
        :new-tab="settings.newTab"
        :first="i === 0"
        :last="i === state.sections.length - 1"
      />

      <button
        v-if="editing"
        class="m-5 flex h-40 w-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/25 text-white/60 transition hover:border-white/60 hover:bg-white/5 hover:text-white"
        @click="newSection"
      >
        <Plus :size="22" /> Add section
      </button>

      <p v-if="!editing && !state.sections.length" class="mt-10 text-white/60">
        No links yet - press the pencil in the corner to add some.
      </p>
    </div>
  </main>
</template>
