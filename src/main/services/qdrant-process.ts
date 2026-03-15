/**
 * Qdrant process manager — spawn/kill the Qdrant binary.
 * Binaire local, ecoute sur 127.0.0.1:6333 uniquement.
 */
import { spawn, type ChildProcess } from 'child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { app } from 'electron'

const QDRANT_PORT = 6333
const QDRANT_GRPC_PORT = 6334
const HEALTH_CHECK_TIMEOUT = 30_000
const HEALTH_CHECK_INTERVAL = 500

function getQdrantBinaryPath(): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'qdrant')
    : path.join(__dirname, '../../vendor/qdrant', `${process.platform}-${process.arch}`)

  const binary = process.platform === 'win32' ? 'qdrant.exe' : 'qdrant'
  return path.join(resourcesPath, binary)
}

export function getQdrantStoragePath(): string {
  return path.join(app.getPath('userData'), 'qdrant-storage')
}

export function isQdrantAvailable(): boolean {
  const binaryPath = getQdrantBinaryPath()
  const exists = fs.existsSync(binaryPath)
  console.log('[Qdrant] Binary path:', binaryPath, '— exists:', exists)
  return exists
}

/**
 * Generate a Qdrant config YAML and return its path.
 * Qdrant uses config files, not CLI args for port/storage.
 */
function createConfigFile(storagePath: string): string {
  const configDir = path.join(app.getPath('userData'), 'qdrant-config')
  fs.mkdirSync(configDir, { recursive: true })

  const configPath = path.join(configDir, 'config.yaml')
  const escapedPath = storagePath.replace(/"/g, '\\"')
  const configContent = `
storage:
  storage_path: "${escapedPath}"

service:
  host: 127.0.0.1
  http_port: ${QDRANT_PORT}
  grpc_port: ${QDRANT_GRPC_PORT}
  enable_tls: false

telemetry_disabled: true
`

  fs.writeFileSync(configPath, configContent, 'utf-8')
  console.log('[Qdrant] Config written to:', configPath)
  return configPath
}

export function startQdrant(): ChildProcess {
  const binaryPath = getQdrantBinaryPath()
  const storagePath = getQdrantStoragePath()

  // Ensure storage directory exists
  fs.mkdirSync(storagePath, { recursive: true })

  // Create config file
  const configPath = createConfigFile(storagePath)

  console.log('[Qdrant] Starting binary:', binaryPath)
  console.log('[Qdrant] Storage path:', storagePath)

  const proc = spawn(binaryPath, [
    '--config-path', configPath
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      HOME: app.getPath('userData'),
      TMPDIR: os.tmpdir()
    }
  })

  proc.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line) console.log('[Qdrant]', line)
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line) console.warn('[Qdrant]', line)
  })

  return proc
}

export async function waitForQdrantReady(): Promise<void> {
  const start = Date.now()
  const url = `http://127.0.0.1:${QDRANT_PORT}/healthz`

  while (Date.now() - start < HEALTH_CHECK_TIMEOUT) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL))
  }

  throw new Error(`Qdrant did not become ready within ${HEALTH_CHECK_TIMEOUT}ms`)
}

export async function stopQdrant(proc: ChildProcess): Promise<void> {
  if (!proc || proc.killed) return

  proc.kill('SIGTERM')

  await Promise.race([
    new Promise<void>(resolve => proc.on('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 5000))
  ])

  if (!proc.killed) {
    proc.kill('SIGKILL')
  }
}

export const QDRANT_PORT_NUMBER = QDRANT_PORT
