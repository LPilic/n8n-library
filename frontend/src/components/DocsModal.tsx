import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { useHighlight } from '@/hooks/useHighlight'
import { Loader2, BookOpen, ExternalLink } from 'lucide-react'
import { sanitizeHtml } from '@/lib/sanitize'

interface Props {
  workflowName: string
  nodes: unknown[]
  connections: unknown
  onClose: () => void
}

export function DocsModal({ workflowName, nodes, connections, onClose }: Props) {
  const navigate = useNavigate()
  const { success: showSuccess, error: showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [html, setHtml] = useState('')
  const highlightRef = useHighlight([html])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedArticleId, setSavedArticleId] = useState<number | null>(null)

  // Generate docs on mount
  useState(() => {
    api
      .post<{ documentation: string }>('/api/ai/document-workflow', {
        workflowName,
        nodes,
        connections,
      })
      .then((res) => {
        setHtml(markdownToHtml(res.documentation || ''))
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to generate documentation')
        setLoading(false)
      })
  })

  async function saveToKb() {
    setSaving(true)
    try {
      const res = await api.post<{ id: number }>('/api/kb/articles', {
        title: `${workflowName} — Documentation`,
        body: html,
        excerpt: `Auto-generated documentation for the ${workflowName} workflow.`,
        status: 'draft',
        tags: ['workflow-docs', 'auto-generated'],
      })
      setSavedArticleId(res.id)
      showSuccess('Saved as draft article in Knowledge Base')
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to save to KB')
    } finally {
      setSaving(false)
    }
  }

  function viewInKb() {
    onClose()
    navigate(`/kb/${savedArticleId}`)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-lg mx-4 flex flex-col overflow-hidden"
        style={{ width: '90vw', maxWidth: '900px', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <h3 className="text-[15px] font-bold text-text-dark truncate">
            Documentation: {esc(workflowName)}
          </h3>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {savedArticleId ? (
              <button
                onClick={viewInKb}
                className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover flex items-center gap-1.5"
              >
                <ExternalLink size={13} /> View in KB
              </button>
            ) : html && !loading ? (
              <button
                onClick={saveToKb}
                disabled={saving}
                className="text-[12px] font-semibold px-3 py-1.5 bg-success text-white rounded-md hover:bg-success/90 disabled:opacity-50 flex items-center gap-1.5"
              >
                <BookOpen size={13} />
                {saving ? 'Saving...' : 'Save to Knowledge Base'}
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="text-[12px] font-semibold px-3 py-1.5 bg-bg-light border border-border text-text-base rounded-md hover:bg-bg"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-[13px] text-text-muted">Generating documentation...</p>
            </div>
          )}
          {error && (
            <div className="text-[13px] text-danger py-8 text-center">{error}</div>
          )}
          {html && !loading && (
            <div
              ref={highlightRef}
              className="text-[14px] leading-[1.7] text-text-dark [&_h1]:text-[20px] [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-6 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border-light [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_code]:bg-bg [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_pre]:bg-bg [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_strong]:text-text-dark [&_a]:text-primary [&_a:hover]:underline [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-border [&_th]:text-[12px] [&_th]:font-semibold [&_td]:p-2 [&_td]:border-b [&_td]:border-border-light [&_td]:text-[13px]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
