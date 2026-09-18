"use client"

import { useCallback, useEffect, useState } from "react"
import { numeroDoCampo } from "@/lib/webtrader/ticket"
import { ArrowRight, Copy, Loader2 } from "lucide-react"
import type { EstadoLigador } from "@/components/contas/ligador-contas"

/**
 * «Copiar entre as minhas contas» — o lado do cliente, SÓ LEITURA + PEDIDO.
 *
 * Mostra as rotas do próprio (estado, modo, lote) e os últimos factos copiados (símbolo, direcção,
 * lote — nunca valores em dinheiro). O botão envia um PEDIDO: a equipa aprova e a rota começa
 * sempre em modo de teste (sem ordens). Nesta entrega não há interruptores do lado do cliente.
 *
 * Usado no ligador de contas (área de membro) e no separador T2T › Conta.
 */

interface RotaCliente {
  id: string; origem_tipo: string; origem_ref: string; destino_tipo: string; destino_ref: string; rotulo: string | null
  modo_lote: string; valor: number; ativa: boolean; modo: "shadow" | "live"; estado: "pedido" | "aprovada" | "recusada"; notas: string | null; created_at: string
}
interface EventoCliente { rotaId: string; tipo: string; simbolo: string | null; direcao: string | null; volume: number | null; resultado: string; em: string }

const NOME: Record<string, string> = { mt5: "MT5", mt4: "MT4", tradelocker: "TradeLocker", mtmfunded: "MTM Funded" }
const LOTE: Record<string, string> = { multiplicador: "×", fixo: "lote fixo", risco_pct: "% risco", proporcional_saldo: "proporcional ao saldo ×" }
const TIPO: Record<string, string> = { open: "abriu", modify: "SL/TP", partial: "parcial", close: "fechou" }

export default function CopiasEntreContas({ estado }: { estado: EstadoLigador }) {
  const { contas, getToken } = estado
  const [rotas, setRotas] = useState<RotaCliente[]>([])
  const [eventos, setEventos] = useState<EventoCliente[]>([])
  const [disponivel, setDisponivel] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [origem, setOrigem] = useState("")
  const [destino, setDestino] = useState("")
  const [modo, setModo] = useState("multiplicador")
  const [valor, setValor] = useState("1")
  const [aEnviar, setAEnviar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const tok = await getToken()
    if (!tok) return
    const r = await fetch("/api/contas/copia", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setDisponivel(Boolean(j.disponivel))
    setRotas(j.rotas ?? [])
    setEventos(j.eventos ?? [])
  }, [getToken])
  useEffect(() => { void carregar() }, [carregar])

  // Só faz sentido com duas contas ou mais, e só com a funcionalidade na base.
  if (!disponivel || contas.length < 2) return null

  const nomeConta = (ref: string) => {
    const c = contas.find((x) => x.chave === ref)
    return c ? `${NOME[c.plataforma] ?? c.plataforma} · ${c.rotulo ?? c.login ?? "—"}` : "conta removida"
  }

  const pedir = async () => {
    setMsg(null)
    // «0,5» é 0,5 (Number dava NaN → null → 400 «valor inválido»); lixo diz-se aqui.
    const n = numeroDoCampo(valor)
    if (n == null || !Number.isFinite(n) || !(n > 0)) { setMsg("Indica um valor válido (ex.: 1 ou 0,5)."); return }
    setAEnviar(true)
    try {
      const tok = await getToken()
      // Sem sessão não se manda «Bearer null».
      if (!tok) { setMsg("Sessão indisponível. Volta a entrar."); return }
      const r = await fetch("/api/contas/copia", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ origem_ref: origem, destino_ref: destino, modo_lote: modo, valor: n }),
      }).catch(() => null)
      const j = r ? await r.json().catch(() => ({})) : {}
      setMsg(r?.ok ? j.message ?? "Pedido enviado." : r ? j.error ?? "Não foi possível enviar o pedido." : "Sem ligação ao servidor — tenta outra vez.")
      if (r?.ok) { setAberto(false); setOrigem(""); setDestino(""); void carregar() }
    } catch {
      setMsg("Não foi possível enviar o pedido.")
    } finally {
      setAEnviar(false)
    }
  }

  const campo = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white"><Copy className="h-4 w-4 text-[#D2A63C]" /> Copiar entre as minhas contas</p>
        <button type="button" onClick={() => setAberto(!aberto)} className="rounded-lg border border-[#D2A63C]/40 px-2.5 py-1 text-[12px] text-[#D2A63C]">Pedir cópia</button>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">Replica as trades de uma conta tua noutra (MTM Funded, MT4, MT5, TradeLocker). A equipa revê cada pedido e a cópia começa sempre em modo de teste, sem ordens.</p>

      {aberto && (
        <div className="space-y-2 rounded-xl border border-zinc-800 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Copiar desta conta</span>
              <select className={campo} value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">—</option>{contas.map((c) => <option key={c.chave} value={c.chave}>{nomeConta(c.chave)}</option>)}</select>
            </label>
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Para esta conta</span>
              <select className={campo} value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">—</option>{contas.filter((c) => c.chave !== origem && c.estado !== "so_leitura").map((c) => <option key={c.chave} value={c.chave}>{nomeConta(c.chave)}</option>)}</select>
            </label>
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">Tamanho</span>
              <select className={campo} value={modo} onChange={(e) => setModo(e.target.value)}>
                <option value="multiplicador">Multiplicador do lote</option><option value="fixo">Lote fixo</option><option value="proporcional_saldo">Proporcional ao saldo</option><option value="risco_pct">% de risco por trade</option>
              </select>
            </label>
            <label className="space-y-1"><span className="text-[11px] text-zinc-500">{modo === "fixo" ? "Lotes" : modo === "risco_pct" ? "% por trade" : "Multiplicador"}</span>
              <input className={campo} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
          </div>
          <button type="button" disabled={!origem || !destino || aEnviar} onClick={pedir} className="w-full rounded-xl bg-[#D2A63C] py-2 text-[13px] font-bold text-black disabled:opacity-40">
            {aEnviar ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Enviar pedido
          </button>
        </div>
      )}
      {msg && <p className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] text-zinc-300">{msg}</p>}

      {rotas.length > 0 && (
        <ul className="space-y-1.5">
          {rotas.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-800 bg-black/30 px-2.5 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-1.5 text-white">
                <span>{nomeConta(r.origem_ref)}</span><ArrowRight className="h-3.5 w-3.5 text-zinc-500" /><span>{nomeConta(r.destino_ref)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10.5px] text-zinc-400">
                <span className="rounded bg-zinc-800 px-1.5">{r.estado === "pedido" ? "à espera de aprovação" : r.estado === "recusada" ? "recusado" : r.ativa ? "activa" : "aprovada · parada"}</span>
                <span className="rounded bg-zinc-800 px-1.5">{r.modo === "live" ? "a copiar" : "modo de teste (sem ordens)"}</span>
                <span className="rounded bg-zinc-800 px-1.5">{LOTE[r.modo_lote] ?? r.modo_lote} {r.valor}</span>
                {r.estado === "recusada" && r.notas && <span className="text-rose-300">{r.notas}</span>}
              </div>
              {eventos.filter((e) => e.rotaId === r.id).slice(0, 3).map((e, i) => (
                <p key={i} className="mt-0.5 text-[10.5px] text-zinc-500">
                  {new Date(e.em).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {TIPO[e.tipo] ?? e.tipo} {e.simbolo ?? ""} {e.direcao ?? ""} {e.volume ?? ""} · {e.resultado === "sombra" ? "teste" : e.resultado}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
