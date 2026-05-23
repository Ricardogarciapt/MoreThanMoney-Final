import type { Metadata, Viewport } from "next"
import AppMobileShell from "@/components/mobile/app-mobile-shell"

export const metadata: Metadata = {
  title: "MTM App",
  description: "MoreThanMoney — app smartphone",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MTM App",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#111827",
}

export default function AppMobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppMobileShell>{children}</AppMobileShell>
}
