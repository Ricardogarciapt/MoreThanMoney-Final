"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import type { ContaCentro } from "@/lib/admin-centro/servidor/contas"
import type { LinhaFanout, Sinal } from "@/lib/admin-centro/servidor/sinais"
import { FONTES, nomeMotivo } from "@/lib/admin-centro/regras"
import ContaModal from "@/components/admin/mtmfunded-conta-modal"
import { useCentroCtx, type Alvo } from "./contexto"
import { tomEstadoConta, type DadosContas } from "./seccoes/contas"
import type { DadosEstrategias } from "./seccoes/estrategias"
import type { DadosUtilizadores } from "./seccoes/utilizadores"
import {
  Aviso, Botao, Campo, Faixa, Gaveta, Pilula, Tabela, Vazio, fmtIdade, fmtMs, fmtNum, fmtQuando, idadeDe, pedirCentro, pedirPalavra, td, th, trClic, useCentro,
} from "./ui"

export default function Gavetas({ alvo }: { alvo: Alvo | null }) {
  const ctx = useCentroCtx()
  if (!alvo) return null
  if (alvo.tipo === "conta" && alvo.id.startsWith("funded:")) {
    return <ContaModal contaId={alvo.id.slice(7)} aoFechar={ctx.fechar} aoMudar={ctx.depoisDeAcao} />
  }
  if (alvo.tipo === "conta") return <GavetaConta refConta={alvo.id} />
  if (alvo.tipo === "estrategia") return <GavetaEstrategia id={alvo.id} />
  if (alvo.tipo === "utilizador") return <GavetaUtilizador id={alvo.id} />
  return <GavetaSinal id={alvo.id} />
}

// ── conta ───────────────────────────────────────────────────────────────────────────────────────

