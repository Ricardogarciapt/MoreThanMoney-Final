"use client"

import { useEffect, useState } from "react"
import { ehIosNativo } from "@/lib/app-nativa"
import { Copy as IconCopy, Loader2, Pause, Play, Trash2, AlertTriangle, ChevronLeft } from "lucide-react"
import { pedir } from "./api"

/**
 * COPIAR ESTA CONTA SIMULADA PARA A MINHA CONTA MT5.
 *
 * O aluno escolhe uma das contas que já ligou no MTM Copy ou no MTM Auto, o tamanho, os símbolos e
 * confirma que as decisões são dele. O resto (as ordens) é do serviço do VPS — este painel só
 * configura e mostra o que aconteceu.
 *
 * Arranque prudente: só contas demo. As reais aparecem mas desactivadas, com a nota «em breve».
 * Na app iOS nativa não há link de compra (regras da Apple): só o texto.
 */

type Destino = {
  tipo: "mtmcopy" | "mtmauto"; id: string; rotulo: string; login: string | null; servidor: string | null
  demo: boolean | null; ligado: boolean; outraCopiaAtiva: boolean; permitido: boolean; motivo: string | null
}
type Copiador = {
  id: string; destinoTipo: string; destinoId: string; ativo: boolean; pausadoMotivo: string | null
  modoLote: Modo; valor: number | null; loteMax: number | null; maxPosicoes: number | null; perdaDiariaMax: number | null
  copiarSl: boolean; copiarTp: boolean; simbolos: string[]; destino: Destino | null
}
type Evento = { id: number; tipo: string; payload: Record<string, unknown>; criado_em: string; processado_em: string | null; tentativas: number; erro: string | null }
type CopiaLinha = {
  id: string; estado: string; erro: string | null; symbol: string | null; direcao: string | null; dest_symbol: string | null
  volume_origem: number; dest_volume_origem: number | null; fechado_pct: number; latencia_ms: number | null; deslizamento: number | null; created_at: string
}
type Estado = {
  modo: "master" | "investor"; elegivel: boolean; admin: boolean; reaisLigadas: boolean; interruptorLigado: boolean
  destinos: Destino[]; copiadores: Copiador[]; eventos: Evento[]; copias: CopiaLinha[]
}
type Modo = "proporcional_saldo" | "multiplicador" | "fixo" | "risco_pct"

const MODOS: Array<[Modo, string, string]> = [
  ["proporcional_saldo", "Proporcional ao saldo", "O mesmo risco em %: 1 lote numa simulada de 100 000 são 0,05 numa conta de 5 000."],
  ["multiplicador", "Multiplicador", "O lote da simulada vezes um número."],
  ["fixo", "Lote fixo", "Sempre o mesmo lote, seja qual for o da simulada."],
  ["risco_pct", "Risco %", "Arrisca uma % da equity até ao SL (posições sem SL não se copiam)."],
]
const NOME_MODO = Object.fromEntries(MODOS.map(([m, n]) => [m, n])) as Record<Modo, string>
const TIPO_EVENTO: Record<string, string> = { open: "Abrir", modify: "SL/TP", partial: "Parcial", close: "Fechar" }

/** A regra única (lib/app-nativa.ts): MTM System, MTM Auto e iPad em modo secretária. */
const iosNativo = () => ehIosNativo()

