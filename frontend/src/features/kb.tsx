import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { useHighlight } from '@/hooks/useHighlight'
import { appConfirm } from '@/components/ConfirmDialog'
import { RichTextEditor } from '@/components/RichTextEditor'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Pin,
  ChevronRight,
  Tag,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  History,
  Star,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbArticle {
  id: number
  title: string
  slug: string
  excerpt?: string
  body?: string
  content?: string
  status: string
  category_id?: number
  category_name?: string
  author_name?: string
  tags?: Array<{ id: number; name: string; slug?: string } | string>
  view_count?: number
  pinned?: boolean
  is_pinned?: boolean
  featured?: boolean
  is_featured?: boolean
  author_username?: string
  created_at: string
  updated_at: string
  attachments?: Array<{ id: number; filename?: string; original_name?: string; url?: string; size?: number; size_bytes?: number; mime_type?: string }>
}

interface KbCategory {
  id: number
  name: string
  slug?: string
  article_count: number
}

interface KbTag {
  id: number
  name: string
  article_count: number
}

interface KbStats {
  total: number
  byCategory?: Array<{ id: number; name: string; count: number }>
  popular?: Array<{ id: number; title: string; view_count: number }>
  recent?: Array<{ id: number; title: string; updated_at: string }>
}

interface KbListResponse {
  articles: KbArticle[]
  total: number
  page: number
  pages: number
}

interface KbVersion {
  id: number
  version_number: number
  author_username?: string
  created_at: string
  title?: string
}

// ─── ArticleFormModal ─────────────────────────────────────────────────────────

interface ArticleFormModalProps {
  categories: KbCategory[]
  initial?: KbArticle | null
  onClose: () => void
  onSaved: () => void
}