function GavetaConta({ refConta }: { refConta: string }) {
  const ctx = useCentroCtx()
  const { dados, erro, recarregar } = useCentro<{ conta: ContaCentro | null; mesmoDono: ContaCentro[] }>(`/api/admin/centro/contas?ref=${encodeURIComponent(refConta)}&v=${ctx.versao}`, 30_000)
  const [aCorrer, setACorrer] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [vista, setVista] = useState<Record<string, unknown> | null | "a-ler">(null)
  const c = dados?.conta

  const operar = async (operacao: string) => {
    let confirmacao: string | null = ""
    if (operacao === "deploy" || operacao === "undeploy") {
      confirmacao = pedirPalavra(operacao === "undeploy" ? "Undeploy: a conta deixa de estar ligada na MetaApi (poupa custo) e a cópia desta conta PÁRA." : "Deploy: liga a conta na MetaApi (custo por hora).", "CONFIRMAR")
      if (!confirmacao) return
    } else if (operacao === "remover") {
      confirmacao = pedirPalavra("Remover a conta: pára a cópia, apaga a conta MetaApi (se não for partilhada) e apaga a linha.", "REMOVER")
      if (!confirmacao) return
    } else if (operacao === "pausar" && !window.confirm("Pausar a cópia desta conta? (desubscreve e confirma na CopyFactory)")) return
    setACorrer(operacao)
    const r = await pedirCentro<{ message?: string }>("/api/admin/centro/acoes", { method: "POST", body: { acao: "conta", ref: refConta, operacao, confirmacao } })
    setACorrer(null)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    ctx.depoisDeAcao()
    void recarregar()
  }
  const verPosicoes = async () => {
    setVista("a-ler")
    const r = await pedirCentro<Record<string, unknown>>(`/api/admin/mtmauto-copia/contas?vista=${encodeURIComponent(refConta)}`)
    setVista(r.success && r.data ? r.data : { erro: r.error ?? "falhou" })
  }

  return (
    <Gaveta aberta titulo={c ? `${c.etiquetaDoDono ? `${c.etiquetaDoDono} · ` : ""}${c.plataforma.toUpperCase()} ${c.login ?? "—"}` : "Conta"} sub={c ? `${c.servidor ?? "—"} · ${c.ref}` : refConta} aoFechar={ctx.fechar}>
      {erro && !c && <Aviso tom="grave">{erro}</Aviso>}
      {!dados ? <Vazio>A ler…</Vazio> : !c ? <Vazio>Conta não encontrada (removida?).</Vazio> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pilula tom={tomEstadoConta(c)}>{c.estado}</Pilula>
            <Pilula tom={c.ativa ? "ok" : "neutro"}>{c.ativa ? "activa" : "pausada"}</Pilula>
            <Pilula>{c.categoria}</Pilula>
            {c.demo && <Pilula tom="info">demo</Pilula>}
            {c.metaapi.inexistente && <Pilula tom="grave">MetaApi inexistente</Pilula>}
            {c.metaapi.motorTempoReal && <Pilula tom="info">motor tempo real</Pilula>}
          </div>
          {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}
          {c.erro && <Aviso tom={c.erroEstado === "actual" ? "grave" : "info"}>{c.erroEstado === "velho" ? "Erro histórico (não actual): " : "Erro: "}{c.erro}</Aviso>}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] p-3 sm:grid-cols-3">
            <Campo rotulo="Dono">{c.userId ? <button type="button" className="text-left text-[#E9C46A] hover:underline" onClick={() => ctx.abrir({ tipo: "utilizador", id: c.userId! })}>{c.email ?? c.userId.slice(0, 8)}</button> : "—"}</Campo>
            <Campo rotulo="Plano · direito">{c.plano} · {nomeMotivo(c.motivoDireito)}</Campo>
            <Campo rotulo="Quota MetaApi">{c.contaMetaApi ? `${c.quota.emUso}/${c.quota.limite ?? "∞"}${c.quota.acima ? " (acima)" : ""}` : "não conta"}</Campo>
            <Campo rotulo="Conta MetaApi"><span className="font-mono">{c.metaapiAccountId ?? "—"}</span></Campo>
            <Campo rotulo="Estado guardado">{c.metaapi.guardado ?? "—"} {c.metaapi.streaming ? `· streaming ${c.metaapi.streaming}` : ""}</Campo>
            <Campo rotulo="Saldo · equity">{fmtNum(c.saldo, 2)} · {fmtNum(c.equity, 2)}</Campo>
            <Campo rotulo="Última actividade">{c.ultimaActividade ? `${fmtQuando(c.ultimaActividade)} (há ${fmtIdade(idadeDe(c.ultimaActividade))})` : "—"}</Campo>
            <Campo rotulo="Criada">{fmtQuando(c.criadaEm)}</Campo>
            <Campo rotulo="Actualizada">{fmtQuando(c.atualizadaEm)}</Campo>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Usos e estratégias</p>
            <div className="flex flex-wrap gap-1">{[...c.usos, ...c.estrategias].map((u, i) => <Pilula key={i}>{u}</Pilula>)}</div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Acções (caminhos guardados, auditadas)</p>
            <div className="flex flex-wrap gap-1.5">
              {(c.plataforma === "mt4" || c.plataforma === "mt5") && c.metaapiAccountId && <Botao onClick={() => operar("sincronizar")} disabled={Boolean(aCorrer)} title="1 GET à MetaApi + releitura CopyFactory">{aCorrer === "sincronizar" && <Loader2 className="h-3 w-3 animate-spin" />}Sincronizar</Botao>}
              {(c.origem === "site" || c.origem === "auto") && (c.ativa
                ? <Botao onClick={() => operar("pausar")} disabled={Boolean(aCorrer)}>{aCorrer === "pausar" && <Loader2 className="h-3 w-3 animate-spin" />}Pausar</Botao>
                : <Botao tom="ouro" onClick={() => operar("retomar")} disabled={Boolean(aCorrer)}>{aCorrer === "retomar" && <Loader2 className="h-3 w-3 animate-spin" />}Retomar</Botao>)}
              {(c.plataforma === "mt4" || c.plataforma === "mt5") && c.metaapiAccountId && c.categoria !== "equipa" && (
                <>
                  <Botao onClick={() => operar("deploy")} disabled={Boolean(aCorrer)}>Deploy</Botao>
                  <Botao onClick={() => operar("undeploy")} disabled={Boolean(aCorrer)}>Undeploy</Botao>
                </>
              )}
              {(c.plataforma === "mt4" || c.plataforma === "mt5") && c.metaapiAccountId && <Botao onClick={verPosicoes} title="Lê a conta ao vivo (adaptador do WebTrader)">Ver posições (ao vivo)</Botao>}
              <Link href="/webtrader" target="_blank" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">WebTrader <ExternalLink className="h-3 w-3" /></Link>
              {c.origem !== "funded" && <Botao tom="perigo" onClick={() => operar("remover")} disabled={Boolean(aCorrer)}>Remover…</Botao>}
              <Botao onClick={() => ctx.irPara("copia", { userId: c.userId ?? "" })}>Rotas de cópia do dono</Botao>
              <Botao onClick={() => { ctx.irPara("contas", { userId: c.userId ?? "" }) }}>Gestor clássico</Botao>
            </div>
          </div>

          {vista && (
            <div className="rounded-xl border border-sky-500/25 p-3">
              {vista === "a-ler" ? <Loader2 className="h-4 w-4 animate-spin text-sky-300" /> : vista.erro ? <Aviso tom="grave">{String(vista.erro)}</Aviso> : (
                <>
                  <p className="mb-2 text-xs text-zinc-400">{(() => { const i = vista.conta as Record<string, number | null> | undefined; return `saldo ${i?.saldo ?? "—"} · equity ${i?.equity ?? "—"} · margem livre ${i?.margemLivre ?? "—"}` })()}</p>
                  <Tabela min={520}>
                    <thead><tr><th className={th}>Símbolo</th><th className={th}>Dir.</th><th className={th}>Lote</th><th className={th}>Entrada</th><th className={th}>SL</th><th className={th}>TP</th></tr></thead>
                    <tbody>
                      {((vista.posicoes as Record<string, unknown>[]) ?? []).map((p) => (
                        <tr key={String(p.id)}><td className={td}>{String(p.simboloCorretora ?? p.symbol)}</td><td className={td}>{String(p.direcao)}</td><td className={td}>{String(p.volume)}</td><td className={td}>{String(p.precoEntrada ?? "—")}</td><td className={td}>{String(p.sl ?? "—")}</td><td className={td}>{String(p.tp ?? "—")}</td></tr>
                      ))}
                    </tbody>
                  </Tabela>
                </>
              )}
            </div>
          )}

          {dados.mesmoDono.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Outras contas do mesmo dono</p>
              <div className="space-y-1">
                {dados.mesmoDono.map((o) => (
                  <Faixa key={o.ref} tom={tomEstadoConta(o)} onClick={() => ctx.abrir({ tipo: "conta", id: o.ref })}>
                    <span className="font-mono text-xs text-zinc-200">{o.plataforma.toUpperCase()} {o.login ?? "—"}</span> <span className="text-[10.5px] text-zinc-500">{o.origem} · {o.estado} · {o.usos.join(", ")}</span>
                  </Faixa>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Gaveta>
  )
}

// ── estratégia ──────────────────────────────────────────────────────────────────────────────────

function GavetaEstrategia({ id }: { id: string }) {
  const ctx = useCentroCtx()
  const { dados, recarregar } = useCentro<DadosEstrategias>(`/api/admin/centro/estrategias?v=${ctx.versao}`, 30_000)
  const contas = useCentro<DadosContas>(`/api/admin/centro/contas?v=${ctx.versao}`, 30_000)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const e = dados?.estrategias.find((x) => x.id === id)
  const seguidores = (contas.dados?.contas ?? []).filter((c) => e && (c.estrategias.some((s) => s.startsWith(e.nome) || s === e.estrategiaCf || s.toLowerCase() === e.slug.toLowerCase())))

  const trocar = async (fonte: "mestre" | "espelho") => {
    if (!e) return
    const palavra = pedirPalavra(`Trocar a fonte de execução de ${e.nome} para «${fonte}».\nA base troca a estratégia E as rotas de cópia no mesmo commit, e recusa «espelho» sem veredicto alinhado.`, "CONFIRMAR")
    if (!palavra) return
    const r = await pedirCentro<{ message?: string }>("/api/admin/centro/acoes", { method: "POST", body: { acao: "trocar_fonte", providerId: e.id, fonte, confirmacao: palavra } })
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    ctx.depoisDeAcao(); void recarregar()
  }

  return (
    <Gaveta aberta titulo={e?.nome ?? "Estratégia"} sub={e ? `${e.slug} · ${e.tipo ?? "—"}${e.equipa ? ` · equipa ${e.equipa}` : " · casa"}` : id} aoFechar={ctx.fechar}>
      {!dados ? <Vazio>A ler…</Vazio> : !e ? <Vazio>Estratégia não encontrada.</Vazio> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pilula tom={e.ativa ? "ok" : "neutro"}>{e.ativa ? "activa" : "inactiva"}</Pilula>
            {e.apagada && <Pilula tom="grave">apagada</Pilula>}
            <Pilula tom={e.fonteExecucao === "espelho" ? "info" : "neutro"}>fonte {e.fonteExecucao ?? "mestre (084 por aplicar)"}</Pilula>
            {e.estrategiaCf && <Pilula>CopyFactory {e.estrategiaCf}</Pilula>}
          </div>
          {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] p-3 sm:grid-cols-3">
            <Campo rotulo="Conta mestre"><span className="font-mono">{e.metaapiAccountId ?? "—"}</span></Campo>
            <Campo rotulo="Seguidores">{e.seguidores.total} (auto {e.seguidores.mtmauto}, site {e.seguidores.site}, funded {e.seguidores.funded})</Campo>
            <Campo rotulo="Em automático">{e.seguidores.mtmautoAuto}</Campo>
            <Campo rotulo="Sinais 30 d">{e.desempenho30d.sinais} ({e.desempenho30d.fechados} fechados)</Campo>
            <Campo rotulo="Pips · % · acerto">{fmtNum(e.desempenho30d.pips, 1)} · {e.desempenho30d.pct ?? "—"}% · {e.desempenho30d.acerto ?? "—"}%</Campo>
            <Campo rotulo="Resultado € (admin)">{e.desempenho30d.dinheiro == null ? "—" : fmtNum(e.desempenho30d.dinheiro, 2)} em {e.desempenho30d.execucoes} execuções</Campo>
          </div>
          {e.divergencias.length > 0 && <Aviso>{e.divergencias.map((d) => <p key={d}>• {d}</p>)}</Aviso>}

          <div className="rounded-xl border border-white/[0.06] p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Fonte de execução</p>
            {e.espelho ? (
              <div className="space-y-1 text-xs">
                <p>Conta espelho <span className="font-mono">{e.espelho.conta ?? "—"}</span> · <Pilula tom={e.espelho.alinhado ? "ok" : "aviso"}>{e.espelho.alinhado ? "alinhado" : "por alinhar"}</Pilula></p>
                <p className="text-zinc-500">{e.espelho.nTrades ?? 0} trades · dif. média {e.espelho.mediaDiferencaPips ?? "—"} pips · p95 {fmtMs(e.espelho.latenciaP95Ms)}</p>
                {e.espelho.motivos.map((m) => <p key={m} className="text-amber-300">• {m}</p>)}
              </div>
            ) : <p className="text-xs text-zinc-500">Sem conta espelho.</p>}
            <div className="mt-2 flex gap-1.5">
              <Botao onClick={() => trocar("mestre")} disabled={e.fonteExecucao === "mestre" || e.apagada}>Usar mestre</Botao>
              <Botao tom="ouro" onClick={() => trocar("espelho")} disabled={!e.espelho?.alinhado || e.fonteExecucao === "espelho" || e.apagada} title={e.espelho?.alinhado ? "" : "Só com veredicto alinhado"}>Usar espelho</Botao>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Botao onClick={() => ctx.irPara("sinais", { estrategia: e.id })}>Sinais desta estratégia</Botao>
            <Botao onClick={() => ctx.irPara("estrategias")}>Controlo / trailing / reconciliação</Botao>
            <a href={`${process.env.NEXT_PUBLIC_MTM_AUTO_BASE_URL || "https://mtm-auto.vercel.app"}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800" title="Pausar/apagar estratégia: caminho guardado do MTM Auto (marca apagado_em, nunca DELETE)">Pausar/apagar no admin MTM Auto <ExternalLink className="h-3 w-3" /></a>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Contas a seguir ({seguidores.length})</p>
            {seguidores.length === 0 ? <Vazio>Nenhuma conta ligada encontrada.</Vazio> : (
              <div className="space-y-1">
                {seguidores.map((c) => (
                  <Faixa key={c.ref} tom={tomEstadoConta(c)} onClick={() => ctx.abrir({ tipo: "conta", id: c.ref })}>
                    <span className="font-mono text-xs text-zinc-200">{c.plataforma.toUpperCase()} {c.login ?? "—"}</span> <span className="text-[10.5px] text-zinc-500">{c.email ?? ""} · {c.origem} · {c.estado}</span>
                  </Faixa>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Gaveta>
  )
}

// ── utilizador ──────────────────────────────────────────────────────────────────────────────────

function GavetaUtilizador({ id }: { id: string }) {
  const ctx = useCentroCtx()
  const u = useCentro<{ utilizador: DadosUtilizadores["utilizadores"][number] | null }>(`/api/admin/centro/utilizadores?id=${encodeURIComponent(id)}&v=${ctx.versao}`, 30_000)
  const contas = useCentro<DadosContas>(`/api/admin/centro/contas?v=${ctx.versao}`, 30_000)
  const x = u.dados?.utilizador
  const minhas = (contas.dados?.contas ?? []).filter((c) => c.userId === id)
  return (
    <Gaveta aberta titulo={x?.email ?? "Utilizador"} sub={x ? `${x.nome ?? ""} · ${x.tipo ?? "—"}${x.categoria ? `/${x.categoria}` : ""}` : id} aoFechar={ctx.fechar}>
      {!u.dados && !u.erro ? <Vazio>A ler…</Vazio> : !x ? <Vazio>Utilizador sem perfil nem conta MTM Auto.</Vazio> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Pilula tom={x.temMtmAuto ? "ok" : "grave"}>{x.temMtmAuto ? "com MTM Auto" : "sem MTM Auto"}</Pilula>
            <Pilula>{nomeMotivo(x.motivo)}</Pilula>
            {x.legadoMtmCopy.ativo && <Pilula tom="aviso">MTM Copy legado até {x.legadoMtmCopy.expira?.slice(0, 10)}</Pilula>}
            {x.quotaAcima && <Pilula tom="aviso">acima da quota</Pilula>}
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] p-3 sm:grid-cols-3">
            <Campo rotulo="MTM Auto">{x.mtmauto ? [x.mtmauto.subscricao && `Stripe ${x.mtmauto.subscricao}`, x.mtmauto.apple && `Apple ${x.mtmauto.apple}`, x.mtmauto.manual && "manual", x.mtmauto.isento && "isento", x.mtmauto.suspenso && "SUSPENSO"].filter(Boolean).join(" · ") || "registado" : "sem registo"}</Campo>
            <Campo rotulo="Equipa">{x.mtmauto?.equipa ?? "casa"}</Campo>
            <Campo rotulo="Quota MetaApi">{x.contasMetaApi}/{x.quotaLimite ?? "∞"}</Campo>
            <Campo rotulo="T2T">{x.t2t.ligacoes ? `${x.t2t.ligacoes} ligação(ões) · risco ${x.t2t.risco ?? "—"}` : "—"}</Campo>
            <Campo rotulo="Fontes T2T">{x.t2t.fontes.join(", ") || "—"}</Campo>
            <Campo rotulo="Último login">{fmtQuando(x.ultimoLogin)}</Campo>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href={`/admin?tab=users&userId=${id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">Gestão de utilizadores <ExternalLink className="h-3 w-3" /></Link>
            <Botao onClick={() => ctx.irPara("contas", { userId: id })}>Gestor clássico (lotes, risco, sinais)</Botao>
            <Botao onClick={() => ctx.irPara("copia", { userId: id })}>Rotas de cópia</Botao>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Contas ({minhas.length})</p>
            {minhas.length === 0 ? <Vazio>Sem contas ligadas.</Vazio> : (
              <div className="space-y-1">
                {minhas.map((c) => (
                  <Faixa key={c.ref} tom={tomEstadoConta(c)} onClick={() => ctx.abrir({ tipo: "conta", id: c.ref })}>
                    <span className="font-mono text-xs text-zinc-200">{c.plataforma.toUpperCase()} {c.login ?? "—"}</span> <span className="text-[10.5px] text-zinc-500">{c.origem} · {c.estado} · {[...c.usos, ...c.estrategias].join(", ")}</span>
                  </Faixa>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Gaveta>
  )
}

// ── sinal ───────────────────────────────────────────────────────────────────────────────────────

function GavetaSinal({ id }: { id: string }) {
  const ctx = useCentroCtx()
  const [d, setD] = useState<{ sinal: Sinal | null; fanout: (LinhaFanout & { email: string | null })[]; bruto: string | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ler = useCallback(async () => {
    const r = await pedirCentro<NonNullable<typeof d>>(`/api/admin/centro/sinais?id=${encodeURIComponent(id)}`)
    if (r.success && r.data) setD(r.data); else setErro(r.error ?? "falhou")
  }, [id])
  useEffect(() => { void ler() }, [ler])
  const s = d?.sinal
  return (
    <Gaveta aberta largura="max-w-3xl" titulo={s ? `${s.simbolo ?? "—"} ${s.direcao ?? ""} · ${FONTES.find((f) => f.chave === s.fonte)?.nome ?? s.fonte}` : "Sinal"} sub={s ? `${fmtQuando(s.em)} · ${s.sistema} · ${s.origem}` : id} aoFechar={ctx.fechar}>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {!d ? <Vazio>A ler…</Vazio> : !s ? <Vazio>O sinal saiu da janela de 24 h.</Vazio> : (
        <>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] p-3 sm:grid-cols-4">
            <Campo rotulo="Entrada · SL · TP">{s.entrada ?? "—"} · {s.sl ?? "—"} · {s.tp ?? "—"}</Campo>
            <Campo rotulo="Estado">{s.estado}</Campo>
            <Campo rotulo="Fan-out">{s.fanout.executado}✓ {s.fanout.saltado}↷ {s.fanout.erro}✕ ({s.fanout.errosSistema} sist.)</Campo>
            <Campo rotulo="Latência p50 · p95">{fmtMs(s.latenciaP50Ms)} · {fmtMs(s.latenciaP95Ms)}</Campo>
          </div>
          {s.resumo && <p className="text-xs text-zinc-400">{s.resumo}</p>}
          {s.estrategiaId && <Botao onClick={() => ctx.abrir({ tipo: "estrategia", id: s.estrategiaId! })}>Abrir estratégia</Botao>}
          {d.fanout.length === 0 ? <Vazio>Sem fan-out por conta (sinal de chat/TradingView ou só a mestre).</Vazio> : (
            <Tabela min={640}>
              <thead><tr><th className={th}>Conta</th><th className={th}>Dono</th><th className={th}>Resultado</th><th className={th}>Lote</th><th className={th}>Latência</th><th className={th}>Motivo</th></tr></thead>
              <tbody>
                {d.fanout.map((f, i) => (
                  <tr key={i} className={f.contaRef ? trClic : ""} onClick={() => f.contaRef && ctx.abrir({ tipo: "conta", id: f.contaRef })}>
                    <td className={`${td} font-mono text-[10.5px]`}>{f.contaRef ?? "—"}</td>
                    <td className={td}>{f.userId ? <button type="button" className="hover:text-[#E9C46A]" onClick={(e) => { e.stopPropagation(); ctx.abrir({ tipo: "utilizador", id: f.userId! }) }}>{f.email ?? f.userId.slice(0, 8)}</button> : "—"}</td>
                    <td className={td}><Pilula tom={f.estado === "executado" ? "ok" : f.estado === "erro" ? "grave" : f.esperado ? "neutro" : f.estado === "saltado" ? "aviso" : "info"}>{f.estadoBruto}</Pilula></td>
                    <td className={`${td} font-mono`}>{f.lote ?? "—"}</td>
                    <td className={`${td} font-mono`}>{fmtMs(f.latenciaMs)}</td>
                    <td className={`${td} max-w-[280px] text-[10.5px] text-zinc-400`}>{f.motivo ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          {d.bruto && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] text-zinc-400">{d.bruto}</pre>}
        </>
      )}
    </Gaveta>
  )
}
