<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStartpage } from '@/composables/useStartpage'
import { useFavicons } from '@/composables/useFavicons'
import { faviconUrl } from '@/lib/favicons'
import { gradientCss, type Gradient } from '@/lib/gradients'
import { hostOf } from '@/lib/autosort'
import type { Link } from '@/lib/defaults'

/**
 * The icon before a link, best first: the person's own image, then the site's
 * real icon (if turned on), then a letter badge in the section's colours.
 */
const props = withDefaults(defineProps<{ link: Link; gradient: Gradient; size?: number }>(), { size: 18 })

const { state } = useStartpage()
const favicons = useFavicons()

/** An image that failed to load drops to the next choice down. */
const failed = ref(false)
watch(() => [props.link.url, state.icons[props.link.id], favicons.enabled.value], () => { failed.value = false })

const src = computed(() => {
  if (failed.value) return null
  const own = state.icons[props.link.id]
  if (own) return own
  if (favicons.enabled.value && hostOf(props.link.url)) return faviconUrl(props.link.url, props.size <= 16 ? 32 : 64) // fixed steps, so resizing text doesn't refetch
  return null
})

const letter = computed(() => {
  const name = props.link.name.trim() || hostOf(props.link.url) || '?'
  return name.charAt(0).toUpperCase()
})
</script>

<template>
  <img
    v-if="src"
    :src="src"
    alt=""
    class="tl-icon shrink-0 rounded-[4px] object-cover"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="failed = true"
  >
  <span
    v-else
    aria-hidden="true"
    class="tl-icon grid shrink-0 select-none place-items-center rounded-[5px] font-bold leading-none text-white"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.58)}px`, backgroundImage: gradientCss(gradient) }"
  >{{ letter }}</span>
</template>
