import { create } from 'zustand'
import type {
  MeetSessionInfo,
  MeetPermissions,
  MeetEvent,
  MeetCostSummary
} from '../../../preload/types'
import { useConversationsStore } from './conversations.store'
import { useMessagesStore } from './messages.store'

type MeetRole = 'host' | 'guest' | null

let typingTimer: ReturnType<typeof setTimeout> | null = null

interface PendingLlmRequest {
  messageId: string
  content: string
}

interface MeetState {
  role: MeetRole
  session: MeetSessionInfo | null
  isConnected: boolean
  inviteCode: string | null
  permissions: MeetPermissions
  sendMode: 'llm' | 'chat'
  isGuestTyping: boolean
  pendingApprovals: PendingLlmRequest[]

  createSession: (conversationId: string, hostName: string, guestName: string) => Promise<string>
  endSession: () => Promise<void>
  updatePermissions: (permissions: Partial<MeetPermissions>) => Promise<void>
  approveLlm: (messageId: string) => Promise<void>
  rejectLlm: (messageId: string) => Promise<void>
  joinSession: (hostUrl: string, inviteCode: string) => Promise<void>
  leaveSession: () => Promise<void>
  setSendMode: (mode: 'llm' | 'chat') => void
  toggleSendMode: () => void
  loadCosts: (sessionId: string) => Promise<MeetCostSummary | null>
  handleMeetEvent: (event: MeetEvent) => void
  reset: () => void
}

const initialPermissions: MeetPermissions = {
  guestCanLlm: false,
  guestAutoApprove: false,
  guestVisibility: 'response-only'
}

export const useMeetStore = create<MeetState>((set, get) => ({
  role: null,
  session: null,
  isConnected: false,
  inviteCode: null,
  permissions: initialPermissions,
  sendMode: 'llm',
  isGuestTyping: false,
  pendingApprovals: [],

  createSession: async (conversationId, hostName, guestName) => {
    const result = await window.api.meetCreateSession({ conversationId, hostName, guestName })
    set({
      role: 'host',
      inviteCode: result.inviteCode,
      session: {
        id: result.sessionId,
        conversationId,
        hostName,
        guestName,
        inviteCode: result.inviteCode,
        status: 'waiting',
        permissions: initialPermissions
      },
      isConnected: false
    })
    return result.inviteCode
  },

  endSession: async () => {
    await window.api.meetEndSession()
    get().reset()
  },

  updatePermissions: async (permissions) => {
    await window.api.meetUpdatePermissions(permissions)
    set((s) => ({
      permissions: { ...s.permissions, ...permissions }
    }))
  },

  approveLlm: async (messageId) => {
    await window.api.meetApproveLlm(messageId)
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((p) => p.messageId !== messageId)
    }))
  },

  rejectLlm: async (messageId) => {
    await window.api.meetRejectLlm(messageId)
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((p) => p.messageId !== messageId)
    }))
  },

  joinSession: async (hostUrl, inviteCode) => {
    await window.api.meetJoin({ hostUrl, inviteCode })
    set({ role: 'guest' })
  },

  leaveSession: async () => {
    await window.api.meetLeave()
    get().reset()
  },

  setSendMode: (mode) => set({ sendMode: mode }),

  toggleSendMode: () =>
    set((s) => ({
      sendMode: s.sendMode === 'llm' ? 'chat' : 'llm'
    })),

  loadCosts: async (sessionId) => {
    return window.api.meetGetCosts(sessionId)
  },

  handleMeetEvent: (event) => {
    switch (event.type) {
      case 'meet:welcome': {
        // Guard: skip if already connected (avoid duplicate handling)
        if (get().isConnected) break

        // Create a local mirror conversation for the guest
        const meetConvId = `meet-${event.sessionId}`
        const convStore = useConversationsStore.getState()

        // Only add if not already present
        if (!convStore.conversations.find((c) => c.id === meetConvId)) {
          convStore.addConversation({
            id: meetConvId,
            title: `Meet · ${event.guestName}`,
            createdAt: new Date(),
            updatedAt: new Date()
          })
        }
        convStore.setActiveConversation(meetConvId)

        set({
          isConnected: true,
          session: {
            id: event.sessionId,
            conversationId: meetConvId,
            hostName: event.hostName || 'Hôte',
            guestName: event.guestName,
            inviteCode: '',
            status: 'connected',
            permissions: event.permissions
          },
          permissions: event.permissions
        })
        break
      }
      case 'meet:permissions':
        set({ permissions: event.permissions })
        break
      case 'meet:typing':
        if (event.sender !== get().role) {
          if (typingTimer) clearTimeout(typingTimer)
          set({ isGuestTyping: true })
          typingTimer = setTimeout(() => set({ isGuestTyping: false }), 3000)
        }
        break
      case 'meet:chat': {
        // Received a chat message from the peer — add to local messages
        const chatConvId = get().session?.conversationId
        if (!chatConvId) break
        // Guard: skip if message already exists (dedup)
        const msgStore2 = useMessagesStore.getState()
        if (msgStore2.messages.find((m) => m.id === event.messageId)) break
        msgStore2.addMessage({
          id: event.messageId,
          conversationId: chatConvId,
          role: 'user',
          content: event.content,
          meetSender: event.sender,
          meetTarget: 'chat',
          createdAt: new Date()
        })
        break
      }
      case 'meet:chunk': {
        // Received a LLM stream chunk from the host — relay to messages store
        const chunkConvId = get().session?.conversationId
        if (!chunkConvId) break
        const msgStore = useMessagesStore.getState()
        const chunk = event.chunk

        if (chunk.type === 'start') {
          // Create a new streaming assistant message
          const streamMsgId = `meet-stream-${Date.now()}`
          msgStore.addMessage({
            id: streamMsgId,
            conversationId: chunkConvId,
            role: 'assistant',
            content: '',
            isStreaming: true,
            createdAt: new Date()
          })
          msgStore.setStreamingMessageId(streamMsgId)
        } else if (chunk.type === 'text-delta' && chunk.content) {
          const streamId = msgStore.streamingMessageId
          if (streamId) {
            msgStore.appendToMessage(streamId, chunk.content)
          }
        } else if (chunk.type === 'finish') {
          const streamId = msgStore.streamingMessageId
          if (streamId) {
            msgStore.updateMessage(streamId, { isStreaming: false })
            msgStore.setStreamingMessageId(null)
          }
        } else if (chunk.type === 'error') {
          const streamId = msgStore.streamingMessageId
          if (streamId) {
            msgStore.updateMessage(streamId, {
              isStreaming: false,
              content: msgStore.messages.find((m) => m.id === streamId)?.content + '\n\n⚠️ ' + (chunk.error || 'Erreur')
            })
            msgStore.setStreamingMessageId(null)
          }
        }
        break
      }
      case 'meet:llm-request':
        set((s) => ({
          pendingApprovals: [
            ...s.pendingApprovals,
            {
              messageId: event.messageId,
              content: event.content
            }
          ]
        }))
        break
      case 'meet:end':
      case 'meet:leave':
        get().reset()
        break
      case 'meet:invite-request':
        set((s) => ({
          isConnected: true,
          session: s.session ? { ...s.session, status: 'connected' } : null
        }))
        break
    }
  },

  reset: () =>
    set({
      role: null,
      session: null,
      isConnected: false,
      inviteCode: null,
      permissions: initialPermissions,
      sendMode: 'llm',
      isGuestTyping: false,
      pendingApprovals: []
    })
}))
