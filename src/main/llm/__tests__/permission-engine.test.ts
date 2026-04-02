import { isReadOnlyCommand } from '../permission-engine'

describe('isReadOnlyCommand', () => {
  describe('simple readonly commands', () => {
    it('accepts ls', () => {
      expect(isReadOnlyCommand('ls')).toBe(true)
    })

    it('accepts ls with flags', () => {
      expect(isReadOnlyCommand('ls -la')).toBe(true)
    })

    it('accepts cat', () => {
      expect(isReadOnlyCommand('cat file.txt')).toBe(true)
    })

    it('accepts grep', () => {
      expect(isReadOnlyCommand('grep pattern file.txt')).toBe(true)
    })

    it('accepts head', () => {
      expect(isReadOnlyCommand('head -n 10 file.txt')).toBe(true)
    })

    it('accepts tail', () => {
      expect(isReadOnlyCommand('tail -f log.txt')).toBe(true)
    })

    it('accepts wc', () => {
      expect(isReadOnlyCommand('wc -l file.txt')).toBe(true)
    })

    it('accepts pwd', () => {
      expect(isReadOnlyCommand('pwd')).toBe(true)
    })

    it('accepts whoami', () => {
      expect(isReadOnlyCommand('whoami')).toBe(true)
    })

    it('accepts echo', () => {
      expect(isReadOnlyCommand('echo hello')).toBe(true)
    })

    it('accepts date', () => {
      expect(isReadOnlyCommand('date')).toBe(true)
    })

    it('accepts find', () => {
      expect(isReadOnlyCommand('find . -name "*.ts"')).toBe(true)
    })
  })

  describe('piped readonly commands', () => {
    it('accepts cat | grep', () => {
      expect(isReadOnlyCommand('cat file.txt | grep pattern')).toBe(true)
    })

    it('accepts ls | head', () => {
      expect(isReadOnlyCommand('ls | head -n 5')).toBe(true)
    })

    it('accepts grep | wc', () => {
      expect(isReadOnlyCommand('grep -r pattern . | wc -l')).toBe(true)
    })
  })

  describe('chained readonly commands', () => {
    it('accepts ls && cat', () => {
      expect(isReadOnlyCommand('ls && cat file.txt')).toBe(true)
    })

    it('accepts pwd; ls', () => {
      expect(isReadOnlyCommand('pwd; ls')).toBe(true)
    })

    it('accepts grep || echo', () => {
      expect(isReadOnlyCommand('grep pattern file.txt || echo "not found"')).toBe(true)
    })
  })

  describe('write commands (rejected)', () => {
    it('rejects rm', () => {
      expect(isReadOnlyCommand('rm file.txt')).toBe(false)
    })

    it('rejects mkdir', () => {
      expect(isReadOnlyCommand('mkdir newdir')).toBe(false)
    })

    it('rejects mv', () => {
      expect(isReadOnlyCommand('mv src dst')).toBe(false)
    })

    it('rejects npm install', () => {
      expect(isReadOnlyCommand('npm install')).toBe(false)
    })

    it('rejects git commit', () => {
      expect(isReadOnlyCommand('git commit -m "msg"')).toBe(false)
    })
  })

  describe('mixed commands (rejected if any non-readonly)', () => {
    it('rejects ls && rm', () => {
      expect(isReadOnlyCommand('ls && rm file.txt')).toBe(false)
    })

    it('rejects cat | sort | npm', () => {
      expect(isReadOnlyCommand('cat package.json | sort | npm install')).toBe(false)
    })

    it('rejects echo; mkdir', () => {
      expect(isReadOnlyCommand('echo hello; mkdir newdir')).toBe(false)
    })
  })

  describe('env var prefixes', () => {
    it('accepts LANG=C grep (readonly command with env prefix)', () => {
      expect(isReadOnlyCommand('LANG=C grep pattern file.txt')).toBe(true)
    })

    it('accepts multiple env vars before readonly command', () => {
      expect(isReadOnlyCommand('LANG=C LC_ALL=C sort file.txt')).toBe(true)
    })

    it('rejects FOO=bar npm install (write command with env prefix)', () => {
      expect(isReadOnlyCommand('FOO=bar npm install')).toBe(false)
    })
  })

  describe('absolute paths', () => {
    it('accepts /usr/bin/cat', () => {
      expect(isReadOnlyCommand('/usr/bin/cat file.txt')).toBe(true)
    })

    it('accepts /bin/ls', () => {
      expect(isReadOnlyCommand('/bin/ls -la')).toBe(true)
    })

    it('rejects /bin/rm', () => {
      expect(isReadOnlyCommand('/bin/rm -rf /tmp')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('rejects empty string', () => {
      expect(isReadOnlyCommand('')).toBe(false)
    })

    it('accepts jq (in readonly set)', () => {
      expect(isReadOnlyCommand('jq .name data.json')).toBe(true)
    })

    it('accepts rg (ripgrep)', () => {
      expect(isReadOnlyCommand('rg pattern src/')).toBe(true)
    })
  })
})
