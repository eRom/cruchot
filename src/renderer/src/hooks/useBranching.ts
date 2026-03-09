import { useCallback, useMemo } from 'react'
import type { Message } from '@/stores/messages.store'

export interface BranchInfo {
  /** All sibling messages (same parentMessageId), sorted by createdAt */
  siblings: Message[]
  /** 1-based index of the current message among siblings */
  currentIndex: number
  /** Total number of branches */
  total: number
}

/**
 * Hook that derives branching information from the messages list.
 * Groups messages by parentMessageId to identify alternative branches.
 */
export function useBranching(messages: Message[]) {
  // Index: parentMessageId -> messages with that parent
  const branchMap = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const msg of messages) {
      const parentId = msg.parentMessageId ?? '__root__'
      const siblings = map.get(parentId)
      if (siblings) {
        siblings.push(msg)
      } else {
        map.set(parentId, [msg])
      }
    }
    // Sort each group by createdAt
    for (const siblings of map.values()) {
      siblings.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )
    }
    return map
  }, [messages])

  const getBranches = useCallback(
    (messageId: string): BranchInfo => {
      const message = messages.find((m) => m.id === messageId)
      if (!message) {
        return { siblings: [], currentIndex: 0, total: 0 }
      }

      const parentId = message.parentMessageId ?? '__root__'
      const siblings = branchMap.get(parentId) ?? [message]
      const currentIndex = siblings.findIndex((m) => m.id === messageId) + 1

      return {
        siblings,
        currentIndex,
        total: siblings.length,
      }
    },
    [messages, branchMap]
  )

  return { getBranches }
}
