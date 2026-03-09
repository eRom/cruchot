import { useState, useEffect } from 'react'

// Extended API methods — will be added to ElectronAPI by the leader
interface NetworkAPI {
  onNetworkChanged: (callback: (data: { online: boolean }) => void) => void
  offNetworkChanged: () => void
}

function getNetworkApi(): NetworkAPI | null {
  const api = window.api as unknown as Partial<NetworkAPI>
  if (api.onNetworkChanged && api.offNetworkChanged) {
    return api as NetworkAPI
  }
  return null
}

export function OfflineIndicator(): React.JSX.Element | null {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // Initialize from navigator
    setOnline(navigator.onLine)

    // Listen to browser online/offline events
    const handleOnline = (): void => setOnline(true)
    const handleOffline = (): void => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen to IPC network:changed events from main process
    const networkApi = getNetworkApi()
    if (networkApi) {
      networkApi.onNetworkChanged((data: { online: boolean }) => {
        setOnline(data.online)
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)

      const api = getNetworkApi()
      if (api) {
        api.offNetworkChanged()
      }
    }
  }, [])

  if (online) return null

  return (
    <div className="flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-medium text-white">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      Mode hors-ligne — Les providers cloud ne sont pas disponibles
    </div>
  )
}
