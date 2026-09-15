"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Mail, RefreshCw } from "lucide-react"
import { authHeaders } from "@/lib/auth-token"

/**
 * CREDENCIAIS DE UMA CONTA MTM FUNDED — login, servidor e as passwords escondidas.
 *
 * «Mostrar» pede a password da conta MTM (re-autenticação no servidor, 428 sem ela). Quem entrou
 * com Google/PrimeVerse não tem essa password: recebe o link seguro por email (uso único, 24 h).
 * As passwords ficam só em memória, escondem-se sozinhas ao fim de 60 s e ao desmontar.
 * «Gerar nova password» troca master e investor (mesma prova) e mostra as novas uma vez.
 *
 * Usado no WebTrader (A minha conta → Credenciais) e na página do link (/mtmfunded/credenciais),
 * onde chega já com as passwords e uma concessão de 10 min para gerar novas sem outra prova.
 */

interface Reveladas { password: string | null; investor: string | null; aviso?: string }

async function chamar(url: string, corpo: Record<string, unknown>, method = "POST") {
  const r = await fetch(url, {
    method, credentials: "include", cache: "no-store",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.ok, d }
}

export default function CredenciaisConta({ contaId, login, servidor, podeGerir = true, iniciais, concessao }: {
  contaId: string
  login: string | null
  servidor: string | null
  /** Sessão investor ou conta alheia: só login/servidor. */
  podeGerir?: boolean
  iniciais?: Reveladas | null
  concessao?: string | null
}) {
  const [reveladas, setReveladas] = useState<Reveladas | null>(iniciais ?? null)
  const [pedirPassword, setPedirPassword] = useState<null | "mostrar" | "gerar">(null)
  const [semPassword, setSemPassword] = useState(false)
  const [passwordMtm, setPasswordMtm] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmarGerar, setConfirmarGerar] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Esconder sozinho: uma password à vista num ecrã pousado na mesa é uma password partilhada.
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (reveladas?.password) temporizador.current = setTimeout(() => setReveladas(null), 60_000)
    return () => { if (temporizador.current) clearTimeout(temporizador.current) }
  }, [reveladas])

  const mostrar = async (password?: string) => {
    setOcupado("mostrar"); setErro(null); setAviso(null)
    try {
      const { ok, status, d } = await chamar("/api/mtmfunded/conta/credenciais", { contaId, ...(password ? { password } : {}) })
      if (ok) { setReveladas(d); setPedirPassword(null); setPasswordMtm(""); if (d.aviso) setAviso(d.aviso); return }
      if (status === 428 || (status === 401 && d.reautenticar)) {
        setPedirPassword("mostrar"); setSemPassword(Boolean(d.semPassword))
        if (password || d.semPassword) setErro(d.error)
        return
      }
      setErro(d.error || "Não foi possível ler as credenciais")
    } finally { setOcupado(null) }
  }

  const gerar = async (password?: string) => {
    setOcupado("gerar"); setErro(null); setAviso(null)
    try {
      const { ok, status, d } = await chamar("/api/mtmfunded/conta/credenciais/regenerar", { contaId, ...(password ? { password } : {}), ...(concessao ? { concessao } : {}) })
      if (ok) {
        setReveladas({ password: d.password, investor: d.investor }); setPedirPassword(null); setPasswordMtm(""); setConfirmarGerar(false)
        setAviso("Passwords novas geradas. As antigas deixaram de funcionar — guarda estas agora. Enviámos-te um email a avisar.")
        return
      }
      if (status === 428 || (status === 401 && d.reautenticar)) {
        setPedirPassword("gerar"); setSemPassword(Boolean(d.semPassword))
        if (password || d.semPassword) setErro(d.error)
        return
      }
      setErro(d.error || "Não foi possível gerar")
    } finally { setOcupado(null) }
  }

  const pedirLink = async () => {
    setOcupado("link"); setErro(null)
    try {
      const { ok, d } = await chamar("/api/mtmfunded/conta/credenciais/link", { contaId })
      if (ok) { setAviso("Enviámos-te um email com um link seguro (abre uma vez, válido 24 h)."); setPedirPassword(null) }
      else setErro(d.error || "Não foi possível enviar")
    } finally { setOcupado(null) }
  }

  const mascara = "••••••••••"
  return (
    <div className="space-y-2 text-[12px]">
      <LinhaCopiavel rotulo="Login" valor={login ?? "—"} copiavel={Boolean(login)} />
      <LinhaCopiavel rotulo="Servidor" valor={servidor ?? "MTM Funded"} />
      {podeGerir && (
        <>
          <LinhaCopiavel rotulo="Password master (negociar)" valor={reveladas?.password ?? mascara} copiavel={Boolean(reveladas?.password)} escondida={!reveladas?.password} />
          <LinhaCopiavel rotulo="Password investor (só ver)" valor={reveladas?.investor ?? mascara} copiavel={Boolean(reveladas?.investor)} escondida={!reveladas?.investor} />

          {pedirPassword && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (passwordMtm) void (pedirPassword === "gerar" ? gerar(passwordMtm) : mostrar(passwordMtm)) }}
              className="space-y-2 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-2.5"
            >
              {!semPassword && (
                <>
                  <label className="block text-[11.5px] text-zinc-300" htmlFor={`pw-${contaId}`}>Confirma a password da tua conta MTM</label>
                  <div className="flex gap-1.5">
                    <input id={`pw-${contaId}`} type="password" autoComplete="current-password" value={passwordMtm} onChange={(e) => setPasswordMtm(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[13px] text-white outline-none focus:border-[#D2A63C]/60" />
                    <button type="submit" disabled={!passwordMtm || Boolean(ocupado)} className="rounded-md bg-[#D2A63C] px-3 text-[12px] font-semibold text-black disabled:opacity-40">
                      {ocupado === "mostrar" || ocupado === "gerar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmar"}
                    </button>
                  </div>
                </>
              )}
              <button type="button" onClick={() => void pedirLink()} disabled={Boolean(ocupado)} className="flex items-center gap-1.5 text-[11.5px] text-[#D2A63C] disabled:opacity-40">
                {ocupado === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {semPassword ? "Entras com Google/PrimeVerse — enviar link seguro por email" : "Ou recebe um link seguro por email"}
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {reveladas?.password ? (
              <button onClick={() => setReveladas(null)} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-300"><EyeOff className="h-3.5 w-3.5" /> Esconder</button>
            ) : (
              <button onClick={() => void mostrar()} disabled={Boolean(ocupado)} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-200 disabled:opacity-40">
                {ocupado === "mostrar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Mostrar
              </button>
            )}
            {!confirmarGerar ? (
              <button onClick={() => setConfirmarGerar(true)} disabled={Boolean(ocupado)} className="flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-300 disabled:opacity-40">
                <RefreshCw className="h-3.5 w-3.5" /> Gerar nova password
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1 text-[11.5px] text-amber-200">
                As passwords antigas deixam de funcionar.
                <button onClick={() => void gerar()} className="font-semibold text-amber-300">{ocupado === "gerar" ? "A gerar…" : "Gerar"}</button>
                <button onClick={() => setConfirmarGerar(false)} className="text-zinc-400">Cancelar</button>
              </span>
            )}
          </div>
        </>
      )}
      {aviso && <p className="flex items-start gap-1.5 text-[11.5px] text-emerald-300"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {aviso}</p>}
      {erro && <p className="text-[11.5px] text-rose-300">{erro}</p>}
      <p className="text-[10.5px] leading-snug text-zinc-500">A MoreThanMoney nunca te pede estas passwords. A investor deixa alguém ver a conta sem negociar.</p>
    </div>
  )
}

export function LinhaCopiavel({ rotulo, valor, copiavel = true, escondida = false }: { rotulo: string; valor: string; copiavel?: boolean; escondida?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem permissão: o valor fica à vista */ }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-[10.5px] text-zinc-500">{rotulo}</p>
        <p className={`truncate font-mono text-[13px] ${escondida ? "tracking-widest text-zinc-500" : "text-white"}`}>{valor}</p>
      </div>
      {copiavel && (
        <button onClick={() => void copiar()} aria-label={`copiar ${rotulo}`} className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300">
          {copiado ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}{copiado ? "copiado" : "copiar"}
        </button>
      )}
    </div>
  )
}
