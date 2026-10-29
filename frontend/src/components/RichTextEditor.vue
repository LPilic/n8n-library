<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { N8nIcon } from '@n8n/design-system'

const CODE_LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'xml', label: 'XML' },
]

const props = withDefaults(
  defineProps<{
    content: string
    placeholder?: string
  }>(),
  { placeholder: 'Write something...' },
)

const emit = defineEmits<{ (e: 'change', html: string): void }>()

let internalChange = false
const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
    CodeBlock.configure({ languageClassPrefix: 'language-' }),
    Underline,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: props.placeholder }),
  ],
  content: props.content,
  onUpdate: ({ editor: e }) => {
    internalChange = true
    emit('change', e.getHTML())
  },
})

// Sync external content changes into the editor (e.g. AI generate)
watch(
  () => props.content,
  (content) => {
    if (!editor.value) return
    if (internalChange) {
      internalChange = false
      return
    }
    const currentHtml = editor.value.getHTML()
    if (content !== currentHtml) {
      editor.value.commands.setContent(content, { emitUpdate: false })
    }
  },
)

const showLangMenu = ref(false)
const langRef = ref<HTMLElement | null>(null)

let langHandler: ((e: MouseEvent) => void) | null = null
watch(showLangMenu, (open) => {
  if (open) {
    langHandler = (e: MouseEvent) => {
      if (langRef.value && !langRef.value.contains(e.target as Node)) showLangMenu.value = false
    }
    document.addEventListener('mousedown', langHandler)
  } else if (langHandler) {
    document.removeEventListener('mousedown', langHandler)
    langHandler = null
  }
})

function insertCodeBlock(language: string) {
  if (!editor.value) return
  editor.value.chain().focus().toggleCodeBlock({ language: language || '' }).run()
  showLangMenu.value = false
}

function toggleLink() {
  if (!editor.value) return
  if (editor.value.isActive('link')) {
    editor.value.chain().focus().unsetLink().run()
  } else {
    const url = prompt('URL:')
    if (url) editor.value.chain().focus().setLink({ href: url }).run()
  }
}
</script>

<template>
  <div class="overflow-hidden rounded-md border border-input-border focus-within:border-primary focus-within:shadow-[0_0_0_2px_var(--color-primary-alpha)]">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-0.5 border-b border-border-light bg-bg-alt px-2 py-1.5">
      <button
        v-for="tool in [
          { active: editor?.isActive('bold'), title: 'Bold', icon: 'bold', run: () => editor?.chain().focus().toggleBold().run() },
          { active: editor?.isActive('italic'), title: 'Italic', icon: 'italic', run: () => editor?.chain().focus().toggleItalic().run() },
          { active: editor?.isActive('underline'), title: 'Underline', icon: 'underline', run: () => editor?.chain().focus().toggleUnderline().run() },
        ]"
        :key="tool.title"
        type="button"
        :title="tool.title"
        class="cursor-pointer rounded p-1.5 transition-colors"
        :class="tool.active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark'"
        @click="tool.run()"
      >
        <N8nIcon :icon="tool.icon" :size="15" />
      </button>
      <div class="mx-1 h-4 w-px bg-border-light" />
      <button
        v-for="tool in [
          { active: editor?.isActive('bulletList'), title: 'Bullet list', icon: 'list', run: () => editor?.chain().focus().toggleBulletList().run() },
          { active: editor?.isActive('orderedList'), title: 'Numbered list', icon: 'list-ordered', run: () => editor?.chain().focus().toggleOrderedList().run() },
          { active: editor?.isActive('blockquote'), title: 'Blockquote', icon: 'quote', run: () => editor?.chain().focus().toggleBlockquote().run() },
        ]"
        :key="tool.title"
        type="button"
        :title="tool.title"
        class="cursor-pointer rounded p-1.5 transition-colors"
        :class="tool.active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark'"
        @click="tool.run()"
      >
        <N8nIcon :icon="tool.icon" :size="15" />
      </button>
      <div class="mx-1 h-4 w-px bg-border-light" />
      <div ref="langRef" class="relative">
        <button
          type="button"
          title="Code block"
          class="flex cursor-pointer items-center gap-0.5 rounded p-1.5 transition-colors"
          :class="editor?.isActive('codeBlock') ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark'"
          @click="editor?.isActive('codeBlock') ? editor?.chain().focus().toggleCodeBlock().run() : (showLangMenu = !showLangMenu)"
        >
          <N8nIcon icon="code" :size="15" />
          <N8nIcon v-if="!editor?.isActive('codeBlock')" icon="chevron-down" :size="10" />
        </button>
        <div
          v-if="showLangMenu"
          class="dropdown-enter absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-popover"
        >
          <button
            v-for="lang in CODE_LANGUAGES"
            :key="lang.value"
            type="button"
            class="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-text-base transition-colors hover:bg-bg-alt"
            @click="insertCodeBlock(lang.value)"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>
      <button
        type="button"
        title="Link"
        class="cursor-pointer rounded p-1.5 transition-colors"
        :class="editor?.isActive('link') ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark'"
        @click="toggleLink"
      >
        <N8nIcon icon="link" :size="15" />
      </button>
      <button
        type="button"
        title="Clear formatting"
        class="cursor-pointer rounded p-1.5 text-text-muted transition-colors hover:bg-bg hover:text-text-dark"
        @click="editor?.chain().focus().clearNodes().unsetAllMarks().run()"
      >
        <N8nIcon icon="remove-formatting" :size="15" />
      </button>
    </div>

    <EditorContent
      :editor="editor"
      class="[&_.tiptap]:min-h-[150px] [&_.tiptap]:max-h-[400px] [&_.tiptap]:overflow-y-auto [&_.tiptap]:px-3 [&_.tiptap]:py-2.5 [&_.tiptap]:text-[14px] [&_.tiptap]:leading-relaxed [&_.tiptap]:text-text-dark [&_.tiptap]:outline-none [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.tiptap_blockquote]:border-l-3 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-text-muted [&_.tiptap_code]:rounded [&_.tiptap_code]:bg-bg [&_.tiptap_code]:px-1 [&_.tiptap_code]:text-xs [&_.tiptap_h1]:mb-2 [&_.tiptap_h1]:text-xl [&_.tiptap_h1]:font-bold [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:mb-1 [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold [&_.tiptap_ol]:mb-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_p]:mb-2 [&_.tiptap_pre]:mb-2 [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:bg-bg [&_.tiptap_pre]:p-3 [&_.tiptap_ul]:mb-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-text-xmuted [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
    />
  </div>
</template>