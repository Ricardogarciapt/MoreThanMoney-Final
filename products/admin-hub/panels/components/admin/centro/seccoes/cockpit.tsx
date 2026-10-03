"use client"

import { useState } from "react"
import { Activity, AlertTriangle, Clock, Database, Gauge, Radio, Server, ShieldAlert, Zap } from "lucide-react"
import type { cockpit } from "@/lib/admin-centro/servidor/cockpit"
import { CONFIRMACOES, tomIdade, type AcaoRunbook, type Alerta } from "@/lib/admin-centro/regras"
import { AVISO_SIMULADO, textoPct } from "@/lib/admin-centro/linha-de-agua"
import { useCentroCtx } from "../contexto"
import MotorRealSombra from "../motor-real-sombra"
import MotorMestresCentro from "../motor-mestres"
import {
  Aviso, Azulejo, BotaoLer, Botao, Faixa, Painel, Pilula, Sparkline, Tabela, Vazio, curto, fmtIdade, fmtMs, fmtNum, fmtQuando,
  idadeDe, pedirCentro, pedirPalavra, td, th, useCentro,
} from "../ui"

type Cockpit = Awaited<ReturnType<typeof cockpit>>

export default function SeccaoCockpit() {
  const ctx = useCentroCtx()
  const { dados: c, erro, aCarregar, recarregar, lidoEm } = useCentro<Cockpit>(`/api/admin/centro/cockpit?v=${ctx.versao}`, 20_000)
  const [aCorrer, setACorrer] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const correr = async (a: AcaoRunbook, confirmar?: string, id?: string) => {
    if (a.tipo === "ir") { ctx.irPara(a.seccao, a.filtro); return }
    const palavra = confirmar ?? (a.tipo === "pausar_monitores" ? CONFIRMACOES.pausar_monitores : a.tipo === "retomar_monitores" ? CONFIRMACOES.retomar_monitores : CONFIRMACOES.desligar_motor_copia)
    const texto = a.tipo === "pausar_monitores"
      ? `Pausar as leituras de FUNDO da MetaApi (monitores) durante ${a.minutos} min.\nAs ordens, fechos e modificações dos clientes NÃO param.`
      : a.tipo === "retomar_monitores" ? "Retomar já os monitores de fundo (limpa o travão global de quota)." : "Desligar o motor da cópia entre contas."
    const ok = pedirPalavra(texto, palavra)
    if (!ok) return
    setACorrer(id ?? a.tipo)
    const r = await pedirCentro<{ message?: string }>("/api/admin/centro/acoes", { method: "POST", body: { acao: a.tipo, confirmacao: ok, ...(a.tipo === "pausar_monitores" ? { minutos: a.minutos } : {}) } })
    setACorrer(null)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    ctx.depoisDeAcao()
    void recarregar()
  }

  if (erro && !c) return <Aviso tom="grave">Cockpit indisponível: {erro}</Aviso>
  if (!c) return <Esqueleto />

  const e1 = c.execucao.h1
  const e24 = c.execucao.h24
  const quotaAte = c.metaapi.quota.bloqueioGlobalAte ? Date.parse(c.metaapi.quota.bloqueioGlobalAte) : 0
  const quotaActiva = quotaAte > Date.now()
  const graves = c.alertas.filter((a) => a.severidade === "grave").length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pilula tom={graves ? "grave" : c.alertas.length ? "aviso" : "ok"} vivo>{graves ? `${graves} grave(s)` : c.alertas.length ? `${c.alertas.length} aviso(s)` : "sistema nominal"}</Pilula>
        <Pilula tom={c.supabase.latenciaMs == null ? "grave" : c.supabase.latenciaMs > 800 ? "aviso" : "ok"}>Supabase {fmtMs(c.supabase.latenciaMs)}</Pilula>
        <Pilula tom={quotaActiva ? "aviso" : "ok"}>MetaApi {quotaActiva ? `travão ${fmtIdade(Math.round((quotaAte - Date.now()) / 1000))}` : "sem travão"}</Pilula>
        <Pilula tom={c.copia.live ? "grave" : c.copia.motorLigado ? "info" : "neutro"} title="Cópia entre contas (rotas conta → conta, 078)">cópia conta→conta {c.copia.live ? "LIVE" : c.copia.motorLigado ? "sombra" : "desligada"}</Pilula>
        {c.mestres && <Pilula tom={c.mestres.estado === "kill" || c.mestres.estado === "sem-pulso" ? "grave" : c.mestres.estado === "live" ? "ok" : c.mestres.estado === "sombra" ? "info" : "neutro"}>mestres {c.mestres.estado === "kill" ? "KILL" : c.mestres.estado === "sem-pulso" ? "sem batimento" : c.mestres.estado}</Pilula>}
        <div className="ml-auto flex items-center gap-2">
          <Botao onClick={() => correr({ tipo: "pausar_monitores", minutos: 10 }, undefined, "pausa-topo")} disabled={Boolean(aCorrer)} title="Travão global de leituras de fundo (as ordens nunca param)">
            <Clock className="h-3 w-3" /> Pausar monitores 10 min
          </Botao>
          <BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />
        </div>
      </div>
      {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}
      {c.avisos.length > 0 && <Aviso>Leituras parciais: {c.avisos.join(" · ")}</Aviso>}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Azulejo rotulo="Execuções 24 h" valor={fmtNum(e24.executado)} sub={`${fmtNum(e1.executado)} na última hora`} serie={c.execucao.serieExec} barras tom="ok" onClick={() => ctx.irPara("sinais", { estado: "executado" })} />
        <Azulejo rotulo="Sucesso 1 h / 24 h" valor={`${e1.taxaSucesso ?? "—"}%`} sub={`24 h: ${e24.taxaSucesso ?? "—"}% de ${fmtNum(e24.total)}`} tom={e1.total >= 5 && (e1.taxaSucesso ?? 100) < 60 ? "aviso" : "neutro"} />
        <Azulejo rotulo="Saltos 24 h" valor={fmtNum(e24.saltado)} sub="sem acesso / saldo / filtros" onClick={() => ctx.irPara("sinais", { estado: "saltado" })} />
        <Azulejo rotulo="Erros do sistema 24 h" valor={fmtNum(e24.errosSistema)} sub={`1 h: ${e1.errosSistema} · brutos ${e24.erro}`} serie={c.execucao.serieErro} barras tom={e1.errosSistema ? "grave" : e24.errosSistema ? "aviso" : "ok"} onClick={() => ctx.irPara("sinais", { estado: "sistema" })} />
        <Azulejo rotulo="Latência p50" valor={fmtMs(c.execucao.latenciaP50Ms)} sub="sinal → execução" />
        <Azulejo rotulo="Latência p95" valor={fmtMs(c.execucao.latenciaP95Ms)} sub="24 h" tom={(c.execucao.latenciaP95Ms ?? 0) > 10_000 ? "aviso" : "neutro"} />
      </div>

      {/* ── SALDOS ── o dono abre o Centro e vê o dinheiro. Dois totais, nunca um: o simulado entra
           a preço melhor do que o mercado deu (~56% do lucro) e não se soma ao real. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Azulejo
          rotulo="Saldo real"
          valor={c.saldos.real.contas ? fmtNum(c.saldos.real.saldo, 2) : "—"}
          sub={`${c.saldos.real.contas} conta(s) · linha de água ${textoPct(c.saldos.real.pct)}`}
          tom={c.saldos.real.pct == null ? "neutro" : c.saldos.real.pct >= 0 ? "ok" : "grave"}
          onClick={() => ctx.irPara("contas")}
        />
        <Azulejo
          rotulo="Linha de água · real"
          valor={textoPct(c.saldos.real.pct)}
          tom={c.saldos.real.pct == null ? "neutro" : c.saldos.real.pct >= 0 ? "ok" : "grave"}
          sub={c.saldos.real.comLinha ? `${c.saldos.real.comLinha} conta(s) contra ${fmtNum(c.saldos.real.inicial, 0)} de partida` : "nenhuma conta real declara saldo_inicial"}
          onClick={() => ctx.irPara("contas")}
        />
        <Azulejo
          rotulo="Saldo simulado"
          valor={c.saldos.simulado.contas ? fmtNum(c.saldos.simulado.saldo, 2) : "—"}
          tom="aviso"
          sub={`${c.saldos.simulado.contas} conta(s) SIM · linha de água ${textoPct(c.saldos.simulado.pct)} — não se somam às reais`}
          onClick={() => ctx.irPara("contas")}
        />
        <Azulejo rotulo="Simulado ≠ prova" valor={textoPct(c.saldos.simulado.pct)} tom="aviso" sub={AVISO_SIMULADO} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* ── pipeline ── */}
        <Painel titulo="Pipeline de sinais" icone={<Radio className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="Último sinal por fonte e volume por hora (24 h)">
          <div className="grid gap-2 sm:grid-cols-2">
            {c.fontes.map((f) => {
              const tom = f.n24h === 0 ? "neutro" : f.erros24h > 0 ? "aviso" : tomIdade(f.idadeS, 3 * 3600, 24 * 3600) === "ok" ? "ok" : "neutro"
              return (
                <Faixa key={f.chave} tom={tom} onClick={() => ctx.irPara("sinais", { fonte: f.chave })}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-100">{f.nome}</p>
                      <p className="truncate text-[10.5px] text-zinc-500">{f.nota}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums text-white">{f.ultimo ? fmtIdade(f.idadeS) : "—"}</p>
                      <p className="text-[10px] text-zinc-500">{f.n1h}/h · {f.n24h}/24h{f.erros24h ? <span className="text-amber-300"> · {f.erros24h} err</span> : null}</p>
                    </div>
                  </div>
                  <div className="mt-1"><Sparkline serie={f.serie} tom={tom === "neutro" ? "neutro" : tom} barras /></div>
                </Faixa>
              )
            })}
          </div>
        </Painel>

        {/* ── alertas ── */}
        <Painel titulo="Alertas" icone={<AlertTriangle className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="Com runbook de um clique (confirmado e auditado)">
          {c.alertas.length === 0 ? <Vazio>Sem alertas. Tudo dentro dos limites.</Vazio> : (
            <div className="space-y-2">
              {c.alertas.map((a: Alerta) => (
                <Faixa key={a.id} tom={a.severidade}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-100">{a.titulo}</p>
                      <p className="text-[11px] text-zinc-500">{a.detalhe}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {a.acoes.map((x, i) => (
                        <Botao key={i} tom={x.confirmar ? "ouro" : "neutro"} disabled={aCorrer === `${a.id}:${i}`} onClick={() => correr(x.acao, x.confirmar, `${a.id}:${i}`)}>{x.rotulo}</Botao>
                      ))}
                    </div>
                  </div>
                </Faixa>
              ))}
            </div>
          )}
        </Painel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── MetaApi ── */}
        <Painel titulo="MetaApi" icone={<Gauge className="h-3.5 w-3.5 text-[#D2A63C]" />} sub={c.metaapi.nota}>
          <div className="grid grid-cols-2 gap-2">
            <Azulejo rotulo="Travão de créditos" valor={quotaActiva ? fmtIdade(Math.round((quotaAte - Date.now()) / 1000)) : "livre"} sub={quotaActiva ? `${c.metaapi.quota.api ?? "?"} · ${c.metaapi.quota.motivo?.slice(0, 60) ?? ""}` : c.metaapi.quota.pendente ? "080 por aplicar" : `${c.metaapi.quota.contasBloqueadas} conta(s) com travão próprio`} tom={quotaActiva ? "aviso" : "ok"} />
            <Azulejo rotulo="Inexistentes (registo)" valor={c.metaapi.fantasmas.total ?? "—"} sub={`+${c.metaapi.fantasmas.conhecidasApagadas} apagadas conhecidas · ${c.metaapi.inexistentesReferenciadas} ainda referenciada(s)`} tom={c.metaapi.inexistentesReferenciadas ? "aviso" : "neutro"} onClick={() => ctx.irPara("contas", { problema: "inexistente" })} />
            <Azulejo rotulo="Contas MetaApi" valor={c.metaapi.distintas} sub={`${c.metaapi.contas} ligações · ${c.metaapi.ligadas} ligadas · ${c.metaapi.emErro} erro`} tom={c.metaapi.emErro ? "aviso" : "neutro"} onClick={() => ctx.irPara("contas")} />
            <Azulejo rotulo="Quota dos clientes" valor={`${c.metaapi.distintas}/${c.metaapi.quotaUtilizadores.soma}${c.metaapi.quotaUtilizadores.ilimitados ? "+" : ""}`} sub={`${c.metaapi.quotaUtilizadores.acima} acima da quota · ${c.metaapi.quotaUtilizadores.ilimitados} admin`} tom={c.metaapi.quotaUtilizadores.acima ? "aviso" : "neutro"} onClick={() => ctx.irPara("utilizadores", { quota: "acima" })} />
          </div>
          {c.metaapi.fantasmas.contas.length > 0 && (
            <div className="mt-3 space-y-1">
              {c.metaapi.fantasmas.contas.slice(0, 6).map((f) => (
                <p key={f.conta} className="flex justify-between gap-2 font-mono text-[10.5px] text-zinc-500"><span>{curto(f.conta, 13)}</span><span>até {fmtQuando(f.ate)}</span></p>
              ))}
            </div>
          )}
        </Painel>

        {/* ── streaming + Supabase ── */}
        <Painel titulo="Streaming & base" icone={<Database className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="Fotografia de streaming por conta (071) e sonda Supabase">
          <div className="space-y-1.5">
            {c.streaming.length === 0 ? <Vazio>Sem fotografias de streaming.</Vazio> : c.streaming.map((s) => (
              <div key={s.conta} className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/50 px-2 py-1.5">
                <span className="font-mono text-[11px] text-zinc-300">{curto(s.conta, 13)}{s.motorTempoReal && <span className="ml-1 text-[#D2A63C]">· motor</span>}</span>
                <Pilula tom={!s.sincronizado ? "aviso" : tomIdade(s.idadeS, 30, 120)} vivo={(s.idadeS ?? 999) < 30}>{s.sincronizado ? "sync" : "a sincronizar"} {fmtIdade(s.idadeS)}</Pilula>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/50 px-2 py-1.5">
              <span className="text-[11px] text-zinc-300">Supabase (1 linha)</span>
              <Pilula tom={c.supabase.latenciaMs == null ? "grave" : c.supabase.latenciaMs > 1500 ? "grave" : c.supabase.latenciaMs > 600 ? "aviso" : "ok"}>{c.supabase.erro ? "falhou" : fmtMs(c.supabase.latenciaMs)}</Pilula>
            </div>
          </div>
        </Painel>

        {/* ── VPS ── */}
        <Painel titulo="Serviços do VPS" icone={<Server className="h-3.5 w-3.5 text-[#D2A63C]" />} sub="servicos_pulso (078)">
          {c.servicosPendente ? <Aviso>Migração 078 por aplicar.</Aviso> : c.servicos.length === 0 ? <Vazio>Nenhum serviço registou batimento (servicos_pulso vazio).</Vazio> : (
            <div className="space-y-1.5">
              {c.servicos.map((s) => (
                <div key={s.nome} className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/50 px-2 py-1.5" title={JSON.stringify(s.estado).slice(0, 300)}>
                  <span className="truncate text-[11px] text-zinc-300">{s.nome}{s.versao && <span className="ml-1 text-zinc-600">{s.versao}</span>}</span>
                  <Pilula tom={tomIdade(s.idadeS, 70, 180)} vivo={(s.idadeS ?? 999) < 70}>{fmtIdade(s.idadeS)}</Pilula>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Azulejo rotulo="Rotas cópia" valor={c.copia.rotas} sub={`${c.copia.ativas} activas`} onClick={() => ctx.irPara("copia")} />
            <Azulejo rotulo="Pedidos" valor={c.copia.pedidos} tom={c.copia.pedidos ? "info" : "neutro"} onClick={() => ctx.irPara("copia", { estado: "pedido" })} />
            <Azulejo rotulo="Fila eventos" valor={c.copia.eventosPendentes} tom={c.copia.eventosPendentes > 200 ? "aviso" : "neutro"} sub={`${c.copia.errosEventos24h} erro 24h`} />
          </div>
        </Painel>
      </div>

      <MotorMestresCentro versao={ctx.versao} />

      <MotorRealSombra versao={ctx.versao} />

      {/* ── crons ── */}
      <Painel titulo="Crons da Vercel" icone={<Zap className="h-3.5 w-3.5 text-[#D2A63C]" />} sub={c.cronsPendente ? "Horários do vercel.json. «Última execução» aparece quando a 095 (cron_pulso) estiver aplicada e os crons chamarem registarPulsoCron." : "Última execução registada por cada cron"}>
        <Tabela min={560}>
          <thead><tr><th className={th}>Caminho</th><th className={th}>Horário</th><th className={th}>Última execução</th><th className={th}>Duração</th></tr></thead>
          <tbody>
            {c.crons.map((x) => (
              <tr key={x.caminho}>
                <td className={`${td} font-mono text-[11px]`}>{x.caminho}</td>
                <td className={`${td} font-mono text-[11px] text-zinc-500`}>{x.horario}</td>
                <td className={td}>{x.ultimoEm ? <Pilula tom={x.ok ? "ok" : "grave"}>{fmtIdade(idadeDe(x.ultimoEm))}</Pilula> : <span className="text-zinc-600">sem registo</span>}</td>
                <td className={`${td} font-mono`}>{fmtMs(x.duracaoMs)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Painel>
      <p className="flex items-center gap-1 text-[10px] text-zinc-600"><Activity className="h-3 w-3" /> Lido {fmtQuando(c.lidaEm)} · servidor em cache 15–30 s · relê a cada 20 s e pára com o separador escondido · <ShieldAlert className="h-3 w-3" /> nenhuma chamada à MetaApi</p>
    </div>
  )
}

function Esqueleto() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-white/[0.04] bg-zinc-900/50" />)}
    </div>
  )
}
