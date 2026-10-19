<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { useStartpage } from '@/composables/useStartpage'
import { usePages } from '@/composables/usePages'

/**
 * The page switcher at the bottom: names to click while viewing, and fields
 * to rename, add and remove pages while editing. Hidden with a single page,
 * unless editing, where it's how a second page gets made.
 */
const props = defineProps<{ editing: boolean }>()

const { state, addPage, removePage } = useStartpage()
const pages = usePages()

/**
 * With "Hide the page switcher when idle" on, it slides off the bottom a few seconds
 * after it was last used, and comes back when the pointer nears the bottom, when
 * pages switch, or when it gets keyboard focus. Never while editing.
 */
const IDLE_MS = 3000
/** How close to the bottom edge, in pixels, the pointer brings it back. */
const NEAR_BOTTOM = 110
const autoHide = computed(() => state.settings.hidePageBar && !props.editing)
const shown = ref(true)
let holding = false
let idle: ReturnType<typeof setTimeout> | undefined

const wake = () => {
  shown.value = true
  clearTimeout(idle)
  if (autoHide.value && !holding) idle = setTimeout(() => { shown.value = false }, IDLE_MS)
}
/** Pointing at it or tabbing into it keeps it out until you leave. */
const hold = (on: boolean) => {
  holding = on
  wake()
}
const nearBottom = (e: MouseEvent | TouchEvent) => {
  const y = 'touches' in e ? e.touches[0]?.clientY : e.clientY
  if (y !== undefined && y > window.innerHeight - NEAR_BOTTOM) wake()
}

// The pointer is only watched while hiding is on.
watch(autoHide, on => {
  window.removeEventListener('mousemove', nearBottom)
  window.removeEventListener('touchstart', nearBottom)
  if (on) {
    window.addEventListener('mousemove', nearBottom, { passive: true })
    window.addEventListener('touchstart', nearBottom, { passive: true })
  }
  wake()
}, { immediate: true })
watch(() => pages.index.value, wake)
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', nearBottom)
  window.removeEventListener('touchstart', nearBottom)
  clearTimeout(idle)
})

const add = async () => {
  const page = addPage()
  pages.go(state.pages.indexOf(page))
  await nextTick()
  document.querySelector<HTMLInputElement>(`[data-page-name="${page.id}"]`)?.select()
}
</script>

<template>
  <nav
    v-if="editing || state.pages.length > 1"
    class="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4"
    aria-label="Pages"
  >
    <div
      class="glass pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 transition duration-500 ease-out"
      :class="shown ? '' : 'translate-y-[calc(100%+2rem)] opacity-0'"
      :data-shown="shown"
      @mouseenter="hold(true)"
      @mouseleave="hold(false)"
      @focusin="hold(true)"
      @focusout="hold(false)"
    >
      <template v-for="(page, i) in state.pages" :key="page.id">
        <!-- Viewing: a name to click. -->
        <button
          v-if="!editing"
          class="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition"
          :class="i === pages.index.value ? 'bg-white text-neutral-900 font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'"
          :aria-current="i === pages.index.value ? 'page' : undefined"
          @click="pages.go(i)"
        >
          {{ page.name }}
        </button>

        <!-- Editing: a name to change, and an x to remove it. Its sections move to another page. -->
        <span
          v-else
          class="flex items-center rounded-full pl-1 transition"
          :class="i === pages.index.value ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-white/5'"
          @click="pages.go(i)"
        >
          <input
            v-model="page.name"
            :data-page-name="page.id"
            class="w-24 bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30"
            placeholder="Page name"
            :aria-label="`Name of page ${i + 1}`"
          >
          <button
            v-if="state.pages.length > 1"
            class="mr-1 rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-red-300"
            :title="`Remove ${page.name || 'this page'} (its sections move to another page)`"
            :aria-label="`Remove ${page.name || 'this page'}`"
            @click.stop="removePage(page.id)"
          >
            <X :size="13" />
          </button>
        </span>
      </template>

      <button
        v-if="editing"
        class="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        @click="add"
      >
        <Plus :size="14" /> Add page
      </button>
    </div>
  </nav>
</template>
