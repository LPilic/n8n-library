import { useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('python', python)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('plaintext', plaintext)

/**
 * Re-indent code based on brace/bracket depth.
 * Collapses excessive blank lines and applies consistent 2-space indentation.
 */
function formatCode(code: string, lang: string): string {
  // Don't format languages where indentation is significant or not brace-based
  if (['python', 'yaml', 'markdown', 'plaintext', 'bash', 'sh'].includes(lang)) {
    // Still clean up excessive blank lines
    return code.replace(/\n{3,}/g, '\n\n').trim()
  }

  // Strip all blank lines first — TipTap inserts them between every line.
  // Then re-add meaningful ones (between top-level blocks).
  const rawLines = code.split('\n').filter(l => l.trim() !== '')
  const formatted: string[] = []
  let depth = 0

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()
    if (!trimmed) continue

    // Decrease indent for closing braces/brackets at start of line
    const leadingClose = trimmed.match(/^[}\])\s,;]*/)?.[0] || ''
    const closers = (leadingClose.match(/[}\])]/g) || []).length
    if (closers > 0) depth = Math.max(0, depth - closers)

    // Add blank line before top-level blocks (depth 0 after close)
    const prevDepth = depth
    formatted.push('  '.repeat(depth) + trimmed)

    // Count openers and closers on the whole line to adjust depth for next line
    // Ignore braces/brackets inside strings
    const stripped = trimmed.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, '')
    const opens = (stripped.match(/[{[(]/g) || []).length
    const closes = (stripped.match(/[}\])]/g) || []).length
    depth = Math.max(0, depth + opens - closes + closers)

    // Insert blank line after top-level closing brace (separates blocks)
    if (depth === 0 && prevDepth === 0 && closers > 0 && i < rawLines.length - 1) {
      formatted.push('')
    }
  }

  // Remove trailing blank lines
  return formatted.join('\n').trim()
}

/**
 * Applies code formatting and syntax highlighting to all <pre><code> blocks
 * inside the ref element. Auto-detects language if no class is set.
 */
export function useHighlight(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll('pre code').forEach((el) => {
      const codeEl = el as HTMLElement
      // Skip already-highlighted elements
      if (codeEl.dataset.highlighted === 'yes') return

      // Get raw text and determine language
      let text = codeEl.textContent || ''
      let lang: string

      const langMatch = codeEl.className.match(/language-(\w+)/)
      if (langMatch) {
        lang = langMatch[1]
      } else {
        const result = hljs.highlightAuto(text, [
          'javascript', 'typescript', 'json', 'python', 'bash',
          'html', 'css', 'sql', 'xml', 'yaml',
        ])
        lang = result.language || 'plaintext'
        codeEl.classList.add(`language-${lang}`)
      }

      // Format the code (re-indent, clean blank lines)
      text = formatCode(text, lang)
      codeEl.textContent = text

      // Set data-lang for the CSS badge
      codeEl.setAttribute('data-lang', lang)

      // Apply syntax highlighting
      hljs.highlightElement(codeEl)
    })
  }, deps)

  return ref
}
