"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { authHeaders, getAccessToken } from "@/lib/auth-token"
import CredenciaisConta from "@/components/funded/credenciais-conta"

/**
 * /mtmfunded/credenciais#t=<token> — a página do link «Ver credenciais» do email.
 *
 * O token vem no FRAGMENTO (o browser não o manda ao servidor). Lê-se, tira-se logo do URL
 * (histórico e partilhas não o levam) e guarda-se só neste separador até haver sessão: sem sessão,
 * «Entrar» leva ao login e volta aqui sem o token no URL. Com sessão, o servidor verifica
 * assinatura, prazo, dono e uso único (lib/mtmfunded/credenciais-link.ts) e devolve as passwords
 * UMA vez. Recarregar a página já não as mostra — o link gastou-se.
 */

const CHAVE = "mtmfunded_link_credenciais"

type Estado =
  | { fase: "a_ler" }
  | { fase: "sem_sessao" }
  | { fase: "sem_token" }
  | { fase: "erro"; erro: string }
  | { fase: "ok"; d: { contaId: string; login: string | null; servidor: string | null; password: string | null; investor: string | null; aviso?: string; etiqueta?: string | null; concessao?: string } }

export default function PaginaCredenciais() {
  const [estado, setEstado] = useState<Estado>({ fase: "a_ler" })

  useEffect(() => {
    let token: string | null = null
    try {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""))
      token = h.get("t")
      if (token) {
        sessionStorage.setItem(CHAVE, token)
        window.history.replaceState(null, "", window.location.pathname)
      } else {
        token = sessionStorage.getItem(CHAVE)
      }
    } catch { /* modo privado */ }
    if (!token) { setEstado({ fase: "sem_token" }); return }

    void (async () => {
      const sessao = await getAccessToken().catch(() => null)
      if (!sessao) { setEstado({ fase: "sem_sessao" }); return }
      const r = await fetch("/api/mtmfunded/conta/credenciais/link", {
        method: "PUT", credentials: "include", cache: "no-store",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401) { setEstado({ fase: "sem_sessao" }); return }
      // Gasto ou recusado, o token já não serve para nada neste separador.
      try { sessionStorage.removeItem(CHAVE) } catch { /* ok */ }
      if (!r.ok) { setEstado({ fase: "erro", erro: d.error || "Não foi possível abrir o link." }); return }
      setEstado({ fase: "ok", d })
    })()
  }, [])

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 text-white">
      <meta name="referrer" content="no-referrer" />
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[#D2A63C]" />
        <h1 className="text-[18px] font-bold">Credenciais da conta MTM Funded</h1>
      </div>

      {estado.fase === "a_ler" && <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>}

      {estado.fase === "sem_sessao" && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4 text-[13.5px]">
          <p>Por segurança, as credenciais só abrem com sessão iniciada na <b>conta MTM dona desta conta</b>.</p>
          <a href={`/login?redirect=${encodeURIComponent("/mtmfunded/credenciais")}`} className="inline-block rounded-lg bg-[#D2A63C] px-4 py-2 font-semibold text-black">Entrar e ver as credenciais</a>
          <p className="text-[12px] text-zinc-500">Depois de entrares voltas aqui automaticamente, neste separador.</p>
        </div>
      )}

      {estado.fase === "sem_token" && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-4 text-[13.5px]">
          <p>Este endereço precisa do link completo do email.</p>
          <p className="text-[12.5px] text-zinc-400">Podes pedir um link novo ou ver as credenciais no <a className="text-[#D2A63C]" href="/webtrader">WebTrader</a> → A minha conta → Credenciais.</p>
        </div>
      )}

      {estado.fase === "erro" && (
        <div className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-[13.5px]">
          <p className="text-rose-200">{estado.erro}</p>
          <p className="text-[12.5px] text-zinc-400">No <a className="text-[#D2A63C]" href="/webtrader">WebTrader</a> → A minha conta → Credenciais podes ver ou gerar as passwords.</p>
        </div>
      )}

      {estado.fase === "ok" && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
          {estado.d.etiqueta && <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[11px] font-bold text-black">{estado.d.etiqueta}</span>}
          <p className="text-[12.5px] text-amber-200">Este link já não volta a abrir. Copia as passwords agora ou guarda-as num gestor de passwords.</p>
          <CredenciaisConta
            contaId={estado.d.contaId} login={estado.d.login} servidor={estado.d.servidor}
            iniciais={{ password: estado.d.password, investor: estado.d.investor, aviso: estado.d.aviso }}
            concessao={estado.d.concessao ?? null}
          />
          <a href="/webtrader" className="block rounded-lg border border-white/10 py-2 text-center text-[13px] text-zinc-200">Abrir o WebTrader</a>
        </div>
      )}
    </main>
  )
}
