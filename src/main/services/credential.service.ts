import { safeStorage } from 'electron'

const CREDENTIAL_PREFIX = 'multi-llm:apikey:'

/**
 * Stores an API key securely using Electron safeStorage (OS Keychain).
 * The key is encrypted before being stored in the DB settings table.
 */
export function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system')
  }
  const encrypted = safeStorage.encryptString(apiKey)
  return encrypted.toString('base64')
}

/**
 * Decrypts an API key from its stored encrypted form.
 */
export function decryptApiKey(encryptedBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system')
  }
  const buffer = Buffer.from(encryptedBase64, 'base64')
  return safeStorage.decryptString(buffer)
}

/**
 * Returns a masked version of an API key for display in the renderer.
 * Example: "sk-proj-abc...xyz" → "sk-proj-abc•••xyz"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••••••'
  const prefix = apiKey.slice(0, 7)
  const suffix = apiKey.slice(-4)
  return `${prefix}${'•'.repeat(8)}${suffix}`
}

/**
 * Returns the settings key used to store a provider's API key.
 */
export function getCredentialKey(providerId: string): string {
  return `${CREDENTIAL_PREFIX}${providerId}`
}

/**
 * Checks if safeStorage encryption is available.
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
