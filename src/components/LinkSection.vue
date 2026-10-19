<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ChevronLeft, ChevronRight, FolderInput, GripVertical, Plus, Trash2, X } from 'lucide-vue-next'
import { pageOf, useStartpage } from '@/composables/useStartpage'
import LinkIcon from '@/components/LinkIcon.vue'
import { imageFileToIcon } from '@/lib/image'
import { endOf, useLinkDrag } from '@/composables/useLinkDrag'
import { GRADIENTS, gradientCss, sameGradient } from '@/lib/gradients'
import { normalizeUrl, type Section } from '@/lib/defaults'
import { linkScale } from '@/lib/fonts'

const props = defineProps<{
  section: Section
  editing: boolean
  newTab: boolean
  first: boolean
  last: boolean
}>()

const { state, addLink, removeLink, removeSection, shiftSection, moveLink, setLinkIcon } = useStartpage()

/** With more than one page, section names in menus say which page they're on. */
/** Icons grow and shrink with the links' text size. */
const iconSize = computed(() => Math.round(18 * linkScale(state.settings)))

const pageName = (id: string) => state.pages.find(p => p.id === id)?.name ?? ''
const labelOf = (s: typeof props.section) =>
  state.pages.length > 1 ? `${pageName(pageOf(s))} › ${s.title}` : s.title

/** The other sections a link can be sent to with Move to. */
const otherSections = computed(() => state.sections.filter(s => s.id !== props.section.id))

/** Which page this section is on, for the page picker while editing. */
const sectionPage = computed({
  get: () => pageOf(props.section),
  set: (id: string) => { props.section.page = id }
})

// One hidden file picker per card, pointed at whichever link's image is being changed.
const iconInput = ref<HTMLInputElement | null>(null)
const iconFor = ref<string | null>(null)
const iconError = ref('')
let errorTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(errorTimer))

const pickIcon = (linkId: string) => {
  iconFor.value = linkId
  iconInput.value?.click()
}

const onIconFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !iconFor.value) return
  try {
    setLinkIcon(iconFor.value, await imageFileToIcon(file))
  } catch (err) {
    iconError.value = err instanceof Error ? err.message : "That image couldn't be used"
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => { iconError.value = '' }, 4000)
  }
}
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
  <div v-if="!editing" class="tl-links m-5" style="font-size: calc(16px * var(--tl-link-scale, 1))">
    <ol class="my-4 list-none pl-10">
      <li>
        <h3 class="gradient-text tl-title m-0 inline font-bold" :style="{ backgroundImage: accent }">
          {{ section.title }}
        </h3>
      </li>
      <li aria-hidden="true" class="h-[3px] w-[180px]" :style="{ backgroundImage: accent }" />
      <li v-for="link in visibleLinks" :key="link.id" class="pl-[5px] pt-[5px]">
        <a
          class="tl-link"
          :data-hover="state.settings.hover"
          :style="{ '--accent': section.gradient[0], '--accent2': section.gradient[1] }"
          :href="link.url"
          :target="newTab ? '_blank' : undefined"
          :rel="newTab ? 'noopener noreferrer' : undefined"
        ><LinkIcon v-if="state.settings.icons" :link="link" :gradient="section.gradient" :size="iconSize" /><span class="tl-label">{{ link.name || link.url }}</span></a>
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
        <!-- The link's image: click to choose your own; the little x puts the site icon or letter back. -->
        <span class="group/icon relative shrink-0">
          <button
            class="grid h-7 w-7 place-items-center rounded-md transition hover:bg-white/10"
            :title="state.icons[link.id] ? 'Change this image' : 'Choose an image for this link'"
            :aria-label="`Choose an image for ${link.name || 'this link'}`"
            @click="pickIcon(link.id)"
          >
            <LinkIcon :link="link" :gradient="section.gradient" />
          </button>
          <button
            v-if="state.icons[link.id]"
            class="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-neutral-800 text-white/80 ring-1 ring-white/20 hover:bg-red-500 hover:text-white group-hover/icon:grid"
            title="Remove this image"
            :aria-label="`Remove the image for ${link.name || 'this link'}`"
            @click="setLinkIcon(link.id, null)"
          >
            <X :size="10" />
          </button>
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
            <option v-for="s in otherSections" :key="s.id" :value="s.id" class="bg-neutral-900">{{ labelOf(s) }}</option>
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
    <input ref="iconInput" type="file" accept="image/*" class="hidden" @change="onIconFile">
    <p v-if="iconError" class="px-1 pt-1 text-xs text-amber-200/90">{{ iconError }}</p>

    <label v-if="state.pages.length > 1" class="mt-3 flex items-center justify-between gap-2 text-xs">
      <span class="text-white/60">Page</span>
      <select v-model="sectionPage" class="field !py-0.5 !text-xs" aria-label="Page this section is on">
        <option v-for="p in state.pages" :key="p.id" :value="p.id" class="bg-neutral-900">{{ p.name }}</option>
      </select>
    </label>

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
