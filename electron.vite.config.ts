import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// electron-vite uses NODE_ENV_ELECTRON_VITE (not NODE_ENV) to signal production builds
const isProd =
  process.env.NODE_ENV_ELECTRON_VITE === 'production' ||
  process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          'ai',
          '@ai-sdk/anthropic',
          '@ai-sdk/openai',
          '@ai-sdk/openai-compatible',
          '@ai-sdk/google',
          '@ai-sdk/mistral',
          '@ai-sdk/xai',
          '@ai-sdk/deepseek',
          '@openrouter/ai-sdk-provider',
          '@ai-sdk/provider',
          '@ai-sdk/provider-utils',
          'drizzle-orm',
          'nanoid',
          'sonner',
          'zod',
          'mammoth',
          'turndown',
          'pdf-parse',
          'qrcode',
          'ws',
          'electron-updater',
          'builder-util-runtime'
        ]
      })
    ],
    ...(isProd ? { esbuild: { drop: ['console'] } } : {}),
    build: {
      outDir: 'out/main',
      sourcemap: false,
      minify: isProd ? 'esbuild' : false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: ['fsevents', 'chokidar', '@ai-sdk/mcp', '@ai-sdk/mcp/mcp-stdio', '@perplexity-ai/ai-sdk', '@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common', 'sharp', 'bufferutil', 'utf-8-validate']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('react/jsx-runtime') || (id.includes('/react/') && !id.includes('react-'))) return 'vendor-react'
              if (id.includes('lucide-react')) return 'vendor-icons'
              if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
              if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('katex') || id.includes('unified') || id.includes('mdast') || id.includes('hast') || id.includes('micromark')) return 'vendor-markdown'
              if (id.includes('@radix-ui')) return 'vendor-radix'
            }
          }
        }
      }
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
