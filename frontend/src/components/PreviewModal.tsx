import { useRef, useEffect } from 'react'
import { esc } from '@/lib/utils'

function N8nDemoPreview({ workflow, minHeight = '80vh' }: { workflow: { nodes: unknown[]; connections: unknown }; minHeight?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''
    const demo = document.createElement('n8n-demo')
    demo.setAttribute('workflow', JSON.stringify(workflow))
    demo.setAttribute('frame', 'true')
    demo.style.cssText = `display:block;width:100%;height:100%;--n8n-workflow-min-height:${minHeight};--n8n-iframe-border-radius:0;--n8n-frame-background-color:#f5f5f5;`
    containerRef.current.appendChild(demo)

    const style = document.createElement('style')
    style.textContent = 'n8n-demo iframe { width:100%!important; height:100%!important; min-height:0!important; border:none!important; }'
    containerRef.current.appendChild(style)

    return () => { if (containerRef.current) containerRef.current.innerHTML = '' }
  }, [workflow, minHeight])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
}

export { N8nDemoPreview }

interface Props {
  title: string
  workflowData: { nodes: unknown[]; connections: unknown }
  onClose: () => void
}

export function PreviewModal({ title, workflowData, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 modal-overlay" />
      <div
        className="relative bg-bg-light rounded-lg shadow-lg flex flex-col overflow-hidden"
        style={{ width: '94vw', maxWidth: '1400px', height: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 bg-bg-light z-10">
          <h2 className="text-[15px] font-bold text-text-dark truncate">{esc(title)}</h2>
          <button onClick={onClose}
            className="text-[13px] px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg hover:text-text-dark transition-colors">
            Close
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', padding: 0 }}>
          <N8nDemoPreview workflow={workflowData} />
        </div>
      </div>
    </div>
  )
}
