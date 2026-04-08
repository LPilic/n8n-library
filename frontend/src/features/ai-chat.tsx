import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { timeAgo, cn } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  Sparkles,
  X,
  Plus,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
  Server,
  ChevronUp,
  MessageSquare,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationSummary {
  id: number
  title: string
  message_count: number
  updated_at: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: number
  title: string
  messages: ChatMessage[]
  enabled_mcp_servers: string[] | null
}

interface McpServer {
  id: string
  name: string
  enabled: boolean
  status: string
  toolCount: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AiChatPanelProps {
  open: boolean
  onToggle: () => void
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatChatMarkdown(raw: string): string {
  let s = escapeHtml(raw)
  // Code blocks
  s = s.replace(/```([\s\S]*?)```/g, '<pre class="my-1 px-2 py-1 rounded bg-bg text-xs font-mono overflow-x-auto whitespace-pre-wrap">$1</pre>')
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-bg text-xs font-mono">$1</code>')
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Line breaks
  s = s.replace(/\n/g, '<br/>')
  return s
}

// ─── AiChatPanel ──────────────────────────────────────────────────────────────

export function AiChatPanel({ open, onToggle }: AiChatPanelProps) {
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'chat'>('list')

  const openConversation = (id: number) => {
    setActiveConvId(id)
    setView('chat')
  }

  const backToList = () => {
    setActiveConvId(null)
    setView('list')
  }

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={onToggle}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
          title="Open AI Chat"
        >
          <Sparkles size={20} />
        </button>
      )}

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 sm:hidden"
          onClick={onToggle}
        />
      )}

      {/* Panel */}
      <div
        className="fixed top-[57px] z-50 bg-card border-l border-border flex flex-col shadow-xl"
        style={{
          right: open ? 0 : -440,
          width: 'min(420px, 100vw)',
          height: 'calc(100vh - 57px)',
          transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {view === 'list' ? (
          <ConversationList
            onClose={onToggle}
            onOpen={openConversation}
          />
        ) : (
          <ChatView
            convId={activeConvId!}
            onBack={backToList}
            onClose={onToggle}
          />
        )}
      </div>
    </>
  )
}

// ─── ConversationList ─────────────────────────────────────────────────────────

