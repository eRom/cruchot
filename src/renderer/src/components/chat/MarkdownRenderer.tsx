import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { remarkGfm, remarkMath, rehypeKatex } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import type { HighlighterCore } from 'shiki/core'
import DOMPurify from 'dompurify'
import MermaidBlock from './MermaidBlock'
import 'katex/dist/katex.min.css'

// ── Shiki singleton (core API — only 12 langs bundled) ─────────

let highlighterPromise: Promise<HighlighterCore> | null = null
let highlighterInstance: HighlighterCore | null = null

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterInstance) return Promise.resolve(highlighterInstance)
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [
        engine,
        themeDark,
        themeLight,
        langJs,
        langTs,
        langPy,
        langRust,
        langGo,
        langJava,
        langHtml,
        langCss,
        langJson,
        langBash,
        langSql,
        langMarkdown,
      ] = await Promise.all([
        createOnigurumaEngine(import('shiki/wasm')),
        import('shiki/dist/themes/github-dark.mjs'),
        import('shiki/dist/themes/github-light.mjs'),
        import('shiki/dist/langs/javascript.mjs'),
        import('shiki/dist/langs/typescript.mjs'),
        import('shiki/dist/langs/python.mjs'),
        import('shiki/dist/langs/rust.mjs'),
        import('shiki/dist/langs/go.mjs'),
        import('shiki/dist/langs/java.mjs'),
        import('shiki/dist/langs/html.mjs'),
        import('shiki/dist/langs/css.mjs'),
        import('shiki/dist/langs/json.mjs'),
        import('shiki/dist/langs/bash.mjs'),
        import('shiki/dist/langs/sql.mjs'),
        import('shiki/dist/langs/markdown.mjs'),
      ])

      const hl = await createHighlighterCore({
        engine,
        themes: [themeDark.default, themeLight.default],
        langs: [
          langJs.default,
          langTs.default,
          langPy.default,
          langRust.default,
          langGo.default,
          langJava.default,
          langHtml.default,
          langCss.default,
          langJson.default,
          langBash.default,
          langSql.default,
          langMarkdown.default,
        ],
      })

      highlighterInstance = hl
      return hl
    })()
  }
  return highlighterPromise
}

// Pre-load the highlighter immediately
getHighlighter()

// ── Types ──────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string
  className?: string
  isStreaming?: boolean
}

// ── CopyCodeButton ─────────────────────────────────────────────

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = code
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [code])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-white/60 opacity-0 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white/90 group-hover:opacity-100"
      aria-label="Copier le code"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          <span>Copie</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>Copier</span>
        </>
      )}
    </button>
  )
}

// ── ShikiCodeBlock ─────────────────────────────────────────────

function ShikiCodeBlock({ code, language, isStreaming }: { code: string; language: string; isStreaming?: boolean }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (isStreaming) {
      setHtml(null)
      return
    }
    let cancelled = false
    getHighlighter().then((hl) => {
      if (cancelled) return
      try {
        const rendered = hl.codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
        })
        setHtml(rendered)
      } catch {
        // Language not loaded — fallback to plain text
        setHtml(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [code, language, isStreaming])

  if (html) {
    return (
      <div className="group relative">
        <CopyCodeButton code={code} />
        <div
          className="overflow-x-auto [&_pre]:p-4 [&_pre]:pt-8 [&_pre]:text-[13px] [&_pre]:leading-6 [&_pre]:!bg-transparent [&_code]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      </div>
    )
  }

  // Fallback — plain text (also used during streaming)
  return (
    <div className="group relative">
      <CopyCodeButton code={code} />
      <code className="block overflow-x-auto whitespace-pre p-4 pt-8 text-[13px] leading-6">
        {code}
      </code>
    </div>
  )
}

// ── Markdown components factory ────────────────────────────────

/** Build react-markdown components with isStreaming context. */
function buildComponents(isStreaming: boolean): Partial<Components> {
  return {
    h1: ({ children }) => (
      <h1 className="mt-6 mb-3 text-xl font-semibold tracking-tight first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-5 mb-2.5 text-lg font-semibold tracking-tight first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-3 ml-1 list-inside list-disc space-y-1.5 last:mb-0 [&_ul]:mb-0 [&_ul]:mt-1.5">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 ml-1 list-inside list-decimal space-y-1.5 last:mb-0 [&_ol]:mb-0 [&_ol]:mt-1.5">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => {
      const safeHref = href && /^(https?:\/\/|mailto:|#)/.test(href) ? href : undefined
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
        >
          {children}
        </a>
      )
    },
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-primary/30 pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    hr: () => <hr className="my-5 border-border" />,
    // Code — inline and block
    code: ({ children, className }) => {
      const isBlock = typeof className === 'string' && className.includes('language-')
      if (isBlock) {
        const language = className?.replace('language-', '') ?? ''
        const codeStr = String(children).replace(/\n$/, '')

        // Mermaid diagrams
        if (language === 'mermaid') {
          return <MermaidBlock code={codeStr} />
        }

        return <ShikiCodeBlock code={codeStr} language={language} isStreaming={isStreaming} />
      }
      // Inline code
      return (
        <code className="rounded-[5px] bg-primary/8 px-1.5 py-0.5 text-[0.875em] font-mono dark:bg-white/10">
          {children}
        </code>
      )
    },
    // Code blocks (pre wrapping code)
    pre: ({ children }) => (
      <pre className="my-3 overflow-hidden rounded-xl bg-[#1e1e2e] p-4 text-[13px] leading-6 text-[#cdd6f4] shadow-sm last:mb-0 dark:bg-[#11111b] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
        {children}
      </pre>
    ),
    // Tables
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-t border-border px-3 py-2">{children}</td>
    ),
  }
}

// ── Pre-built static component objects ─────────────────────────
// Built once at module scope — guarantees referential stability and
// avoids React remounts caused by new object identity on each render.
const COMPONENTS_STATIC = buildComponents(false)
const COMPONENTS_STREAMING = buildComponents(true)

// ── Main component ─────────────────────────────────────────────

/**
 * Renders Markdown content with styled components.
 * Supports GFM, LaTeX (KaTeX), syntax highlighting (Shiki), and Mermaid diagrams.
 * When isStreaming is true, Shiki highlighting is skipped (plain text fallback)
 * to avoid re-highlighting on every token during streaming.
 */
function MarkdownRenderer({ content, className, isStreaming = false }: MarkdownRendererProps): React.JSX.Element {
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], [])
  const rehypePlugins = useMemo(() => [rehypeKatex], [])
  const components = isStreaming ? COMPONENTS_STREAMING : COMPONENTS_STATIC

  return (
    <div className={cn('markdown-body text-[14.5px]', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
