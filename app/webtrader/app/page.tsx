"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { decidirPassagem, destinoDaEntrada, tokenDoFragmento } from "@/lib/webtrader/sessao-app"

/**
 * /webtrader/app — a porta do WebTrader dentro da app iOS MTM Auto.
 *
 * A casca nativa abre ESTA página no separador WebTrader. A página pede à casca a sessão da app
 * (mensagem `mtmautoWT`), e a casca responde chamando `window.__mtmAutoWTReceber({ token, userId })`
 * (ou `{ erro: true }` quando a app não soube responder)
 * — o token viaja como ARGUMENTO de função, nunca num URL (ficaria em históricos e logs).
 *
 * Com isso, a página garante que o WebTrader tem a sessão da MESMA pessoa (lib/webtrader/sessao-app
 * decide manter / trocar / sair) e segue para /webtrader com a query que trouxe. Qualquer falha cai no
 * ecrã de entrada normal do WebTrader: pior caso, o cliente entra à mão — nunca fica numa página
 * presa nem com a sessão de outra pessoa.
 *
 * Fora da app (browser normal) não há casca — e aí o token pode vir no FRAGMENTO do URL
 * (`#mtmauto=<token>`), que é como a MTM Auto web manda cá a pessoa. O fragmento nunca é enviado ao
 * servidor (não entra em logs nem no Referer) e é limpo do histórico ANTES de qualquer pedido de
 * rede. Daí para a frente é exactamente a mesma passagem da casca: as duas portas entram no mesmo
 * corredor, para não haver duas noções de «entrar com a conta da app».
 *
 * Sem casca e sem fragmento, segue logo para /webtrader — que é o caminho de quase toda a gente.
 */

/** `erro`: a app não conseguiu dizer se há sessão (rede) — não se mexe na sessão do WebTrader. */
type Dados = { token?: string | null; userId?: string | null; erro?: boolean }
type Ponte = { postMessage: (m: unknown) => void }

declare global {
  interface Window {
    __mtmAutoWTReceber?: (d: Dados) => Promise<string>
  }
}

const ESPERA_CASCA_MS = 8000

function ponteDaCasca(): Ponte | null {
  const w = window as unknown as { webkit?: { messageHandlers?: { mtmautoWT?: Ponte } } }
  return w.webkit?.messageHandlers?.mtmautoWT ?? null
}

async function sairLocal() {
  // Só este dispositivo: sair "global" terminaria também a sessão da app MTM Auto.
  await Promise.race([supabase.auth.signOut({ scope: "local" }), new Promise((ok) => setTimeout(ok, 2000))]).catch(() => null)
  const { clearCachedSession } = await import("@/lib/auth-cache")
  clearCachedSession()
}

export default function EntradaWebtraderApp() {
  const [texto, setTexto] = useState("A abrir o WebTrader…")

  useEffect(() => {
    const destino = destinoDaEntrada(window.location.search)
    let feito = false
    const seguir = () => {
      if (feito) return
      feito = true
      window.location.replace(destino)
    }

    /**
     * A passagem, seja de onde vier o token. É uma função só de propósito: ter a casca e o browser
     * a decidir em sítios diferentes era como nasciam as diferenças de comportamento entre app e web.
     */
    const passar = async (d: Dados): Promise<string> => {
      if (d?.erro) { seguir(); return "erro" }
      try {
        const { data } = await supabase.auth.getSession()
        const passo = decidirPassagem({ tokenApp: d?.token, userIdApp: d?.userId, userIdAtual: data.session?.user?.id })
        if (passo === "sair") { await sairLocal(); seguir(); return passo }
        if (passo === "manter") { seguir(); return passo }

        setTexto("A entrar com a tua conta MTM Auto…")
        if (data.session) await sairLocal()
        const r = await fetch("/api/webtrader/sessao-app", {
          method: "POST",
          headers: { Authorization: `Bearer ${d.token}` },
          cache: "no-store",
        })
        const j = (await r.json().catch(() => null)) as { access_token?: string; refresh_token?: string; code?: string } | null
        if (!r.ok || !j?.access_token || !j.refresh_token) { seguir(); return j?.code ?? "falhou" }
        const { data: nova, error } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token })
        if (!error && nova.session) {
          const { setCachedSession } = await import("@/lib/auth-cache")
          setCachedSession(nova.session)
        }
        seguir()
        return error ? "falhou" : "trocar"
      } catch {
        seguir()
        return "falhou"
      }
    }

    const ponte = ponteDaCasca()
    if (!ponte) {
      /**
       * BROWSER. O token vem no fragmento — e a PRIMEIRA coisa a fazer é tirá-lo do histórico,
       * antes de qualquer await. Se o pedido de rede falhasse com o fragmento ainda no URL, ficava
       * lá um token a que basta carregar em «recarregar» para reaparecer.
       *
       * `decidirPassagem` não sabe o `userId` por este caminho (o URL não o traz, e trazê-lo não
       * acrescentava segurança nenhuma) — passa-se `null`, que a função lê como «não sei de quem é»
       * e resolve pedindo a sessão nova ao servidor, que é quem confirma a identidade do token.
       */
      const token = tokenDoFragmento(window.location.hash)
      if (!token) { seguir(); return }
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      void passar({ token, userId: null })
      return
    }

    let espera: ReturnType<typeof setTimeout> | undefined
    window.__mtmAutoWTReceber = async (d: Dados) => {
      // A casca respondeu: a partir daqui manda a passagem, não o relógio (senão saía-se a meio do pedido).
      clearTimeout(espera)
      return passar(d)
    }

    ponte.postMessage({ acao: "sessao" })
    // A casca pode não responder (build antiga, vista MTM Auto ainda a carregar): não se fica preso.
    espera = setTimeout(seguir, ESPERA_CASCA_MS)
    return () => { clearTimeout(espera); delete window.__mtmAutoWTReceber }
  }, [])

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#131722] text-white">
      <div className="flex flex-col items-center gap-3 text-[13px] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-[#2962FF]" />
        {texto}
      </div>
    </main>
  )
}
