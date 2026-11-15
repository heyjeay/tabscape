<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useStartpage } from '@/composables/useStartpage'
import { useFavicons } from '@/composables/useFavicons'
import { faviconUrl } from '@/lib/favicons'
import { gradientCss, type Gradient } from '@/lib/gradients'
import { hostOf } from '@/lib/autosort'
import { appIcons, askAppForIcon, inApp } from '@/lib/inApp'
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
watch(() => [props.link.url, state.icons[props.link.id], favicons.enabled.value], () => {
  failed.value = false
})

/**
 * In the iPhone app: the site's icon, which the app fetches once and keeps on the phone
 * (lib/inApp), so it's there at once every time. Until it has it, the letter shows.
 */
const appIcon = computed(() => {
  if (!inApp) return null
  const host = hostOf(props.link.url)
  return host ? (appIcons[host] ?? null) : null
})
watchEffect(() => {
  const host = inApp ? hostOf(props.link.url) : null
  if (host && !state.icons[props.link.id]) askAppForIcon(host)
})
/** A small tab icon (.ico): shown smaller, on a light tile, rather than stretched to fill one. */
const small = computed(() => inApp && !state.icons[props.link.id] && /\.ico$/i.test(appIcon.value ?? ''))

const onError = () => {
  failed.value = true
}

const src = computed(() => {
  if (failed.value) return null
  const own = state.icons[props.link.id]
  if (own) return own
  if (inApp) return appIcon.value
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
    :class="{ 'tl-icon-small': small }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="onError"
  >
  <span
    v-else
    aria-hidden="true"
    class="tl-icon grid shrink-0 select-none place-items-center rounded-[5px] font-bold leading-none text-white"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.58)}px`, backgroundImage: gradientCss(gradient) }"
  >{{ letter }}</span>
</template>
