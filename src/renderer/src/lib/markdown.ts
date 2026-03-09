/**
 * Markdown configuration shared across the app.
 * Re-exports remark/rehype plugins so consumers don't import them directly.
 */
export { default as remarkGfm } from 'remark-gfm'
export { default as remarkMath } from 'remark-math'
export { default as rehypeKatex } from 'rehype-katex'
