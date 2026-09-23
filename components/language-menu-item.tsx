"use client"

import { Globe, Check } from "lucide-react"
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/components/i18n-provider"

/** Os 21 idiomas do dicionário (bandeira + nome nativo). */
const LANGS: { code: string; flag: string; native: string }[] = [
  { code: "pt", flag: "🇵🇹", native: "Português" },
  { code: "en", flag: "🇬🇧", native: "English" },
  { code: "es", flag: "🇪🇸", native: "Español" },
  { code: "fr", flag: "🇫🇷", native: "Français" },
  { code: "de", flag: "🇩🇪", native: "Deutsch" },
  { code: "it", flag: "🇮🇹", native: "Italiano" },
  { code: "nl", flag: "🇳🇱", native: "Nederlands" },
  { code: "zh-CN", flag: "🇨🇳", native: "中文" },
  { code: "ja", flag: "🇯🇵", native: "日本語" },
  { code: "ar", flag: "🇸🇦", native: "العربية" },
  { code: "ru", flag: "🇷🇺", native: "Русский" },
  { code: "hi", flag: "🇮🇳", native: "हिन्दी" },
  { code: "sr", flag: "🇷🇸", native: "Српски" },
  { code: "hr", flag: "🇭🇷", native: "Hrvatski" },
  { code: "bs", flag: "🇧🇦", native: "Bosanski" },
  { code: "sq", flag: "🇦🇱", native: "Shqip" },
  { code: "bg", flag: "🇧🇬", native: "Български" },
  { code: "ro", flag: "🇷🇴", native: "Română" },
  { code: "pl", flag: "🇵🇱", native: "Polski" },
  { code: "uk", flag: "🇺🇦", native: "Українська" },
  { code: "tr", flag: "🇹🇷", native: "Türkçe" },
]

/**
 * Item de idioma para o dropdown do utilizador. Usa o i18n nativo (`setLang`),
 * que grava o cookie `mtm_lang`, persiste `preferred_language` na BD e aplica o
 * dicionário — sincronizando app, emails e suporte no idioma escolhido.
 */
export function LanguageMenuItem() {
  const { lang, setLang, t } = useI18n()
  const current = LANGS.find((l) => l.code === lang) || LANGS[0]

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white data-[state=open]:bg-[#D2A63C]/10">
        <Globe className="mr-3 h-4 w-4" />
        <span className="flex-1">{t("nav.language")}</span>
        <span className="ml-2 text-base leading-none">{current.flag}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto bg-black/95 border-[#D2A63C]/20">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className="cursor-pointer text-gray-300 hover:text-white hover:bg-[#D2A63C]/10 focus:bg-[#D2A63C]/10 focus:text-white"
          >
            <span className="mr-3 text-base leading-none">{l.flag}</span>
            <span className="flex-1">{l.native}</span>
            {l.code === lang && <Check className="ml-2 h-4 w-4 text-[#D2A63C]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
