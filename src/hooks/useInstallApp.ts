import { useCallback, useEffect, useState } from 'react'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallChoice> }

type NavigatorStandalone = Navigator & { standalone?: boolean }
function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as NavigatorStandalone).standalone === true
}

/** Native install prompt when supported; always expose platform guidance otherwise. */
export function useInstallApp() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => standalone())
  const [installError, setInstallError] = useState('')

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    const update = () => setInstalled(standalone())
    const beforeInstall = (event: Event) => {
      event.preventDefault() // keep the one-time browser prompt for our own install button
      setInstallEvent(event as InstallEvent)
    }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setInstallError('') }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    displayMode.addEventListener?.('change', update)
    update()
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      displayMode.removeEventListener?.('change', update)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return false
    try {
      setInstallError('')
      await installEvent.prompt()
      const result = await installEvent.userChoice
      setInstallEvent(null)
      return result.outcome === 'accepted'
    } catch {
      setInstallError('Browser installation was unavailable. Use the browser menu instead.')
      setInstallEvent(null)
      return false
    }
  }, [installEvent])

  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(navigator.userAgent)
  return { installed, canPromptInstall: Boolean(installEvent) && !installed, install, installError, isIOS, isAndroid }
}
