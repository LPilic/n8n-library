import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
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
    return code.replace(/\n{3,}/g, '\n\n').trim()
  }

  const rawLines = code.split('\n').filter((l) => l.trim() !== '')
  const formatted: string[] = []
  let depth = 0

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()
    if (!trimmed) continue

    const leadingClose = trimmed.match(/^[}\])\s,;]*/)?.[0] || ''
    const closers = (leadingClose.match(/[}\])]/g) || []).length
    if (closers > 0) depth = Math.max(0, depth - closers)

    const prevDepth = depth
    formatted.push('  '.repeat(depth) + trimmed)

    const stripped = trimmed.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, '')
    const opens = (stripped.match(/[{[(]/g) || []).length
    const closes = (stripped.match(/[}\])]/g) || []).length
    depth = Math.max(0, depth + opens - closes + closers)

    if (depth === 0 && prevDepth === 0 && closers > 0 && i < rawLines.length - 1) {
      formatted.push('')
    }
  }

  return formatted.join('\n').trim()
}

/**
 * Applies code formatting and syntax highlighting to all <pre><code> blocks
 * inside the ref element. The `deps` watcher controls when highlighting re-runs.
 */
export function useHighlight(deps: Ref<unknown> | Array<Ref<unknown>> = []) {
  const container = ref<HTMLElement | null>(null)

  let stop: (() => void) | undefined

  function highlight(root: HTMLElement | null) {
    if (!root) return
    root.querySelectorAll('pre code').forEach((node) => {
      const codeEl = node as HTMLElement
      if (codeEl.dataset.highlighted === 'yes') return

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

      text = formatCode(text, lang)
      codeEl.textContent = text
      codeEl.setAttribute('data-lang', lang)
      hljs.highlightElement(codeEl)
    })
  }

  const depList: Array<Ref<unknown>> = Array.isArray(deps) ? deps : [deps]
  if (depList.length > 0) {
    stop = watch(depList, () => highlight(container.value))
  }

  onBeforeUnmount(() => stop?.())

  // Highlight after the DOM node becomes available
  watch(
    container,
    (el) => {
      if (el) requestAnimationFrame(() => highlight(el))
    },
    { flush: 'post' },
  )

  return container
}