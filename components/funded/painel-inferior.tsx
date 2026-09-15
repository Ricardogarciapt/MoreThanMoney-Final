"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { BarChart3, Bell, BookOpen, History, ListOrdered, User, Wallet } from "lucide-react"
import ListaPosicoes from "./lista-posicoes"
import FundedDiario from "./funded-diario"
import FundedAlertas from "./funded-alertas"
import PainelConta from "./painel-conta"
import type { Trader } from "./trader-contexto"
const FundedEstatisticas = dynamic(() => import("./funded-estatisticas"), { ssr: false })

/**
 * O PAINEL DE BAIXO (PRO) — Posições | Ordens | Histórico | Estatísticas | Diário | Alertas | Conta.
 * O separador escolhido fica guardado. O histórico abre a nota da trade no Diário (📖).
 */

export type Separador = "posicoes" | "ordens" | "historico" | "estatisticas" | "diario" | "alertas" | "conta"
const CHAVE = "mtmfunded_pro_separador"

export default function PainelInferior({ t, denso = true }: { t: Trader; denso?: boolean }) {
  const [sep, setSep] = useState<Separador>("posicoes")
  const [foco, setFoco] = useState<string | null>(null)
  useEffect(() => { try { const v = localStorage.getItem(CHAVE) as Separador | null; if (v) setSep(v) } catch { /* ok */ } }, [])
  const escolher = (s: Separador) => { setSep(s); try { localStorage.setItem(CHAVE, s) } catch { /* ok */ } }

  const d = t.dados
  const ativos = (t.alertas.alertas ?? []).filter((a) => a.ativo).length
  const separadores: Array<[Separador, string, typeof Wallet, number?]> = [
    ["posicoes", "Posições", Wallet, d.posicoes.length], ["ordens", "Ordens", ListOrdered, d.ordens.length], ["historico", "Histórico", History],
    ["estatisticas", "Estatísticas", BarChart3], ["diario", "Diário", BookOpen], ["alertas", "Alertas", Bell, ativos], ["conta", "Conta", User],
  ]
  const lista = (vista: "posicoes" | "ordens" | "historico") => (
    <ListaPosicoes
      vista={vista} posicoes={d.posicoes} ordens={d.ordens} historico={d.historico} simbolos={t.fichas} precos={t.mapa}
      podeNegociar={t.podeNegociar} denso={denso} accountId={t.accountId} simboloAtual={t.simbolo?.symbol}
      executar={t.executar} onSelecionarSimbolo={(s) => void t.selecionarPorNome(s)}
      onNota={(id) => { setFoco(id); escolher("diario") }} notas={t.diario.comTrade}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#131722]">
      <div role="tablist" aria-label="Painel da conta" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[#2A2E39] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {separadores.map(([s, nome, Icone, n]) => (
          <button key={s} role="tab" aria-selected={sep === s} onClick={() => escolher(s)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-[12px] ${sep === s ? "border-[#D2A63C] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
            <Icone className="h-3.5 w-3.5" /> {nome}{n ? <span className="rounded bg-white/10 px-1 text-[10px]">{n}</span> : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#363A45_transparent]">
        {sep === "posicoes" && lista("posicoes")}
        {sep === "ordens" && lista("ordens")}
        {sep === "historico" && lista("historico")}
        {sep === "estatisticas" && (
          <FundedEstatisticas accountId={t.accountId} equity={t.vivo.equity}
            regras={{ limites: t.vivo.limites, regras: d.regras, saldoInicial: d.conta.saldoInicial, equity: t.vivo.equity, diasNegociados: d.conta.diasNegociados }} />
        )}
        {sep === "diario" && <FundedDiario accountId={t.accountId} historico={d.historico} podeEscrever={d.modo === "master"} diario={t.diario} focoTrade={foco} onFoco={setFoco} />}
        {sep === "alertas" && <FundedAlertas accountId={t.accountId} simbolo={t.simbolo} preco={t.simbolo ? t.vivos[t.simbolo.symbol] : undefined} podeCriar={d.modo === "master"} estado={t.alertas} onSelecionarSimbolo={(s) => void t.selecionarPorNome(s)} />}
        {sep === "conta" && <PainelConta t={t} />}
      </div>
    </div>
  )
}
