import type { Metadata, Viewport } from "next"
import { Outfit, JetBrains_Mono } from "next/font/google"
import { ThemeProvider } from "@mtm-auto/components/theme-provider"
import "./mtm-auto-scope.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

export const metadata: Metadata = {
  title: "MTM Auto | Copy Trading",
  description:
    "Plataforma de copy trading: estratégias MT4/MT5, gestão de risco e marketplace de sinais.",
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07090f",
}

export default function MtmAutoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${outfit.variable} ${jetbrains.variable} mtm-auto-root dark min-h-screen font-sans antialiased`}
      style={{
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
        {children}
      </ThemeProvider>
    </div>
  )
}
