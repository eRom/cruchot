import { runBashSecurityChecks, wrapCommand } from '../bash-security'

describe('runBashSecurityChecks', () => {
  describe('Check 1: unclosed quotes', () => {
    it('blocks command with unclosed single quote', () => {
      const result = runBashSecurityChecks("echo 'hello")
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(1)
    })

    it('blocks command with unclosed double quote', () => {
      const result = runBashSecurityChecks('echo "hello')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(1)
    })

    it('passes command with balanced single quotes', () => {
      const result = runBashSecurityChecks("echo 'hello world'")
      expect(result.pass).toBe(true)
    })

    it('passes command with balanced double quotes', () => {
      const result = runBashSecurityChecks('echo "hello world"')
      expect(result.pass).toBe(true)
    })

    it('passes command with escaped quote inside double quotes', () => {
      const result = runBashSecurityChecks('echo "it\\"s fine"')
      expect(result.pass).toBe(true)
    })
  })

  describe('Check 2: jq system()', () => {
    it('blocks jq with system() call', () => {
      const result = runBashSecurityChecks('echo x | jq system("id")')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(2)
    })

    it('allows normal jq usage', () => {
      const result = runBashSecurityChecks('cat data.json | jq .name')
      expect(result.pass).toBe(true)
    })

    it('allows jq without system', () => {
      const result = runBashSecurityChecks('jq -r ".[] | .id" data.json')
      expect(result.pass).toBe(true)
    })
  })

  describe('Check 3: obfuscated flags (backslash in command names)', () => {
    it('blocks backslash inside command name outside quotes', () => {
      const result = runBashSecurityChecks('r\\m -rf /tmp/test')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(3)
    })

    it('allows backslash escape sequences inside double-quoted strings', () => {
      const result = runBashSecurityChecks('echo "line1\\nline2"')
      expect(result.pass).toBe(true)
    })

    it('allows backslash inside single-quoted strings', () => {
      const result = runBashSecurityChecks("echo 'a\\nb'")
      expect(result.pass).toBe(true)
    })
  })

  describe('Check 4: dangerous commands after semicolons/newlines', () => {
    it('blocks rm after semicolon', () => {
      const result = runBashSecurityChecks('ls; rm -rf /tmp')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })

    it('blocks sudo after newline', () => {
      const result = runBashSecurityChecks('ls\nsudo something')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })

    it('blocks chmod after semicolon', () => {
      const result = runBashSecurityChecks('echo hi; chmod 777 /etc/passwd')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })

    it('allows rm as standalone command (not after separator)', () => {
      // rm alone at start would not trigger check 4 (no preceding separator)
      const result = runBashSecurityChecks('rm file.txt')
      // should pass check 4 (no semicolon/newline before rm)
      expect(result.failedCheck).not.toBe(4)
    })

    it('blocks rm after & (background) — security regression', () => {
      // Critical: `&` was previously not in check 4. An attacker could bypass
      // the readonly check via `ls & rm -rf workspace/*`.
      const result = runBashSecurityChecks('ls & rm -rf /tmp/test')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })

    it('blocks sudo after &', () => {
      const result = runBashSecurityChecks('echo hi & sudo something')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })

    it('blocks chmod after &', () => {
      const result = runBashSecurityChecks('cat file & chmod 777 secret')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(4)
    })
  })

  describe('Check 5: dangerous variable assignments', () => {
    it('blocks IFS assignment', () => {
      const result = runBashSecurityChecks('IFS=: command')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(5)
    })

    it('blocks PATH assignment', () => {
      const result = runBashSecurityChecks('PATH=/evil/path:$PATH ls')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(5)
    })

    it('blocks LD_PRELOAD assignment', () => {
      const result = runBashSecurityChecks('LD_PRELOAD=/malicious.so ./program')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(5)
    })

    it('allows LANG env var prefix', () => {
      const result = runBashSecurityChecks('LANG=C grep pattern file.txt')
      expect(result.pass).toBe(true)
    })
  })

  describe('Check 7: command substitution', () => {
    it('blocks $() outside quotes', () => {
      const result = runBashSecurityChecks('echo $(id)')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(7)
    })

    it('blocks backticks outside quotes', () => {
      const result = runBashSecurityChecks('echo `id`')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(7)
    })

    it('allows backticks inside single quotes', () => {
      // Single-quoted strings prevent command substitution
      const result = runBashSecurityChecks("echo 'the `backtick` is literal'")
      expect(result.pass).toBe(true)
    })

    it('allows ${VAR} variable expansion (not blocked by check 7)', () => {
      // ${VAR} is not in COMMAND_SUBSTITUTION_PATTERNS
      const result = runBashSecurityChecks('echo ${HOME}')
      expect(result.pass).toBe(true)
    })
  })

  describe('Check 8: sensitive path redirections', () => {
    it('blocks redirect to /etc/', () => {
      const result = runBashSecurityChecks('echo evil > /etc/cron.d/backdoor')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(8)
    })

    it('blocks redirect to ~/.bashrc', () => {
      const result = runBashSecurityChecks('echo "alias ls=evil" >> ~/.bashrc')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(8)
    })

    it('blocks redirect to ~/.zshrc', () => {
      const result = runBashSecurityChecks('echo "some config" >> ~/.zshrc')
      expect(result.pass).toBe(false)
      expect(result.failedCheck).toBe(8)
    })
  })

  describe('safe commands', () => {
    it('allows ls', () => {
      expect(runBashSecurityChecks('ls -la').pass).toBe(true)
    })

    it('allows git status', () => {
      expect(runBashSecurityChecks('git status').pass).toBe(true)
    })

    it('allows npm install', () => {
      expect(runBashSecurityChecks('npm install').pass).toBe(true)
    })

    it('allows cat piped to grep', () => {
      expect(runBashSecurityChecks('cat file.txt | grep pattern').pass).toBe(true)
    })

    it('allows multi-line python script', () => {
      const python = `python3 -c "
import os
print(os.getcwd())
"`
      expect(runBashSecurityChecks(python).pass).toBe(true)
    })

    it('allows file path with spaces in quotes', () => {
      expect(runBashSecurityChecks('cat "/path/to/my file.txt"').pass).toBe(true)
    })
  })
})

describe('wrapCommand', () => {
  it('wraps bash command with extglob disable and eval', () => {
    const result = wrapCommand('ls -la', 'bash')
    expect(result).toContain('shopt -u extglob')
    expect(result).toContain("eval 'ls -la'")
    expect(result).toContain('< /dev/null')
  })

  it('wraps zsh command with NO_EXTENDED_GLOB', () => {
    const result = wrapCommand('ls -la', 'zsh')
    expect(result).toContain('setopt NO_EXTENDED_GLOB')
    expect(result).toContain("eval 'ls -la'")
  })

  it('includes cd prefix when workdir is provided', () => {
    const result = wrapCommand('ls', 'bash', '/workspace/project')
    expect(result).toContain("cd '/workspace/project'")
  })

  it('does not include cd when workdir is omitted', () => {
    const result = wrapCommand('ls', 'bash')
    expect(result).not.toContain('cd ')
  })

  it('escapes single quotes in command', () => {
    const result = wrapCommand("echo 'hello'", 'bash')
    // Single quotes in command become '\''
    expect(result).toContain("echo '\\''hello'\\''")
  })

  it('escapes single quotes in workdir path', () => {
    const result = wrapCommand('ls', 'bash', "/path/with'quote")
    expect(result).toContain("cd '/path/with'\\''quote'")
  })
})
