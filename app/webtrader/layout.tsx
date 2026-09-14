import type { Metadata, Viewport } from "next"

/**
 * MTM WEBTRADER COMO APP PRÓPRIA — manifesto e metadados só desta rota.
 *
 * O manifesto do site (/manifest.json, «MTM App», start_url /app-mobile) vem do layout raiz pela
 * metadata `manifest`; aqui sobrepõe-se — o Next junta a metadata e o filho ganha — para que
 * «Adicionar ao ecrã principal» em /webtrader instale o WebTrader e não a app inteira.
 */
export const metadata: Metadata = {
  title: "MTM WebTrader",
  description: "WebTrader das contas simuladas educativas MTM Funded — não é negociação real.",
  manifest: "/webtrader.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WebTrader",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#131722",
}

export default function WebtraderLayout({ children }: { children: React.ReactNode }) {
  return children
}
