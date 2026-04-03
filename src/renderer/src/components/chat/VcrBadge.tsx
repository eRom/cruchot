import { useVcrStore } from '@/stores/vcr.store'

export function VcrBadge() {
  const isRecording = useVcrStore((s) => s.isRecording)

  if (!isRecording) return null

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5">
      <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[10px] font-semibold text-red-400">REC</span>
    </span>
  )
}
