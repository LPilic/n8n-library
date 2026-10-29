<script setup lang="ts">
// Port of src/features/ai-chat.tsx — AiChatPanel (floating chat panel).
// Used by AppLayout with `:open` + `@toggle`; renders nothing when closed.
// In the React version ConversationList/ChatView/MessageBubble were sub-components
// that remounted on view switches; here they are inlined and the chat state is
// reset on those transitions instead.
import { ref, computed, watch, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nIcon } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { timeAgo } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/sanitize'

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

// ─── Props / Emits ────────────────────────────────────────────────────────────

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const { success: showSuccess, error: showError } = useToast()
const queryClient = useQueryClient()

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

function assistantHtml(content: string): string {
  return sanitizeHtml(formatChatMarkdown(content))
}

// ─── Panel state (AiChatPanel) ────────────────────────────────────────────────

const activeConvId = ref<number | null>(null)
const view = ref<'list' | 'chat'>('list')

const panelStyle = computed(() => ({
  right: props.open ? '0px' : '-440px',
  width: 'min(420px, 100vw)',
  height: 'calc(100vh - 57px)',
  transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
}))

// ─── ConversationList ─────────────────────────────────────────────────────────

const { data: listData, isLoading: listLoading } = useQuery({
  queryKey: ['ai-conversations'],
  queryFn: () => api.get<{ conversations: ConversationSummary[] }>('/api/ai/conversations'),
})

const conversations = computed(() => listData.value?.conversations ?? [])

const createPending = ref(false)

async function createConversation() {
  createPending.value = true
  try {
    const conv = await api.post<Conversation>('/api/ai/conversations', {
      title: 'New Chat',
      enabledMcpServers: null,
    })
    queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    openConversation(conv.id)
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Failed to create conversation')
  } finally {
    createPending.value = false
  }
}

async function deleteConversation(id: number) {
  try {
    await api.delete(`/api/ai/conversations/${id}`)
    showSuccess('Conversation deleted')
    queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

async function confirmDeleteConversation(id: number) {
  const confirmed = await appConfirm('Delete this conversation?')
  if (confirmed) void deleteConversation(id)
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

const messages = ref<ChatMessage[]>([])
const input = ref('')
const isThinking = ref(false)
const toolCallNames = ref<string[]>([])
const title = ref('')
const editingTitle = ref(false)
const titleDraft = ref('')
const showMcp = ref(false)
const enabledMcpServers = ref<string[] | null>(null)

const bottomRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// Load conversation
const { data: convData, isLoading: convLoading } = useQuery({
  queryKey: ['ai-conversation', activeConvId],
  queryFn: () => api.get<Conversation>(`/api/ai/conversations/${activeConvId.value}`),
  enabled: computed(() => activeConvId.value !== null),
  staleTime: Infinity,
})

// Sync chat state whenever conversation data for the active id is available
watch(
  [activeConvId, convData],
  ([convId, conv]) => {
    if (view.value !== 'chat' || convId == null || !conv || conv.id !== convId) return
    messages.value = conv.messages ?? []
    title.value = conv.title
    titleDraft.value = conv.title
    enabledMcpServers.value = conv.enabled_mcp_servers
  },
  { immediate: true },
)

// Load MCP servers
const { data: mcpData } = useQuery({
  queryKey: ['mcp-servers'],
  queryFn: () => api.get<{ servers: McpServer[] }>('/api/mcp/servers'),
  staleTime: 60_000,
})
const mcpServers = computed(() => mcpData.value?.servers ?? [])

// Auto-scroll on new messages
watch([messages, isThinking], () => {
  nextTick(() => bottomRef.value?.scrollIntoView({ behavior: 'smooth' }))
})

// Save conversation helper
function saveConversation(updatedMessages: ChatMessage[], updatedMcp?: string[] | null) {
  const mcp = updatedMcp !== undefined ? updatedMcp : enabledMcpServers.value
  api
    .put(`/api/ai/conversations/${activeConvId.value}`, {
      title: title.value,
      messages: updatedMessages,
      enabledMcpServers: mcp,
    })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    })
    .catch(() => { /* silent */ })
}

// Update title
function saveTitle() {
  if (!titleDraft.value.trim() || titleDraft.value === title.value) {
    editingTitle.value = false
    titleDraft.value = title.value
    return
  }
  title.value = titleDraft.value
  editingTitle.value = false
  api
    .put(`/api/ai/conversations/${activeConvId.value}`, {
      title: titleDraft.value,
      messages: messages.value,
      enabledMcpServers: enabledMcpServers.value,
    })
    .then(() => queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }))
    .catch(() => { /* silent */ })
}

// Toggle an MCP server
function toggleMcp(serverId: string) {
  let next: string[] | null
  if (enabledMcpServers.value === null) {
    // All enabled → disable just this one
    next = mcpServers.value.map((s) => s.id).filter((id) => id !== serverId)
  } else if (enabledMcpServers.value.includes(serverId)) {
    next = enabledMcpServers.value.filter((id) => id !== serverId)
  } else {
    const updated = [...enabledMcpServers.value, serverId]
    // If all enabled, collapse back to null
    next = updated.length === mcpServers.value.length ? null : updated
  }
  enabledMcpServers.value = next
  saveConversation(messages.value, next)
}

