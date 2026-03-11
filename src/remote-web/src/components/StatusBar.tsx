interface StatusBarProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  activeConversation: { id: string; title: string } | null
}

export function StatusBar({ connectionStatus, activeConversation }: StatusBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 bg-card/80 backdrop-blur-sm px-4 py-2.5 shrink-0">
      {/* Status dot + label */}
      <div className="flex items-center gap-2">
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
          connectionStatus === 'connected'
            ? 'text-emerald-accent'
            : connectionStatus === 'connecting'
              ? 'text-amber-400'
              : 'text-muted-foreground'
        }`}>
          {connectionStatus === 'connected'
            ? 'Connecte'
            : connectionStatus === 'connecting'
              ? 'Connexion...'
              : 'Deconnecte'}
        </span>
      </div>

      {/* Separator + Conversation title */}
      {activeConversation && (
        <>
          <span className="text-border">|</span>
          <span className="text-[11px] font-medium text-foreground truncate flex-1">
            {activeConversation.title}
          </span>
        </>
      )}

      {/* Brand mark */}
      <span className="ml-auto text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase">
        Remote
      </span>
    </div>
  )
}
