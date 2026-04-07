import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// electron-vite uses NODE_ENV_ELECTRON_VITE (not NODE_ENV) to signal production builds
const isProd =
  process.env.NODE_ENV_ELECTRON_VITE === 'production' ||
  process.env.NODE_ENV === 'production'

// Hard "shipping" flag: ONLY set in release.yml CI before electron-builder
// runs. It activates aggressive tree-shaking of TEST_MODE-only branches
// (notably the test-helpers IPC dynamic import, see src/main/index.ts
// `if (TEST_MODE && !__PROD_BUILD__)`). Local `npm run build` doesn't set
// it so the e2e:flows can still register their helpers via TEST_MODE.
const isShippingBuild = process.env.CRUCHOT_SHIPPING_BUILD === '1'

export default defineConfig({
  main: {
    // Compile-time constant replaced by Vite's define. Used to tree-shake
    // TEST_MODE-only branches in shipping builds (notably the dynamic
    // import of src/main/ipc/test-helpers.ipc which would otherwise leak
    // as a chunk and trip the audit-bundle.js test-helpers-leak rule).
    // Pinned to CRUCHOT_SHIPPING_BUILD=1, set only by release.yml — so
    // local `npm run build` keeps the helpers chunk for E2E flow specs.
    define: {
      __PROD_BUILD__: JSON.stringify(isShippingBuild)
    },
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
    build: {
      outDir: 'out/main',
      sourcemap: false,
      minify: isProd ? 'esbuild' : false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'embedding.worker': resolve(__dirname, 'src/main/workers/embedding.worker.ts')
        },
        external: ['fsevents', 'chokidar', '@ai-sdk/mcp', '@ai-sdk/mcp/mcp-stdio', '@perplexity-ai/ai-sdk', '@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common', 'sharp', 'bufferutil', 'utf-8-validate', '@mistralai/mistralai']
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
              if (id.includes('shiki') || id.includes('oniguruma')) return 'vendor-shiki'
              if (id.includes('mermaid') || id.includes('cytoscape') || id.includes('elkjs')) return 'vendor-mermaid'
              if (id.includes('recharts')) return 'vendor-charts'
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
