"use client"

import { useState } from "react"
import { Power } from "lucide-react"
import { Aviso, BotaoRecarregar, Cartao, Etiqueta, Tabela, confirmarEscrita, ms, pedirAdmin, quando, td, th, useDadosAdmin } from "./comum"

interface Visao {
  lidaEm: string
  interruptores: { globalLigado: boolean; liveDesbloqueado: boolean }
  entrega: { mensagens24h: number; execucoes24h: number; erros24h: number; latenciaP50Ms: number | null; latenciaP95Ms: number | null; latenciaMaxMs: number | null; nota: string }
  copyFactory: { estrategias: number; subscritores: number; subscritoresComEstrategiaMorta: { id: string; nome: string }[]; listadaEm: string; falhou: boolean }
  metaApi: { total: number; deployed: number; ligadas: number; undeployed: number; sistema: number; streamingPremium: number; falhou: boolean; nota: string }
  copiaContas: { migracaoAplicada: boolean; rotas: number; ativas: number; pedidos: number; live: number; fontesStreamingNecessarias: number; eventosPendentes: number; latenciaP50Ms: number | null; latenciaP95Ms: number | null }
  servicos: { nome: string; host: string | null; versao: string | null; em: string; idadeS: number; estado: Record<string, unknown> }[]
  ultimosErros: { onde: string; texto: string; em: string }[]
}

