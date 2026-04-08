import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '@/lib/utils'
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Quote, Code, Link as LinkIcon, RemoveFormatting, ChevronDown,
} from 'lucide-react'

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

interface Props {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichTextEditor({ content, onChange, placeholder = 'Write something...' }: Props) {
  const internalChange = useRef(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlock.configure({
        languageClassPrefix: 'language-',
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      internalChange.current = true
      onChange(e.getHTML())
    },
  })

  // Sync external content changes into the editor (e.g. AI generate)
  useEffect(() => {
    if (!editor || internalChange.current) {
      internalChange.current = false
      return
    }
    const currentHtml = editor.getHTML()
    if (content !== currentHtml) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  const [showLangMenu, setShowLangMenu] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  // Close lang menu on outside click
  useEffect(() => {
    if (!showLangMenu) return
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLangMenu])

  if (!editor) return null

  function insertCodeBlock(language: string) {
    if (!editor) return
    editor.chain().focus().toggleCodeBlock({ language: language || null }).run()
    setShowLangMenu(false)
  }

  function toggleLink() {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
    } else {
      const url = prompt('URL:')
      if (url) editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const Btn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark',
      )}
    >
      {children}
    </button>
  )

  return (
    <div className="border border-input-border rounded-md overflow-hidden focus-within:border-primary focus-within:shadow-[0_0_0_2px_rgba(255,109,90,0.15)]">
      {/* Toolbar — matches legacy Quill toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-bg-alt border-b border-border-light flex-wrap">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold size={15} />
        </Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic size={15} />
        </Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon size={15} />
        </Btn>
        <div className="w-px h-4 bg-border-light mx-1" />
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List size={15} />
        </Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered size={15} />
        </Btn>
        <div className="w-px h-4 bg-border-light mx-1" />
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          <Quote size={15} />
        </Btn>
        <div className="relative" ref={langRef}>
          <button
            type="button"
            title="Code block"
            onClick={() => {
              if (editor.isActive('codeBlock')) {
                editor.chain().focus().toggleCodeBlock().run()
              } else {
                setShowLangMenu(!showLangMenu)
              }
            }}
            className={cn(
              'flex items-center gap-0.5 p-1.5 rounded transition-colors',
              editor.isActive('codeBlock') ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg hover:text-text-dark',
            )}
          >
            <Code size={15} />
            {!editor.isActive('codeBlock') && <ChevronDown size={10} />}
          </button>
          {showLangMenu && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 py-1 min-w-[160px] dropdown-enter">
              {CODE_LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm text-text-base hover:bg-bg-alt transition-colors"
                  onClick={() => insertCodeBlock(lang.value)}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Btn active={editor.isActive('link')} onClick={toggleLink} title="Link">
          <LinkIcon size={15} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <RemoveFormatting size={15} />
        </Btn>
      </div>
      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="[&_.tiptap]:px-3 [&_.tiptap]:py-2.5 [&_.tiptap]:min-h-[150px] [&_.tiptap]:max-h-[400px] [&_.tiptap]:overflow-y-auto [&_.tiptap]:outline-none [&_.tiptap]:text-[14px] [&_.tiptap]:leading-relaxed [&_.tiptap]:text-text-dark [&_.tiptap_p]:mb-2 [&_.tiptap_h1]:text-xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-2 [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-2 [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-1 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:mb-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_ol]:mb-2 [&_.tiptap_blockquote]:border-l-3 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-text-muted [&_.tiptap_code]:bg-bg [&_.tiptap_code]:px-1 [&_.tiptap_code]:rounded [&_.tiptap_code]:text-xs [&_.tiptap_pre]:bg-bg [&_.tiptap_pre]:p-3 [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:mb-2 [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-text-xmuted [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  )
}
