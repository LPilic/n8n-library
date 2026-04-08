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

/**
 * Applies syntax highlighting to all <pre><code> blocks inside the ref element.
 * Auto-detects language if no class is set.
 */
export function useHighlight(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll('pre code').forEach((el) => {
      const codeEl = el as HTMLElement
      // If no language class, try auto-detection
      if (!codeEl.className || !codeEl.className.match(/language-/)) {
        const result = hljs.highlightAuto(codeEl.textContent || '')
        if (result.language) {
          codeEl.classList.add(`language-${result.language}`)
          codeEl.innerHTML = result.value
          codeEl.classList.add('hljs')
        }
      } else {
        hljs.highlightElement(codeEl)
      }
    })
  }, deps)

  return ref
}
