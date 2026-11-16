"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import BotaoAprendeAUsar from "@/components/intro/botao-aprende-a-usar"
import BalaoApoio from "@/components/suporte/balao-apoio"

/**
 * O balão de apoio no site principal fica DESLIGADO até `NEXT_PUBLIC_APOIO_BALAO_SITE=1`.
 * O dono quer o apoio sobretudo no site de apresentação (/solucoes, que monta o balão por si);
 * aqui liga-se com uma variável, sem novo deploy de código.
 */
const APOIO_NO_SITE = process.env.NEXT_PUBLIC_APOIO_BALAO_SITE === "1"

export default function ConditionalNavbarFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // True while running in the native iOS/Android WKWebView shell
  const [isNativeApp, setIsNativeApp] = useState(false)

  // Re-check on every client-side navigation so the flag is picked up after
  // the app-mobile page sets it and the user navigates to e.g. /member-area
  useEffect(() => {
    try {
      setIsNativeApp(sessionStorage.getItem("mtm_native") === "1")
    } catch {
      // sessionStorage unavailable (rare)
    }
  }, [pathname])

  const isExactOrChildPath = (basePath: string) => {
    if (!pathname) return false
    return pathname === basePath || pathname.startsWith(`${basePath}/`)
  }

  // Rotas standalone: não renderizar navbar/footer global.
  // `/mtmfunded` é um NEGÓCIO À PARTE, e não uma secção do site: tem navegação, rodapé,
  // FAQ e políticas próprias, sem caminho de regresso a morethanmoney.pt. Herdar a navbar
  // global misturava as duas marcas — e, num produto financiado, misturar quem responde
  // pelo quê não é uma questão de estética.
  const standalonePaths = ["/charts-primeverse", "/app-mobile", "/work", "/tradingfloor", "/apresentacao", "/FreeSession", "/mtmfunded", "/webtrader"]
  const isStandalonePage = standalonePaths.some(isExactOrChildPath)

  /**
   * O botão «Aprende a usar …» vive aqui e não em cada página.
   *
   * Ele descobre sozinho em que destino está (lib/navegacao.ts) e só aparece se o admin tiver
   * ligado um vídeo para esse destino. Montá-lo uma vez é o que faz um destino novo receber o
   * botão sem ninguém se lembrar de o ir lá pôr — e o que garante que é o MESMO botão em todo o
   * lado. Fica de fora das superfícies que têm barras próprias coladas ao fundo (a PWA, o
   * webtrader, os charts) e da app nativa, onde um botão flutuante taparia a navegação.
   */
  const semBotaoIntro = ["/app-mobile", "/webtrader", "/charts-primeverse"].some(isExactOrChildPath)
  /**
   * O balão de apoio fica no canto inferior direito. Sai das superfícies com barras ou botões
   * próprios colados ao fundo (PWA, webtrader, charts, quizzes, /mobile), das áreas internas
   * (admin, gestão, backoffice, estúdio), do MTM Funded (tem apoio próprio) e do /solucoes (monta
   * o seu). Na app nativa também não aparece: lá taparia a navegação.
   */
  const semApoio = [
    "/app-mobile", "/webtrader", "/charts-primeverse", "/admin", "/dashboard-gestao", "/backoffice", "/estudio",
    "/mtmfunded", "/avaliacoes", "/mobile", "/apresentacao", "/tradingfloor", "/mtm-terminal", "/live", "/solucoes",
  ].some(isExactOrChildPath)
  const comApoio = APOIO_NO_SITE && !isNativeApp && !semApoio
  const balaoApoio = comApoio ? <BalaoApoio origem="site" /> : null
  // Com o balão no canto, o «Aprende a usar» sobe para cima dele em vez de ficarem sobrepostos.
  const botaoIntro = !isNativeApp && !semBotaoIntro ? <BotaoAprendeAUsar acimaDoApoio={comApoio} /> : null

  // In the native app every route is standalone — hide Navbar & Footer site-wide
  if (isStandalonePage || isNativeApp) {
    return (
      <>
        {children}
        {botaoIntro}
        {balaoApoio}
      </>
    )
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
      {botaoIntro}
      {balaoApoio}
    </>
  )
}

