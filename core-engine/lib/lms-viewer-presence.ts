/** Segundos sem heartbeat para deixar de contar como espectador ativo */
export const LMS_VIEWER_ACTIVE_SECONDS = 45

export function getOrCreateLmsViewerKey(): string {
  if (typeof window === "undefined") return ""
  const key = "mtm_lms_viewer_key"
  try {
    let existing = sessionStorage.getItem(key)
    if (!existing) {
      existing =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      sessionStorage.setItem(key, existing)
    }
    return existing
  } catch {
    return `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
