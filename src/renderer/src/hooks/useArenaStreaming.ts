import { useEffect, useCallback, useRef } from 'react'
import { useArenaStore } from '@/stores/arena.store'
import type { ArenaChunk } from '../../../preload/types'

/**
 * Hook that listens for arena streaming chunks from both sides
 * and updates the arena store in real-time.
 */
export function useArenaStreaming() {
  const startLeftStream = useArenaStore((s) => s.startLeftStream)
  const startRightStream = useArenaStore((s) => s.startRightStream)
  const appendToLeft = useArenaStore((s) => s.appendToLeft)
  const appendToRight = useArenaStore((s) => s.appendToRight)
  const appendReasoningLeft = useArenaStore((s) => s.appendReasoningLeft)
  const appendReasoningRight = useArenaStore((s) => s.appendReasoningRight)
  const finishLeft = useArenaStore((s) => s.finishLeft)
  const finishRight = useArenaStore((s) => s.finishRight)
  const errorLeft = useArenaStore((s) => s.errorLeft)
  const errorRight = useArenaStore((s) => s.errorRight)
  const setCurrentMatchId = useArenaStore((s) => s.setCurrentMatchId)

  // Refs to avoid stale closure
  const leftStreamingRef = useRef(false)
  const rightStreamingRef = useRef(false)

  const handleLeftChunk = useCallback((chunk: ArenaChunk) => {
    switch (chunk.type) {
      case 'start':
        leftStreamingRef.current = true
        startLeftStream(chunk.modelId ?? '', chunk.providerId ?? '')
        break
      case 'text-delta':
        appendToLeft(chunk.content ?? '')
        break
      case 'reasoning-delta':
        appendReasoningLeft(chunk.content ?? '')
        break
      case 'finish':
        leftStreamingRef.current = false
        finishLeft({
          content: chunk.content ?? '',
          id: chunk.messageId,
          tokensIn: chunk.usage?.promptTokens,
          tokensOut: chunk.usage?.completionTokens,
          cost: chunk.cost,
          responseTimeMs: chunk.responseTimeMs
        })
        break
      case 'error':
        leftStreamingRef.current = false
        errorLeft(chunk.error ?? 'Erreur inconnue')
        break
    }
  }, [startLeftStream, appendToLeft, appendReasoningLeft, finishLeft, errorLeft])

  const handleRightChunk = useCallback((chunk: ArenaChunk) => {
    switch (chunk.type) {
      case 'start':
        rightStreamingRef.current = true
        startRightStream(chunk.modelId ?? '', chunk.providerId ?? '')
        break
      case 'text-delta':
        appendToRight(chunk.content ?? '')
        break
      case 'reasoning-delta':
        appendReasoningRight(chunk.content ?? '')
        break
      case 'finish':
        rightStreamingRef.current = false
        finishRight({
          content: chunk.content ?? '',
          id: chunk.messageId,
          tokensIn: chunk.usage?.promptTokens,
          tokensOut: chunk.usage?.completionTokens,
          cost: chunk.cost,
          responseTimeMs: chunk.responseTimeMs
        })
        break
      case 'error':
        rightStreamingRef.current = false
        errorRight(chunk.error ?? 'Erreur inconnue')
        break
    }
  }, [startRightStream, appendToRight, appendReasoningRight, finishRight, errorRight])

  const handleMatchCreated = useCallback((data: { matchId: string }) => {
    setCurrentMatchId(data.matchId)
  }, [setCurrentMatchId])

  // Listen for arena chunks
  useEffect(() => {
    window.api.onArenaChunkLeft(handleLeftChunk)
    window.api.onArenaChunkRight(handleRightChunk)
    window.api.onArenaMatchCreated(handleMatchCreated)

    return () => {
      window.api.offArenaChunkLeft()
      window.api.offArenaChunkRight()
      window.api.offArenaMatchCreated()

      // Cancel streams if component unmounts while streaming
      if (leftStreamingRef.current || rightStreamingRef.current) {
        window.api.arenaCancel().catch(() => {})
      }
    }
  }, [handleLeftChunk, handleRightChunk, handleMatchCreated])
}
