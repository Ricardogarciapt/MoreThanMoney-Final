"use client"

import { useEffect, useState } from "react"
import { ChevronDown, KeyRound, Loader2, Lock, Mail, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { loadMemberProfile } from "@/lib/member-profile"
import { isRegisteredMember } from "@/lib/member-access"
import { needsAccessRevalidation } from "@/lib/access-migration"
import { buildOAuthCallbackUrl, REGISTER_NOT_FOUND_MESSAGE } from "@/lib/oauth-flow"
import { mensagemErroLogin, redirectWebtrader } from "@/lib/webtrader/entrada"
import type { SessaoConta } from "@/components/funded/api"
import EntrarCredenciais from "./entrar-credenciais"

/**
 * ENTRAR NO WEBTRADER — quem chega a /webtrader sem sessão MTM.
 *
 *  1. «Entrar com a conta MTM» (email + password) — o mesmo Supabase e as mesmas mensagens do /login.
 *  2. «Continuar com Google» — o OAuth do site (/auth/callback → /auth/post-oauth), a voltar a
 *     /webtrader (lib/webtrader/entrada.redirectWebtrader: só caminhos /webtrader deste site).
 *  3. PrimeVerse, como no /login.
 *  4. «Entrar só com credenciais de conta» — MTM Funded (77xxxxxx) sem conta MTM; TradeLocker e MT5
 *     pedem sessão MTM (dono da ligação e quota MetaApi).
 *
 * Com a conta MTM, o WebTrader sincroniza sozinho todas as contas da pessoa (FundedWebtrader).
 * Sem compras aqui: nem no web, nem no iOS nativo.
 */

type Resultado = { plataforma: "mtmfunded"; sessao: SessaoConta } | { plataforma: "tradelocker" | "mt5"; ref: string }

function ehIosNativo(): boolean {
  if (typeof navigator === "undefined") return false
  // MTM System (MTMNativeApp) ou app MTM Auto (MTMAuto-iOS): nenhuma deixa comprar fora da Apple.
  const ua = navigator.userAgent
  // O iPad dentro de uma app identifica-se como «Macintosh»; nenhum browser de Mac traz estas marcas.
  return /MTMAuto-iOS/i.test(ua) || (/MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod|Macintosh/i.test(ua))
}

function destinoAtual(): string {
  if (typeof window === "undefined") return "/webtrader"
  return redirectWebtrader(`${window.location.pathname}${window.location.search}`)
}

const campo = "h-11 w-full rounded-lg border border-white/10 bg-black/60 pl-9 pr-3 text-[14px] text-white placeholder:text-zinc-600 focus:border-[#2962FF] focus:outline-none"

export default function EntrarWebtrader({ onEntrouMtm, onEntrouConta, onFechar, compraPermitida, credenciaisAbertas = false }: {
  onEntrouMtm: () => void
  onEntrouConta: (r: Resultado) => void
  onFechar?: () => void
  compraPermitida: boolean
  credenciaisAbertas?: boolean
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [aEntrar, setAEntrar] = useState(false)
  const [erro, setErro] = useState<{ texto: string; registo?: boolean } | null>(null)
  const [pvAberto, setPvAberto] = useState(false)
  const [pvUser, setPvUser] = useState("")
  const [pvPass, setPvPass] = useState("")
  const [pvAEntrar, setPvAEntrar] = useState(false)
  const [soCredenciais, setSoCredenciais] = useState(credenciaisAbertas)
  const [iosNativo, setIosNativo] = useState(false)

  useEffect(() => { setIosNativo(ehIosNativo()) }, [])

  const entrarEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setAEntrar(true); setErro(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error || !data.session) { setErro({ texto: mensagemErroLogin(error?.message) }); return }
      setPassword("")
      const { setCachedSession, clearCachedSession } = await import("@/lib/auth-cache")
      setCachedSession(data.session)
      // Como o /login: perfil com timeout (nunca pendura) — sem perfil registado não entra.
      const perfil = await Promise.race([
        loadMemberProfile(supabase, data.session.user.id).catch(() => "timeout" as const),
        new Promise<"timeout">((ok) => setTimeout(() => ok("timeout"), 5000)),
      ])
      if (perfil !== "timeout") {
        if (perfil && needsAccessRevalidation(perfil)) { window.location.replace("/access-migration"); return }
        if (!perfil || !isRegisteredMember(perfil)) {
          // Oferta de gratidão (2026-09): quem tem a conta oferecida entra no WebTrader sem pack activo.
          if (perfil) {
            const { destinoPelaOferta } = await import("@/lib/mtmfunded/oferta-acesso-cliente")
            if (await destinoPelaOferta(data.session.access_token, "/webtrader")) { onEntrouMtm(); return }
          }
          await Promise.race([supabase.auth.signOut(), new Promise((ok) => setTimeout(ok, 2000))]).catch(() => null)
          clearCachedSession()
          setErro({ texto: REGISTER_NOT_FOUND_MESSAGE, registo: true })
          return
        }
      }
      onEntrouMtm()
    } catch {
      setErro({ texto: "Erro ao fazer login. Tente novamente." })
    } finally {
      setAEntrar(false)
    }
  }

  const entrarGoogle = async () => {
    setErro(null)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Mesmo domínio que iniciou o fluxo (cookies PKCE); volta a /webtrader com o deep-link.
          redirectTo: buildOAuthCallbackUrl(window.location.origin, { flow: "login", redirect: destinoAtual() }),
          queryParams: { access_type: "offline", prompt: "select_account" },
          skipBrowserRedirect: false,
        },
      })
      if (error) { setErro({ texto: `Erro ao iniciar Google Login: ${error.message}` }); return }
      if (data?.url) window.location.href = data.url
      else setErro({ texto: "Erro ao gerar URL do Google. Verifica a configuração no Supabase." })
    } catch {
      setErro({ texto: "Erro ao iniciar login com Google. Tenta novamente." })
    }
  }

  const entrarPrimeverse = async (e: React.FormEvent) => {
    e.preventDefault()
    setPvAEntrar(true); setErro(null)
    try {
      const res = await fetch("/api/auth/primeverse-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pvUser.trim(), password: pvPass }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setErro({ texto: d.error || "Falha no login PrimeVerse." }); return }
      setPvPass("")
      try { (await import("@/lib/auth-cache")).clearCachedSession() } catch { /* ok */ }
      // A sessão PrimeVerse chega em cookies: recarrega o WebTrader (nunca outro destino).
      window.location.replace(`${window.location.origin}${destinoAtual()}`)
    } catch {
      setErro({ texto: "Erro ao ligar ao PrimeVerse. Tenta novamente." })
    } finally {
      setPvAEntrar(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-3 py-6 text-white">
      <div className="mb-5 flex items-start gap-3">
        <img src="/icon-192x192.png" alt="MTM" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold leading-tight">Entrar no WebTrader</h1>
          <p className="mt-0.5 text-[12.5px] text-zinc-400">Entra com a tua conta MTM e as tuas contas aparecem logo: MT5, TradeLocker e MTM Funded.</p>
        </div>
        {onFechar && <button onClick={onFechar} aria-label="fechar" className="text-zinc-500"><X className="h-5 w-5" /></button>}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#0d0f15] p-4">
        <p className="text-[13px] font-semibold">Entrar com a conta MTM</p>
        {erro && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-[12.5px] text-rose-200">
            {erro.texto}
            {erro.registo && !iosNativo && <> <a href="/register" className="font-semibold text-[#D2A63C] underline">Registo</a></>}
          </p>
        )}
        <form onSubmit={entrarEmail} className="space-y-2.5">
          <label className="relative block">
            <span className="sr-only">Email</span>
            <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
            <input type="email" autoComplete="username" required placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={aEntrar} className={campo} />
          </label>
          <label className="relative block">
            <span className="sr-only">Password</span>
            <Lock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
            <input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={aEntrar} className={campo} />
          </label>
          <div className="flex justify-end">
            <a href="/forgot-password" className="text-[11.5px] text-zinc-400 hover:text-white">Esqueci-me da password</a>
          </div>
          <button disabled={aEntrar || !email || !password} className="flex h-11 w-full items-center justify-center rounded-lg bg-[#2962FF] text-[14px] font-bold text-white disabled:opacity-40">
            {aEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </button>
        </form>

        {/* Dentro das apps iOS entra-se com a conta da app (email/password ou a sessão passada pela
            app). Google e PrimeVerse ficam de fora: a regra 4.8 da Apple obriga a dar o «Iniciar
            sessão com a Apple» com o mesmo destaque, e na app isso já é feito no ecrã de entrada dela. */}
        {!iosNativo && (<>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500"><span className="h-px flex-1 bg-white/10" />ou<span className="h-px flex-1 bg-white/10" /></div>

        <button type="button" onClick={entrarGoogle} disabled={aEntrar} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-[14px] font-semibold text-zinc-900 disabled:opacity-40">
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuar com Google
        </button>

        <button type="button" onClick={() => setPvAberto((v) => !v)} className="flex h-10 w-full items-center justify-center rounded-lg border border-cyan-500/40 bg-[#0e2a3a] text-[13px] font-semibold text-white">
          Entrar com PrimeVerse
        </button>
        {pvAberto && (
          <form onSubmit={entrarPrimeverse} className="space-y-2 rounded-lg border border-cyan-500/30 bg-black/40 p-3">
            <p className="text-[11.5px] text-zinc-400">És cliente PrimeVerse? Entra com as credenciais do hub.</p>
            <input placeholder="Utilizador ou email PrimeVerse" value={pvUser} onChange={(e) => setPvUser(e.target.value)} required disabled={pvAEntrar} className="h-10 w-full rounded-lg border border-white/10 bg-black px-2 text-white" />
            <input type="password" placeholder="Password PrimeVerse" value={pvPass} onChange={(e) => setPvPass(e.target.value)} required disabled={pvAEntrar} className="h-10 w-full rounded-lg border border-white/10 bg-black px-2 text-white" />
            <button disabled={pvAEntrar} className="flex h-10 w-full items-center justify-center rounded-lg bg-cyan-600 font-semibold text-white disabled:opacity-40">
              {pvAEntrar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar via PrimeVerse"}
            </button>
          </form>
        )}

        </>)}
        {!iosNativo && (
          <p className="text-center text-[11.5px] text-zinc-500">
            <a href={`/login?redirect=${encodeURIComponent(destinoAtual())}`} className="hover:text-white">Outras opções de entrada (Apple…)</a>
            {" · "}<a href="/register" className="text-[#D2A63C]">Criar conta MTM</a>
          </p>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-[#0d0f15]">
        <button type="button" onClick={() => setSoCredenciais((v) => !v)} aria-expanded={soCredenciais}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-zinc-200">
          <KeyRound className="h-4 w-4 text-zinc-400" /> Entrar só com credenciais de conta
          <ChevronDown className={`ml-auto h-4 w-4 text-zinc-500 transition-transform ${soCredenciais ? "rotate-180" : ""}`} />
        </button>
        {soCredenciais && (
          <div className="px-2 pb-2">
            <p className="px-2 pb-2 text-[11.5px] text-zinc-500">Sem conta MTM: entra numa conta MTM Funded (login 77xxxxxx). Contas TradeLocker e MT5 precisam da conta MTM.</p>
            <EntrarCredenciais
              temSessaoMtm={false}
              compraPermitida={compraPermitida && !iosNativo}
              onPedirLoginMtm={() => { setSoCredenciais(false); window.scrollTo({ top: 0, behavior: "smooth" }) }}
              onEntrou={onEntrouConta}
            />
          </div>
        )}
      </div>
    </div>
  )
}
