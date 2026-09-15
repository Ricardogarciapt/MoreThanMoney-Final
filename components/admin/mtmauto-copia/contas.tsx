"use client"

import { useMemo, useState } from "react"
import { Eye, Loader2, MoreHorizontal } from "lucide-react"
import { Aviso, BotaoRecarregar, Etiqueta, Tabela, confirmarEscrita, pedirAdmin, quando, td, th, useDadosAdmin } from "./comum"

interface ContaAdmin {
  ref: string
  origem: "site" | "auto" | "wt" | "funded"
  plataforma: "mt4" | "mt5" | "tradelocker" | "mtmfunded"
  userId: string
  email: string | null
  nome: string | null
  rotulo: string | null
  login: string | null
  servidor: string | null
  estado: string
  ativa: boolean
  erro: string | null
  demo: boolean
  soLeitura: boolean
  metaapiAccountId: string | null
  metaapiEstado: string | null
  metaapiLigacao: string | null
  chaveEquipa: boolean
  contaMetaApi: boolean
  usos: string[]
  saldo: number | null
  plano: string
  motivoDireito: string
  quota: { emUso: number; limite: number | null; acima: boolean }
  criadaEm: string | null
}

const NOME_PLAT = { mt4: "MT4", mt5: "MT5", tradelocker: "TradeLocker", mtmfunded: "MTM Funded" } as const
const NOME_ORIGEM = { site: "T2T / site", auto: "MTM Auto", wt: "WebTrader", funded: "MTM Funded" } as const

