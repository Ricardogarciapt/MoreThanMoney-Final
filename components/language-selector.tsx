"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Globe } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function LanguageSelector() {
  const [language, setLanguage] = useState("pt")

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    // Aqui você implementaria a lógica para mudar o idioma da aplicação
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Selecionar idioma">
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleLanguageChange("pt")} className={language === "pt" ? "bg-muted" : ""}>
          🇵🇹 Português
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange("en")} className={language === "en" ? "bg-muted" : ""}>
          🇬🇧 English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange("es")} className={language === "es" ? "bg-muted" : ""}>
          🇪🇸 Español
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
