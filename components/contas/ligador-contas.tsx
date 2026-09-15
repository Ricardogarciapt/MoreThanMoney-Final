"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Pause, Play, Plus, Search, Trash2, Wallet, KeyRound, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react"
import { T2T_BROKERS } from "@/lib/mtmcopy/t2t-brokers"
import TradeLockerConnectForm, { TradeLockerBadge } from "@/components/tradelocker/tradelocker-connect-form"
import MtmFundedConnectForm, { MtmFundedBadge, SoLeituraBadge } from "@/components/ligar-mtmfunded/mtmfunded-connect-form"
import CopiasEntreContas from "@/components/contas/copias-entre-contas"

/**
 * LIGADOR DE CONTAS — «As minhas contas». UM componente para todo o lado:
 *   • separador T2T › Conta na app-mobile (/app-mobile?tab=tap-to-trade)
 *   • área de membro no site (/member-area/contas)
 *
 * Plataformas: MetaTrader 5, MetaTrader 4, TradeLocker e MTM Funded. A lista, a quota e as acções
 * vêm de /api/contas; ligar usa as rotas especializadas (todas com a quota MetaApi no servidor).
 * Passwords só atravessam o formulário até ao servidor — nunca são guardadas no browser nem voltam.
 *
 * `useContasLigadas` é partilhado para o separador T2T poder pôr «Execução» entre a lista e os
 * limites sem pedir os dados duas vezes.
 */

export type PlataformaConta = "mt5" | "mt4" | "tradelocker" | "mtmfunded"

export interface ContaUnificada {
  chave: string
  id: string
  origem: "site" | "auto" | "wt"
  plataforma: PlataformaConta
  rotulo: string | null
  login: string | null
  servidor: string | null
  estado: "ligada" | "a_ligar" | "erro" | "so_leitura" | "pausada"
  erro: string | null
  demo: boolean
  contaMetaApi: boolean
  usos: string[]
  saldo: number | null
  acoes: { editarCredenciais: boolean; pausar: boolean; retomar: boolean; remover: boolean; gerirNaAppMtmAuto: boolean }
}

export interface QuotaContas {
  plano: "admin" | "premium" | "gratis"
  base: number | null
  extras: number
  limite: number | null
  emUso: number
  livres: number | null
  acimaDoLimite: boolean
  semLimite: boolean
  mensagem: string | null
  gratis: number
  premium: number
}

type Obter = () => Promise<string | null>

async function tokenPorDefeito(): Promise<string | null> {
  const { getAccessToken } = await import("@/lib/auth-token")
  return getAccessToken()
}

/** iOS nativo (shell MTMNativeApp): sem compras fora da App Store. */
function ehIosNativo(): boolean {
  if (typeof navigator === "undefined") return false
  return /MTMNativeApp/i.test(navigator.userAgent) && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function useContasLigadas(getToken: Obter = tokenPorDefeito) {
  const [contas, setContas] = useState<ContaUnificada[]>([])
  const [quota, setQuota] = useState<QuotaContas | null>(null)
  const [compraPermitida, setCompraPermitida] = useState(false)
  const [aCarregar, setACarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    setACarregar(true)
    try {
      const tok = await getToken()
      if (!tok) { setErro("Sessão indisponível. Volta a entrar."); return }
      const r = await fetch("/api/contas", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || "Não foi possível ler as tuas contas."); return }
      setContas(j.contas ?? [])
      setQuota(j.quota ?? null)
      setCompraPermitida(Boolean(j.compraPermitida) && !ehIosNativo())
      setErro(null)
    } catch {
      setErro("Não foi possível ler as tuas contas.")
    } finally {
      setACarregar(false)
    }
  }, [getToken])

  useEffect(() => { recarregar() }, [recarregar])

  const pedir = useCallback(
    async (metodo: "PATCH" | "DELETE", corpo: Record<string, unknown>) => {
      const tok = await getToken()
      if (!tok) throw new Error("Sessão indisponível. Volta a entrar.")
      const url = metodo === "DELETE" ? `/api/contas?chave=${encodeURIComponent(String(corpo.chave))}` : "/api/contas"
      const r = await fetch(url, {
        method: metodo,
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: metodo === "DELETE" ? undefined : JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || j.message || "Não foi possível concluir.")
      return j as { aviso?: string; message?: string; metaapi?: string }
    },
    [getToken],
  )

  return { contas, quota, compraPermitida, aCarregar, erro, recarregar, pedir, getToken }
}

export type EstadoLigador = ReturnType<typeof useContasLigadas>