const Etiqueta = ({ demo }: { demo: boolean | null }) => (
  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${demo === true ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>
    {demo === true ? "Demo" : demo === false ? "Real" : "Real?"}
  </span>
)

export default function FundedCopier({ accountId, podeGerir }: { accountId: string; podeGerir: boolean }) {
  const [dados, setDados] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [novo, setNovo] = useState(false)

  const ler = async () => {
    try { setDados(await pedir<Estado>(`/api/mtmfunded/simulado/copia?accountId=${accountId}`, {}, accountId)); setErro(null) }
    catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    ler()
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") ler() }, 10_000)
    return () => clearInterval(iv)
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const accao = async (f: () => Promise<unknown>) => {
    setACarregar(true); setErro(null)
    try { await f(); await ler() } catch (e) { setErro((e as Error).message) } finally { setACarregar(false) }
  }
  const alternar = (c: Copiador) => accao(() => pedir("/api/mtmfunded/simulado/copia", { method: "PATCH", body: JSON.stringify({ accountId, id: c.id, ativo: !c.ativo }) }, accountId))
  const apagar = (c: Copiador) => {
    if (!confirm("Apagar esta cópia? As posições já copiadas ficam na tua conta.")) return
    accao(() => pedir(`/api/mtmfunded/simulado/copia?accountId=${accountId}&id=${c.id}`, { method: "DELETE" }, accountId))
  }

  if (!dados) {
    return erro
      ? <p className="text-[12px] text-rose-300">{erro}</p>
      : <div className="grid place-items-center p-4"><Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /></div>
  }

  const cabecalho = (
    <div className="flex items-center gap-2">
      <IconCopy className="h-4 w-4 text-[#D2A63C]" />
      <b className="text-white">Copiar para a minha conta</b>
      {dados.copiadores.length > 0 && (
        <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
          {dados.copiadores.filter((c) => c.ativo).length} activa(s)
        </span>
      )}
    </div>
  )

  if (!dados.elegivel) {
    return (
      <div className="space-y-2 text-[12px]">
        {cabecalho}
        <p className="text-zinc-400">A cópia para a tua conta está incluída no MTM Copy ou no MTM Auto.</p>
        {!iosNativo() && <a href="/upgrade" className="inline-block rounded-lg bg-[#D2A63C] px-3 py-1.5 font-bold text-black">Ver planos</a>}
      </div>
    )
  }

  if (novo && podeGerir && dados.modo === "master") {
    return (
      <div className="space-y-3 text-[12px]">
        {cabecalho}
        <NovoCopiador accountId={accountId} dados={dados} onFechar={() => setNovo(false)} onCriado={async () => { setNovo(false); await ler() }} />
      </div>
    )
  }

  return (
    <div className="space-y-3 text-[12px]">
      {cabecalho}
      <p className="text-zinc-400">
        Cada trade desta conta simulada abre também numa conta MT5 tua (MTM Copy ou MTM Auto). Fechos, parciais e SL/TP seguem a simulada — mesmo com a cópia em pausa.
      </p>
      {!dados.interruptorLigado && (
        <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">A cópia está a ser activada do nosso lado — por agora as posições novas ainda não são enviadas.</p>
      )}

      {dados.copiadores.map((c) => (
        <div key={c.id} className="rounded-lg border border-white/10 p-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${c.ativo ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <span className="min-w-0 flex-1 truncate text-white">{c.destino?.rotulo ?? "conta removida"}</span>
            {c.destino && <Etiqueta demo={c.destino.demo} />}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {NOME_MODO[c.modoLote]}{c.valor ? ` · ${c.valor}${c.modoLote === "risco_pct" ? "%" : c.modoLote === "fixo" ? " lotes" : "×"}` : ""}
            {c.loteMax ? ` · máx ${c.loteMax} lotes` : ""}{c.perdaDiariaMax ? ` · perda diária ${c.perdaDiariaMax}%` : ""}
            {c.maxPosicoes ? ` · até ${c.maxPosicoes} posições` : ""}
            {` · ${c.simbolos.length ? c.simbolos.join(", ") : "todos os símbolos"}`}
            {!c.copiarSl ? " · sem SL" : ""}{!c.copiarTp ? " · sem TP" : ""}
          </p>
          {!c.ativo && c.pausadoMotivo && <p className="mt-1 text-[11px] text-amber-300">Em pausa: {c.pausadoMotivo}</p>}
          {c.destino?.outraCopiaAtiva && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Esta conta também recebe outra cópia (MTM Copy / MTM Auto) — as posições somam-se.</p>
          )}
          {podeGerir && dados.modo === "master" && (
            <div className="mt-2 flex gap-2">
              <button disabled={aCarregar} onClick={() => alternar(c)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-zinc-200 disabled:opacity-40">
                {c.ativo ? <><Pause className="h-3 w-3" /> Pausar</> : <><Play className="h-3 w-3" /> Ligar</>}
              </button>
              <button disabled={aCarregar} onClick={() => apagar(c)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-rose-300 disabled:opacity-40">
                <Trash2 className="h-3 w-3" /> Apagar
              </button>
            </div>
          )}
        </div>
      ))}

      {podeGerir && dados.modo === "master" ? (
        <button disabled={aCarregar} onClick={() => setNovo(true)} className="w-full rounded-lg bg-[#D2A63C] py-2 font-bold text-black disabled:opacity-40">
          {dados.copiadores.length ? "Copiar para outra conta" : "Copiar para a minha conta"}
        </button>
      ) : (
        <p className="text-[11px] text-zinc-500">A cópia só se configura com a password master e a tua sessão MTM.</p>
      )}
      {erro && <p className="text-[11px] text-rose-300">{erro}</p>}

      {(dados.copias.length > 0 || dados.eventos.length > 0) && <PainelCopia dados={dados} />}
    </div>
  )
}

function NovoCopiador({ accountId, dados, onFechar, onCriado }: { accountId: string; dados: Estado; onFechar: () => void; onCriado: () => void }) {
  const [passo, setPasso] = useState(1)
  const [destino, setDestino] = useState<Destino | null>(null)
  const [modo, setModo] = useState<Modo>("proporcional_saldo")
  const [valor, setValor] = useState("")
  const [loteMax, setLoteMax] = useState("")
  const [perdaDiaria, setPerdaDiaria] = useState("")
  const [todos, setTodos] = useState(true)
  const [simbolos, setSimbolos] = useState("")
  const [copiarSl, setCopiarSl] = useState(true)
  const [copiarTp, setCopiarTp] = useState(true)
  const [aceite, setAceite] = useState(false)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const jaUsados = new Set(dados.copiadores.map((c) => `${c.destinoTipo}:${c.destinoId}`))
  const precisaValor = modo !== "proporcional_saldo"

  const criar = async () => {
    setAEnviar(true); setErro(null)
    try {
      await pedir("/api/mtmfunded/simulado/copia", {
        method: "POST",
        body: JSON.stringify({
          accountId, destinoTipo: destino!.tipo, destinoId: destino!.id, modoLote: modo,
          valor: valor ? Number(valor.replace(",", ".")) : null,
          loteMax: loteMax ? Number(loteMax.replace(",", ".")) : null,
          perdaDiariaMax: perdaDiaria ? Number(perdaDiaria.replace(",", ".")) : null,
          simbolos: todos ? [] : simbolos.split(/[\s,;]+/).filter(Boolean),
          copiarSl, copiarTp, aceite,
        }),
      }, accountId)
      onCriado()
    } catch (e) { setErro((e as Error).message) } finally { setAEnviar(false) }
  }

  const campo = "w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-white outline-none focus:border-[#D2A63C]"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <button onClick={() => (passo > 1 ? setPasso(passo - 1) : onFechar())} className="flex items-center gap-0.5 text-[#D2A63C]"><ChevronLeft className="h-3 w-3" />{passo > 1 ? "Voltar" : "Cancelar"}</button>
        <span className="ml-auto">Passo {passo} de 4</span>
      </div>

      {passo === 1 && (
        <div className="space-y-2">
          <b className="text-white">Para que conta?</b>
          {dados.destinos.length === 0 && <p className="text-zinc-400">Ainda não tens nenhuma conta ligada no MTM Copy ou no MTM Auto. Liga uma primeiro.</p>}
          {dados.destinos.map((d) => {
            const usado = jaUsados.has(`${d.tipo}:${d.id}`)
            const desactivado = !d.permitido || usado
            return (
              <button key={`${d.tipo}:${d.id}`} disabled={desactivado} onClick={() => { setDestino(d); setPasso(2) }}
                className={`w-full rounded-lg border p-2 text-left disabled:opacity-50 ${destino?.id === d.id ? "border-[#D2A63C]" : "border-white/10"}`}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-white">{d.rotulo}</span>
                  <span className="text-[10px] text-zinc-500">{d.tipo === "mtmcopy" ? "MTM Copy" : "MTM Auto"}</span>
                  <Etiqueta demo={d.demo} />
                </div>
                <p className="text-[11px] text-zinc-500">{d.login ?? ""} {d.servidor ?? ""}</p>
                {usado && <p className="text-[11px] text-zinc-400">Já está a receber a cópia desta conta.</p>}
                {!usado && d.motivo && <p className="text-[11px] text-amber-300">{d.demo === true ? d.motivo : "Contas reais disponíveis em breve"}</p>}
                {!desactivado && d.outraCopiaAtiva && <p className="text-[11px] text-amber-300">Atenção: esta conta já recebe outra cópia — as posições somam-se.</p>}
              </button>
            )
          })}
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-2">
          <b className="text-white">Tamanho das posições</b>
          {MODOS.map(([m, nome, ajuda]) => (
            <label key={m} className={`block cursor-pointer rounded-lg border p-2 ${modo === m ? "border-[#D2A63C]" : "border-white/10"}`}>
              <input type="radio" className="mr-2" checked={modo === m} onChange={() => { setModo(m); setValor("") }} />
              <span className="text-white">{nome}</span>{m === "proporcional_saldo" && <span className="ml-1 text-[10px] text-[#D2A63C]">recomendado</span>}
              <p className="mt-0.5 text-[11px] text-zinc-500">{ajuda}</p>
            </label>
          ))}
          {precisaValor && (
            <label className="block">
              <span className="text-[11px] text-zinc-400">{modo === "multiplicador" ? "Multiplicador (ex.: 0,5)" : modo === "fixo" ? "Lotes por posição" : "Risco por trade (%)"}</span>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-zinc-400">Lote máximo</span><input inputMode="decimal" placeholder="sem limite" value={loteMax} onChange={(e) => setLoteMax(e.target.value)} className={campo} /></label>
            <label className="block"><span className="text-[11px] text-zinc-400">Perda diária máx. (%)</span><input inputMode="decimal" placeholder="sem limite" value={perdaDiaria} onChange={(e) => setPerdaDiaria(e.target.value)} className={campo} /></label>
          </div>
          <button disabled={precisaValor && !valor} onClick={() => setPasso(3)} className="w-full rounded-lg bg-[#D2A63C] py-2 font-bold text-black disabled:opacity-40">Continuar</button>
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-2">
          <b className="text-white">O que copiar</b>
          <label className="flex items-center gap-2"><input type="radio" checked={todos} onChange={() => setTodos(true)} /> <span className="text-zinc-200">Todos os símbolos</span></label>
          <label className="flex items-center gap-2"><input type="radio" checked={!todos} onChange={() => setTodos(false)} /> <span className="text-zinc-200">Só estes:</span></label>
          {!todos && <input placeholder="XAUUSD, EURUSD, US30" value={simbolos} onChange={(e) => setSimbolos(e.target.value)} className={campo} />}
          <label className="flex items-center gap-2"><input type="checkbox" checked={copiarSl} onChange={(e) => setCopiarSl(e.target.checked)} /> <span className="text-zinc-200">Copiar o stop loss</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={copiarTp} onChange={(e) => setCopiarTp(e.target.checked)} /> <span className="text-zinc-200">Copiar o take profit</span></label>
          <p className="text-[11px] text-zinc-500">SL e TP vão à mesma distância da entrada, medida a partir do preço a que a tua conta entrou.</p>
          <button disabled={!todos && !simbolos.trim()} onClick={() => setPasso(4)} className="w-full rounded-lg bg-[#D2A63C] py-2 font-bold text-black disabled:opacity-40">Continuar</button>
        </div>
      )}

      {passo === 4 && destino && (
        <div className="space-y-2">
          <b className="text-white">Confirmar</b>
          <ul className="space-y-0.5 text-[11.5px] text-zinc-300">
            <li>Destino: <span className="text-white">{destino.rotulo}</span> <Etiqueta demo={destino.demo} /></li>
            <li>Tamanho: {NOME_MODO[modo]}{valor ? ` (${valor})` : ""}{loteMax ? ` · máx ${loteMax} lotes` : ""}{perdaDiaria ? ` · perda diária ${perdaDiaria}%` : ""}</li>
            <li>Símbolos: {todos ? "todos" : simbolos}</li>
            <li>SL: {copiarSl ? "sim" : "não"} · TP: {copiarTp ? "sim" : "não"}</li>
          </ul>
          <label className="flex items-start gap-2 rounded-lg border border-white/10 p-2">
            <input type="checkbox" className="mt-0.5" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span className="text-zinc-200">Estou a copiar a minha própria conta simulada para a minha conta. A MTM fornece o software; as decisões são minhas.</span>
          </label>
          <button disabled={!aceite || aEnviar} onClick={criar} className="w-full rounded-lg bg-[#D2A63C] py-2 font-bold text-black disabled:opacity-40">
            {aEnviar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Ligar a cópia"}
          </button>
          {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
        </div>
      )}
    </div>
  )
}

function PainelCopia({ dados }: { dados: Estado }) {
  const abertas = dados.copias.filter((c) => c.latencia_ms != null)
  const latMedia = abertas.length ? Math.round(abertas.reduce((s, c) => s + Number(c.latencia_ms), 0) / abertas.length) : null
  const desliz = dados.copias.filter((c) => c.deslizamento != null)
  const deslizMedio = desliz.length ? desliz.reduce((s, c) => s + Number(c.deslizamento), 0) / desliz.length : null
  const cor = (estado: string) => estado === "aberta" ? "text-emerald-300" : estado === "fechada" ? "text-zinc-400" : estado === "enviando" ? "text-sky-300" : "text-rose-300"

  return (
    <div className="space-y-2 border-t border-white/10 pt-2">
      <b className="text-white">Cópia</b>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-white/5 p-1.5"><span className="text-zinc-500">Latência média</span><div className="font-mono text-white">{latMedia == null ? "—" : `${(latMedia / 1000).toFixed(1)} s`}</div></div>
        <div className="rounded-lg bg-white/5 p-1.5"><span className="text-zinc-500">Deslizamento médio</span><div className="font-mono text-white">{deslizMedio == null ? "—" : deslizMedio.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}</div></div>
      </div>
      {dados.copias.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-[10.5px]">
            <thead className="text-zinc-500"><tr><th className="text-left">Posição</th><th className="text-right">Lote</th><th className="text-right">Estado</th></tr></thead>
            <tbody>
              {dados.copias.map((c) => (
                <tr key={c.id} className="border-t border-white/5" title={c.erro ?? ""}>
                  <td className="py-0.5 text-zinc-200">{c.symbol ?? "—"} {c.direcao ?? ""}</td>
                  <td className="text-right font-mono text-zinc-300">{c.volume_origem} → {c.dest_volume_origem ?? "—"}</td>
                  <td className={`text-right ${cor(c.estado)}`}>{c.estado}{c.fechado_pct > 0 && c.fechado_pct < 1 ? ` ${Math.round(c.fechado_pct * 100)}%` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dados.copias.some((c) => c.erro) && (
            <p className="mt-1 text-[10.5px] text-zinc-500">Último motivo: {dados.copias.find((c) => c.erro)?.erro}</p>
          )}
        </div>
      )}
      {dados.eventos.length > 0 && (
        <div className="max-h-40 overflow-y-auto">
          <p className="text-[10.5px] text-zinc-500">Últimos 20 eventos</p>
          {dados.eventos.map((e) => (
            <div key={e.id} className="flex items-center gap-2 border-t border-white/5 py-0.5 text-[10.5px]">
              <span className="w-12 text-zinc-300">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
              <span className="text-zinc-400">{String(e.payload?.symbol ?? "")}</span>
              <span className="ml-auto text-zinc-500">{new Date(e.criado_em).toLocaleTimeString("pt-PT")}</span>
              <span className={e.processado_em ? (e.erro && !e.erro.startsWith("seco") ? "text-rose-300" : "text-emerald-300") : "text-sky-300"} title={e.erro ?? ""}>
                {e.processado_em ? (e.erro && !e.erro.startsWith("seco") ? "erro" : "ok") : e.tentativas ? `a repetir (${e.tentativas})` : "na fila"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
