import { useRef, useEffect } from 'react'
import { esc } from '@/lib/utils'

function N8nDemoPreview({ workflow }: { workflow: { nodes: unknown[]; connections: unknown } }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''
    const demo = document.createElement('n8n-demo')
    demo.setAttribute('workflow', JSON.stringify(workflow))
    demo.setAttribute('frame', 'true')
    demo.style.width = '100%'
    demo.style.height = '100%'
    demo.style.display = 'block'
    containerRef.current.appendChild(demo)
    return () => { if (containerRef.current) containerRef.current.innerHTML = '' }
  }, [workflow])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

export { N8nDemoPreview }

interface Props {
  title: string
  workflowData: { nodes: unknown[]; connections: unknown }
  onClose: () => void
}

export function PreviewModal({ title, workflowData, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg mx-4 flex flex-col overflow-hidden"
        style={{ width: '94vw', maxWidth: '1400px', height: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-[15px] font-bold text-text-dark truncate">{esc(title)}</h2>
          <button onClick={onClose}
            className="text-[12px] font-semibold px-3 py-1.5 bg-bg-light border border-border text-text-base rounded-md hover:bg-bg">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <N8nDemoPreview workflow={workflowData} />
        </div>
      </div>
    </div>
  )
}
