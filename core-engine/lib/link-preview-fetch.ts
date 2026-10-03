import type { LinkPreviewData } from "@/lib/link-preview-types"
import { getHostname, normalizeUrlForHref } from "@/lib/url-utils"

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return null
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null
}

function resolveImageUrl(image: string | null, baseUrl: string): string | null {
  if (!image) return null
  try {
    return new URL(image, baseUrl).toString()
  } catch {
    return image.startsWith("http") ? image : null
  }
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "localhost" || h.endsWith(".local")) return true
  if (h === "127.0.0.1" || h.startsWith("10.") || h.startsWith("192.168.")) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  return false
}

/** Obtém metadados Open Graph / Twitter de uma URL pública. */
export async function fetchLinkPreview(urlInput: string): Promise<LinkPreviewData | null> {
  const url = normalizeUrlForHref(urlInput)
  if (!url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (isPrivateHost(parsed.hostname)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MoreThanMoneyBot/1.0; +https://www.morethanmoney.pt)",
        Accept: "text/html,application/xhtml+xml",
      },
    })

    if (!res.ok) {
      return { url, siteName: getHostname(url), title: getHostname(url) }
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { url, siteName: getHostname(url), title: getHostname(url) }
    }

    const html = (await res.text()).slice(0, 500_000)
    const finalUrl = res.url || url

    const title =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      titleTag(html) ||
      getHostname(finalUrl)

    const description =
      metaContent(html, "og:description") ||
      metaContent(html, "twitter:description") ||
      metaContent(html, "description")

    const image = resolveImageUrl(
      metaContent(html, "og:image") ||
        metaContent(html, "twitter:image") ||
        metaContent(html, "twitter:image:src"),
      finalUrl
    )

    const siteName =
      metaContent(html, "og:site_name") || getHostname(finalUrl)

    return {
      url: finalUrl,
      title,
      description,
      image,
      siteName,
    }
  } catch {
    return { url, siteName: getHostname(url), title: getHostname(url) }
  } finally {
    clearTimeout(timeout)
  }
}
