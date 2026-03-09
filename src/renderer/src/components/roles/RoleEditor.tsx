import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Role, useRolesStore } from '../../stores/roles.store'

interface RoleEditorProps {
  role?: Role
  onSave: () => void
  onCancel: () => void
}

export function RoleEditor({ role, onSave, onCancel }: RoleEditorProps) {
  const { addRole, updateRole } = useRolesStore()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(role?.systemPrompt ?? '')
  const [icon, setIcon] = useState(role?.icon ?? '')
  const [saving, setSaving] = useState(false)

  const isBuiltin = role?.isBuiltin ?? false

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    try {
      if (role) {
        const updated = await window.api.updateRole(role.id, {
          name: name.trim(),
          description: description.trim() || null,
          systemPrompt: systemPrompt.trim() || null,
          icon: icon.trim() || null
        })
        if (updated) updateRole(role.id, updated)
      } else {
        const created = await window.api.createRole({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          icon: icon.trim() || undefined
        })
        addRole(created)
      }
      onSave()
    } catch (err) {
      console.error('Failed to save role:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <button
          onClick={onCancel}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">
          {role ? 'Modifier le rôle' : 'Nouveau rôle'}
        </h2>
        {isBuiltin && (
          <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded">
            Intégré
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nom</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du rôle..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description courte..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Icône Lucide</label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="Ex: Code, Pen, BarChart..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prompt système</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Instructions pour le modèle..."
            rows={8}
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 p-4 border-t border-border">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
