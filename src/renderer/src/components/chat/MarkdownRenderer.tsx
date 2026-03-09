import React, { useCallback, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { remarkGfm } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/** Button that copies text to clipboard with a brief check animation. */
function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
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

/** Custom react-markdown components with polished styling. */
const components: Partial<Components> = {
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
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-500 underline underline-offset-2 transition-colors hover:text-blue-400 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </a>
  ),
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
  // Inline code
  code: ({ children, className }) => {
    // If className contains "language-" it's inside a pre (code block) — render raw
    const isBlock = typeof className === 'string' && className.includes('language-')
    if (isBlock) {
      const language = className?.replace('language-', '') ?? ''
      const codeStr = String(children).replace(/\n$/, '')
      return (
        <div className="group relative">
          {language && (
            <span className="absolute top-2.5 left-3 text-[11px] font-medium uppercase tracking-wider text-white/30">
              {language}
            </span>
          )}
          <CopyCodeButton code={codeStr} />
          <code className="block overflow-x-auto whitespace-pre p-4 pt-8 text-[13px] leading-6">
            {children}
          </code>
        </div>
      )
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
    <pre className="my-3 overflow-hidden rounded-xl bg-[#1e1e2e] text-[#cdd6f4] shadow-sm last:mb-0 dark:bg-[#11111b]">
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

/**
 * Renders Markdown content with styled components.
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown.
 */
function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-body text-[14.5px]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default React.memo(MarkdownRenderer)
