import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Prompt, usePromptsStore } from '../../stores/prompts.store'

interface PromptEditorProps {
  prompt?: Prompt
  onSave: () => void
  onCancel: () => void
}

export function PromptEditor({ prompt, onSave, onCancel }: PromptEditorProps) {
  const { addPrompt, updatePrompt } = usePromptsStore()
  const [title, setTitle] = useState(prompt?.title ?? '')
  const [content, setContent] = useState(prompt?.content ?? '')
  const [category, setCategory] = useState(prompt?.category ?? '')
  const [tagsInput, setTagsInput] = useState(prompt?.tags?.join(', ') ?? '')
  const [type, setType] = useState<'complet' | 'complement' | 'system'>(
    prompt?.type ?? 'complet'
  )
  const [saving, setSaving] = useState(false)

  // Extraire les variables {{nom}} du contenu
  function extractVariables(text: string): Array<{ name: string }> {
    const regex = /\{\{(\w+)\}\}/g
    const vars: Array<{ name: string }> = []
    const seen = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1])
        vars.push({ name: match[1] })
      }
    }
    return vars
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const variables = extractVariables(content)

    try {
      if (prompt) {
        const updated = await window.api.updatePrompt(prompt.id, {
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || null,
          tags: tags.length > 0 ? tags : null,
          type,
          variables: variables.length > 0 ? variables : null
        })
        if (updated) updatePrompt(prompt.id, updated)
      } else {
        const created = await window.api.createPrompt({
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
          type,
          variables: variables.length > 0 ? variables : undefined
        })
        addPrompt(created)
      }
      onSave()
    } catch (err) {
      console.error('Failed to save prompt:', err)
    } finally {
      setSaving(false)
    }
  }

  const detectedVars = extractVariables(content)

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
          {prompt ? 'Modifier le prompt' : 'Nouveau prompt'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Titre</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre du prompt..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <div className="flex gap-2">
            {(['complet', 'complement', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  type === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {t === 'complet' ? 'Complet' : t === 'complement' ? 'Complément' : 'Système'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Contenu
            <span className="text-muted-foreground font-normal ml-2">
              {'Utilisez {{variable}} pour les variables'}
            </span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Contenu du prompt..."
            rows={10}
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring resize-y font-mono"
          />
        </div>

        {detectedVars.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1">Variables détectées</label>
            <div className="flex flex-wrap gap-1">
              {detectedVars.map((v) => (
                <span
                  key={v.name}
                  className="text-xs px-2 py-1 bg-primary/15 text-primary rounded"
                >
                  {`{{${v.name}}}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Catégorie</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex: développement, rédaction..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Tags <span className="text-muted-foreground font-normal">(séparés par des virgules)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="tag1, tag2, tag3..."
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
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
          disabled={saving || !title.trim() || !content.trim()}
          className="flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
