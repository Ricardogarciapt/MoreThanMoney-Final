"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home } from "lucide-react"

export default function HomeButton() {
  const pathname = usePathname()

  // Não mostrar o botão na página do Scanner
  if (pathname?.includes("/scanner")) {
    return null
  }

  return (
    <div className="fixed top-4 left-4 z-50">
      <Link href="/">
        <Button
          variant="outline"
          className="border-gold-500 text-gold-400 hover:bg-gold-500/10 flex items-center gap-2"
        >
          <Home size={16} />
          Início
        </Button>
      </Link>
    </div>
  )
}