function ConversationList({
  onClose,
  onOpen,
}: {
  onClose: () => void
  onOpen: (id: number) => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => api.get<{ conversations: ConversationSummary[] }>('/api/ai/conversations'),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post<Conversation>('/api/ai/conversations', { title: 'New Chat', enabledMcpServers: null }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
      onOpen(conv.id)
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Failed to create conversation'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/ai/conversations/${id}`),
    onSuccess: () => {
      showSuccess('Conversation deleted')
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const conversations = data?.conversations ?? []

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-text-dark">AI Chat</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            <Plus size={12} /> New Chat
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-text-muted">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
            <MessageSquare size={32} className="text-text-xmuted" />
            <p className="text-sm text-text-muted">No conversations yet.</p>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-light">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-start gap-2 px-4 py-3 hover:bg-card-hover cursor-pointer group"
                onClick={() => onOpen(conv.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-dark truncate group-hover:text-primary transition-colors">
                    {conv.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-xmuted">
                      {conv.message_count} message{conv.message_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-text-xmuted">&middot;</span>
                    <span className="text-[10px] text-text-xmuted">{timeAgo(conv.updated_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this conversation?')) deleteMut.mutate(conv.id)
                  }}
                  className="p-1 text-text-xmuted hover:text-danger rounded-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

function ChatView({
  convId,
  onBack,
  onClose,
}: {
  convId: number
  onBack: () => void
  onClose: () => void
}) {
  const { error: showError } = useToast()
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [toolCallNames, setToolCallNames] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showMcp, setShowMcp] = useState(false)
  const [enabledMcpServers, setEnabledMcpServers] = useState<string[] | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load conversation
  const { isLoading } = useQuery({
    queryKey: ['ai-conversation', convId],
    queryFn: () => api.get<Conversation>(`/api/ai/conversations/${convId}`),
    enabled: !!convId,
    staleTime: Infinity,
    onSuccess: (conv: Conversation) => {
      setMessages(conv.messages ?? [])
      setTitle(conv.title)
      setTitleDraft(conv.title)
      setEnabledMcpServers(conv.enabled_mcp_servers)
    },
  } as Parameters<typeof useQuery>[0])

  // Load MCP servers
  const { data: mcpData } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => api.get<{ servers: McpServer[] }>('/api/mcp/servers'),
    staleTime: 60_000,
  })
  const mcpServers = mcpData?.servers ?? []

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Save conversation helper
  const saveConversation = useCallback(
    (updatedMessages: ChatMessage[], updatedMcp?: string[] | null) => {
      const mcp = updatedMcp !== undefined ? updatedMcp : enabledMcpServers
      api
        .put(`/api/ai/conversations/${convId}`, {
          title,
          messages: updatedMessages,
          enabledMcpServers: mcp,
        })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
        })
        .catch(() => {/* silent */})
    },
    [convId, title, enabledMcpServers, queryClient],
  )

  // Update title
  const saveTitle = () => {
    if (!titleDraft.trim() || titleDraft === title) {
      setEditingTitle(false)
      setTitleDraft(title)
      return
    }
    setTitle(titleDraft)
    setEditingTitle(false)
    api
      .put(`/api/ai/conversations/${convId}`, {
        title: titleDraft,
        messages,
        enabledMcpServers: enabledMcpServers,
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }))
      .catch(() => {/* silent */})
  }

  // Toggle an MCP server
  const toggleMcp = (serverId: string) => {
    let next: string[] | null
    if (enabledMcpServers === null) {
      // All enabled → disable just this one
      next = mcpServers.map((s) => s.id).filter((id) => id !== serverId)
    } else if (enabledMcpServers.includes(serverId)) {
      next = enabledMcpServers.filter((id) => id !== serverId)
    } else {
      const updated = [...enabledMcpServers, serverId]
      // If all enabled, collapse back to null
      next = updated.length === mcpServers.length ? null : updated
    }
    setEnabledMcpServers(next)
    saveConversation(messages, next)
  }

  // Is a server enabled?
  const isMcpEnabled = (serverId: string) =>
    enabledMcpServers === null || enabledMcpServers.includes(serverId)

  // Send message
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isThinking) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsThinking(true)
    setToolCallNames([])

    try {
      const result = await api.post<{ reply: string; toolCalls?: { tool: string }[] }>(
        '/api/ai/chat',
        {
          messages: newMessages,
          enabledMcpServers: enabledMcpServers,
        },
      )

      const toolNames = result.toolCalls?.map((tc) => tc.tool) ?? []
      setToolCallNames(toolNames)

      const assistantMsg: ChatMessage = { role: 'assistant', content: result.reply }
      const finalMessages = [...newMessages, assistantMsg]
      setMessages(finalMessages)
      saveConversation(finalMessages)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Chat failed')
      // Revert user message on error
      setMessages(messages)
    } finally {
      setIsThinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="p-1 text-text-xmuted hover:text-text-dark rounded-sm"
          title="Back"
        >
          <ChevronLeft size={16} />
        </button>

        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle() }}
            className="flex-1 text-sm font-medium text-text-dark bg-input-bg border border-input-focus rounded-sm px-2 py-0.5 focus:outline-none min-w-0"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex-1 text-sm font-medium text-text-dark text-left truncate hover:text-primary transition-colors min-w-0"
            title="Click to rename"
          >
            {title || 'Chat'}
          </button>
        )}

        <button
          onClick={() => setShowMcp((v) => !v)}
          className={cn(
            'p-1.5 rounded-sm transition-colors',
            showMcp ? 'text-primary bg-primary-light' : 'text-text-xmuted hover:text-text-dark',
          )}
          title="MCP Servers"
        >
          <Server size={14} />
        </button>

        <button
          onClick={onClose}
          className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* MCP panel */}
      {showMcp && mcpServers.length > 0 && (
        <div className="border-b border-border bg-bg px-4 py-2.5 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-text-muted uppercase">MCP Servers</span>
            <button
              onClick={() => setShowMcp(false)}
              className="text-text-xmuted hover:text-text-dark"
            >
              <ChevronUp size={12} />
            </button>
          </div>
          <div className="space-y-1">
            {mcpServers.map((srv) => (
              <label
                key={srv.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={isMcpEnabled(srv.id)}
                  onChange={() => toggleMcp(srv.id)}
                  className="accent-primary"
                />
                <span className="text-xs text-text-dark flex-1 truncate group-hover:text-primary transition-colors">
                  {srv.name}
                </span>
                <span className="text-[10px] text-text-xmuted shrink-0">
                  {srv.toolCount} tool{srv.toolCount !== 1 ? 's' : ''}
                </span>
                <span
                  className={cn(
                    'text-[10px] shrink-0',
                    srv.status === 'connected' ? 'text-success' : 'text-text-xmuted',
                  )}
                >
                  {srv.status}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showMcp && mcpServers.length === 0 && (
        <div className="border-b border-border bg-bg px-4 py-2.5 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-text-muted uppercase">MCP Servers</span>
            <button onClick={() => setShowMcp(false)} className="text-text-xmuted hover:text-text-dark">
              <ChevronUp size={12} />
            </button>
          </div>
          <p className="text-xs text-text-muted">No MCP servers configured.</p>
        </div>
      )}

      {/* Message area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="text-sm text-text-muted">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <Sparkles size={28} className="text-text-xmuted" />
            <p className="text-sm text-text-muted">How can I help you today?</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))
        )}

        {/* Tool calls */}
        {toolCallNames.map((name, i) => (
          <div key={i} className="flex justify-start">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-border-light text-text-muted border border-border">
              Used tool: {name}
            </span>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" />
            Thinking...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-2.5 border-t border-border shrink-0">
        <div className="flex items-end gap-2 bg-input-bg border border-input-border rounded-md px-3 py-2 focus-within:border-input-focus transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AI... (Enter to send)"
            rows={1}
            className="flex-1 text-sm text-text-dark bg-transparent resize-none focus:outline-none placeholder:text-text-xmuted leading-5 max-h-32"
            style={{ minHeight: '20px' }}
            disabled={isThinking}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isThinking}
            className="p-1 text-primary hover:text-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            title="Send"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-text-xmuted mt-1 text-right">
          Shift+Enter for new line
        </p>
      </div>
    </>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-primary-light text-text-dark text-sm leading-relaxed break-words">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[90%] px-3 py-2 rounded-lg bg-card border border-border text-text-dark text-sm leading-relaxed break-words"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatChatMarkdown(message.content)) }}
      />
    </div>
  )
}
