import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/main/**/__tests__/**/*.test.ts',
      'src/renderer/src/components/**/*.config.test.ts'
    ],
    exclude: ['node_modules', 'out', 'dist'],
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
})
