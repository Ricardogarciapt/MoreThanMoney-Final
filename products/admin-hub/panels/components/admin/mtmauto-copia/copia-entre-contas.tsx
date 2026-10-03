"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Loader2, Plus } from "lucide-react"
import { Aviso, BotaoRecarregar, Etiqueta, Tabela, confirmarEscrita, ms, pedirAdmin, quando, td, th, useDadosAdmin } from "./comum"

type Plat = "mtmfunded" | "mt4" | "mt5" | "tradelocker"
interface Rota {
  id: string; user_id: string; origem_tipo: Plat; origem_ref: string; destino_tipo: Plat; destino_ref: string; rotulo: string | null
  modo_lote: "multiplicador" | "fixo" | "risco_pct" | "proporcional_saldo"; valor: number; mapa_simbolos: Record<string, string>; filtro_simbolos: string[]
  filtro_direcao: "ambas" | "buy" | "sell"; lote_max: number | null; max_abertas: number | null; copiar_sl: boolean; copiar_tp: boolean
  copiar_parciais: boolean; copiar_modificacoes: boolean; fechar_com_origem: boolean; ativa: boolean; modo: "shadow" | "live"
  estado: "pedido" | "aprovada" | "recusada"; pedido_pelo_cliente: boolean; notas: string | null; pausada_motivo: string | null; created_at: string
}
interface Conta { ref: string; plataforma: Plat; email: string | null; login: string | null; servidor: string | null; rotulo: string | null; soLeitura: boolean; userId: string }
interface Evento { id: string; tipo: string; simbolo: string | null; direcao: string | null; volumeOrigem: number | null; resultado: string; acaoPretendida: unknown; acaoReal: unknown; latenciaMs: number | null; erro: string | null; criadoEm: string }

const NOME: Record<Plat, string> = { mtmfunded: "MTM Funded", mt4: "MT4", mt5: "MT5", tradelocker: "TradeLocker" }
const MODO_LOTE = { multiplicador: "Multiplicador ×", fixo: "Lote fixo", risco_pct: "Risco % da equity", proporcional_saldo: "Proporcional ao saldo" }
const campo = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"

const CONFIG_VAZIA = {
  rotulo: "", modo_lote: "multiplicador", valor: "1", mapa: "", filtro_simbolos: "", filtro_direcao: "ambas", lote_max: "", max_abertas: "",
  copiar_sl: true, copiar_tp: true, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true, notas: "",
}
type Config = typeof CONFIG_VAZIA

function configParaCorpo(c: Config) {
  const mapa: Record<string, string> = {}
  for (const par of c.mapa.split(/[\n,;]+/)) {
    const [a, b] = par.split(/[=:>]+/).map((x) => x.trim())
    if (a && b) mapa[a.toUpperCase()] = b
  }
  return {
    rotulo: c.rotulo, modo_lote: c.modo_lote, valor: Number(c.valor), mapa_simbolos: mapa, filtro_simbolos: c.filtro_simbolos,
    filtro_direcao: c.filtro_direcao, lote_max: c.lote_max === "" ? null : Number(c.lote_max), max_abertas: c.max_abertas === "" ? null : Number(c.max_abertas),
    copiar_sl: c.copiar_sl, copiar_tp: c.copiar_tp, copiar_parciais: c.copiar_parciais, copiar_modificacoes: c.copiar_modificacoes, fechar_com_origem: c.fechar_com_origem, notas: c.notas,
  }
}
function rotaParaConfig(r: Rota): Config {
  return {
    rotulo: r.rotulo ?? "", modo_lote: r.modo_lote, valor: String(r.valor), mapa: Object.entries(r.mapa_simbolos ?? {}).map(([a, b]) => `${a}=${b}`).join("\n"),
    filtro_simbolos: (r.filtro_simbolos ?? []).join(", "), filtro_direcao: r.filtro_direcao, lote_max: r.lote_max == null ? "" : String(r.lote_max),
    max_abertas: r.max_abertas == null ? "" : String(r.max_abertas), copiar_sl: r.copiar_sl, copiar_tp: r.copiar_tp, copiar_parciais: r.copiar_parciais,
    copiar_modificacoes: r.copiar_modificacoes, fechar_com_origem: r.fechar_com_origem, notas: r.notas ?? "",
  }
}

