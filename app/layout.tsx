import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Suspense } from "react"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from 'sonner'
import Navbar from "@/components/navbar"
import { AuthProvider } from "@/contexts/auth-context"

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: "MoreThanMoney - Plataforma de Trading e Educação Financeira",
  description: "Plataforma integrada de formação financeira e serviços de automatização com inteligência artificial. Scanners AI, Educação IQONIC, Swipe to Trade e muito mais.",
  keywords: ["trading", "forex", "scanners ai", "educação financeira", "iqonic", "swipe to trade", "copytrading", "portugal"],
  authors: [{ name: "MoreThanMoney" }],
  creator: "MoreThanMoney",
  publisher: "MoreThanMoney",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title: "MoreThanMoney - Plataforma de Trading e Educação Financeira",
    description: "Plataforma integrada de formação financeira e serviços de automatização com inteligência artificial.",
    url: "https://morethanmoney.pt",
    siteName: "MoreThanMoney",
    images: [
      {
        url: '/logo-new.png',
        width: 500,
        height: 500,
        alt: 'MoreThanMoney Logo',
      },
    ],
    locale: 'pt_PT',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "MoreThanMoney - Plataforma de Trading e Educação Financeira",
    description: "Plataforma integrada de formação financeira e serviços de automatização com inteligência artificial.",
    images: ['/logo-new.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#D2A63C" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MTM App" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      </head>
      <body suppressHydrationWarning>
        
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <Suspense fallback={null}>
              <Navbar />
              {children}
              <Toaster />
              <Sonner richColors position="top-right" />
            </Suspense>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
