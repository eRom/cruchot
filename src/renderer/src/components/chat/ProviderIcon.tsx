import { cn } from '@/lib/utils'

interface ProviderIconProps {
  providerId: string
  className?: string
  size?: number
}

export function ProviderIcon({ providerId, className, size = 14 }: ProviderIconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    className: cn('shrink-0', className),
    'aria-hidden': true as const
  }

  switch (providerId) {
    // OpenAI — hexagonal node shape
    case 'openai':
      return (
        <svg {...props}>
          <path
            d="M22.28 9.37a5.98 5.98 0 0 0-.52-4.93 6.07 6.07 0 0 0-6.55-2.91A5.98 5.98 0 0 0 10.69.1a6.07 6.07 0 0 0-5.8 4.22 5.98 5.98 0 0 0-4 2.9 6.07 6.07 0 0 0 .75 7.12 5.98 5.98 0 0 0 .52 4.93 6.07 6.07 0 0 0 6.55 2.91 5.98 5.98 0 0 0 4.52 1.43 6.07 6.07 0 0 0 5.8-4.22 5.98 5.98 0 0 0 4-2.9 6.07 6.07 0 0 0-.75-7.12zM13.21 22.1a4.49 4.49 0 0 1-2.88-1.05l.14-.08 4.79-2.77a.78.78 0 0 0 .39-.67v-6.77l2.02 1.17a.07.07 0 0 1 .04.06v5.6a4.51 4.51 0 0 1-4.5 4.51zM3.58 18.05a4.49 4.49 0 0 1-.54-3.02l.14.09 4.79 2.76a.78.78 0 0 0 .78 0l5.85-3.38v2.33a.07.07 0 0 1-.03.06l-4.84 2.8a4.51 4.51 0 0 1-6.15-1.64zM2.34 7.9a4.49 4.49 0 0 1 2.35-1.97v5.72a.78.78 0 0 0 .39.67l5.85 3.37-2.02 1.17a.07.07 0 0 1-.07 0L4 14.06A4.51 4.51 0 0 1 2.34 7.9zm17.32 4.03L13.81 8.55l2.02-1.17a.07.07 0 0 1 .07 0l4.84 2.8a4.51 4.51 0 0 1-.7 8.14v-5.72a.78.78 0 0 0-.38-.67zm2.01-3.04l-.14-.09-4.79-2.76a.78.78 0 0 0-.78 0L10.11 9.4V7.08a.07.07 0 0 1 .03-.06l4.84-2.8a4.51 4.51 0 0 1 6.69 4.67zM8.93 12.93l-2.02-1.17a.07.07 0 0 1-.04-.06V6.1a4.51 4.51 0 0 1 7.38-3.46l-.14.08-4.79 2.77a.78.78 0 0 0-.39.67zm1.1-2.37L12 9.36l1.97 1.2v2.4L12 14.15l-1.97-1.2z"
            fill="currentColor"
          />
        </svg>
      )

    // Anthropic — stylized A mark
    case 'anthropic':
      return (
        <svg {...props}>
          <path
            d="M13.83 3.5h2.88L22.5 20.5h-2.95l-1.36-4.03h-6.3l-1.36 4.03H7.67zm1.38 4.38L12.87 14.2h4.68z"
            fill="currentColor"
          />
          <path
            d="M8.56 3.5H5.7L1.5 20.5h2.79l.97-4.03h5.09l.97 4.03h2.79zM5.92 14.2l1.87-7.78 1.87 7.78z"
            fill="currentColor"
          />
        </svg>
      )

    // Google — four-color "G"
    case 'google':
      return (
        <svg {...props}>
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09a6.72 6.72 0 0 1 0-4.18V7.07H2.18A11.01 11.01 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )

    // Mistral — distinctive orange/black bar pattern
    case 'mistral':
      return (
        <svg {...props}>
          {/* Row 1 */}
          <rect x="1" y="2" width="4.5" height="4.5" rx="0.5" fill="currentColor" />
          <rect x="18.5" y="2" width="4.5" height="4.5" rx="0.5" fill="#F7D046" />
          {/* Row 2 */}
          <rect x="1" y="9.75" width="4.5" height="4.5" rx="0.5" fill="currentColor" />
          <rect x="7" y="9.75" width="4.5" height="4.5" rx="0.5" fill="#F2A73B" />
          <rect x="12.5" y="9.75" width="4.5" height="4.5" rx="0.5" fill="#EE792F" />
          <rect x="18.5" y="9.75" width="4.5" height="4.5" rx="0.5" fill="#EB5829" />
          {/* Row 3 */}
          <rect x="1" y="17.5" width="4.5" height="4.5" rx="0.5" fill="currentColor" />
          <rect x="18.5" y="17.5" width="4.5" height="4.5" rx="0.5" fill="#EA3326" />
        </svg>
      )

    // xAI — bold X
    case 'xai':
      return (
        <svg {...props}>
          <path
            d="M3 4h3.6l4.1 5.8L14.9 4H18l-5.5 7.6L18.5 20H15l-4.4-5.9L6.4 20H3l5.7-8.1z"
            fill="currentColor"
          />
        </svg>
      )

    // DeepSeek — whale/ocean inspired "D" mark
    case 'deepseek':
      return (
        <svg {...props}>
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 13.2c-.68.96-1.76 1.6-3.04 1.8-.32.04-.64.04-.96 0-1.6-.2-2.88-1.24-3.4-2.72-.16-.48-.24-1-.2-1.52.08-1.2.72-2.28 1.64-3 .52-.4 1.12-.68 1.76-.8.4-.08.76-.08 1.16 0 .84.2 1.56.72 2.04 1.44.36.52.56 1.12.6 1.76.04.76-.16 1.48-.56 2.08-.12.2-.28.36-.44.52.2-.04.4-.12.56-.24.4-.28.68-.68.84-1.16.2-.56.2-1.16.04-1.72-.2-.64-.6-1.2-1.12-1.56-.64-.44-1.4-.6-2.16-.48-.96.16-1.8.72-2.36 1.52-.48.68-.72 1.52-.68 2.36.04 1 .48 1.92 1.2 2.56.6.52 1.36.84 2.16.88.6.04 1.2-.08 1.72-.36.6-.32 1.08-.8 1.4-1.4z"
            fill="currentColor"
          />
          <circle cx="10.5" cy="10" r="0.8" fill="currentColor" />
        </svg>
      )

    // Alibaba Qwen — cloud mark
    case 'qwen':
      return (
        <svg {...props}>
          <path
            d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
            fill="currentColor"
          />
          <text
            x="12"
            y="15.5"
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui"
            fill="var(--background, white)"
          >
            Q
          </text>
        </svg>
      )

    // Perplexity — abstract search/globe
    case 'perplexity':
      return (
        <svg {...props}>
          <path
            d="M12 2v8.5l6-4.5M12 2v8.5L6 6M12 10.5L18 6v6.5l-6 5M12 10.5L6 6v6.5l6 5M12 17.5V22M18 12.5L22 15M6 12.5L2 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      )

    // Ollama — llama head silhouette
    case 'ollama':
      return (
        <svg {...props}>
          <path
            d="M9.5 3C7.5 3 6 4.5 6 6.5v1c-.6.3-1 .9-1 1.5v3c0 .8.4 1.5 1 2v4.5c0 1.4 1.1 2.5 2.5 2.5h1c.3 0 .5-.2.5-.5V18h4v2.5c0 .3.2.5.5.5h1c1.4 0 2.5-1.1 2.5-2.5V14c.6-.5 1-1.2 1-2V9c0-.6-.4-1.2-1-1.5v-1C17 4.5 15.5 3 13.5 3h-4zM9 8.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-3 3h1v1.5h-1z"
            fill="currentColor"
          />
        </svg>
      )

    // LM Studio — monitor with code brackets
    case 'lmstudio':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 8l-2 2 2 2M16 8l2 2-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )

    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">?</text>
        </svg>
      )
  }
}
