import React, { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface MermaidBlockProps {
  code: string
}

// Initialize mermaid once
let mermaidInitialized = false
function ensureMermaidInit() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  })
  mermaidInitialized = true
}

/**
 * Renders a Mermaid diagram from a code string.
 * Uses mermaid.render() asynchronously with error handling.
 */
function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const uniqueId = useId().replace(/:/g, '_')

  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      ensureMermaidInit()
      try {
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${uniqueId}`,
          code
        )
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Erreur de rendu du diagramme'
          )
          setSvg(null)
        }
      }
    }

    renderDiagram()
    return () => {
      cancelled = true
    }
  }, [code, uniqueId])

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p className="font-medium">Erreur Mermaid</p>
        <pre className="mt-1 whitespace-pre-wrap text-xs opacity-70">{error}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center justify-center rounded-xl bg-muted/30 p-8 text-sm text-muted-foreground">
        Chargement du diagramme...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-3 flex items-center justify-center overflow-x-auto rounded-xl bg-[#1e1e2e] p-4 dark:bg-[#11111b] [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export default React.memo(MermaidBlock)