// ── estilos ────────────────────────────────────────────────────────────────────────────────────
const cartao = "rounded-2xl border border-zinc-800 bg-zinc-950/60"
const campo = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
const rotulo = "text-[11px] text-zinc-500"

const NOME_PLATAFORMA: Record<PlataformaConta, string> = {
  mt5: "MetaTrader 5",
  mt4: "MetaTrader 4",
  tradelocker: "TradeLocker",
  mtmfunded: "MTM Funded",
}

function BadgePlataforma({ c }: { c: ContaUnificada }) {
  if (c.plataforma === "tradelocker") return <TradeLockerBadge />
  if (c.plataforma === "mtmfunded") return <><MtmFundedBadge />{c.estado === "so_leitura" && <SoLeituraBadge className="ml-1" />}</>
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-200">
      {c.plataforma.toUpperCase()}
    </span>
  )
}

function BadgeEstado({ estado }: { estado: ContaUnificada["estado"] }) {
  const m: Record<ContaUnificada["estado"], [string, string]> = {
    ligada: ["Ligada", "bg-emerald-500/15 text-emerald-400"],
    a_ligar: ["A ligar", "bg-amber-500/15 text-amber-300"],
    erro: ["Erro", "bg-rose-500/15 text-rose-400"],
    so_leitura: ["Só leitura", "bg-zinc-700/60 text-zinc-300"],
    pausada: ["Em pausa", "bg-zinc-700/60 text-zinc-300"],
  }
  const [t, cls] = m[estado]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{t}</span>
}

