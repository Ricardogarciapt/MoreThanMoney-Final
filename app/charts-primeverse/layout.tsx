import type React from "react"
import type { Metadata } from "next"
import "../globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Suspense } from "react"
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: "Charts Primeverse - Professional Trading Platform",
  description: "Advanced technical analysis platform with AI-powered scanners.",
}

export default function ChartsPrimeverseLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Gonero Fonts - Add font files to /public/fonts/ when available */}
        <style>{`
          @font-face {
            font-family: 'Gonero ExtExp Bolo';
            src: url('/fonts/Gonero-ExtExp-Bolo.woff2') format('woff2');
            font-weight: 700;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Gonero ExtExp Regular';
            src: url('/fonts/Gonero-ExtExp-Regular.woff2') format('woff2');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Gonero Bold Regular';
            src: url('/fonts/Gonero-Bold-Regular.woff2') format('woff2');
            font-weight: 700;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Gonero Thin Regular';
            src: url('/fonts/Gonero-Thin-Regular.woff2') format('woff2');
            font-weight: 300;
            font-style: normal;
            font-display: swap;
          }
          
          /* Typography fallback */
          body {
            font-family: 'Gonero ExtExp Regular', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          }
          
          h1, h2, h3, h4, h5, h6 {
            font-family: 'Gonero ExtExp Bolo', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          }
        `}</style>
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <Suspense fallback={null}>
            <main>{children}</main>
            <Toaster />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}

