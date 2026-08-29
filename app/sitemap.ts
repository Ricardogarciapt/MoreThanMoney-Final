/**
 * Sitemap do site + blog Opinly. As entradas do blog vêm de opinly.routes()
 * (home, posts, categorias, autores, tags) via buildSitemapEntries — URLs
 * absolutos já com os prefixos corretos. Falha de API não derruba o sitemap:
 * degrada para as páginas estáticas.
 */

import type { MetadataRoute } from "next"
import { buildSitemapEntries } from "@opinly/shared"
import { opinlyConfig } from "@opinly/next"
import { getOpinly, opinlyConfigured } from "@/lib/opinly/client"

const SITE = "https://www.morethanmoney.pt"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/scanners`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/register`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/alertas-mtm`, changeFrequency: "daily", priority: 0.7 },
  ]

  if (!opinlyConfigured()) return staticPages

  try {
    const routes = await getOpinly().routes()
    const blogEntries = buildSitemapEntries(routes, opinlyConfig).map((e) => ({
      url: e.url,
      lastModified: e.lastModified,
    }))
    return [...staticPages, ...blogEntries]
  } catch (err) {
    console.error("[sitemap] rotas Opinly indisponíveis:", err instanceof Error ? err.message : err)
    return staticPages
  }
}