// ── Lista + ligar ──────────────────────────────────────────────────────────────────────────────
export function ListaContas({ estado, onMudou }: { estado: EstadoLigador; onMudou?: () => void }) {
  const { contas, quota, aCarregar, erro, recarregar, pedir, getToken } = estado
  const [aLigar, setALigar] = useState(false)
  const [aEditar, setAEditar] = useState<ContaUnificada | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  const depois = async (texto?: string) => {
    await recarregar()
    onMudou?.()
    if (texto) setAviso({ tipo: "ok", texto })
  }

  const acao = async (c: ContaUnificada, qual: "pausar" | "retomar" | "remover") => {
    if (qual === "remover") {
      const extra = c.contaMetaApi ? " A conta é também apagada na MetaApi." : ""
      if (!window.confirm(`Remover a conta ${c.login ?? ""}?${extra} As posições abertas na corretora não são fechadas.`)) return
    }
    setOcupada(c.chave)
    setAviso(null)
    try {
      const r = qual === "remover" ? await pedir("DELETE", { chave: c.chave }) : await pedir("PATCH", { chave: c.chave, acao: qual })
      await depois(
        qual === "remover"
          ? r.metaapi === "pendente"
            ? `Conta removida. ${r.aviso ?? "A MetaApi ainda não confirmou — volta a ser tentado."}`
            : r.metaapi === "partilhada"
              ? "Conta removida daqui. Continua ligada no outro produto, por isso não foi apagada na MetaApi."
              : "Conta removida."
          : qual === "pausar" ? "Conta em pausa." : "Conta retomada.",
      )
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível concluir." })
    } finally {
      setOcupada(null)
    }
  }

  const cheio = Boolean(quota && !quota.semLimite && quota.livres === 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="etiqueta">Contas ligadas</p>
        <button onClick={recarregar} disabled={aCarregar} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400" aria-label="Actualizar">
          {aCarregar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {erro && <p className="text-[12px] text-rose-400">{erro}</p>}

      {aCarregar && !contas.length ? (
        <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A ler as tuas contas…
        </p>
      ) : !contas.length ? (
        <div className={`${cartao} p-4 text-center`}>
          <Wallet className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-[12.5px] text-zinc-400">Ainda não tens contas ligadas. Liga uma vez e passas a aceitar ideias com um toque.</p>
        </div>
      ) : (
        contas.map((c) => (
          <div key={c.chave} className={`${cartao} p-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-white truncate">{c.rotulo || NOME_PLATAFORMA[c.plataforma]}</span>
                  <BadgePlataforma c={c} />
                  {c.demo && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">demo</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400 truncate">
                  <span className="font-mono text-zinc-300">{c.login ?? "—"}</span> · {c.servidor ?? "—"}
                  {typeof c.saldo === "number" ? ` · ${c.saldo.toLocaleString("pt-PT", { style: "currency", currency: "USD" })}` : ""}
                </p>
              </div>
              <BadgeEstado estado={c.estado} />
            </div>
            {c.usos.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.usos.map((u) => (
                  <span key={u} className="rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-2 py-0.5 text-[10px] text-[#D2A63C]">{u}</span>
                ))}
                {!c.contaMetaApi && (c.plataforma === "tradelocker" || c.plataforma === "mtmfunded") && (
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500">Não conta para o limite</span>
                )}
              </div>
            )}
            {c.estado === "erro" && c.erro && <p className="mt-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">{c.erro}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.acoes.editarCredenciais && (
                <button onClick={() => setAEditar(c)} disabled={ocupada === c.chave} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11.5px] text-zinc-300 disabled:opacity-50">
                  <KeyRound className="w-3 h-3" /> Password / servidor
                </button>
              )}
              {c.acoes.pausar && (
                <button onClick={() => acao(c, "pausar")} disabled={ocupada === c.chave} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11.5px] text-zinc-300 disabled:opacity-50">
                  <Pause className="w-3 h-3" /> Pausar
                </button>
              )}
              {c.acoes.retomar && (
                <button onClick={() => acao(c, "retomar")} disabled={ocupada === c.chave} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[11.5px] text-emerald-400 disabled:opacity-50">
                  <Play className="w-3 h-3" /> Retomar
                </button>
              )}
              {c.acoes.remover && (
                <button onClick={() => acao(c, "remover")} disabled={ocupada === c.chave} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-[11.5px] text-rose-400 disabled:opacity-50">
                  {ocupada === c.chave ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remover
                </button>
              )}
              {c.acoes.gerirNaAppMtmAuto && (
                <a href="/mtmautoapp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11.5px] text-zinc-300">
                  Gerir na app MTM Auto <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))
      )}

      {aviso && (
        <p className={`rounded-xl px-3 py-2 text-[12px] ${aviso.tipo === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{aviso.texto}</p>
      )}

      <button
        type="button"
        onClick={() => setALigar(true)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700 py-2.5 text-[12.5px] font-semibold text-zinc-300"
      >
        <Plus className="w-4 h-4" /> Ligar conta
      </button>
      {cheio && (
        <p className="text-[11px] text-amber-300/90 leading-snug">
          Já usas todas as contas MetaTrader do teu plano. TradeLocker e MTM Funded continuam disponíveis.
        </p>
      )}

      {aLigar && (
        <ModalLigar
          getToken={getToken}
          quota={quota}
          compraPermitida={estado.compraPermitida}
          aoFechar={() => setALigar(false)}
          aoLigar={async () => { setALigar(false); await depois("Conta ligada.") }}
        />
      )}
      {aEditar && (
        <ModalCredenciais
          conta={aEditar}
          pedir={pedir}
          aoFechar={() => setAEditar(null)}
          aoGuardar={async (msg) => { setAEditar(null); await depois(msg) }}
        />
      )}
    </div>
  )
}

// ── Modal: ligar ───────────────────────────────────────────────────────────────────────────────
function ModalLigar({
  getToken,
  quota,
  compraPermitida,
  aoFechar,
  aoLigar,
}: {
  getToken: Obter
  quota: QuotaContas | null
  compraPermitida: boolean
  aoFechar: () => void
  aoLigar: () => void
}) {
  const [plataforma, setPlataforma] = useState<PlataformaConta>("mt5")
  const [corretora, setCorretora] = useState(T2T_BROKERS[0].id)
  const [servidor, setServidor] = useState(T2T_BROKERS[0].servers[0])
  const [procura, setProcura] = useState("")
  const [resultados, setResultados] = useState<string[]>([])
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<{ texto: string; quota?: boolean } | null>(null)
  const metaTrader = plataforma === "mt5" || plataforma === "mt4"
  const semVagas = Boolean(quota && !quota.semLimite && (quota.livres ?? 0) <= 0)

  // Procura de servidores (MetaApi) — só mostra os que o Tap to Trade aceita.
  useEffect(() => {
    if (!metaTrader || procura.trim().length < 2) { setResultados([]); return }
    let cancelado = false
    const t = setTimeout(async () => {
      try {
        const tok = await getToken()
        if (!tok) return
        const r = await fetch(`/api/mtmcopy/brokers?platform=${plataforma}&q=${encodeURIComponent(procura.trim())}&limit=20`, { headers: { Authorization: `Bearer ${tok}` } })
        const j = await r.json().catch(() => ({}))
        const permitidos = new Set(T2T_BROKERS.flatMap((b) => b.servers.map((s) => s.toLowerCase())))
        const lista: string[] = (j.brokers ?? []).flatMap((g: { servers?: string[] }) => g.servers ?? [])
        if (!cancelado) setResultados([...new Set(lista)].filter((s) => permitidos.has(s.toLowerCase())).slice(0, 12))
      } catch {
        /* sem procura — os botões das corretoras continuam a servir */
      }
    }, 350)
    return () => { cancelado = true; clearTimeout(t) }
  }, [procura, plataforma, metaTrader, getToken])

  const servidoresDaCorretora = useMemo(() => T2T_BROKERS.find((b) => b.id === corretora)?.servers ?? [], [corretora])

  const ligarMetaTrader = async () => {
    if (!servidor.trim() || !login.trim() || !password) { setErro({ texto: "Preenche login, password e servidor." }); return }
    setBusy(true)
    setErro(null)
    try {
      const tok = await getToken()
      if (!tok) { setErro({ texto: "Sessão indisponível. Volta a entrar." }); return }
      const res = await fetch("/api/mtmcopy/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          mt5_server: servidor.trim(),
          mt5_login: login.trim(),
          mt5_password: password,
          mt5_platform: plataforma,
          copy_method: "telegram_group",
          purpose: "tap_to_trade",
          account_label: "T2T",
        }),
      })
      const j = await res.json().catch(() => ({}))
      setPassword("")
      if (!res.ok) { setErro({ texto: j.error || "Não foi possível ligar a conta.", quota: j.code === "quota_metaapi" }); return }
      aoLigar()
    } catch (e) {
      setErro({ texto: e instanceof Error ? e.message : "Erro inesperado." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => !busy && aoFechar()}>
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-5 h-5 text-[#D2A63C]" />
          <h3 className="text-base font-bold text-white">Ligar conta</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(["mt5", "mt4", "tradelocker", "mtmfunded"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPlataforma(p); setErro(null) }}
              disabled={busy}
              className={`rounded-xl border py-2 text-xs font-medium ${plataforma === p ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
            >
              {NOME_PLATAFORMA[p]}
            </button>
          ))}
        </div>

        {metaTrader && semVagas && quota && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11.5px] leading-snug text-amber-200">
            {quota.mensagem ?? "Já usas todas as contas MetaTrader do teu plano."}
            {compraPermitida && quota.plano === "gratis" && <UpgradeLinks />}
          </div>
        )}

        {metaTrader && (
          <div className="space-y-2.5">
            <div>
              <label className={rotulo}>Corretora</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {T2T_BROKERS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => { setCorretora(b.id); setServidor(b.servers[0]) }}
                    className={`rounded-xl border py-2 text-xs font-medium ${corretora === b.id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={rotulo}>Servidor</label>
              <select value={servidor} onChange={(e) => setServidor(e.target.value)} className={`mt-1 ${campo}`}>
                {[...new Set([servidor, ...servidoresDaCorretora])].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                <input value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Procurar servidor…" className={`${campo} pl-8`} />
              </div>
              {resultados.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {resultados.map((s) => (
                    <button key={s} onClick={() => { setServidor(s); setProcura("") }} className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">{s}</button>
                  ))}
                </div>
              )}
            </div>
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Login (número da conta)" inputMode="numeric" autoComplete="off" className={campo} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="new-password" className={campo} />
            <p className="text-[10.5px] text-zinc-500 leading-snug">
              A password vai direta para a ligação à corretora e não fica guardada no site. {quota && !quota.semLimite && `Contas MetaTrader: ${quota.emUso} de ${quota.limite}.`}
            </p>
          </div>
        )}

        {plataforma === "tradelocker" && (
          <TradeLockerConnectForm variante="mobile" purpose="tap_to_trade" getToken={getToken} extraPayload={() => ({ account_label: "T2T" })} onConnected={() => aoLigar()} />
        )}
        {plataforma === "mtmfunded" && <MtmFundedConnectForm variante="mobile" getToken={getToken} onConnected={() => aoLigar()} />}

        {erro && (
          <div className="mt-2 text-xs text-rose-400">
            {erro.texto}
            {erro.quota && compraPermitida && <UpgradeLinks />}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={aoFechar} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300">Fechar</button>
          {metaTrader && (
            <button onClick={ligarMetaTrader} disabled={busy} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black disabled:opacity-60">
              {busy ? "A ligar…" : "Ligar"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal: password / servidor ─────────────────────────────────────────────────────────────────
function ModalCredenciais({
  conta,
  pedir,
  aoFechar,
  aoGuardar,
}: {
  conta: ContaUnificada
  pedir: EstadoLigador["pedir"]
  aoFechar: () => void
  aoGuardar: (msg: string) => void
}) {
  const [password, setPassword] = useState("")
  const [servidor, setServidor] = useState(conta.servidor ?? "")
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState("")

  const guardar = async () => {
    setBusy(true)
    setErro("")
    try {
      const mudouServidor = servidor.trim() && servidor.trim() !== (conta.servidor ?? "")
      const r = await pedir("PATCH", {
        chave: conta.chave,
        acao: "credenciais",
        ...(password ? { password } : {}),
        ...(mudouServidor ? { servidor: servidor.trim() } : {}),
      })
      setPassword("")
      aoGuardar(r.message || "Guardado.")
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível guardar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => !busy && aoFechar()}>
      <div className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-1">Password e servidor</h3>
        <p className="text-[11px] text-zinc-400 mb-3">Conta {conta.login ?? ""} · {NOME_PLATAFORMA[conta.plataforma]}</p>
        <label className={rotulo}>Servidor</label>
        <input value={servidor} onChange={(e) => setServidor(e.target.value)} className={`mt-1 mb-2 ${campo}`} />
        <label className={rotulo}>Password nova (deixa vazio para manter)</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" className={`mt-1 ${campo}`} />
        {erro && <p className="text-xs text-rose-400 mt-2">{erro}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={aoFechar} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300">Cancelar</button>
          <button onClick={guardar} disabled={busy} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black disabled:opacity-60">{busy ? "A guardar…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  )
}

function UpgradeLinks() {
  return (
    <span className="mt-1.5 flex flex-wrap gap-2">
      <a href="/upgrade" className="font-semibold text-[#D2A63C] underline">Passar a Premium</a>
      <a href="/mtmauto" className="font-semibold text-[#D2A63C] underline">Conhecer o MTM Auto</a>
    </span>
  )
}

// ── Limites e plano ────────────────────────────────────────────────────────────────────────────
export function LimitesPlano({ estado }: { estado: EstadoLigador }) {
  const { quota, compraPermitida } = estado
  if (!quota) return null
  const nomePlano = quota.plano === "admin" ? "Admin" : quota.plano === "premium" ? "Premium / MTM Auto" : "Gratuito"
  const pct = quota.semLimite || !quota.limite ? 0 : Math.min(100, Math.round((quota.emUso / quota.limite) * 100))
  return (
    <div className={`${cartao} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <p className="etiqueta">Limites e plano</p>
        <span className="text-[11px] text-zinc-400">{nomePlano}</span>
      </div>
      {quota.semLimite ? (
        <p className="text-[12.5px] text-zinc-300">{quota.emUso} contas MetaTrader ligadas · sem limite.</p>
      ) : (
        <>
          <p className="text-[13px] text-white font-semibold">
            {quota.emUso} de {quota.limite} conta{quota.limite === 1 ? "" : "s"} MetaTrader
            {quota.extras > 0 && <span className="ml-1 text-[11px] font-normal text-zinc-400">(inclui {quota.extras} extra{quota.extras === 1 ? "" : "s"})</span>}
          </p>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full ${quota.acimaDoLimite ? "bg-rose-500" : pct >= 100 ? "bg-amber-400" : "bg-[#D2A63C]"}`} style={{ width: `${quota.acimaDoLimite ? 100 : pct}%` }} />
          </div>
          {quota.acimaDoLimite && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Acima do limite: as tuas contas continuam a funcionar, mas não podes ligar mais.
            </p>
          )}
          <p className="text-[11px] leading-snug text-zinc-500">
            Gratuito: {quota.gratis} conta MetaTrader (MT4/MT5). Premium ou MTM Auto: {quota.premium}. TradeLocker e MTM Funded não contam.
          </p>
          {quota.plano === "gratis" && compraPermitida && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a href="/upgrade" className="rounded-xl bg-[#D2A63C] py-2 text-center text-[12.5px] font-bold text-black">Passar a Premium</a>
              <a href="/mtmauto" className="rounded-xl border border-[#D2A63C]/40 py-2 text-center text-[12.5px] font-semibold text-[#D2A63C]">MTM Auto</a>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** O ligador completo (lista + limites), para páginas que não precisam de nada no meio. */
export default function LigadorContas({ getToken }: { getToken?: Obter }) {
  const estado = useContasLigadas(getToken)
  return (
    <div className="mtmauto space-y-4">
      <ListaContas estado={estado} />
      <CopiasEntreContas estado={estado} />
      <LimitesPlano estado={estado} />
    </div>
  )
}