// Is a server enabled?
function isMcpEnabled(serverId: string) {
  return enabledMcpServers.value === null || enabledMcpServers.value.includes(serverId)
}

// Send message
async function sendMessage() {
  const text = input.value.trim()
  if (!text || isThinking.value) return

  const userMsg: ChatMessage = { role: 'user', content: text }
  const newMessages = [...messages.value, userMsg]
  const previousMessages = messages.value
  messages.value = newMessages
  input.value = ''
  isThinking.value = true
  toolCallNames.value = []

  try {
    const result = await api.post<{ reply: string; toolCalls?: { tool: string }[] }>(
      '/api/ai/chat',
      {
        messages: newMessages,
        enabledMcpServers: enabledMcpServers.value,
      },
    )

    toolCallNames.value = result.toolCalls?.map((tc) => tc.tool) ?? []

    const assistantMsg: ChatMessage = { role: 'assistant', content: result.reply }
    const finalMessages = [...newMessages, assistantMsg]
    messages.value = finalMessages
    saveConversation(finalMessages)
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Chat failed')
    // Revert user message on error
    messages.value = previousMessages
  } finally {
    isThinking.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendMessage()
  }
}

// ─── View switching ───────────────────────────────────────────────────────────

function resetChatState() {
  messages.value = []
  input.value = ''
  isThinking.value = false
  toolCallNames.value = []
  title.value = ''
  editingTitle.value = false
  titleDraft.value = ''
  showMcp.value = false
  enabledMcpServers.value = null
}

function openConversation(id: number) {
  resetChatState()
  activeConvId.value = id
  view.value = 'chat'
}

function backToList() {
  resetChatState()
  activeConvId.value = null
  view.value = 'list'
}
</script>

