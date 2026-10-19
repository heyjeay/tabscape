<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'
import { GITHUB_URL } from '@/config'
import { useWhatsNew } from '@/composables/useWhatsNew'
import { WHATS_NEW } from '@/lib/whatsNew'

/** The "What's new" card after an update (lib/whatsNew). Got it, ×, Escape or a click outside puts it away. */
const { open, dismiss } = useWhatsNew()
const gotIt = ref<HTMLButtonElement | null>(null)
const CHANGELOG_URL = `${GITHUB_URL}/blob/master/CHANGELOG.md`

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
watch(open, async isOpen => {
  window.removeEventListener('keydown', onKey)
  if (!isOpen) return
  window.addEventListener('keydown', onKey)
  await nextTick()
  gotIt.value?.focus({ preventScroll: true })
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[60] bg-black/30" aria-hidden="true" @click="dismiss" />
    </Transition>
    <Transition name="pop" appear>
      <div v-if="open" class="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-4">
        <section
          class="glass pointer-events-auto max-h-[calc(100vh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-2xl p-6 text-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
          data-whats-new
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300">
                <Sparkles :size="13" /> What’s new in {{ WHATS_NEW.version }}
              </p>
              <h2 id="whats-new-title" class="m-0 pt-1 text-2xl font-bold leading-tight">{{ WHATS_NEW.title }}</h2>
            </div>
            <button class="icon-btn -mr-1.5 -mt-1" title="Close" aria-label="Close" @click="dismiss">
              <X :size="17" />
            </button>
          </div>

          <ul class="mt-5 space-y-3.5">
            <li v-for="item in WHATS_NEW.items" :key="item.title" class="flex gap-3">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-sky-200">
                <component :is="item.icon" :size="16" />
              </span>
              <span class="text-sm">
                <span class="block font-semibold">{{ item.title }}</span>
                <span class="block text-white/60">{{ item.text }}</span>
              </span>
            </li>
          </ul>

          <div class="mt-6 flex items-center justify-between gap-3">
            <a :href="CHANGELOG_URL" target="_blank" rel="noopener noreferrer" class="text-sm text-white/55 underline-offset-2 transition hover:text-white hover:underline">
              Everything that changed
            </a>
            <button
              ref="gotIt"
              class="rounded-full bg-white px-5 py-2 text-sm font-medium text-neutral-900 shadow-lg transition hover:bg-white/85"
              @click="dismiss"
            >
              Got it
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
