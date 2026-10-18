<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ChevronLeft, ChevronRight, FolderInput, GripVertical, Plus, Trash2, X } from 'lucide-vue-next'
import { useStartpage } from '@/composables/useStartpage'
import { endOf, useLinkDrag } from '@/composables/useLinkDrag'
import { GRADIENTS, gradientCss, sameGradient } from '@/lib/gradients'
import { normalizeUrl, type Section } from '@/lib/defaults'

const props = defineProps<{
  section: Section
  editing: boolean
  newTab: boolean
  first: boolean
  last: boolean
}>()

const { state, addLink, removeLink, removeSection, shiftSection, moveLink } = useStartpage()

/** The other sections a link can be sent to with Move to. */
const otherSections = computed(() => state.sections.filter(s => s.id !== props.section.id))
const drag = useLinkDrag()

const accent = computed(() => gradientCss(props.section.gradient))
/** Links only show once they have somewhere to go. */
const visibleLinks = computed(() => props.section.links.filter(l => l.url.trim()))

const root = ref<HTMLElement | null>(null)

const add = async () => {
  const link = addLink(props.section.id)
  await nextTick()
  root.value?.querySelector<HTMLInputElement>(`[data-link="${link.id}"]`)?.focus()
}

const remove = () => {
  const count = props.section.links.length
  if (count && !confirm(`Delete "${props.section.title}" and its ${count} link${count === 1 ? '' : 's'}?`)) return
  removeSection(props.section.id)
}

const setColor = (index: 0 | 1, value: string) => {
  const next = [...props.section.gradient] as Section['gradient']
  next[index] = value
  props.section.gradient = next
}
</script>

<template>
  <!-- Viewing: the page's original column, as it always looked. -->
  <div v-if="!editing" class="m-5">
    <ol class="my-4 list-none pl-10">
      <li>
        <h3 class="gradient-text m-0 inline text-[26px] font-bold" :style="{ backgroundImage: accent }">
          {{ section.title }}
        </h3>
      </li>
      <li aria-hidden="true" class="h-[3px] w-[180px]" :style="{ backgroundImage: accent }" />
      <li v-for="link in visibleLinks" :key="link.id" class="pl-[5px] pt-[5px]">
        <a
          class="text-white no-underline transition-opacity hover:opacity-70"
          :href="link.url"
          :target="newTab ? '_blank' : undefined"
          :rel="newTab ? 'noopener noreferrer' : undefined"
        >{{ link.name || link.url }}</a>
      </li>
    </ol>
  </div>

  <!-- Editing: the same column as a card of fields. -->
  <div v-else ref="root" class="glass m-5 w-[340px] rounded-xl p-4">
    <input
      v-model="section.title"
      class="w-full bg-transparent text-[22px] font-bold text-white outline-none placeholder:text-white/30"
      placeholder="Section name"
      aria-label="Section name"
    >
    <div class="mb-3 mt-1 h-[3px] w-[180px]" :style="{ backgroundImage: accent }" />

    <div class="mb-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="preset in GRADIENTS"
        :key="preset.name"
        :title="preset.name"
        :aria-label="`${preset.name} colour`"
        class="h-5 w-5 rounded-full transition-transform hover:scale-110"
        :class="sameGradient(preset.colors, section.gradient) ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900' : ''"
        :style="{ backgroundImage: gradientCss(preset.colors) }"
        @click="section.gradient = [...preset.colors]"
      />
      <span class="ml-1 flex items-center gap-0.5" title="Your own colours">
        <input
          type="color"
          :value="section.gradient[0]"
          class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label="Start colour"
          @input="setColor(0, ($event.target as HTMLInputElement).value)"
        >
        <input
          type="color"
          :value="section.gradient[1]"
          class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label="End colour"
          @input="setColor(1, ($event.target as HTMLInputElement).value)"
        >
      </span>
    </div>

    <TransitionGroup tag="ul" name="list" class="relative space-y-1.5">
      <li
        v-for="link in section.links"
        :key="link.id"
        class="flex items-center gap-1 rounded-md transition-shadow"
        :class="[
          drag.dropTarget.value === link.id ? 'shadow-[0_-2px_0_rgba(255,255,255,.85)]' : '',
          drag.dragging.value?.linkId === link.id ? 'opacity-40' : ''
        ]"
        @dragover="drag.over($event, link.id)"
        @drop.prevent="drag.drop(section.id, link.id)"
      >
        <span
          draggable="true"
          class="cursor-grab text-white/35 hover:text-white active:cursor-grabbing"
          title="Drag to reorder, or into another section"
          @dragstart="drag.start($event, section.id, link.id, ($event.currentTarget as HTMLElement).parentElement)"
          @dragend="drag.end()"
        >
          <GripVertical :size="16" />
        </span>
        <input
          v-model="link.name"
          :data-link="link.id"
          class="field w-[105px] min-w-0"
          placeholder="Name"
          aria-label="Link name"
        >
        <input
          v-model="link.url"
          class="field min-w-0 flex-1"
          placeholder="example.com"
          aria-label="Link address"
          @change="link.url = normalizeUrl(link.url)"
        >
        <!-- Move to: a real select laid over the icon, so it works with mouse, keyboard and screen readers. -->
        <label v-if="otherSections.length" class="icon-btn relative cursor-pointer" title="Move to another section">
          <FolderInput :size="15" />
          <select
            class="absolute inset-0 cursor-pointer opacity-0"
            :aria-label="`Move ${link.name || 'link'} to another section`"
            @change="moveLink(section.id, link.id, ($event.target as HTMLSelectElement).value, null)"
          >
            <option value="" disabled selected>Move to…</option>
            <option v-for="s in otherSections" :key="s.id" :value="s.id" class="bg-neutral-900">{{ s.title }}</option>
          </select>
        </label>
        <button class="icon-btn hover:!text-red-400" title="Remove link" @click="removeLink(section.id, link.id)">
          <X :size="15" />
        </button>
      </li>
    </TransitionGroup>

    <button
      class="mt-2 flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
      :class="drag.dropTarget.value === endOf(section.id) ? 'shadow-[0_-2px_0_rgba(255,255,255,.85)]' : ''"
      @click="add"
      @dragover="drag.over($event, endOf(section.id))"
      @drop.prevent="drag.drop(section.id, null)"
    >
      <Plus :size="15" /> Add link
    </button>

    <div class="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
      <div class="flex gap-1">
        <button class="icon-btn disabled:opacity-25" :disabled="first" title="Move left" @click="shiftSection(section.id, -1)">
          <ChevronLeft :size="16" />
        </button>
        <button class="icon-btn disabled:opacity-25" :disabled="last" title="Move right" @click="shiftSection(section.id, 1)">
          <ChevronRight :size="16" />
        </button>
      </div>
      <button class="icon-btn flex items-center gap-1 text-xs hover:!text-red-400" @click="remove">
        <Trash2 :size="14" /> Delete section
      </button>
    </div>
  </div>
</template>