function ArticleFormModal({ categories, initial, onClose, onSaved }: ArticleFormModalProps) {
  const { error: showError, success: showSuccess } = useToast()
  const isEdit = !!initial

  const [title, setTitle] = useState(initial?.title ?? '')
  const [categoryId, setCategoryId] = useState<string>(
    initial?.category_id != null ? String(initial.category_id) : '',
  )
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [content, setContent] = useState(initial?.body ?? initial?.content ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).map(t => typeof t === 'string' ? t : t.name).join(', '))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) {
      showError('Title is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        status,
        body: content,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        ...(categoryId ? { category_id: Number(categoryId) } : {}),
      }
      if (isEdit && initial) {
        await api.put(`/api/kb/articles/${initial.id}`, payload)
        showSuccess('Article updated')
      } else {
        await api.post('/api/kb/articles', payload)
        showSuccess('Article created')
      }
      onSaved()
      onClose()
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-dark">
            {isEdit ? 'Edit Article' : 'New Article'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-xmuted hover:text-text-muted text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="Article title"
            />
          </div>

          {/* Category + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Content</label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Write your article content..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Tags <span className="text-text-xmuted font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="e.g. automation, n8n, api"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-muted hover:text-text-dark border border-input-border rounded-sm bg-input-bg hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Article'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── VersionHistoryModal ───────────────────────────────────────────────────────

interface VersionHistoryModalProps {
  articleId: number
  onClose: () => void
  onRestored: () => void
}

function VersionHistoryModal({ articleId, onClose, onRestored }: VersionHistoryModalProps) {
  const { error: showError, success: showSuccess } = useToast()
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const { data: versions, isLoading } = useQuery({
    queryKey: ['kb-versions', articleId],
    queryFn: () => api.get<KbVersion[]>(`/api/kb/articles/${articleId}/versions`),
  })

  async function handleRestore(versionId: number) {
    const ok = await appConfirm('Restore this version? The current content will be replaced.', {
      okLabel: 'Restore',
    })
    if (!ok) return
    setRestoringId(versionId)
    try {
      await api.post(`/api/kb/articles/${articleId}/restore/${versionId}`, {})
      showSuccess('Version restored')
      onRestored()
      onClose()
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-dark">Version History</h2>
          <button
            onClick={onClose}
            className="text-text-xmuted hover:text-text-muted text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="text-text-muted text-sm">Loading versions…</p>
          ) : !versions || versions.length === 0 ? (
            <p className="text-text-muted text-sm">No version history found.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border-light last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-dark">
                      v{v.version_number}
                      {v.title ? ` — ${esc(v.title)}` : ''}
                    </span>
                    <div className="text-[11px] text-text-xmuted mt-0.5">
                      {v.author_username && (
                        <span className="mr-2">by {esc(v.author_username)}</span>
                      )}
                      <span>{timeAgo(v.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoringId === v.id}
                    className="text-xs px-2.5 py-1 border border-input-border rounded-sm text-text-muted hover:text-primary hover:border-primary bg-input-bg disabled:opacity-50 shrink-0"
                  >
                    {restoringId === v.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-muted hover:text-text-dark border border-input-border rounded-sm bg-input-bg hover:bg-card-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── KbPage ───────────────────────────────────────────────────────────────────

export function KbPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isWriter = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['kb-articles', page, search, categoryFilter, tagFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (categoryFilter) params.set('category', categoryFilter)
      if (tagFilter) params.set('tag', tagFilter)
      if (statusFilter) params.set('status', statusFilter)
      return api.get<KbListResponse>(`/api/kb/articles?${params}`)
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['kb-categories'],
    queryFn: () => api.get<KbCategory[]>('/api/kb/categories'),
  })

  const { data: tags } = useQuery({
    queryKey: ['kb-tags'],
    queryFn: () => api.get<KbTag[]>('/api/kb/tags'),
  })

  const { data: stats } = useQuery({
    queryKey: ['kb-stats'],
    queryFn: () => api.get<KbStats>('/api/kb/stats'),
  })

  const articles = data?.articles ?? []

  function handleArticleSaved() {
    queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    queryClient.invalidateQueries({ queryKey: ['kb-stats'] })
    queryClient.invalidateQueries({ queryKey: ['kb-categories'] })
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 hidden lg:block space-y-3">
        {/* Stats KPI */}
        {stats && (
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-3xl font-extrabold text-primary">{stats.total}</div>
            <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mt-0.5">Articles</div>
          </div>
        )}

        {/* Popular articles */}
        {stats?.popular && stats.popular.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border-light">
              <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">Popular</h3>
            </div>
            <div className="p-1.5">
              {stats.popular.slice(0, 5).map((a) => (
                <button key={a.id} onClick={() => navigate(`/kb/${a.id}`)}
                  className="w-full text-left text-[12px] text-text-muted truncate px-2 py-1.5 rounded-md hover:bg-bg hover:text-primary transition-colors">
                  {a.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status filter */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">Status</h3>
          </div>
          <div className="p-1">
            {['', 'published', 'draft', 'archived'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={cn(
                  'w-full text-left text-[12px] px-2.5 py-1.5 rounded-md capitalize transition-colors',
                  statusFilter === s
                    ? 'bg-primary-light text-primary font-semibold'
                    : 'text-text-muted hover:bg-bg',
                )}
              >
                {s === '' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        {(categories ?? []).length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border-light">
              <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">Categories</h3>
            </div>
            <div className="p-1">
              <button
                onClick={() => { setCategoryFilter(''); setPage(1) }}
                className={cn(
                  'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                  categoryFilter === '' ? 'bg-primary-light text-primary font-semibold' : 'text-text-muted hover:bg-bg',
                )}
              >
                <span>All</span>
              </button>
              {(categories ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCategoryFilter(c.name); setPage(1) }}
                  className={cn(
                    'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors truncate',
                    categoryFilter === c.name ? 'bg-primary-light text-primary font-semibold' : 'text-text-muted hover:bg-bg',
                  )}
                >
                  <span className="truncate">{esc(c.name)}</span>
                  <span className="text-[10px] font-bold tabular-nums text-text-xmuted shrink-0 ml-1">{c.article_count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {(tags ?? []).length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border-light">
              <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">Tags</h3>
            </div>
            <div className="p-2.5 flex flex-wrap gap-1.5">
              {(tags ?? []).slice(0, 20).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTagFilter(tagFilter === t.name ? '' : t.name); setPage(1) }}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded-full border font-medium transition-colors',
                    tagFilter === t.name
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg border-border-light text-text-muted hover:border-primary hover:text-primary',
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Search bar + Create button */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>
          <span className="text-xs text-text-muted">
            {data?.total ?? 0} article{(data?.total ?? 0) !== 1 ? 's' : ''}
          </span>
          {isWriter && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover ml-auto"
            >
              <Plus size={13} /> New Article
            </button>
          )}
        </div>

        {/* Mobile: category + tag filters */}
        <div className="flex gap-2 mb-4 lg:hidden flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Article list */}
        {isLoading ? (
          <div className="text-text-muted text-sm">Loading articles...</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen size={32} className="text-text-xmuted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No articles found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onClick={() => navigate(`/kb/${article.slug || article.id}`)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-text-muted">Page {page} of {data.pages}</span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create article modal */}
      {showCreateModal && (
        <ArticleFormModal
          categories={categories ?? []}
          initial={null}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleArticleSaved}
        />
      )}
    </div>
  )
}

// ─── ArticleCard ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onClick }: { article: KbArticle; onClick: () => void }) {
  return (
    <div
      className="bg-card border border-border rounded-md p-4 hover:border-border-focus cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {(article.is_pinned ?? article.pinned) && <Pin size={12} className="text-warning shrink-0" />}
            <h3 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors truncate">
              {esc(article.title)}
            </h3>
          </div>
          {article.excerpt && (
            <p className="text-xs text-text-muted line-clamp-2 mb-2">{esc(article.excerpt)}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {article.category_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-light text-primary">
                {esc(article.category_name)}
              </span>
            )}
            {(article.tags ?? []).slice(0, 3).map((tag, i) => {
              const tagName = typeof tag === 'string' ? tag : tag.name
              return (
                <span key={typeof tag === 'string' ? tag : tag.id ?? i} className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted flex items-center gap-0.5">
                  <Tag size={8} />{tagName}
                </span>
              )
            })}
            <span className="text-[10px] text-text-xmuted flex items-center gap-0.5 ml-auto">
              <Eye size={10} /> {(article.view_count ?? 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-text-xmuted">{timeAgo(article.updated_at)}</span>
          </div>
        </div>
        <ChevronRight size={14} className="text-text-xmuted shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

// ─── KbArticlePage ────────────────────────────────────────────────────────────

export function KbArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isWriter = user?.role === 'admin' || user?.role === 'editor'
  const isAdmin = user?.role === 'admin'

  const highlightRef = useHighlight([slug])
  const [showEditModal, setShowEditModal] = useState(false)
  const [showVersionModal, setShowVersionModal] = useState(false)

  const { data: article, isLoading } = useQuery({
    queryKey: ['kb-article', slug],
    queryFn: () => api.get<KbArticle>(`/api/kb/articles/${slug}`),
    enabled: !!slug,
  })

  const { data: categories } = useQuery({
    queryKey: ['kb-categories'],
    queryFn: () => api.get<KbCategory[]>('/api/kb/categories'),
  })

  const feedbackMut = useMutation({
    mutationFn: (helpful: boolean) =>
      api.post(`/api/kb/articles/${article?.id}/feedback`, { helpful }),
    onSuccess: () => showSuccess('Feedback submitted — thank you!'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Feedback failed'),
  })

  const pinMut = useMutation({
    mutationFn: () => api.patch(`/api/kb/articles/${article?.id}/pin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-article', slug] })
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

  const featureMut = useMutation({
    mutationFn: () => api.patch(`/api/kb/articles/${article?.id}/feature`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-article', slug] })
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
      showSuccess(article?.featured ? 'Removed from featured' : 'Marked as featured')
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/kb/articles/${article?.id}`),
    onSuccess: () => {
      showSuccess('Article deleted')
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
      navigate('/kb')
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  async function handleDelete() {
    const ok = await appConfirm('Delete this article? This action cannot be undone.', {
      danger: true,
      okLabel: 'Delete',
    })
    if (ok) deleteMut.mutate()
  }

  function handleArticleSaved() {
    queryClient.invalidateQueries({ queryKey: ['kb-article', slug] })
    queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
  }

  if (isLoading) return <div className="text-text-muted text-sm">Loading article...</div>
  if (!article) return <div className="text-danger text-sm">Article not found</div>

  return (
    <div className="max-w-3xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/kb')}
        className="text-sm text-primary hover:text-primary-hover mb-4 inline-block"
      >
        &larr; Back to Knowledge Base
      </button>

      {/* Article header */}
      <div className="bg-card border border-border rounded-md p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {article.category_name && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-light text-primary">
                  {esc(article.category_name)}
                </span>
              )}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded capitalize',
                article.status === 'published' ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
              )}>
                {article.status}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-text-dark leading-snug">{esc(article.title)}</h1>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Pin */}
            <button
              onClick={() => pinMut.mutate()}
              disabled={pinMut.isPending}
              title={(article.is_pinned ?? article.pinned) ? 'Unpin article' : 'Pin article'}
              className={cn(
                'p-1.5 rounded-sm transition-colors',
                (article.is_pinned ?? article.pinned)
                  ? 'text-warning bg-warning-light hover:bg-warning-light'
                  : 'text-text-xmuted hover:text-warning hover:bg-warning-light',
              )}
            >
              <Pin size={16} />
            </button>

            {/* Feature toggle (writer/admin) */}
            {isWriter && (
              <button
                onClick={() => featureMut.mutate()}
                disabled={featureMut.isPending}
                title={(article.is_featured ?? article.featured) ? 'Remove from featured' : 'Mark as featured'}
                className={cn(
                  'p-1.5 rounded-sm transition-colors',
                  (article.is_featured ?? article.featured)
                    ? 'text-warning bg-warning-light'
                    : 'text-text-xmuted hover:text-warning hover:bg-warning-light',
                )}
              >
                <Star size={16} />
              </button>
            )}

            {/* Edit (writer/admin) */}
            {isWriter && (
              <button
                onClick={() => setShowEditModal(true)}
                title="Edit article"
                className="p-1.5 rounded-sm text-text-xmuted hover:text-primary hover:bg-primary-light transition-colors"
              >
                <Pencil size={16} />
              </button>
            )}

            {/* Version history (writer/admin) */}
            {isWriter && (
              <button
                onClick={() => setShowVersionModal(true)}
                title="Version history"
                className="p-1.5 rounded-sm text-text-xmuted hover:text-text-dark hover:bg-card-hover transition-colors"
              >
                <History size={16} />
              </button>
            )}

            {/* Delete (admin only) */}
            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                title="Delete article"
                className="p-1.5 rounded-sm text-text-xmuted hover:text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-xmuted flex-wrap mb-4">
          {(article.author_name || article.author_username) && (
            <span>By <strong className="text-text-muted">{(article.author_name || article.author_username)}</strong></span>
          )}
          <span>Updated {timeAgo(article.updated_at)}</span>
          <span className="flex items-center gap-0.5">
            <Eye size={11} /> {(article.view_count ?? 0).toLocaleString()} views
          </span>
        </div>

        {/* Tags */}
        {(article.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {(article.tags ?? []).map((tag, i) => {
              const tagName = typeof tag === 'string' ? tag : tag.name
              return (
                <span key={typeof tag === 'string' ? tag : tag.id ?? i} className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted flex items-center gap-0.5">
                  <Tag size={8} />{tagName}
                </span>
              )
            })}
          </div>
        )}

        {/* Article content */}
        {(article.body || article.content) ? (
          <div
            ref={highlightRef}
            className="prose prose-sm max-w-none text-text-dark"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(article.body || article.content || '')) }}
          />
        ) : (
          <p className="text-text-muted text-sm italic">No content available.</p>
        )}

        {/* Attachments */}
        {(article.attachments ?? []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-light">
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Attachments</h3>
            <div className="space-y-1">
              {(article.attachments ?? []).map((att) => {
                const name = att.original_name || att.filename || 'file'
                const bytes = att.size_bytes ?? att.size ?? 0
                const href = att.url || `/uploads/kb/${att.filename || att.original_name}`
                return (
                  <a
                    key={att.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-primary hover:text-primary-hover"
                  >
                    <span className="truncate">{name}</span>
                    {bytes > 0 && (
                      <span className="text-text-xmuted shrink-0">
                        ({bytes > 1024 * 1024
                          ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
                          : `${Math.round(bytes / 1024)} KB`})
                      </span>
                    )}
                  </a>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      <div className="bg-card border border-border rounded-md p-4">
        <p className="text-sm font-medium text-text-dark mb-3">Was this article helpful?</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => feedbackMut.mutate(true)}
            disabled={feedbackMut.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-input-border rounded-sm text-success hover:bg-success-light hover:border-success transition-colors disabled:opacity-50"
          >
            <ThumbsUp size={13} /> Yes, helpful
          </button>
          <button
            onClick={() => feedbackMut.mutate(false)}
            disabled={feedbackMut.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-input-border rounded-sm text-danger hover:bg-danger-light hover:border-danger transition-colors disabled:opacity-50"
          >
            <ThumbsDown size={13} /> Not helpful
          </button>
          {feedbackMut.isSuccess && (
            <span className="text-xs text-text-muted ml-2">Thanks for your feedback!</span>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <ArticleFormModal
          categories={categories ?? []}
          initial={article}
          onClose={() => setShowEditModal(false)}
          onSaved={handleArticleSaved}
        />
      )}

      {/* Version history modal */}
      {showVersionModal && (
        <VersionHistoryModal
          articleId={article.id}
          onClose={() => setShowVersionModal(false)}
          onRestored={handleArticleSaved}
        />
      )}
    </div>
  )
}
