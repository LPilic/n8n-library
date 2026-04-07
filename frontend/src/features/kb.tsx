import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import {
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Pin,
  ChevronRight,
  Tag,
  BookOpen,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbArticle {
  id: number
  title: string
  slug: string
  excerpt?: string
  content?: string
  status: string
  category_id?: number
  category_name?: string
  tags?: string[]
  view_count: number
  pinned?: boolean
  author_username?: string
  created_at: string
  updated_at: string
  attachments?: Array<{ id: number; filename: string; url: string; size: number }>
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
  published: number
  draft: number
  totalViews: number
}

interface KbListResponse {
  articles: KbArticle[]
  total: number
  page: number
  pages: number
}

// ─── KbPage ───────────────────────────────────────────────────────────────────

export function KbPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('published')
  const [page, setPage] = useState(1)

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

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 hidden lg:block space-y-5">
        {/* Stats */}
        {stats && (
          <div className="bg-card border border-border rounded-md p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Published</span>
              <span className="font-medium text-text-dark">{stats.published}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Drafts</span>
              <span className="font-medium text-text-dark">{stats.draft}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Total Views</span>
              <span className="font-medium text-text-dark">{stats.totalViews.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Status filter */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Status</h3>
          {['', 'published', 'draft', 'archived'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={cn(
                'block w-full text-left text-xs px-2 py-1 rounded-sm mb-0.5 capitalize',
                statusFilter === s
                  ? 'bg-primary-light text-primary font-medium'
                  : 'text-text-muted hover:bg-card-hover',
              )}
            >
              {s === '' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Categories */}
        {(categories ?? []).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Categories</h3>
            <button
              onClick={() => { setCategoryFilter(''); setPage(1) }}
              className={cn(
                'block w-full text-left text-xs px-2 py-1 rounded-sm mb-0.5',
                categoryFilter === ''
                  ? 'bg-primary-light text-primary font-medium'
                  : 'text-text-muted hover:bg-card-hover',
              )}
            >
              All
            </button>
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => { setCategoryFilter(c.name); setPage(1) }}
                className={cn(
                  'block w-full text-left text-xs px-2 py-1 rounded-sm mb-0.5 truncate',
                  categoryFilter === c.name
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-text-muted hover:bg-card-hover',
                )}
              >
                <span>{esc(c.name)}</span>
                <span className="float-right text-text-xmuted">{c.article_count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tags */}
        {(tags ?? []).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1">
              {(tags ?? []).slice(0, 20).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTagFilter(tagFilter === t.name ? '' : t.name); setPage(1) }}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                    tagFilter === t.name
                      ? 'bg-primary text-white border-primary'
                      : 'bg-border-light text-text-muted border-transparent hover:border-border',
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
        {/* Search bar */}
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
          <span className="text-xs text-text-muted ml-auto">
            {data?.total ?? 0} article{(data?.total ?? 0) !== 1 ? 's' : ''}
          </span>
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
            {article.pinned && <Pin size={12} className="text-warning shrink-0" />}
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
            {(article.tags ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted flex items-center gap-0.5">
                <Tag size={8} />{tag}
              </span>
            ))}
            <span className="text-[10px] text-text-xmuted flex items-center gap-0.5 ml-auto">
              <Eye size={10} /> {article.view_count.toLocaleString()}
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

  const { data: article, isLoading } = useQuery({
    queryKey: ['kb-article', slug],
    queryFn: () => api.get<KbArticle>(`/api/kb/articles/${slug}`),
    enabled: !!slug,
  })

  const feedbackMut = useMutation({
    mutationFn: (helpful: 'yes' | 'no') =>
      api.post(`/api/kb/articles/${article?.id}/feedback`, { helpful }),
    onSuccess: () => showSuccess('Feedback submitted — thank you!'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Feedback failed'),
  })

  const pinMut = useMutation({
    mutationFn: () => api.put(`/api/kb/articles/${article?.id}`, { pinned: !article?.pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-article', slug] })
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

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
          <button
            onClick={() => pinMut.mutate()}
            disabled={pinMut.isPending}
            title={article.pinned ? 'Unpin article' : 'Pin article'}
            className={cn(
              'p-1.5 rounded-sm transition-colors shrink-0',
              article.pinned
                ? 'text-warning bg-warning-light hover:bg-warning-light'
                : 'text-text-xmuted hover:text-warning hover:bg-warning-light',
            )}
          >
            <Pin size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-xmuted flex-wrap mb-4">
          {article.author_username && (
            <span>By <strong className="text-text-muted">{article.author_username}</strong></span>
          )}
          <span>Updated {timeAgo(article.updated_at)}</span>
          <span className="flex items-center gap-0.5">
            <Eye size={11} /> {article.view_count.toLocaleString()} views
          </span>
        </div>

        {/* Tags */}
        {(article.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {(article.tags ?? []).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted flex items-center gap-0.5">
                <Tag size={8} />{tag}
              </span>
            ))}
          </div>
        )}

        {/* Article content */}
        {article.content ? (
          <div
            className="prose prose-sm max-w-none text-text-dark"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        ) : (
          <p className="text-text-muted text-sm italic">No content available.</p>
        )}

        {/* Attachments */}
        {(article.attachments ?? []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-light">
            <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Attachments</h3>
            <div className="space-y-1">
              {(article.attachments ?? []).map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:text-primary-hover"
                >
                  <span className="truncate">{att.filename}</span>
                  <span className="text-text-xmuted shrink-0">
                    ({att.size > 1024 * 1024
                      ? `${(att.size / 1024 / 1024).toFixed(1)} MB`
                      : `${Math.round(att.size / 1024)} KB`})
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback */}
      <div className="bg-card border border-border rounded-md p-4">
        <p className="text-sm font-medium text-text-dark mb-3">Was this article helpful?</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => feedbackMut.mutate('yes')}
            disabled={feedbackMut.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-input-border rounded-sm text-success hover:bg-success-light hover:border-success transition-colors disabled:opacity-50"
          >
            <ThumbsUp size={13} /> Yes, helpful
          </button>
          <button
            onClick={() => feedbackMut.mutate('no')}
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
    </div>
  )
}
