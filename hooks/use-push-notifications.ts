"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  requestNotificationPermission,
  onMessageListener,
  getFCMToken,
  saveFCMToken,
} from "@/lib/firebase-config"

export interface ForegroundMessage {
  title?: string
  body?: string
  data?: Record<string, string>
}

interface UsePushNotificationsOptions {
  /** ID do utilizador autenticado (null se não autenticado) */
  userId: string | null
  /** Se está a correr em contexto nativo Capacitor (iOS/Android) — skip FCM web */
  isNative?: boolean
  /** Chamado quando chega uma mensagem FCM em foreground */
  onForegroundMessage?: (msg: ForegroundMessage) => void
}

/**
 * Hook para gerir notificações push via FCM no browser/PWA.
 * Em contexto nativo (Capacitor), toda a lógica é gerida pelo use-capacitor.ts — este hook fica inativo.
 * Na shell WKWebView (MTM System iOS), captura o evento 'mtm-push-token' e regista o token APNs no servidor.
 */
export function usePushNotifications({
  userId,
  isNative = false,
  onForegroundMessage,
}: UsePushNotificationsOptions) {
  const tokenRegistered = useRef(false)

  // Registar token APNs do MTM System iOS app (evento 'mtm-push-token')
  useEffect(() => {
    if (!userId || tokenRegistered.current) return
    if (typeof window === "undefined") return

    const handleNativeToken = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { token: string; platform: string } | undefined
      if (!detail?.token) return
      try {
        await fetch("/api/notifications/fcm-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            token: detail.token,
            deviceInfo: { platform: detail.platform ?? "ios-apns", nativeApp: true },
          }),
        })
        tokenRegistered.current = true
        console.log("📲 [PUSH] Token APNs registado no servidor")
      } catch (e) {
        console.warn("[PUSH] Erro ao registar token APNs:", e)
      }
    }

    window.addEventListener("mtm-push-token", handleNativeToken)
    return () => window.removeEventListener("mtm-push-token", handleNativeToken)
  }, [userId])

  // Registar token FCM silenciosamente se a permissão já foi concedida anteriormente (web/PWA)
  useEffect(() => {
    if (isNative || !userId || tokenRegistered.current) return
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission !== "granted") return

    getFCMToken()
      .then((token) => {
        if (token) return saveFCMToken(userId, token)
      })
      .then(() => {
        tokenRegistered.current = true
      })
      .catch(() => {})
  }, [userId, isNative])

  // Listener para mensagens recebidas em foreground (app aberta)
  useEffect(() => {
    if (isNative || !onForegroundMessage) return

    onMessageListener((payload: any) => {
      const title = payload.notification?.title ?? payload.data?.title
      const body = payload.notification?.body ?? payload.data?.body
      const data = payload.data as Record<string, string> | undefined
      onForegroundMessage({ title, body, data })
    })
  }, [isNative, onForegroundMessage])

  /**
   * Solicita permissão de notificação ao utilizador e regista o token FCM.
   * Retorna true se a permissão foi concedida com sucesso.
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (isNative) return false
    if (!userId) return false
    if (typeof window === "undefined" || !("Notification" in window)) return false
    if (Notification.permission === "denied") return false

    try {
      const token = await requestNotificationPermission()
      if (token) {
        await saveFCMToken(userId, token)
        tokenRegistered.current = true
        return true
      }
      return false
    } catch {
      return false
    }
  }, [userId, isNative])

  /**
   * Verifica se as notificações push estão suportadas e ativas.
   */
  const getPermissionState = (): NotificationPermission | "unsupported" => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
    return Notification.permission
  }

  return { requestPermission, getPermissionState }
}
