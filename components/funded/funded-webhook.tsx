"use client"

import { useEffect, useState } from "react"
import { Copy, Check, Loader2, Webhook } from "lucide-react"
import { pedir } from "./api"

/**
 * LIGAR O TRADINGVIEW a esta conta simulada.
 *
 * O URL é secreto e mostra-se UMA vez (o servidor só guarda o hash). Os modelos de mensagem são
 * para colar no alerta do TradingView tal e qual.
 *
 * Nota honesta, e está no ecrã: as posições do paper trading do TradingView não se lêem por API
 * nenhuma. A sincronização faz-se pelos ALERTAS (estratégia ou manuais) que chegam a este webhook.
 */

const MODELO_ESTRATEGIA = `{
  "action": "{{strategy.order.action}}",
  "contracts": "{{strategy.order.contracts}}",
  "ticker": "{{ticker}}",
  "price": "{{strategy.order.price}}",
  "position_size": "{{strategy.position_size}}"
}`
const MODELO_MANUAL = `{"acao":"buy","symbol":"XAUUSD","volume":0.1,"sl":0,"tp":0,"tipo":"market"}`

export default function FundedWebhook({ accountId, podeGerir }: { accountId: string; podeGerir: boolean }) {
  const [estado, setEstado] = useState<any>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const ler = async () => {
    try { setEstado(await pedir(`/api/mtmfunded/simulado/webhooks?accountId=${accountId}`, {}, accountId)) }
    catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => { if (podeGerir) ler() }, [accountId, podeGerir]) // eslint-disable-line react-hooks/exhaustive-deps

  const copiar = async (texto: string, chave: string) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(chave); setTimeout(() => setCopiado(null), 1500) } catch { /* sem clipboard */ }
  }
  const gerar = async () => {
    if (estado?.ligado && !confirm("Gerar um URL novo desliga o anterior. Continuar?")) return
    setACarregar(true); setErro(null)
    try {
      const r = await pedir<{ url: string }>("/api/mtmfunded/simulado/webhooks", { method: "POST", body: JSON.stringify({ accountId }) }, accountId)
      setUrl(r.url)
      await ler()
    } catch (e) { setErro((e as Error).message) } finally { setACarregar(false) }
  }
  const desligar = async () => {
    setACarregar(true)
    try { await pedir(`/api/mtmfunded/simulado/webhooks?accountId=${accountId}`, { method: "DELETE" }, accountId); setUrl(null); await ler() }
    catch (e) { setErro((e as Error).message) } finally { setACarregar(false) }
  }

  if (!podeGerir) return <p className="text-[12px] text-zinc-500">O webhook do TradingView só se gere com a password master.</p>

  const Bloco = ({ titulo, texto, chave }: { titulo: string; texto: string; chave: string }) => (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
        <span>{titulo}</span>
        <button onClick={() => copiar(texto, chave)} className="flex items-center gap-1 text-[#D2A63C]">{copiado === chave ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} copiar</button>
      </div>
      <pre className="overflow-x-auto whitespace-pre rounded-lg border border-white/10 bg-black p-2 text-[10.5px] text-zinc-300">{texto}</pre>
    </div>
  )

  return (
    <div className="space-y-3 text-[12px]">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-[#D2A63C]" />
        <b className="text-white">TradingView → esta conta</b>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${estado?.ligado ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>{estado?.ligado ? "ligado" : "desligado"}</span>
      </div>
      <p className="text-zinc-400">
        Cria um alerta no TradingView com «Webhook URL» igual ao URL abaixo e cola uma das mensagens. As posições do paper trading do TradingView não se lêem por API nenhuma — a sincronização funciona pelos alertas (de estratégia ou manuais) enviados para aqui.
      </p>
      {url && (
        <div className="rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/5 p-2">
          <p className="mb-1 text-[11px] text-[#D2A63C]">Copia já — este URL não volta a ser mostrado.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[11px] text-white">{url}</code>
            <button onClick={() => copiar(url, "url")} className="shrink-0 text-[#D2A63C]">{copiado === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={aCarregar} onClick={gerar} className="flex-1 rounded-lg bg-[#D2A63C] py-2 font-bold text-black disabled:opacity-40">
          {aCarregar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : estado?.ligado ? "Gerar URL novo" : "Ligar TradingView"}
        </button>
        {estado?.ligado && <button disabled={aCarregar} onClick={desligar} className="rounded-lg border border-white/10 px-3 text-zinc-300">Desligar</button>}
      </div>
      {estado?.ultimoEm && (
        <p className="text-[11px] text-zinc-500">
          Último alerta: {new Date(estado.ultimoEm).toLocaleString("pt-PT")} — {estado.ultimoErro ? <span className="text-rose-300">{estado.ultimoErro}</span> : <span className="text-emerald-300">ok</span>}
        </p>
      )}
      {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
      <Bloco titulo="Alerta de ESTRATÉGIA (sincroniza pelo position_size — usa a quantidade em lotes)" texto={MODELO_ESTRATEGIA} chave="estrategia" />
      <Bloco titulo="Alerta MANUAL (acao: buy | sell | close · tipo: market | limit | stop + preco)" texto={MODELO_MANUAL} chave="manual" />
    </div>
  )
}
