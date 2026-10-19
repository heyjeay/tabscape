import { computed, ref, watch } from 'vue'
import { useStartpage } from './useStartpage'

/**
 * Which page is showing. Not saved: a new tab always opens on the first page,
 * the way a phone's home screen does.
 */
const index = ref(0)

export const usePages = () => {
  const { state } = useStartpage()

  // A deleted page can't stay selected.
  watch(() => state.pages.length, n => { if (index.value > n - 1) index.value = Math.max(0, n - 1) })

  const current = computed(() => state.pages[Math.min(index.value, state.pages.length - 1)])

  const go = (to: number) => {
    const target = Math.max(0, Math.min(state.pages.length - 1, to))
    if (target === index.value) return
    index.value = target
  }

  return { index, current, go, next: () => go(index.value + 1), prev: () => go(index.value - 1) }
}
