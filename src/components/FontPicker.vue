<script setup lang="ts">
import { FONTS, fontStack, SIZE_MAX, SIZE_MIN } from '@/lib/fonts'

/** A font and a size for one part of the page: each choice is shown in its own font. */
defineProps<{ label: string; sample: string }>()
const font = defineModel<string>('font', { required: true })
const size = defineModel<number>('size', { required: true })
</script>

<template>
  <div>
    <p class="pb-2 text-white/80">{{ label }}</p>
    <div class="grid grid-cols-2 gap-1.5" role="radiogroup" :aria-label="`${label} font`">
      <button
        v-for="option in FONTS"
        :key="option.id"
        role="radio"
        :aria-checked="font === option.id"
        :data-font="option.id"
        class="rounded-lg px-2.5 py-2 text-left ring-1 transition-colors"
        :class="font === option.id ? 'bg-white/15 ring-sky-400' : 'ring-white/10 hover:bg-white/5'"
        @click="font = option.id"
      >
        <span
          class="block truncate text-[17px] leading-snug text-white"
          :style="{ fontFamily: fontStack(option.id), fontSize: `${17 * (option.adjust ?? 1)}px` }"
        >{{ sample }}</span>
        <span class="block truncate text-[11px] text-white/45">{{ option.name }} · {{ option.kind }}</span>
      </button>
    </div>

    <div class="pt-3">
      <div class="flex items-center justify-between pb-1.5">
        <span class="text-white/60">Size</span>
        <span class="flex items-center gap-2 text-xs text-white/45">
          {{ Math.round(size * 100) }}%
          <button v-if="size !== 1" class="text-sky-300 hover:text-sky-200" @click="size = 1">Reset</button>
        </span>
      </div>
      <input
        v-model.number="size"
        type="range" :min="SIZE_MIN" :max="SIZE_MAX" step="0.05"
        class="w-full accent-sky-500"
        :aria-label="`${label} size`"
      >
    </div>
  </div>
</template>
