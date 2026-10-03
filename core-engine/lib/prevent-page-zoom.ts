"use client"

import { useEffect } from "react"

/** Bloqueia pinch-zoom e zoom por gestos na shell da app smartphone (iOS/Android). */
export function usePreventPageZoom(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    const preventGesture = (e: Event) => {
      e.preventDefault()
    }

    const preventPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
      }
    }

    const opts: AddEventListenerOptions = { passive: false }

    document.addEventListener("gesturestart", preventGesture, opts)
    document.addEventListener("gesturechange", preventGesture, opts)
    document.addEventListener("gestureend", preventGesture, opts)
    document.addEventListener("touchmove", preventPinch, opts)
    document.addEventListener("wheel", preventWheelZoom, opts)

    const viewport = document.querySelector('meta[name="viewport"]')
    const previousContent = viewport?.getAttribute("content") ?? null
    if (viewport) {
      viewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      )
    }

    return () => {
      document.removeEventListener("gesturestart", preventGesture)
      document.removeEventListener("gesturechange", preventGesture)
      document.removeEventListener("gestureend", preventGesture)
      document.removeEventListener("touchmove", preventPinch)
      document.removeEventListener("wheel", preventWheelZoom)
      if (viewport && previousContent) {
        viewport.setAttribute("content", previousContent)
      }
    }
  }, [enabled])
}
