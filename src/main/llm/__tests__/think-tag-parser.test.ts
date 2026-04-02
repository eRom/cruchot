import { ThinkTagParser } from '../think-tag-parser'

describe('ThinkTagParser', () => {
  let parser: ThinkTagParser

  beforeEach(() => {
    parser = new ThinkTagParser()
  })

  describe('parse()', () => {
    it('passes plain text through as type text', () => {
      const result = parser.parse('Hello world')
      expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
    })

    it('extracts reasoning content from <think> tags', () => {
      const result = parser.parse('<think>This is my reasoning</think>After thought')
      expect(result).toEqual([
        { type: 'reasoning', content: 'This is my reasoning' },
        { type: 'text', content: 'After thought' },
      ])
    })

    it('handles text before and after a think tag', () => {
      const result = parser.parse('Before <think>inside</think> after')
      expect(result).toEqual([
        { type: 'text', content: 'Before ' },
        { type: 'reasoning', content: 'inside' },
        { type: 'text', content: ' after' },
      ])
    })

    it('buffers partial open tag split across chunks', () => {
      const r1 = parser.parse('Hello <thi')
      expect(r1).toEqual([{ type: 'text', content: 'Hello ' }])

      const r2 = parser.parse('nk>reasoning</think>done')
      expect(r2).toEqual([
        { type: 'reasoning', content: 'reasoning' },
        { type: 'text', content: 'done' },
      ])
    })

    it('buffers partial close tag split across chunks', () => {
      const r1 = parser.parse('<think>partial</thi')
      expect(r1).toEqual([{ type: 'reasoning', content: 'partial' }])

      const r2 = parser.parse('nk>after')
      expect(r2).toEqual([{ type: 'text', content: 'after' }])
    })

    it('handles multiple think blocks in one chunk', () => {
      const result = parser.parse('<think>A</think>text<think>B</think>end')
      expect(result).toEqual([
        { type: 'reasoning', content: 'A' },
        { type: 'text', content: 'text' },
        { type: 'reasoning', content: 'B' },
        { type: 'text', content: 'end' },
      ])
    })

    it('returns empty array for empty string', () => {
      const result = parser.parse('')
      expect(result).toEqual([])
    })

    it('handles reasoning that spans multiple chunks', () => {
      const r1 = parser.parse('<think>first part ')
      expect(r1).toEqual([{ type: 'reasoning', content: 'first part ' }])

      const r2 = parser.parse('second part</think>')
      expect(r2).toEqual([{ type: 'reasoning', content: 'second part' }])
    })
  })

  describe('flush()', () => {
    it('returns pending buffer content when there is a partial tag', () => {
      parser.parse('Hello <thi')
      const result = parser.flush()
      expect(result).toEqual([{ type: 'text', content: '<thi' }])
    })

    it('returns empty array when state is clean', () => {
      parser.parse('Hello world')
      const result = parser.flush()
      expect(result).toEqual([])
    })

    it('clears buffer after flush', () => {
      parser.parse('Hello <thi')
      parser.flush()
      const result = parser.flush()
      expect(result).toEqual([])
    })

    it('returns reasoning type when flushed inside think tag', () => {
      parser.parse('<think>partial</thi')
      const result = parser.flush()
      expect(result).toEqual([{ type: 'reasoning', content: '</thi' }])
    })
  })

  describe('reset()', () => {
    it('clears internal state so parser can be reused', () => {
      parser.parse('<think>inside')
      parser.reset()
      const result = parser.parse('clean text')
      expect(result).toEqual([{ type: 'text', content: 'clean text' }])
    })

    it('clears pending buffer', () => {
      parser.parse('some <thi')
      parser.reset()
      expect(parser.flush()).toEqual([])
    })
  })
})