export default function ContasCopia({ userIdInicial, extraPorUtilizador }: { userIdInicial?: string | null; extraPorUtilizador?: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(userIdInicial ?? null)
  const url = userId ? `/api/admin/mtmauto-copia/contas?userId=${userId}` : "/api/admin/mtmauto-copia/contas"
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<{ contas: ContaAdmin[]; metaapiLidaEm: string; metaapiFalhou: boolean }>(url)
  const [busca, setBusca] = useState("")
  const [plataforma, setPlataforma] = useState<string>("")
  const [soProblemas, setSoProblemas] = useState(false)
  const [aAgir, setAAgir] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [vista, setVista] = useState<{ ref: string; dados: Record<string, unknown> | null } | null>(null)

  const problema = (c: ContaAdmin) => Boolean(c.erro) || c.quota.acima || c.metaapiEstado === "NÃO EXISTE" || (c.contaMetaApi && c.metaapiEstado === "UNDEPLOYED" && c.ativa) || c.estado === "error"

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (dados?.contas ?? []).filter((c) =>
      (!plataforma || c.plataforma === plataforma) &&
      (!soProblemas || problema(c)) &&
      (!t || [c.email, c.nome, c.login, c.servidor, c.rotulo, c.metaapiAccountId, c.ref].some((x) => String(x ?? "").toLowerCase().includes(t))),
    )
  }, [dados, busca, plataforma, soProblemas])

  const agir = async (c: ContaAdmin, acao: string) => {
    let confirmacao: string | null = null
    if (acao === "deploy" || acao === "undeploy") {
      confirmacao = confirmarEscrita(`${acao === "deploy" ? "Ligar (deploy)" : "Desligar (undeploy)"} a conta ${c.login ?? ""} @ ${c.servidor ?? ""} na MetaApi.${acao === "undeploy" ? " A cópia desta conta pára enquanto estiver desligada." : " Passa a custar enquanto estiver ligada."}`, "CONFIRMAR")
      if (!confirmacao) return
    }
    if (acao === "remover") {
      confirmacao = confirmarEscrita(`Remover a conta ${c.login ?? ""} @ ${c.servidor ?? ""} de ${c.email ?? c.userId}. Pára a cópia, apaga a conta na MetaApi (se não for partilhada, com releitura) e apaga a linha.`, "REMOVER")
      if (!confirmacao) return
    }
    setAAgir(`${c.ref}:${acao}`)
    const r = await pedirAdmin<{ message: string }>("/api/admin/mtmauto-copia/contas", { method: "POST", body: { ref: c.ref, acao, confirmacao } })
    setAAgir(null)
    setMensagem(`${c.login ?? c.ref} · ${acao}: ${r.success ? r.data?.message : r.error}`)
    if (acao !== "sincronizar" || r.success) void recarregar()
  }

  const abrirVista = async (c: ContaAdmin) => {
    setVista({ ref: c.ref, dados: null })
    const r = await pedirAdmin<Record<string, unknown>>(`/api/admin/mtmauto-copia/contas?vista=${encodeURIComponent(c.ref)}`)
    setVista({ ref: c.ref, dados: r.success ? r.data ?? {} : { erro: r.error } })
  }

  const porUtilizador = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of dados?.contas ?? []) m.set(c.userId, (m.get(c.userId) ?? 0) + 1)
    return m
  }, [dados])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="email, login, servidor, id MetaApi…" className="w-64 max-w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white" />
        <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white">
          <option value="">Todas as plataformas</option>
          <option value="mt5">MT5</option><option value="mt4">MT4</option><option value="tradelocker">TradeLocker</option><option value="mtmfunded">MTM Funded</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} /> só com problemas</label>
        {userId && (
          <button type="button" onClick={() => setUserId(null)} className="rounded-lg bg-[#D2A63C]/15 px-2 py-1 text-xs text-[#D2A63C]">utilizador {userId.slice(0, 8)} ✕</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">{lista.length} de {dados?.contas.length ?? 0}</span>
          <BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} />
        </div>
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {dados?.metaapiFalhou && <Aviso>A listagem da MetaApi falhou: o estado MetaApi das contas não é fiável nesta leitura.</Aviso>}
      {mensagem && <Aviso tom="info">{mensagem}</Aviso>}

      <Tabela>
        <thead>
          <tr>
            <th className={th}>Dono · plano</th>
            <th className={th}>Conta</th>
            <th className={th}>Estado</th>
            <th className={th}>MetaApi · quota</th>
            <th className={th}>Serve para</th>
            <th className={th}>Saldo</th>
            <th className={th}>Acções</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => {
            const ocupado = aAgir?.startsWith(c.ref)
            const mt = c.plataforma === "mt4" || c.plataforma === "mt5"
            return (
              <tr key={c.ref} className={problema(c) ? "bg-rose-500/[0.03]" : undefined}>
                <td className={td}>
                  <button type="button" onClick={() => setUserId(c.userId)} className="text-left hover:text-[#D2A63C]" title="Filtrar por este utilizador">
                    <span className="block text-zinc-200">{c.email ?? c.userId.slice(0, 8)}</span>
                  </button>
                  <span className="text-[11px] text-zinc-500">{c.plano} · {c.motivoDireito}{(porUtilizador.get(c.userId) ?? 0) > 1 ? ` · ${porUtilizador.get(c.userId)} contas` : ""}</span>
                </td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Etiqueta tom="ouro">{NOME_PLAT[c.plataforma]}</Etiqueta>
                    <Etiqueta>{NOME_ORIGEM[c.origem]}</Etiqueta>
                    {c.demo && <Etiqueta tom="info">demo</Etiqueta>}
                    {c.soLeitura && <Etiqueta>só leitura</Etiqueta>}
                  </div>
                  <span className="mt-0.5 block text-zinc-200">{c.rotulo ? `${c.rotulo} · ` : ""}{c.login ?? "—"}</span>
                  <span className="text-[11px] text-zinc-500">{c.servidor ?? ""}</span>
                </td>
                <td className={td}>
                  <Etiqueta tom={c.estado === "error" ? "grave" : c.ativa ? "ok" : "aviso"}>{c.ativa ? c.estado : `${c.estado} · pausada`}</Etiqueta>
                  {c.erro && <p className="mt-1 max-w-[220px] text-[11px] text-rose-300">{c.erro.slice(0, 140)}</p>}
                </td>
                <td className={td}>
                  {c.metaapiAccountId ? (
                    <>
                      <Etiqueta tom={c.metaapiEstado === "NÃO EXISTE" ? "grave" : c.metaapiEstado === "DEPLOYED" ? (c.metaapiLigacao === "CONNECTED" ? "ok" : "aviso") : c.chaveEquipa ? "info" : "neutro"}>
                        {c.metaapiEstado ?? "—"}{c.metaapiLigacao ? ` · ${c.metaapiLigacao}` : ""}
                      </Etiqueta>
                      <span className="block text-[10px] text-zinc-600">{c.metaapiAccountId.slice(0, 8)}</span>
                    </>
                  ) : <span className="text-zinc-600">não conta</span>}
                  {c.contaMetaApi && (
                    <span className={`block text-[11px] ${c.quota.acima ? "text-rose-300" : "text-zinc-500"}`}>quota {c.quota.emUso}/{c.quota.limite ?? "∞"}</span>
                  )}
                </td>
                <td className={td}><div className="flex max-w-[240px] flex-wrap gap-1">{c.usos.map((u, i) => <Etiqueta key={i}>{u}</Etiqueta>)}</div></td>
                <td className={td}><span className="tabular-nums">{c.saldo == null ? "—" : c.saldo.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}</span></td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1">
                    {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                    <button className="rounded border border-zinc-700 px-1.5 py-0.5 hover:bg-zinc-800" disabled={!!ocupado} onClick={() => agir(c, "sincronizar")} title="Relê a MetaApi e a CopyFactory (sem RPC)">sync</button>
                    {(c.origem === "site" || c.origem === "auto") && (
                      <button className="rounded border border-zinc-700 px-1.5 py-0.5 hover:bg-zinc-800" disabled={!!ocupado} onClick={() => agir(c, c.ativa ? "pausar" : "retomar")}>{c.ativa ? "pausar" : "retomar"}</button>
                    )}
                    <button className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 hover:bg-zinc-800" onClick={() => abrirVista(c)} title="Conta e posições, só leitura (adaptadores do WebTrader)"><Eye className="h-3 w-3" /> ver</button>
                    <details className="relative">
                      <summary className="list-none cursor-pointer rounded border border-zinc-700 px-1 py-0.5 hover:bg-zinc-800"><MoreHorizontal className="h-3.5 w-3.5" /></summary>
                      <div className="absolute right-0 z-10 mt-1 w-36 space-y-1 rounded-lg border border-zinc-700 bg-zinc-950 p-1.5 shadow-xl">
                        {mt && c.metaapiAccountId && !c.chaveEquipa && <button className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-800" onClick={() => agir(c, "deploy")}>deploy</button>}
                        {mt && c.metaapiAccountId && !c.chaveEquipa && <button className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-800" onClick={() => agir(c, "undeploy")}>undeploy</button>}
                        {c.origem !== "funded" && <button className="block w-full rounded px-2 py-1 text-left text-rose-300 hover:bg-zinc-800" onClick={() => agir(c, "remover")}>remover…</button>}
                        <span className="block px-2 py-1 text-[10px] text-zinc-600">criada {quando(c.criadaEm)}</span>
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </Tabela>

      {vista && (
        <div className="rounded-xl border border-sky-500/30 bg-zinc-950 p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-sky-300">Vista só leitura · {vista.ref}</p>
            <button onClick={() => setVista(null)} className="text-zinc-500 hover:text-white">fechar</button>
          </div>
          {!vista.dados ? <Loader2 className="h-4 w-4 animate-spin" /> : vista.dados.erro ? <Aviso tom="grave">{String(vista.dados.erro)}</Aviso> : (
            <>
              <p className="mb-2 text-zinc-400">
                {(() => { const i = vista.dados.conta as Record<string, number | null>; return `saldo ${i?.saldo ?? "—"} · equity ${i?.equity ?? "—"} · margem livre ${i?.margemLivre ?? "—"}` })()}
              </p>
              <Tabela>
                <thead><tr><th className={th}>Símbolo</th><th className={th}>Dir.</th><th className={th}>Lote</th><th className={th}>Entrada</th><th className={th}>SL</th><th className={th}>TP</th><th className={th}>Aberta</th></tr></thead>
                <tbody>
                  {((vista.dados.posicoes as Record<string, unknown>[]) ?? []).map((p) => (
                    <tr key={String(p.id)}>
                      <td className={td}>{String(p.simboloCorretora ?? p.symbol)}</td><td className={td}>{String(p.direcao)}</td><td className={td}>{String(p.volume)}</td>
                      <td className={td}>{String(p.precoEntrada ?? "—")}</td><td className={td}>{String(p.sl ?? "—")}</td><td className={td}>{String(p.tp ?? "—")}</td><td className={td}>{quando(p.abertaEm as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </>
          )}
        </div>
      )}

      {userId && extraPorUtilizador}
    </div>
  )
}
