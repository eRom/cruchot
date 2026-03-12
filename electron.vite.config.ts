import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
          '@ai-sdk/provider',
          '@ai-sdk/provider-utils',
          'drizzle-orm',
          'nanoid',
          'sonner',
          'zod',
          'mammoth',
          'pdf-parse'
        ]
      })
    ],
    build: {
      outDir: 'out/main',
      minify: 'terser',
      terserOptions: {
        mangle: true,
        compress: {
          drop_console: true
        }
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: ['fsevents', 'chokidar', '@ai-sdk/mcp', '@ai-sdk/mcp/mcp-stdio', 'ws', '@perplexity-ai/ai-sdk']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
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
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
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
