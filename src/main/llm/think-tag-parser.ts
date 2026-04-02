/**
 * State machine parser for <think>...</think> tags emitted by
 * open-source models (LM Studio, Ollama) during streaming.
 *
 * These models emit reasoning inside <think>...</think> as plain
 * text-delta chunks. This parser splits the stream into typed
 * segments ('text' or 'reasoning') while handling partial tags
 * that may span across chunk boundaries.
 */
export class ThinkTagParser {
  private insideThinkTag = false
  private pendingBuffer = ''

  /**
   * Parse a text chunk. Returns segments typed as 'text' or 'reasoning'.
   * May buffer partial tags internally.
   */
  parse(text: string): Array<{ type: 'text' | 'reasoning'; content: string }> {
    const segments: Array<{ type: 'text' | 'reasoning'; content: string }> = []
    let remaining = this.pendingBuffer + text
    this.pendingBuffer = ''

    while (remaining.length > 0) {
      if (!this.insideThinkTag) {
        const openIdx = remaining.indexOf('<think>')
        if (openIdx === -1) {
          // Check for partial tag at the end (e.g. "<thi")
          const partialIdx = remaining.lastIndexOf('<')
          if (
            partialIdx !== -1 &&
            partialIdx > remaining.length - 8 &&
            '<think>'.startsWith(remaining.slice(partialIdx))
          ) {
            if (partialIdx > 0) segments.push({ type: 'text', content: remaining.slice(0, partialIdx) })
            this.pendingBuffer = remaining.slice(partialIdx)
            return segments
          }
          segments.push({ type: 'text', content: remaining })
          return segments
        }
        if (openIdx > 0) segments.push({ type: 'text', content: remaining.slice(0, openIdx) })
        this.insideThinkTag = true
        remaining = remaining.slice(openIdx + 7) // skip "<think>"
      } else {
        const closeIdx = remaining.indexOf('</think>')
        if (closeIdx === -1) {
          // Check for partial closing tag
          const partialIdx = remaining.lastIndexOf('<')
          if (
            partialIdx !== -1 &&
            partialIdx > remaining.length - 9 &&
            '</think>'.startsWith(remaining.slice(partialIdx))
          ) {
            if (partialIdx > 0) segments.push({ type: 'reasoning', content: remaining.slice(0, partialIdx) })
            this.pendingBuffer = remaining.slice(partialIdx)
            return segments
          }
          segments.push({ type: 'reasoning', content: remaining })
          return segments
        }
        if (closeIdx > 0) segments.push({ type: 'reasoning', content: remaining.slice(0, closeIdx) })
        this.insideThinkTag = false
        remaining = remaining.slice(closeIdx + 8) // skip "</think>"
      }
    }
    return segments
  }

  /**
   * Flush any remaining buffered content. Call after the stream ends
   * to retrieve any partial tag content that was being buffered.
   */
  flush(): Array<{ type: 'text' | 'reasoning'; content: string }> {
    if (!this.pendingBuffer) return []
    const content = this.pendingBuffer
    this.pendingBuffer = ''
    return [{ type: this.insideThinkTag ? 'reasoning' : 'text', content }]
  }

  /**
   * Reset parser state for reuse.
   */
  reset(): void {
    this.insideThinkTag = false
    this.pendingBuffer = ''
  }
}
