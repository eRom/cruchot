import { Keyboard } from 'lucide-react'

interface Keybinding {
  action: string
  shortcut: string
}

const KEYBINDINGS: Keybinding[] = [
  { action: 'Nouvelle conversation', shortcut: 'Cmd+N' },
  { action: 'Recherche rapide', shortcut: 'Cmd+K' },
  { action: 'Ouvrir les parametres', shortcut: 'Cmd+,' },
  { action: 'Liste des modeles', shortcut: 'Cmd+M' },
  { action: 'Fermer / Annuler', shortcut: 'Escape' }
]

export function KeybindingsSettings() {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-foreground">Raccourcis clavier</h2>
        <Keyboard className="size-4 text-muted-foreground" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Action
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                Raccourci
              </th>
            </tr>
          </thead>
          <tbody>
            {KEYBINDINGS.map((kb, idx) => (
              <tr
                key={kb.action}
                className={idx < KEYBINDINGS.length - 1 ? 'border-b border-border/20' : ''}
              >
                <td className="px-4 py-3 text-foreground">{kb.action}</td>
                <td className="px-4 py-3 text-right">
                  <kbd className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {kb.shortcut}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Les raccourcis ne sont pas encore personnalisables.
      </p>
    </section>
  )
}
