import { defineConfig } from 'drizzle-kit'
import { join } from 'path'
import { homedir } from 'os'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: join(homedir(), 'Library', 'Application Support', 'MultiLLM', 'db', 'main.db')
  }
})
