import type { Metadata, Viewport } from "next"
import MobileAppShell from "@/components/mobile/mobile-app-shell"

export const metadata: Metadata = {
  title: "MTM Mobile App",
  description: "MoreThanMoney - Trading & Portfolio Mobile App",
  manifest: "/manifest.json",
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
  themeColor: "#D2A63C",
}

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MobileAppShell>{children}</MobileAppShell>
}
