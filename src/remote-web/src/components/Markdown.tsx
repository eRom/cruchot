interface MarkdownProps {
  content: string
}

export function Markdown({ content }: MarkdownProps) {
  const html = renderMarkdown(content)
  return (
    <div
      className="text-sm leading-relaxed prose-msg max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function renderMarkdown(text: string): string {
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`
  })

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Headers
  result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Unordered lists
  result = result.replace(/^- (.+)$/gm, '<li>$1</li>')
  result = result.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Ordered lists
  result = result.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  // Paragraphs
  result = result.replace(/\n\n/g, '</p><p>')

  // Linebreaks
  result = result.replace(/\n/g, '<br />')

  return `<p>${result}</p>`
}