export default function VisaoGeralCopia({ irPara }: { irPara: (tab: string) => void }) {
  const { dados: v, erro, aCarregar, recarregar } = useDadosAdmin<Visao>("/api/admin/mtmauto-copia/visao-geral")
  const [aMudar, setAMudar] = useState(false)

  const alternarGlobal = async () => {
    if (!v) return
    const ligar = !v.interruptores.globalLigado
    let confirmacao: string | null = null
    if (ligar) {
      confirmacao = confirmarEscrita("Ligar o motor da cópia entre contas EM SOMBRA: passa a ler as contas de origem das rotas activas (streaming MetaApi / TradeLocker) e a registar as ordens que faria. Não envia nenhuma ordem.", "CONFIRMAR")
      if (!confirmacao) return
    }
    setAMudar(true)
    const r = await pedirAdmin("/api/admin/mtmauto-copia/interruptores", { method: "PATCH", body: { ligado: ligar, confirmacao } })
    setAMudar(false)
    if (!r.success) alert(r.error)
    void recarregar()
  }

  if (erro) return <Aviso tom="grave">Não foi possível ler a visão geral: {erro}</Aviso>
  if (!v) return <p className="text-sm text-zinc-500">A ler…</p>

  const entregaTom = v.entrega.erros24h > 0 ? "aviso" : undefined
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">Lida {quando(v.lidaEm)} · MetaApi/CopyFactory em cache até 60 s</p>
        <BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Entrega aos subscritores (prioridade)</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Cartao titulo="Sinais 24 h" valor={v.entrega.mensagens24h} />
          <Cartao titulo="Execuções 24 h" valor={v.entrega.execucoes24h} />
          <Cartao titulo="Erros 24 h" valor={v.entrega.erros24h} tom={entregaTom} />
          <Cartao titulo="Latência p50" valor={ms(v.entrega.latenciaP50Ms)} />
          <Cartao titulo="Latência p95" valor={ms(v.entrega.latenciaP95Ms)} nota={`máx ${ms(v.entrega.latenciaMaxMs)}`} tom={(v.entrega.latenciaP95Ms ?? 0) > 10_000 ? "aviso" : undefined} />
        </div>
        <p className="text-[11px] text-zinc-500">{v.entrega.nota}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">MetaApi · custo</h3>
          {v.metaApi.falhou && <Aviso>A listagem da MetaApi falhou — números abaixo incompletos.</Aviso>}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cartao titulo="Contas" valor={v.metaApi.total} nota={`${v.metaApi.sistema} de sistema`} />
            <Cartao titulo="Deployed" valor={v.metaApi.deployed} nota="são as que se pagam" />
            <Cartao titulo="Ligadas" valor={v.metaApi.ligadas} />
            <Cartao titulo="Undeployed" valor={v.metaApi.undeployed} />
          </div>
          <p className="text-[11px] text-zinc-500">{v.metaApi.nota} Streaming Premium: {v.metaApi.streamingPremium} conta(s). Quota por cliente na tab Contas.</p>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">CopyFactory · reconciliação</h3>
          <div className="grid grid-cols-3 gap-2">
            <Cartao titulo="Estratégias" valor={v.copyFactory.estrategias} />
            <Cartao titulo="Subscritores" valor={v.copyFactory.subscritores} />
            <Cartao titulo="Estratégia morta" valor={v.copyFactory.subscritoresComEstrategiaMorta.length} tom={v.copyFactory.subscritoresComEstrategiaMorta.length ? "grave" : undefined} nota={v.copyFactory.subscritoresComEstrategiaMorta.length ? "copiam o vazio" : "ok"} />
          </div>
          {v.copyFactory.subscritoresComEstrategiaMorta.length > 0 && (
            <Aviso tom="grave">
              {v.copyFactory.subscritoresComEstrategiaMorta.slice(0, 6).map((s) => s.nome || s.id).join(", ")} —{" "}
              <button className="underline" onClick={() => irPara("sincronizacao")}>corrigir em Sincronização</button>
            </Aviso>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-zinc-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">Cópia entre contas</h3>
          <div className="flex items-center gap-2">
            <Etiqueta tom={v.interruptores.globalLigado ? "info" : "neutro"}>motor {v.interruptores.globalLigado ? "ligado (sombra)" : "desligado"}</Etiqueta>
            <Etiqueta tom={v.interruptores.liveDesbloqueado ? "grave" : "ok"}>live {v.interruptores.liveDesbloqueado ? "desbloqueado" : "bloqueado"}</Etiqueta>
            <button type="button" disabled={aMudar || !v.copiaContas.migracaoAplicada} onClick={alternarGlobal} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
              <Power className="h-3.5 w-3.5" /> {v.interruptores.globalLigado ? "Desligar motor" : "Ligar em sombra"}
            </button>
          </div>
        </div>
        {!v.copiaContas.migracaoAplicada && <Aviso>A migração 078 ainda não foi aplicada — as tabelas da cópia entre contas não existem.</Aviso>}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Cartao titulo="Rotas" valor={v.copiaContas.rotas} nota={`${v.copiaContas.ativas} activas`} />
          <Cartao titulo="Pedidos" valor={v.copiaContas.pedidos} tom={v.copiaContas.pedidos ? "aviso" : undefined} nota="clientes à espera" />
          <Cartao titulo="Em live" valor={v.copiaContas.live} tom={v.copiaContas.live ? "grave" : undefined} />
          <Cartao titulo="Fontes streaming" valor={v.copiaContas.fontesStreamingNecessarias} nota="contas MT de origem 24 h ligadas" />
          <Cartao titulo="Eventos pendentes" valor={v.copiaContas.eventosPendentes} />
          <Cartao titulo="Latência p95" valor={ms(v.copiaContas.latenciaP95Ms)} nota={`p50 ${ms(v.copiaContas.latenciaP50Ms)}`} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Serviços do VPS</h3>
        {v.servicos.length === 0 ? (
          <p className="text-xs text-zinc-500">Sem batimentos registados (servicos_pulso vazio ou 078 por aplicar).</p>
        ) : (
          <Tabela>
            <thead><tr><th className={th}>Serviço</th><th className={th}>Último sinal de vida</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {v.servicos.map((s) => (
                <tr key={s.nome}>
                  <td className={td}>{s.nome}{s.versao ? <span className="ml-1 text-zinc-600">{s.versao}</span> : null}</td>
                  <td className={td}><Etiqueta tom={s.idadeS > 180 ? "grave" : s.idadeS > 70 ? "aviso" : "ok"}>há {s.idadeS < 120 ? `${s.idadeS} s` : `${Math.round(s.idadeS / 60)} min`}</Etiqueta></td>
                  <td className={td}><code className="text-[11px] text-zinc-500 break-all">{JSON.stringify(s.estado).slice(0, 220)}</code></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Últimos erros (24 h)</h3>
        {v.ultimosErros.length === 0 ? <p className="text-xs text-zinc-500">Nenhum.</p> : (
          <ul className="space-y-1 text-xs">
            {v.ultimosErros.map((e, i) => (
              <li key={i} className="rounded-lg bg-zinc-900/60 px-3 py-1.5"><span className="text-zinc-500">{quando(e.em)} · {e.onde}</span> <span className="text-rose-300">{e.texto.slice(0, 240)}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
