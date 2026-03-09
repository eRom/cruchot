import type { ElectronAPI } from '../../../preload/types'

/**
 * Helper pour acceder a l'API IPC de maniere typee.
 * Utiliser cette fonction plutot que window.api directement
 * pour beneficier de l'autocompletion TypeScript.
 */
export function getApi(): ElectronAPI {
  return window.api
}
