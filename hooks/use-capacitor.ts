"use client"

/**
 * useCapacitor — bridge entre o Next.js e os plugins nativos Capacitor
 * Só activa quando a app corre dentro da shell nativa (iOS/Android)
 * Em browser normal, todos os métodos são no-ops seguros
 */

import { useEffect, useCallback, useRef } from "react"

// Detecção se estamos dentro da shell Capacitor (Capacitor nativo)
export const isCapacitor = () =>
  typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.()

/**
 * Detecção da shell nativa MTM System (WKWebView Swift puro).
 * O app iOS injeta sessionStorage.mtm_native = '1' antes de qualquer script.
 * window.MTMNative é o bridge JS exposto via WKUserContentController.
 */
export const isMTMNativeShell = () => {
  if (typeof window === "undefined") return false
  // Verificar bridge injectado (mais fiável)
  if ((window as any).MTMNative) return true
  // Fallback: sessionStorage (injetado via WKUserScript)
  try {
    return sessionStorage.getItem("mtm_native") === "1"
  } catch {
    return false
  }
}

/** True em qualquer shell nativa (Capacitor ou MTM WKWebView) */
export const isNativeApp = () => isCapacitor() || isMTMNativeShell()

export const isIOS = () => {
  if (isCapacitor()) return (window as any).Capacitor?.getPlatform?.() === "ios"
  if (isMTMNativeShell()) return /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return false
}

export const isAndroid = () =>
  isCapacitor() && (window as any).Capacitor?.getPlatform?.() === "android"

// Importação dinâmica segura (só corre no browser, não no SSR)
// webpackIgnore: true — Capacitor modules are native-only, never bundled by webpack
async function getPlugin<T>(pluginName: string): Promise<T | null> {
  if (!isCapacitor()) return null
  try {
    const mod = await import(/* webpackIgnore: true */ `@capacitor/${pluginName.toLowerCase()}` as any)
    return mod[pluginName] as T
  } catch {
    return null
  }
}

interface UseCapacitorOptions {
  userId?: string | null
  onPushToken?: (token: string) => void
  onPushReceived?: (notification: any) => void
  onPushAction?: (action: any) => void
  onDeepLink?: (url: string) => void
  onBackButton?: () => boolean // return true para interceptar, false para default
}

