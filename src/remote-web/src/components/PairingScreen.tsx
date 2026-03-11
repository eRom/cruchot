import { useState, useEffect, useRef } from 'react'

interface PairingScreenProps {
  onPair: (code: string, wsUrl?: string) => void
  error: string | null
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  wsUrl: string | null
}

export function PairingScreen({ onPair, error, connectionStatus, wsUrl }: PairingScreenProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [wsUrlInput, setWsUrlInput] = useState(wsUrl ?? '')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const hasAutoSubmitted = useRef(false)
  const hasUrlFromParams = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pairCode = params.get('pair')
    if (pairCode && pairCode.length === 6) {
      setDigits(pairCode.split(''))
    }
    const ws = params.get('ws')
    if (ws) {
      setWsUrlInput(ws)
      hasUrlFromParams.current = true
    }
  }, [])

  useEffect(() => {
    if (hasAutoSubmitted.current || !hasUrlFromParams.current) return
    if (!digits.every((d) => d !== '')) return
    const code = digits.join('')
    if (code.length !== 6 || connectionStatus !== 'connected') return
    hasAutoSubmitted.current = true
    onPair(code, wsUrlInput || undefined)
  }, [digits, onPair, connectionStatus, wsUrlInput])

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newDigits = [...digits]
    newDigits[index] = value
    setDigits(newDigits)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newDigits = [...digits]
      for (let i = 0; i < pasted.length && i < 6; i++) newDigits[i] = pasted[i]
      setDigits(newDigits)
      const nextEmpty = newDigits.findIndex((d) => d === '')
      if (nextEmpty >= 0) inputRefs.current[nextEmpty]?.focus()
    }
  }

  const handleSubmit = () => {
    const code = digits.join('')
    if (code.length === 6) onPair(code, wsUrlInput || undefined)
  }

  const hasAllDigits = digits.every((d) => d !== '')
  const hasWsUrl = wsUrlInput.trim().length > 0 || !!wsUrl

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-7 animate-fadeIn">
        {/* ── Header ────────────────── */}
        <div className="text-center space-y-2.5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/30">
            <svg viewBox="0 0 24 24" className="size-6 text-sidebar-primary" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-6.364-6.364L4.5 8.25" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Multi-LLM Remote</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connectez-vous a votre desktop pour chatter avec vos LLMs.
          </p>
        </div>

        {/* ── Connection status ─────── */}
        {(connectionStatus !== 'disconnected' || wsUrl) && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-accent'
                    : connectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-muted-foreground/40'
                }`}
              />
              <span className={`text-[11px] ${
                connectionStatus === 'connected' ? 'text-emerald-accent' : connectionStatus === 'connecting' ? 'text-amber-400' : 'text-muted-foreground'
              }`}>
                {connectionStatus === 'connected' ? 'Connecte' : connectionStatus === 'connecting' ? 'Connexion...' : 'Deconnecte'}
              </span>
            </div>
          </div>
        )}

        {/* ── WS URL input ─────────── */}
        {!wsUrl && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Adresse du serveur</label>
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm focus-within:border-ring/40 focus-within:shadow-md transition-all">
              <input
                type="url"
                value={wsUrlInput}
                onChange={(e) => setWsUrlInput(e.target.value)}
                placeholder="ws://localhost:9877"
                className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none font-mono"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Visible dans Parametres &gt; Remote sur le desktop.
            </p>
          </div>
        )}

        {/* ── Pairing code ─────────── */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground">Code de pairing</label>
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="size-12 rounded-lg border border-border/60 bg-card text-center text-xl font-semibold text-foreground shadow-sm
                  focus:border-sidebar-primary focus:ring-1 focus:ring-sidebar-primary/30 focus:outline-none
                  transition-all"
              />
            ))}
          </div>
        </div>

        {/* ── Submit ───────────────── */}
        <button
          onClick={handleSubmit}
          disabled={!hasAllDigits || !hasWsUrl}
          className={`w-full rounded-lg py-3 text-sm font-medium transition-all
            ${hasAllDigits && hasWsUrl
              ? 'bg-sidebar-primary text-white shadow-sm hover:shadow-md hover:scale-[1.01]'
              : 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
            }`}
        >
          Se connecter
        </button>

        {/* ── Error ────────────────── */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 animate-fadeIn">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
