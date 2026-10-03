"use client"

import { useEffect, useMemo, useState } from "react"
import type { Sinal } from "@/lib/admin-centro/servidor/sinais"
import { FONTES } from "@/lib/admin-centro/regras"
import MtmcopySenderLog from "@/components/admin/mtmcopy-sender-log"

import { useCentroCtx } from "../contexto"
import { Azulejo, BotaoLer, Chip, Lista, Painel, Recolhivel, Tabela, fmtIdade, fmtMs, fmtNum, idadeDe, td, th, trClic, useCentro } from "../ui"

const ESTADOS = [
  { id: "", nome: "Todos" },
  { id: "executado", nome: "Com execuções" },
  { id: "saltado", nome: "Com saltos" },
  { id: "erro", nome: "Com erros" },
  { id: "sistema", nome: "Erro do sistema" },
]

export default function SeccaoSinais() {
  const ctx = useCentroCtx()
  const [fonte, setFonte] = useState(ctx.filtro.fonte ?? "")
  const [estado, setEstado] = useState(ctx.filtro.estado ?? "")
  const [simbolo, setSimbolo] = useState("")
  const [q, setQ] = useState("")
  const [qAplicado, setQAplicado] = useState("")
  useEffect(() => { setFonte(ctx.filtro.fonte ?? ""); setEstado(ctx.filtro.estado ?? "") }, [ctx.filtro])
  useEffect(() => { const t = setTimeout(() => setQAplicado(q), 350); return () => clearTimeout(t) }, [q])

  const url = useMemo(() => {
    const p = new URLSearchParams({ limite: "400" })
    if (fonte) p.set("fonte", fonte)
    if (estado) p.set("estado", estado)
    if (simbolo) p.set("simbolo", simbolo)
    if (qAplicado) p.set("q", qAplicado)
    if (ctx.filtro.estrategia) p.set("estrategia", ctx.filtro.estrategia)
    return `/api/admin/centro/sinais?${p.toString()}&v=${ctx.versao}`
  }, [fonte, estado, simbolo, qAplicado, ctx.filtro.estrategia, ctx.versao])
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<{ sinais: Sinal[]; total: number; avisos: string[] }>(url, 20_000)
  const s = dados?.sinais ?? []
  const tot = s.reduce((a, x) => ({ exec: a.exec + x.fanout.executado, salt: a.salt + x.fanout.saltado, erro: a.erro + x.fanout.erro, sist: a.sist + x.fanout.errosSistema }), { exec: 0, salt: 0, erro: 0, sist: 0 })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Azulejo rotulo="Sinais (filtro)" valor={fmtNum(s.length)} sub={`de ${fmtNum(dados?.total)} em 24 h`} />
        <Azulejo rotulo="Execuções" valor={fmtNum(tot.exec)} tom="ok" />
        <Azulejo rotulo="Saltos" valor={fmtNum(tot.salt)} />
        <Azulejo rotulo="Erros" valor={fmtNum(tot.erro)} tom={tot.erro ? "aviso" : "neutro"} />
        <Azulejo rotulo="Erro do sistema" valor={fmtNum(tot.sist)} tom={tot.sist ? "grave" : "ok"} sub="exclui sem acesso / sem saldo" />
      </div>

      <Painel
        titulo="Feed unificado · 24 h"
        sub="Site/Premium/T2T (mtmcopy_signal_log agrupado por mensagem), TradingView, MTM Auto (sinais + execuções) e PrimeVerse (MTM Auto Edge). Clica num sinal para ver o fan-out."
        accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Chip activo={!fonte} onClick={() => setFonte("")}>Todas</Chip>
          {FONTES.map((f) => <Chip key={f.chave} activo={fonte === f.chave} onClick={() => setFonte(f.chave)}>{f.nome}</Chip>)}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {ESTADOS.map((e) => <Chip key={e.id} activo={estado === e.id} onClick={() => setEstado(e.id)}>{e.nome}</Chip>)}
          <input value={simbolo} onChange={(e) => setSimbolo(e.target.value.toUpperCase())} placeholder="Símbolo" className="ml-auto w-24 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white placeholder:text-zinc-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar no detalhe…" className="w-48 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white placeholder:text-zinc-600" />
          {ctx.filtro.estrategia && <Chip activo onClick={() => ctx.irPara("sinais", {})}>estratégia ✕</Chip>}
        </div>
        <Lista dados={dados} erro={erro} avisos={dados?.avisos} vazio={dados?.total === 0} textoVazio="Nenhum sinal nas últimas 24 h em nenhuma fonte." filtrada={s.length === 0}>
          <Tabela min={900}>
            <thead><tr><th className={th}>Há</th><th className={th}>Fonte</th><th className={th}>Símbolo</th><th className={th}>Estado</th><th className={th}>Fan-out</th><th className={th}>Latência p95</th><th className={th}>Resumo</th></tr></thead>
            <tbody>
              {s.map((x) => {
                const f = x.fanout
                const total = Math.max(1, f.total)
                return (
                  <tr key={x.id} className={trClic} onClick={() => ctx.abrir({ tipo: "sinal", id: x.id })}>
                    <td className={`${td} font-mono whitespace-nowrap`}>{fmtIdade(idadeDe(x.em))}</td>
                    <td className={td}><p className="text-zinc-200">{FONTES.find((z) => z.chave === x.fonte)?.nome ?? x.fonte}</p><p className="text-[10px] text-zinc-500">{x.sistema} · {x.origem}</p></td>
                    <td className={`${td} whitespace-nowrap font-mono`}>{x.simbolo ?? "—"} <span className={x.direcao?.toLowerCase().startsWith("b") ? "text-emerald-400" : x.direcao?.toLowerCase().startsWith("s") ? "text-rose-400" : "text-zinc-500"}>{x.direcao ?? ""}</span></td>
                    <td className={`${td} text-[11px]`}>{x.estado}</td>
                    <td className={`${td} min-w-[140px]`}>
                      {f.total === 0 ? <span className="text-zinc-600">—</span> : (
                        <>
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            <span className="bg-emerald-400" style={{ width: `${(f.executado / total) * 100}%` }} />
                            <span className="bg-zinc-500" style={{ width: `${(f.saltado / total) * 100}%` }} />
                            <span className="bg-rose-500" style={{ width: `${(f.erro / total) * 100}%` }} />
                            <span className="bg-sky-400" style={{ width: `${(f.pendente / total) * 100}%` }} />
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-zinc-500">{f.executado}✓ {f.saltado}↷ {f.erro}✕{f.errosSistema ? <span className="text-rose-300"> ({f.errosSistema} sist.)</span> : null}{f.pendente ? ` ${f.pendente}…` : ""}</p>
                        </>
                      )}
                    </td>
                    <td className={`${td} font-mono`}>{fmtMs(x.latenciaP95Ms)}</td>
                    <td className={`${td} max-w-[320px] truncate text-[11px] text-zinc-500`} title={x.resumo ?? ""}>{x.resumo ?? ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        </Lista>
      </Painel>

      <Recolhivel titulo="Log de sinais dos providers (clássico)" descricao="O registo de sempre por canal/estado, com a mensagem bruta.">
        <MtmcopySenderLog />
      </Recolhivel>
      <p className="text-[10px] text-zinc-600">Reprocessar um sinal: não existe hoje caminho seguro no servidor (o relay-post só reprocessa edições do Telegram). Fica pendente — ver docs/admin-centro-paridade.md.</p>
    </div>
  )
}