export function useCapacitor(options: UseCapacitorOptions = {}) {
  const cleanupRef = useRef<(() => void)[]>([])

  // Inicializar StatusBar e SplashScreen
  const initUI = useCallback(async () => {
    if (!isCapacitor()) return  // Só Capacitor tem StatusBar/SplashScreen plugins

    try {
      const { StatusBar, Style } = await import(/* webpackIgnore: true */ "@capacitor/status-bar" as any)
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: "#000000" })
      await StatusBar.show()
    } catch (e) {
      console.warn("[CAP] StatusBar:", e)
    }

    try {
      const { SplashScreen } = await import(/* webpackIgnore: true */ "@capacitor/splash-screen" as any)
      await SplashScreen.hide({ fadeOutDuration: 300 })
    } catch (e) {
      console.warn("[CAP] SplashScreen:", e)
    }
  }, [])

  // Registar push notifications
  const initPush = useCallback(async () => {
    if (!isCapacitor() || !options.userId) return

    try {
      const { PushNotifications } = await import(/* webpackIgnore: true */ "@capacitor/push-notifications" as any)

      let permStatus = await PushNotifications.checkPermissions()

      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions()
      }

      if (permStatus.receive !== "granted") {
        console.warn("[CAP] Push não autorizado")
        return
      }

      await PushNotifications.register()

      // Token recebido → guardar no servidor
      const tokenListener = await PushNotifications.addListener(
        "registration",
        async (token) => {
          console.log("[CAP] Push token:", token.value.substring(0, 20) + "...")
          options.onPushToken?.(token.value)

          // Registar no endpoint existente
          try {
            await fetch("/api/notifications/fcm-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: options.userId,
                token: token.value,
                deviceInfo: {
                  platform: isIOS() ? "ios" : "android",
                  userAgent: navigator.userAgent,
                  appVersion: "1.0.0",
                  nativeApp: true,
                },
              }),
            })
            console.log("[CAP] Token registado no servidor")
          } catch (e) {
            console.warn("[CAP] Erro ao registar token:", e)
          }
        }
      )

      // Notificação recebida em foreground
      const fgListener = await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          console.log("[CAP] Notificação fg:", notification.title)
          options.onPushReceived?.(notification)
          hapticMedium()
        }
      )

      // Utilizador clicou na notificação
      const actionListener = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          console.log("[CAP] Notificação tap:", action.notification.data)
          options.onPushAction?.(action)

          // Deep link da notificação
          const url = action.notification.data?.url
          if (url) {
            try {
              const parsed = new URL(url)
              // Navegar para o path relativo
              window.location.href = parsed.pathname + parsed.search
            } catch {
              window.location.href = url
            }
          }
        }
      )

      cleanupRef.current.push(
        () => tokenListener.remove(),
        () => fgListener.remove(),
        () => actionListener.remove()
      )
    } catch (e) {
      console.warn("[CAP] Push init:", e)
    }
  }, [options.userId, options.onPushToken, options.onPushReceived, options.onPushAction])

  // Back button Android
  const initBackButton = useCallback(async () => {
    if (!isAndroid()) return

    try {
      const { App } = await import(/* webpackIgnore: true */ "@capacitor/app" as any)

      const listener = await App.addListener("backButton", ({ canGoBack }) => {
        const intercepted = options.onBackButton?.()
        if (intercepted) return

        if (canGoBack) {
          window.history.back()
        } else {
          App.exitApp()
        }
      })

      cleanupRef.current.push(() => listener.remove())
    } catch (e) {
      console.warn("[CAP] BackButton:", e)
    }
  }, [options.onBackButton])

  // Deep links
  const initDeepLinks = useCallback(async () => {
    if (!isCapacitor()) return

    try {
      const { App } = await import(/* webpackIgnore: true */ "@capacitor/app" as any)

      const listener = await App.addListener("appUrlOpen", (data) => {
        console.log("[CAP] Deep link:", data.url)
        options.onDeepLink?.(data.url)

        try {
          const parsed = new URL(data.url)
          if (parsed.hostname.includes("morethanmoney.pt")) {
            window.location.href = parsed.pathname + parsed.search
          }
        } catch {
          /* ignora URLs inválidos */
        }
      })

      cleanupRef.current.push(() => listener.remove())
    } catch (e) {
      console.warn("[CAP] DeepLinks:", e)
    }
  }, [options.onDeepLink])

  useEffect(() => {
    if (!isNativeApp()) return

    if (isCapacitor()) {
      // Só Capacitor tem estes plugins
      initUI()
      initBackButton()
      initDeepLinks()
    }

    return () => {
      cleanupRef.current.forEach((fn) => fn())
      cleanupRef.current = []
    }
  }, [initUI, initBackButton, initDeepLinks])

  // Registar push só quando userId estiver disponível (apenas Capacitor — MTM Shell usa web push)
  useEffect(() => {
    if (!isCapacitor() || !options.userId) return
    initPush()
  }, [options.userId, initPush])

  return {
    isNative: isNativeApp(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
  }
}

// ── Haptics helpers (podem ser usados fora do hook) ───────────────────

export async function hapticLight() {
  if (!isCapacitor()) return
  try {
    const { Haptics, ImpactStyle } = await import(/* webpackIgnore: true */ "@capacitor/haptics" as any)
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {}
}

export async function hapticMedium() {
  if (!isCapacitor()) return
  try {
    const { Haptics, ImpactStyle } = await import(/* webpackIgnore: true */ "@capacitor/haptics" as any)
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {}
}

export async function hapticHeavy() {
  if (!isCapacitor()) return
  try {
    const { Haptics, ImpactStyle } = await import(/* webpackIgnore: true */ "@capacitor/haptics" as any)
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch {}
}

export async function hapticSuccess() {
  if (!isCapacitor()) return
  try {
    const { Haptics, NotificationType } = await import(/* webpackIgnore: true */ "@capacitor/haptics" as any)
    await Haptics.notification({ type: NotificationType.Success })
  } catch {}
}
