"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

/**
 * Descarregar o MetaTrader 5, com o sistema já escolhido.
 *
 * O EA não serve de nada sem o MetaTrader, e quem chega a esta página pode nem o ter instalado.
 * Mandá-lo à procura no site da MetaQuotes é perder gente pelo caminho.
 *
 * Os endereços são os da própria MetaQuotes, não cópias nossas: um instalador de 500 MB alojado
 * por nós ficava desactualizado no dia em que eles publicassem uma build nova, e um MetaTrader
 * desactualizado é a primeira coisa que dá problemas a ligar à corretora.
 */

const SISTEMAS = [
  {
    id: "windows" as const,
    nome: "Windows",
    url: "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe",
    tamanho: "23 MB",
  },
  {
    id: "macos" as const,
    nome: "macOS",
    url: "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/MetaTrader5.dmg",
    tamanho: "500 MB",
  },
]

type Sistema = (typeof SISTEMAS)[number]["id"]

/**
 * O sistema do visitante, para o botão já vir certo.
 *
 * Só corre no browser: adivinhar no servidor daria a mesma resposta a toda a gente e ainda
 * quebrava a hidratação, porque o servidor não sabe em que máquina a página vai abrir.
 */
function sistemaProvavel(): Sistema {
  if (typeof navigator === "undefined") return "windows"
  const ua = navigator.userAgent
  // iPhones e iPads também dizem "Mac" em alguns casos, mas não há MetaTrader de desktop para
  // eles — e mandá-los para o .dmg era mandá-los para um ficheiro que não conseguem abrir.
  if (/Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) return "macos"
  return "windows"
}

export function DescarregarMt5() {
  const [sistema, setSistema] = useState<Sistema>("windows")

  useEffect(() => {
    setSistema(sistemaProvavel())
  }, [])

  const escolhido = SISTEMAS.find((s) => s.id === sistema) ?? SISTEMAS[0]

  return (
    <div className="inline-flex items-stretch rounded-md border border-gray-700 overflow-hidden">
      <div className="flex items-center border-r border-gray-700" role="group" aria-label="Sistema operativo">
        {SISTEMAS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSistema(s.id)}
            aria-pressed={sistema === s.id}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              sistema === s.id
                ? "bg-[#D2A63C]/15 text-[#D2A63C]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {s.nome}
          </button>
        ))}
      </div>
      <Button
        asChild
        variant="ghost"
        className="rounded-none text-gray-300 hover:text-white hover:bg-gray-800/60 px-4"
      >
        {/* Sem `download`: o ficheiro vem de outro domínio, e nesse caso o atributo é ignorado
            pelo browser. O cabeçalho da MetaQuotes é que manda gravar — e manda. */}
        <a href={escolhido.url} rel="noopener noreferrer">
          <Download className="w-4 h-4 mr-2" />
          Descarregar o MetaTrader 5
          <span className="ml-2 text-xs text-gray-600">{escolhido.tamanho}</span>
        </a>
      </Button>
    </div>
  )
}
