import { sanitizeForLog } from '../log-utils'

describe('sanitizeForLog', () => {
  describe('coercion', () => {
    it('returns plain ASCII strings unchanged', () => {
      expect(sanitizeForLog('hello world')).toBe('hello world')
    })

    it('converts numbers to string', () => {
      expect(sanitizeForLog(42)).toBe('42')
    })

    it('converts booleans to string', () => {
      expect(sanitizeForLog(true)).toBe('true')
      expect(sanitizeForLog(false)).toBe('false')
    })

    it('converts null/undefined to string literal', () => {
      expect(sanitizeForLog(null)).toBe('null')
      expect(sanitizeForLog(undefined)).toBe('undefined')
    })

    it('JSON-encodes objects', () => {
      expect(sanitizeForLog({ foo: 'bar' })).toBe('{"foo":"bar"}')
    })

    it('JSON-encodes arrays', () => {
      expect(sanitizeForLog([1, 2, 3])).toBe('[1,2,3]')
    })
  })

  describe('control character stripping (log injection)', () => {
    it('strips newlines', () => {
      expect(sanitizeForLog('foo\nbar')).toBe('foobar')
    })

    it('strips carriage returns', () => {
      expect(sanitizeForLog('foo\rbar')).toBe('foobar')
    })

    it('strips CRLF', () => {
      expect(sanitizeForLog('foo\r\nbar')).toBe('foobar')
    })

    it('strips null bytes', () => {
      expect(sanitizeForLog('foo\x00bar')).toBe('foobar')
    })

    it('strips BEL (\\x07)', () => {
      expect(sanitizeForLog('alert\x07here')).toBe('alerthere')
    })

    it('strips backspace (\\x08)', () => {
      expect(sanitizeForLog('foo\x08bar')).toBe('foobar')
    })

    it('strips form feed (\\x0c)', () => {
      expect(sanitizeForLog('foo\x0cbar')).toBe('foobar')
    })

    it('strips DEL (\\x7f)', () => {
      expect(sanitizeForLog('foo\x7fbar')).toBe('foobar')
    })

    it('strips C1 control chars (\\x80-\\x9f)', () => {
      expect(sanitizeForLog('foo\x80bar\x9fbaz')).toBe('foobarbaz')
    })

    it('preserves tab (\\t)', () => {
      // Tab is 0x09 — left intact because it is harmless and legitimate
      expect(sanitizeForLog('col1\tcol2')).toBe('col1\tcol2')
    })
  })

  describe('ANSI escape sequences (terminal injection)', () => {
    it('strips colour CSI sequences', () => {
      expect(sanitizeForLog('\x1b[31mred\x1b[0m')).toBe('red')
    })

    it('strips multi-arg CSI sequences', () => {
      expect(sanitizeForLog('\x1b[38;2;255;0;0mfoo\x1b[0m')).toBe('foo')
    })

    it('strips cursor movement', () => {
      expect(sanitizeForLog('foo\x1b[2Abar')).toBe('foobar')
    })

    it('strips clear screen sequence', () => {
      expect(sanitizeForLog('foo\x1b[2Jbar')).toBe('foobar')
    })

    it('strips OSC sequences', () => {
      // OSC = `\x1b]...BEL` — used for window titles, hyperlinks
      expect(sanitizeForLog('\x1b]0;evil title\x07normal')).toBe('normal')
    })

    it('strips simple escape sequences', () => {
      expect(sanitizeForLog('foo\x1bMbar')).toBe('foobar')
    })
  })

  describe('combined attacks', () => {
    it('strips a forged log entry attempt', () => {
      const evil = 'innocent\n[ERROR] Forged: admin password leaked\n'
      const safe = sanitizeForLog(evil)
      expect(safe).toBe('innocent[ERROR] Forged: admin password leaked')
      expect(safe).not.toContain('\n')
    })

    it('strips ANSI hide+overwrite combo', () => {
      // \x1b[8m = invisible, \x1b[1A = up one line, \x1b[2K = erase line
      const evil = 'visible\x1b[8mhidden\x1b[0m\x1b[1A\x1b[2Koverwritten'
      expect(sanitizeForLog(evil)).toBe('visiblehiddenoverwritten')
    })

    it('handles real-world Telegram-style payload', () => {
      const evil = '<script>alert(1)</script>\n\rEND'
      expect(sanitizeForLog(evil)).toBe('<script>alert(1)</script>END')
    })
  })

  describe('length capping', () => {
    it('truncates strings longer than the default max', () => {
      const long = 'a'.repeat(300)
      const result = sanitizeForLog(long)
      expect(result.length).toBe(201) // 200 chars + ellipsis
      expect(result.endsWith('…')).toBe(true)
    })

    it('respects custom maxLen', () => {
      const result = sanitizeForLog('hello world', 5)
      expect(result).toBe('hello…')
    })

    it('does not truncate short strings', () => {
      expect(sanitizeForLog('short', 100)).toBe('short')
    })

    it('caps after stripping (final length is post-strip)', () => {
      // 'a' * 300 with newlines interspersed; after strip we have ~300 chars
      const input = 'a'.repeat(300).split('').join('\n')
      const result = sanitizeForLog(input)
      // After stripping newlines, 300 chars -> capped to 200 + ellipsis
      expect(result.length).toBe(201)
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(sanitizeForLog('')).toBe('')
    })

    it('handles string of only control chars', () => {
      expect(sanitizeForLog('\x00\x01\x02\x03')).toBe('')
    })

    it('handles string of only ANSI escapes', () => {
      expect(sanitizeForLog('\x1b[31m\x1b[0m')).toBe('')
    })

    it('handles unicode characters (preserved)', () => {
      expect(sanitizeForLog('héllo wörld 你好 🎉')).toBe('héllo wörld 你好 🎉')
    })

    it('handles unserializable objects gracefully', () => {
      const circular: any = {}
      circular.self = circular
      expect(sanitizeForLog(circular)).toBe('[unserializable]')
    })
  })
})
