<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { useStartpage } from '@/composables/useStartpage'
import { useFavicons } from '@/composables/useFavicons'
import { faviconUrl } from '@/lib/favicons'
import { gradientCss, type Gradient } from '@/lib/gradients'
import { hostOf } from '@/lib/autosort'
import { appIcons, askAppForIcon, iconSiteOf, inApp } from '@/lib/inApp'
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
  const site = iconSiteOf(props.link.url)
  return site ? (appIcons[site] ?? null) : null
})
watchEffect(() => {
  const host = inApp ? iconSiteOf(props.link.url) : null
  if (host && !state.icons[props.link.id]) askAppForIcon(host)
})
/** A small icon (the app marks them ".s." when it saves them): shown smaller, on a light tile, rather than stretched blurry to fill one. */
const small = computed(() => inApp && !state.icons[props.link.id] && /\.s\.\w+$/i.test(appIcon.value ?? ''))

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

/**
 * An icon still loading shows the letter meanwhile, then comes in from a blur to sharp. One
 * that's there at once (saved, or in the browser's memory) just shows: no letter flashing up
 * first, and no blur every time a page opens.
 */
const image = ref<HTMLImageElement | null>(null)
const loading = ref(false)
const reveal = ref(false)
watch(src, async now => {
  reveal.value = false
  loading.value = false
  if (!now) return
  // Looked at before the page is drawn, so a ready icon never shows the letter first.
  await nextTick()
  const el = image.value
  if (el && src.value === now && !(el.complete && el.naturalWidth)) loading.value = true
}, { immediate: true })
const onLoad = () => {
  if (!loading.value) return
  loading.value = false
  reveal.value = true
}

const letter = computed(() => {
  const name = props.link.name.trim() || hostOf(props.link.url) || '?'
  return name.charAt(0).toUpperCase()
})
</script>

<template>
  <!--
    In the iPhone app: a tile in two layers. The frame (.tl-icon) has the tile's shape, size and
    shadow; the face inside has the icon or letter and takes the look picked in the app's Settings
    (Start Page Icons: app-touch.css), so a look never fights the press glow or the icon's blur-in.
  -->
  <span
    v-if="inApp"
    aria-hidden="true"
    class="tl-icon tl-tile shrink-0 select-none font-bold leading-none text-white"
    :class="{ 'tl-tile-small': small && !!src && !loading, 'tl-tile-letter': !src || loading }"
    :style="{ width: `${size}px`, height: `${size}px`, '--tile-gradient': gradientCss(gradient) }"
  >
    <span class="tl-tile-face">
      <img
        v-if="src"
        v-show="!loading"
        ref="image"
        :src="src"
        alt=""
        :class="{ 'tl-icon-reveal': reveal }"
        @load="onLoad"
        @error="onError"
      >
      <span v-if="!src || loading" class="tl-tile-char">{{ letter }}</span>
    </span>
  </span>
  <!-- Elsewhere (the extension, the website): the icon, or its letter while there's none or it's loading. -->
  <template v-else>
    <img
      v-if="src"
      v-show="!loading"
      ref="image"
      :src="src"
      alt=""
      class="tl-icon shrink-0 rounded-[4px] object-cover"
      :class="{ 'tl-icon-small': small, 'tl-icon-reveal': reveal }"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @load="onLoad"
      @error="onError"
    >
    <span
      v-if="!src || loading"
      aria-hidden="true"
      class="tl-icon grid shrink-0 select-none place-items-center rounded-[5px] font-bold leading-none text-white"
      :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.58)}px`, backgroundImage: gradientCss(gradient) }"
    >{{ letter }}</span>
  </template>
</template>

<style>
/* An icon that's just arrived comes into focus: from a soft, bright blur to sharp. */
.tl-icon-reveal {
  animation: tl-icon-reveal 0.65s cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
}
@keyframes tl-icon-reveal {
  from {
    opacity: 0.15;
    filter: blur(12px) saturate(1.6) brightness(1.15);
    transform: scale(1.12);
  }
  45% {
    opacity: 1;
  }
  to {
    opacity: 1;
    filter: blur(0) saturate(1) brightness(1);
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tl-icon-reveal {
    animation: tl-icon-fade 0.25s ease backwards;
  }
  @keyframes tl-icon-fade {
    from {
      opacity: 0;
    }
  }
}
</style>