function FormConfig({ c, set }: { c: Config; set: (c: Config) => void }) {
  const up = (k: keyof Config, v: string | boolean) => set({ ...c, [k]: v })
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Nome</span><input className={campo} value={c.rotulo} onChange={(e) => up("rotulo", e.target.value)} /></label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Modo do lote</span>
        <select className={campo} value={c.modo_lote} onChange={(e) => up("modo_lote", e.target.value)}>{Object.entries(MODO_LOTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">{c.modo_lote === "fixo" ? "Lotes" : c.modo_lote === "risco_pct" ? "% da equity (máx 10)" : "Multiplicador"}</span><input className={campo} inputMode="decimal" value={c.valor} onChange={(e) => up("valor", e.target.value)} /></label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Lote máximo</span><input className={campo} inputMode="decimal" value={c.lote_max} onChange={(e) => up("lote_max", e.target.value)} placeholder="sem" /></label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Símbolos (vazio = todos)</span><input className={campo} value={c.filtro_simbolos} onChange={(e) => up("filtro_simbolos", e.target.value)} placeholder="XAUUSD, EURUSD" /></label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Direcção</span>
        <select className={campo} value={c.filtro_direcao} onChange={(e) => up("filtro_direcao", e.target.value)}><option value="ambas">Compras e vendas</option><option value="buy">Só compras</option><option value="sell">Só vendas</option></select>
      </label>
      <label className="space-y-1"><span className="text-[11px] text-zinc-500">Máx. posições abertas</span><input className={campo} inputMode="numeric" value={c.max_abertas} onChange={(e) => up("max_abertas", e.target.value)} placeholder="sem" /></label>
      <label className="space-y-1 md:row-span-2"><span className="text-[11px] text-zinc-500">Mapa de símbolos (origem=destino)</span><textarea className={`${campo} h-[74px]`} value={c.mapa} onChange={(e) => up("mapa", e.target.value)} placeholder={"XAUUSD=GOLD\nUS30=DJ30"} /></label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        {([["copiar_sl", "copiar SL"], ["copiar_tp", "copiar TP"], ["copiar_parciais", "copiar parciais"], ["copiar_modificacoes", "copiar modificações"], ["fechar_com_origem", "fechar com a origem"]] as const).map(([k, t]) => (
          <label key={k} className="flex items-center gap-1.5 text-xs text-zinc-300"><input type="checkbox" checked={c[k] as boolean} onChange={(e) => up(k, e.target.checked)} /> {t}</label>
        ))}
      </div>
    </div>
  )
}

function EventosDaRota({ rotaId }: { rotaId: string }) {
  const { dados, aCarregar, recarregar } = useDadosAdmin<{ eventos: Evento[] }>(`/api/admin/mtmauto-copia/eventos?rotaId=${rotaId}&sistema=copia_contas&limite=30`)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-500">Últimos eventos · pretendido vs real</p><BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} /></div>
      {!dados?.eventos.length ? <p className="text-xs text-zinc-500">Sem eventos.</p> : (
        <Tabela>
          <thead><tr><th className={th}>Quando</th><th className={th}>Facto na origem</th><th className={th}>Resultado</th><th className={th}>Acção pretendida</th><th className={th}>Real</th><th className={th}>Latência</th></tr></thead>
          <tbody>
            {dados.eventos.map((e) => (
              <tr key={e.id}>
                <td className={td}>{quando(e.criadoEm)}</td>
                <td className={td}>{e.tipo} {e.simbolo ?? ""} {e.direcao ?? ""} {e.volumeOrigem ?? ""}</td>
                <td className={td}><Etiqueta tom={e.resultado === "ok" ? "ok" : e.resultado === "sombra" ? "info" : e.resultado === "erro" ? "grave" : e.resultado === "recusado" ? "aviso" : "neutro"}>{e.resultado}</Etiqueta>{e.erro && <span className="block text-[11px] text-rose-300">{e.erro}</span>}</td>
                <td className={td}><code className="text-[11px] text-zinc-400 break-all">{JSON.stringify(e.acaoPretendida)}</code></td>
                <td className={td}><code className="text-[11px] text-zinc-400 break-all">{e.acaoReal ? JSON.stringify(e.acaoReal) : "—"}</code></td>
                <td className={td}>{ms(e.latenciaMs)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  )
}

export default function CopiaEntreContas({ userIdInicial }: { userIdInicial?: string | null }) {
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<{ rotas: Rota[]; legado: Record<string, unknown>[] }>("/api/admin/mtmauto-copia/rotas")
  const { dados: contasTodas } = useDadosAdmin<{ contas: Conta[] }>("/api/admin/mtmauto-copia/contas")
  const [criar, setCriar] = useState(false)
  const [dono, setDono] = useState<string>(userIdInicial ?? "")
  const [origem, setOrigem] = useState("")
  const [destino, setDestino] = useState("")
  const [config, setConfig] = useState<Config>({ ...CONFIG_VAZIA })
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ id: string; c: Config } | null>(null)
  const [filtro, setFiltro] = useState<"" | "pedido" | "aprovada" | "recusada">("")

  const contasPorRef = useMemo(() => new Map((contasTodas?.contas ?? []).map((c) => [c.ref, c])), [contasTodas])
  const donos = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of contasTodas?.contas ?? []) if (!m.has(c.userId)) m.set(c.userId, c.email ?? c.userId.slice(0, 8))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [contasTodas])
  const contasDoDono = (contasTodas?.contas ?? []).filter((c) => c.userId === dono)
  useEffect(() => { setOrigem(""); setDestino("") }, [dono])

  const descr = (ref: string) => {
    const c = contasPorRef.get(ref)
    return c ? `${NOME[c.plataforma]} · ${c.rotulo ? `${c.rotulo} · ` : ""}${c.login ?? "—"}` : ref
  }

  const gravarNova = async () => {
    setAGravar(true)
    const r = await pedirAdmin<{ rota: Rota }>("/api/admin/mtmauto-copia/rotas", { method: "POST", body: { origem_ref: origem, destino_ref: destino, ...configParaCorpo(config) } })
    setAGravar(false)
    setMsg(r.success ? "Rota criada: aprovada, INACTIVA e em sombra. Activa-a para o motor a calcular (sem enviar ordens)." : r.error ?? "falhou")
    if (r.success) { setCriar(false); setConfig({ ...CONFIG_VAZIA }); void recarregar() }
  }

  const acao = async (r: Rota, a: string, extra: Record<string, unknown> = {}) => {
    const resp = await pedirAdmin<{ rota: Rota }>("/api/admin/mtmauto-copia/rotas", { method: "PATCH", body: { id: r.id, acao: a, ...extra } })
    setMsg(resp.success ? `Rota ${r.rotulo ?? r.id.slice(0, 8)}: ${a} feito.` : resp.error ?? "falhou")
    void recarregar()
  }

  const pedirLive = (r: Rota) => {
    const confirmacao = confirmarEscrita("Pedir modo LIVE: a rota passaria a enviar ordens REAIS para o destino. Nesta instalação o live está bloqueado na base — o pedido vai ser recusado.", "LIGAR")
    if (confirmacao) void acao(r, "modo", { modo: "live", confirmacao })
  }

  const apagar = async (r: Rota) => {
    if (!window.confirm("Apagar a rota? Só é possível sem cópias abertas no destino.")) return
    const resp = await pedirAdmin(`/api/admin/mtmauto-copia/rotas?id=${r.id}`, { method: "DELETE" })
    setMsg(resp.success ? "Rota apagada." : resp.error ?? "falhou")
    void recarregar()
  }

  const rotas = (dados?.rotas ?? []).filter((r) => !filtro || r.estado === filtro)
  const pedidos = (dados?.rotas ?? []).filter((r) => r.estado === "pedido").length

  return (
    <div className="space-y-4">
      <Aviso tom="info">
        Nesta entrega o motor corre <strong>só em sombra</strong>: calcula e regista a ordem que faria no destino e não envia nada. O modo live está bloqueado na base
        (<code>copia_contas_live_desbloqueado=false</code>) e exige ainda «LIGAR» por rota e <code>COPIA_ESCRITA=1</code> no VPS.
      </Aviso>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCriar(!criar)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black"><Plus className="h-3.5 w-3.5" /> Nova rota</button>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white">
          <option value="">Todas</option><option value="pedido">Pedidos ({pedidos})</option><option value="aprovada">Aprovadas</option><option value="recusada">Recusadas</option>
        </select>
        <div className="ml-auto"><BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} /></div>
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {msg && <Aviso tom="info">{msg}</Aviso>}

      {criar && (
        <div className="space-y-3 rounded-xl border border-[#D2A63C]/30 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Dono (as duas contas são dele)</span>
              <select className={campo} value={dono} onChange={(e) => setDono(e.target.value)}><option value="">—</option>{donos.map(([id, e]) => <option key={id} value={id}>{e}</option>)}</select>
            </label>
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Origem</span>
              <select className={campo} value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">—</option>{contasDoDono.map((c) => <option key={c.ref} value={c.ref}>{descr(c.ref)}</option>)}</select>
            </label>
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Destino</span>
              <select className={campo} value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">—</option>{contasDoDono.filter((c) => c.ref !== origem && !c.soLeitura).map((c) => <option key={c.ref} value={c.ref}>{descr(c.ref)}</option>)}</select>
            </label>
          </div>
          <FormConfig c={config} set={setConfig} />
          <div className="flex items-center gap-2">
            <button type="button" disabled={!origem || !destino || aGravar} onClick={gravarNova} className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">{aGravar ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null} Criar (sombra, inactiva)</button>
            <span className="text-[11px] text-zinc-500">A base recusa: a mesma conta, ciclos (A→B→A) e mais de 5 destinos por origem.</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rotas.length === 0 && !aCarregar && <p className="text-xs text-zinc-500">Sem rotas.</p>}
        {rotas.map((r) => (
          <div key={r.id} className={`rounded-xl border ${r.estado === "pedido" ? "border-amber-500/40" : "border-zinc-800"}`}>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <button type="button" onClick={() => setAberta(aberta === r.id ? null : r.id)} className="flex flex-wrap items-center gap-2 text-left">
                <span className="text-sm font-semibold text-zinc-100">{r.rotulo || "Rota"}</span>
                <span className="text-xs text-zinc-300">{descr(r.origem_ref)}</span><ArrowRight className="h-3.5 w-3.5 text-zinc-500" /><span className="text-xs text-zinc-300">{descr(r.destino_ref)}</span>
              </button>
              <span className="text-[11px] text-zinc-500">{contasPorRef.get(r.origem_ref)?.email ?? r.user_id.slice(0, 8)}</span>
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <Etiqueta tom={r.estado === "aprovada" ? "ok" : r.estado === "pedido" ? "aviso" : "neutro"}>{r.estado}{r.pedido_pelo_cliente ? " · cliente" : ""}</Etiqueta>
                <Etiqueta tom={r.ativa ? "info" : "neutro"}>{r.ativa ? "activa" : "inactiva"}</Etiqueta>
                <Etiqueta tom={r.modo === "live" ? "grave" : "info"}>{r.modo === "live" ? "LIVE" : "sombra"}</Etiqueta>
                <Etiqueta>{MODO_LOTE[r.modo_lote]} {r.valor}</Etiqueta>
              </span>
            </div>
            {aberta === r.id && (
              <div className="space-y-3 border-t border-zinc-800 p-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  {r.estado === "pedido" && <button className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-300" onClick={() => acao(r, "aprovar")}>aprovar</button>}
                  {r.estado !== "recusada" && <button className="rounded border border-zinc-700 px-2 py-1" onClick={() => { const m = window.prompt("Motivo da recusa (o cliente vê)?") ?? ""; void acao(r, "recusar", { motivo: m }) }}>recusar</button>}
                  {r.estado === "aprovada" && (r.ativa
                    ? <button className="rounded border border-zinc-700 px-2 py-1" onClick={() => acao(r, "pausar")}>pausar</button>
                    : <button className="rounded border border-sky-500/40 px-2 py-1 text-sky-300" onClick={() => acao(r, "ativar")}>activar (sombra)</button>)}
                  {r.modo === "shadow" ? <button className="rounded border border-rose-500/30 px-2 py-1 text-rose-300" onClick={() => pedirLive(r)}>pedir live…</button> : <button className="rounded border border-zinc-700 px-2 py-1" onClick={() => acao(r, "modo", { modo: "shadow" })}>voltar a sombra</button>}
                  <button className="rounded border border-zinc-700 px-2 py-1" onClick={() => setEdicao(edicao?.id === r.id ? null : { id: r.id, c: rotaParaConfig(r) })}>editar</button>
                  <button className="rounded border border-zinc-700 px-2 py-1 text-rose-300" onClick={() => apagar(r)}>apagar</button>
                  {r.pausada_motivo && <span className="text-[11px] text-zinc-500">pausa: {r.pausada_motivo}</span>}
                  {r.notas && <span className="text-[11px] text-zinc-500">notas: {r.notas}</span>}
                </div>
                {edicao?.id === r.id && (
                  <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
                    <FormConfig c={edicao.c} set={(c) => setEdicao({ id: r.id, c })} />
                    <button className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black" onClick={async () => { await acao(r, "editar", configParaCorpo(edicao.c)); setEdicao(null) }}>Guardar</button>
                  </div>
                )}
                <p className="text-[11px] text-zinc-500">
                  Filtros: {r.filtro_simbolos?.length ? r.filtro_simbolos.join(", ") : "todos os símbolos"} · {r.filtro_direcao} · lote máx {r.lote_max ?? "—"} · máx abertas {r.max_abertas ?? "—"} ·
                  SL {r.copiar_sl ? "sim" : "não"} · TP {r.copiar_tp ? "sim" : "não"} · parciais {r.copiar_parciais ? "sim" : "não"} · modificações {r.copiar_modificacoes ? "sim" : "não"} · fecha com a origem {r.fechar_com_origem ? "sim" : "não"}
                  {Object.keys(r.mapa_simbolos ?? {}).length ? ` · mapa ${Object.entries(r.mapa_simbolos).map(([a, b]) => `${a}→${b}`).join(", ")}` : ""}
                </p>
                <EventosDaRota rotaId={r.id} />
              </div>
            )}
          </div>
        ))}
      </div>

      {(dados?.legado?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">Copiador MTM Funded (068) — só leitura</h3>
          <p className="text-[11px] text-zinc-500">Continua a correr no serviço mtm-funded-copier (COPIER_ESCRITA no VPS). Aparece aqui e na vista copia_rotas_todas; a migração para rotas novas é uma decisão à parte.</p>
          <Tabela>
            <thead><tr><th className={th}>Conta simulada</th><th className={th}>Destino</th><th className={th}>Lote</th><th className={th}>Estado</th><th className={th}>Criado</th></tr></thead>
            <tbody>
              {dados!.legado.map((l) => (
                <tr key={String(l.id)}>
                  <td className={td}>{String(l.account_id).slice(0, 8)}</td>
                  <td className={td}>{String(l.destino_tipo)} · {String(l.destino_id).slice(0, 8)}</td>
                  <td className={td}>{String(l.modo_lote)} {String(l.valor ?? "")}</td>
                  <td className={td}><Etiqueta tom={l.ativo ? "ok" : "neutro"}>{l.ativo ? "activo" : `pausado${l.pausado_motivo ? ` · ${l.pausado_motivo}` : ""}`}</Etiqueta></td>
                  <td className={td}>{quando(l.created_at as string)}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </section>
      )}
    </div>
  )
}
