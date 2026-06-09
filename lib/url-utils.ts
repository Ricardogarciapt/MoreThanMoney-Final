/** Extração e normalização de URLs em texto de posts. */

const URL_IN_TEXT =
  /(?:https?:\/\/|www\.)[^\s<>"']+/gi

export function extractUrlsFromText(text: string): string[] {
  if (!text?.trim()) return []
  const matches = text.match(URL_IN_TEXT) || []
  const normalized = matches.map(normalizeUrlForHref).filter(Boolean) as string[]
  return [...new Set(normalized)]
}

export function getPrimaryUrlFromText(text: string): string | null {
  const urls = extractUrlsFromText(text)
  return urls[0] ?? null
}

export function normalizeUrlForHref(raw: string): string | null {
  let u = raw.trim().replace(/[.,;:!?)}\]]+$/, "")
  if (!u) return null
  if (/^www\./i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