<template>
  <template v-if="open">
    <!-- FAB removed — AI Chat is triggered from sidebar -->

    <!-- Mobile overlay -->
    <div class="fixed inset-0 z-40 bg-black/30 sm:hidden" @click="emit('toggle')" />

    <!-- Panel -->
    <div
      class="fixed top-[57px] z-50 flex flex-col border-l border-border bg-card shadow-xl"
      :style="panelStyle"
    >
      <!-- Conversation list -->
      <template v-if="view === 'list'">
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div class="flex items-center gap-2">
            <N8nIcon icon="sparkles" :size="16" class="text-primary" />
            <h2 class="text-sm font-semibold text-text-dark">AI Chat</h2>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="flex cursor-pointer items-center gap-1 bg-primary rounded-sm px-2.5 py-1 text-xs text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
              :disabled="createPending"
              @click="createConversation"
            >
              <N8nIcon icon="plus" :size="12" /> New Chat
            </button>
            <button
              class="cursor-pointer rounded-sm p-1.5 text-text-xmuted hover:text-text-dark"
              title="Close"
              @click="emit('toggle')"
            >
              <N8nIcon icon="x" :size="16" />
            </button>
          </div>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="listLoading" class="p-4 text-sm text-text-muted">Loading conversations...</div>
          <div v-else-if="conversations.length === 0" class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <N8nIcon icon="message-square" :size="32" class="text-text-xmuted" />
            <p class="text-sm text-text-muted">No conversations yet.</p>
            <N8nButton
              variant="brand"
              size="small"
              label="Start a conversation"
              :disabled="createPending"
              @click="createConversation"
            />
          </div>
          <div v-else class="divide-y divide-border-light">
            <div
              v-for="conv in conversations"
              :key="conv.id"
              class="group flex cursor-pointer items-start gap-2 px-4 py-3 hover:bg-card-hover"
              @click="openConversation(conv.id)"
            >
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm text-text-dark transition-colors group-hover:text-primary">
                  {{ conv.title }}
                </p>
                <div class="mt-0.5 flex items-center gap-2">
                  <span class="text-[10px] text-text-xmuted">
                    {{ conv.message_count }} message{{ conv.message_count !== 1 ? 's' : '' }}
                  </span>
                  <span class="text-[10px] text-text-xmuted">&middot;</span>
                  <span class="text-[10px] text-text-xmuted">{{ timeAgo(conv.updated_at) }}</span>
                </div>
              </div>
              <button
                class="mt-0.5 shrink-0 cursor-pointer rounded-sm p-1 text-text-xmuted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                title="Delete"
                @click.stop="confirmDeleteConversation(conv.id)"
              >
                <N8nIcon icon="trash-2" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Chat view -->
      <template v-else>
        <!-- Header -->
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <button
            class="cursor-pointer rounded-sm p-1 text-text-xmuted hover:text-text-dark"
            title="Back"
            @click="backToList"
          >
            <N8nIcon icon="chevron-left" :size="16" />
          </button>

          <input
            v-if="editingTitle"
            v-model="titleDraft"
            autofocus
            class="min-w-0 flex-1 bg-input-bg border border-input-focus rounded-sm px-2 py-0.5 text-sm font-medium text-text-dark focus:outline-none"
            @blur="saveTitle"
            @keydown.enter="saveTitle"
          />
          <button
            v-else
            class="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium text-text-dark transition-colors hover:text-primary"
            title="Click to rename"
            @click="editingTitle = true"
          >
            {{ title || 'Chat' }}
          </button>

          <button
            class="cursor-pointer rounded-sm p-1.5 transition-colors"
            :class="showMcp ? 'text-primary bg-primary-light' : 'text-text-xmuted hover:text-text-dark'"
            title="MCP Servers"
            @click="showMcp = !showMcp"
          >
            <N8nIcon icon="server" :size="14" />
          </button>

          <button
            class="cursor-pointer rounded-sm p-1.5 text-text-xmuted hover:text-text-dark"
            title="Close"
            @click="emit('toggle')"
          >
            <N8nIcon icon="x" :size="16" />
          </button>
        </div>

        <!-- MCP panel -->
        <div v-if="showMcp && mcpServers.length > 0" class="shrink-0 border-b border-border bg-bg px-4 py-2.5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase text-text-muted">MCP Servers</span>
            <button class="cursor-pointer text-text-xmuted hover:text-text-dark" @click="showMcp = false">
              <N8nIcon icon="chevron-up" :size="12" />
            </button>
          </div>
          <div class="space-y-1">
            <label v-for="srv in mcpServers" :key="srv.id" class="group flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                :checked="isMcpEnabled(srv.id)"
                class="accent-primary"
                @change="toggleMcp(srv.id)"
              />
              <span class="flex-1 truncate text-xs text-text-dark transition-colors group-hover:text-primary">
                {{ srv.name }}
              </span>
              <span class="shrink-0 text-[10px] text-text-xmuted">
                {{ srv.toolCount }} tool{{ srv.toolCount !== 1 ? 's' : '' }}
              </span>
              <span
                class="shrink-0 text-[10px]"
                :class="srv.status === 'connected' ? 'text-success' : 'text-text-xmuted'"
              >
                {{ srv.status }}
              </span>
            </label>
          </div>
        </div>

        <div v-else-if="showMcp" class="shrink-0 border-b border-border bg-bg px-4 py-2.5">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase text-text-muted">MCP Servers</span>
            <button class="cursor-pointer text-text-xmuted hover:text-text-dark" @click="showMcp = false">
              <N8nIcon icon="chevron-up" :size="12" />
            </button>
          </div>
          <p class="text-xs text-text-muted">No MCP servers configured.</p>
        </div>

        <!-- Message area -->
        <div class="space-y-3 flex-1 overflow-y-auto px-4 py-3">
          <div v-if="convLoading" class="text-sm text-text-muted">Loading...</div>
          <div v-else-if="messages.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-center">
            <N8nIcon icon="sparkles" :size="28" class="text-text-xmuted" />
            <p class="text-sm text-text-muted">How can I help you today?</p>
          </div>
          <template v-else>
            <template v-for="(msg, i) in messages" :key="`msg-${i}`">
              <!-- User message -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[85%] break-words rounded-lg bg-primary-light px-3 py-2 text-sm leading-relaxed text-text-dark">
                  {{ msg.content }}
                </div>
              </div>
              <!-- Assistant message -->
              <div v-else class="flex justify-start">
                <div
                  class="max-w-[90%] break-words rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed text-text-dark"
                  v-html="assistantHtml(msg.content)"
                />
              </div>
            </template>
          </template>

          <!-- Tool calls -->
          <div v-for="(name, i) in toolCallNames" :key="`tool-${i}`" class="flex justify-start">
            <span class="rounded-full border border-border bg-border-light px-2 py-0.5 text-[10px] text-text-muted">
              Used tool: {{ name }}
            </span>
          </div>

          <!-- Thinking indicator -->
          <div v-if="isThinking" class="flex items-center gap-1.5 text-xs text-text-muted">
            <N8nIcon icon="loader-circle" :size="13" spin />
            Thinking...
          </div>

          <div ref="bottomRef" />
        </div>

        <!-- Input bar -->
        <div class="shrink-0 border-t border-border px-3 py-2.5">
          <div class="flex items-end gap-2 bg-input-bg border border-input-border rounded-md px-3 py-2 transition-colors focus-within:border-input-focus">
            <textarea
              ref="inputRef"
              v-model="input"
              rows="1"
              placeholder="Message AI... (Enter to send)"
              class="max-h-32 flex-1 resize-none bg-transparent text-sm leading-5 text-text-dark placeholder:text-text-xmuted focus:outline-none"
              :style="{ minHeight: '20px' }"
              :disabled="isThinking"
              @keydown="handleKeyDown"
            />
            <button
              class="shrink-0 cursor-pointer p-1 text-primary transition-colors hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              title="Send"
              :disabled="!input.trim() || isThinking"
              @click="sendMessage"
            >
              <N8nIcon icon="send" :size="16" />
            </button>
          </div>
          <p class="mt-1 text-right text-[10px] text-text-xmuted">
            Shift+Enter for new line
          </p>
        </div>
      </template>
    </div>
  </template>
</template>