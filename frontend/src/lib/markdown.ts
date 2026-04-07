/**
 * Converts markdown to HTML. Handles:
 * - Mixed content (HTML + markdown)
 * - Headings (# to ####)
 * - Bold (**text**) and italic (*text*)
 * - Code blocks (``` ... ```) and inline code
 * - Unordered (-) and ordered (1.) lists
 * - Horizontal rules (---)
 * - Paragraphs (blank-line separated)
 * - Passes through existing HTML tags untouched
 */
export function markdownToHtml(md: string): string {
  if (!md) return ''

  // If content is predominantly HTML (has multiple tags), return as-is
  const tagCount = (md.match(/<[a-z][^>]*>/gi) || []).length
  if (tagCount > 3) return md

  // Split into lines for processing
  const lines = md.split('\n')
  const result: string[] = []
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeLines: string[] = []
  let listItems: string[] = []

  function flushList() {
    if (listItems.length > 0) {
      result.push('<ul>' + listItems.join('') + '</ul>')
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push(`<pre><code class="language-${codeBlockLang}">${codeLines.join('\n')}</code></pre>`)
        codeLines = []
        inCodeBlock = false
        codeBlockLang = ''
      } else {
        flushList()
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
      }
      continue
    }
    if (inCodeBlock) {
      codeLines.push(escapeHtml(line))
      continue
    }

    // Skip lines that are already HTML
    if (/^\s*<[a-z/][^>]*>/i.test(line)) {
      flushList()
      result.push(line)
      continue
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      flushList()
      result.push('<hr>')
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      result.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`)
      continue
    }

    // Unordered list items
    const ulMatch = line.match(/^(\s*)-\s+(.+)$/)
    if (ulMatch) {
      listItems.push(`<li>${formatInline(ulMatch[2])}</li>`)
      continue
    }

    // Ordered list items
    const olMatch = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (olMatch) {
      listItems.push(`<li>${formatInline(olMatch[1])}</li>`)
      continue
    }

    // Flush list before non-list content
    flushList()

    // Empty line
    if (line.trim() === '') {
      continue
    }

    // Regular paragraph
    result.push(`<p>${formatInline(line)}</p>`)
  }

  flushList()

  return result.join('\n')
}

/** Format inline markdown: bold, italic, code, links */
function formatInline(text: string): string {
  let s = text

  // Inline code (must be before bold/italic to avoid conflicts)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')

  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  s = s.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  return s
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
