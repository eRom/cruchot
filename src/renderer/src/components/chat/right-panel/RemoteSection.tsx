import { Smartphone, Globe } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { Switch } from '@/components/ui/switch'
import { useRemoteStore } from '@/stores/remote.store'
import { useRemoteServerStore } from '@/stores/remote-server.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useUiStore } from '@/stores/ui.store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function RemoteSection() {
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const isBusy = useUiStore((s) => s.isStreaming)

  // Telegram
  const telegramStatus = useRemoteStore((s) => s.status)
  const telegramConfig = useRemoteStore((s) => s.config)
  const telegramStart = useRemoteStore((s) => s.start)
  const telegramStop = useRemoteStore((s) => s.stop)
  const telegramPairingCode = useRemoteStore((s) => s.pairingCode)
  const hasTelegramToken = !!telegramConfig?.hasToken
  const isTelegramActive = telegramStatus === 'connected'
  const isTelegramPairing = telegramStatus === 'pairing'
  const isTelegramOn = isTelegramActive || isTelegramPairing

  // Web Remote
  const webStatus = useRemoteServerStore((s) => s.status)
  const webConfig = useRemoteServerStore((s) => s.config)
  const webStart = useRemoteServerStore((s) => s.start)
  const webStop = useRemoteServerStore((s) => s.stop)
  const isWebRunning = webStatus === 'running'
  const webClients = webConfig?.connectedClients ?? 0

  const handleTelegramToggle = async (checked: boolean) => {
    try {
      if (checked) {
        const code = await telegramStart(activeConversationId ?? undefined)
        const pairText = `/pair ${code}`
        navigator.clipboard.writeText(pairText).catch(() => {})
        toast.success(`Envoyez ${pairText} a votre bot Telegram`, {
          description: 'Commande copiee dans le presse-papier'
        })
      } else {
        await telegramStop()
      }
    } catch {
      toast.error('Erreur Remote Telegram')
    }
  }

  const handleWebToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await webStart(activeConversationId ?? undefined)
        toast.success('Serveur Web Remote demarre')
      } else {
        await webStop()
      }
    } catch {
      toast.error('Erreur Web Remote')
    }
  }

  return (
    <CollapsibleSection title="Remote" defaultOpen>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative">
              <Smartphone className="size-4" />
              {isTelegramActive && (
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {isTelegramPairing && (
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-yellow-400 animate-pulse" />
              )}
            </span>
            <span className={cn(
              isTelegramActive && 'text-emerald-500',
              isTelegramPairing && 'text-yellow-500'
            )}>
              Telegram
            </span>
          </div>
          <Switch
            checked={isTelegramOn}
            onCheckedChange={handleTelegramToggle}
            disabled={!hasTelegramToken || isBusy}
          />
        </div>
        {isTelegramPairing && telegramPairingCode && (
          <p className="px-1 text-[11px] text-yellow-500/80">
            Code : <span className="font-mono font-medium">{telegramPairingCode}</span>
          </p>
        )}

        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative">
              <Globe className="size-4" />
              {isWebRunning && webClients > 0 && (
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {isWebRunning && webClients === 0 && (
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-blue-500" />
              )}
            </span>
            <span className={cn(
              isWebRunning && webClients > 0 && 'text-emerald-500',
              isWebRunning && webClients === 0 && 'text-blue-500'
            )}>
              Web {isWebRunning && webClients > 0 ? `(${webClients})` : ''}
            </span>
          </div>
          <Switch
            checked={isWebRunning}
            onCheckedChange={handleWebToggle}
            disabled={isBusy}
          />
        </div>

        {!hasTelegramToken && (
          <p className="px-1 text-[11px] text-muted-foreground/50">
            Configurez Telegram dans Parametres &gt; Remote
          </p>
        )}
      </div>
    </CollapsibleSection>
  )
}
