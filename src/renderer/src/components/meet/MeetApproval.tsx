import { useMeetStore } from '../../stores/meet.store'

export function MeetApproval() {
  const { pendingApprovals, approveLlm, rejectLlm, session } = useMeetStore()

  if (pendingApprovals.length === 0) return null

  return (
    <div className="space-y-2 px-4 py-2">
      {pendingApprovals.map((req) => (
        <div
          key={req.messageId}
          className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-400">
              {session?.guestName ?? 'Guest'} veut interroger le LLM
            </span>
          </div>
          <div className="mb-3 rounded-lg bg-black/20 p-2.5 text-xs italic text-muted-foreground">
            &ldquo;{req.content.length > 200 ? req.content.slice(0, 200) + '...' : req.content}
            &rdquo;
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => approveLlm(req.messageId)}
              className="rounded-lg border border-green-500/30 bg-green-500/15 px-4 py-1.5 text-xs text-green-400 hover:bg-green-500/25"
            >
              Approuver
            </button>
            <button
              onClick={() => rejectLlm(req.messageId)}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
            >
              Refuser
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
