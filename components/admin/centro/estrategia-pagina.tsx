"use client"

import { useState, type ReactNode } from "react"
import { ArrowLeft, ArrowLeftRight, ExternalLink, RefreshCcw } from "lucide-react"
import type { FichaEstrategia } from "@/lib/admin-centro/servidor/estrategia-ficha"
import { palavraDeConfirmacao, NOME_CAMPO, type CampoModo } from "@/lib/mestres/painel"
import { Coluna as ColunaCadeia } from "@/components/admin/copia-cadeia/vista-simples"
import OpcoesEstrategia from "./opcoes-estrategia"
import { useCentroCtx } from "./contexto"
import { Aviso, Botao, Pilula, Recolhivel, Tabela, Vazio, fmtIdade, fmtNum, idadeDe, pedirCentro, pedirPalavra, td, th, useCentro } from "./ui"

/**
 * A PÁGINA DE UMA ESTRATÉGIA — `/admin/centro?s=estrategias&e=<slug>`.
 *
 * Decisão do dono (05/10): o Centro é o único sítio onde se DECIDE o que uma estratégia faz, e
 * abrir uma estratégia mostra a cadeia INTEIRA, por esta ordem, cada elo com o seu interruptor ali
 * mesmo:
 *   1. Fonte do sinal → 2. Conta mestre → 3. Rotas → 4. Subscritores
 * A hierarquia do ecrã é a do pedido do dono: o que precisa de atenção (contradições entre elos)
 * primeiro, depois o controlo (a cadeia e a gestão), e o detalhe recolhido no fim.
 *
 * Todas as escritas vão a `POST /api/admin/centro/estrategia` → `estrategia-escrita.ts` (a camada
 * única, com a guarda de equipa). As opções (listada, a executar, trailing, BE, SL mínimo, risco,
 * símbolos, apagar) reutilizam `OpcoesEstrategia` — o mesmo componente e a mesma regra de sempre.
 */

type Resposta = { ok?: boolean; message?: string; error?: string }

const MODOS = ["desligado", "sombra", "live"] as const
const CAMPOS: CampoModo[] = ["sinal_modo", "modo", "t2t_modo"]
const TOM_MODO = (m: string) => (m === "live" ? "grave" : m === "sombra" ? "info" : "neutro") as "grave" | "info" | "neutro"
const TOM_FONTE = { viva: "ok", desligada: "grave", por_ligar: "aviso", sem_fonte: "aviso" } as const
const NOME_FONTE = { viva: "viva", desligada: "fonte desligada", por_ligar: "MT5 por ligar", sem_fonte: "sem fonte declarada" } as const

export default function PaginaEstrategia({ refEstrategia }: { refEstrategia: string }) {
  const ctx = useCentroCtx()
  const { dados: f, erro, recarregar, aCarregar } = useCentro<FichaEstrategia>(`/api/admin/centro/estrategia?e=${encodeURIComponent(refEstrategia)}&v=${ctx.versao}`, 30_000)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  /** Uma escrita: pede, mostra a resposta do servidor (nunca «ok» inventado), relê. */
  const escrever = async (chave: string, corpo: Record<string, unknown>) => {
    if (!f) return
    setOcupado(chave)
    const r = await pedirCentro<Resposta>("/api/admin/centro/estrategia", { method: "POST", body: { providerId: f.id, ...corpo } })
    setOcupado(null)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    ctx.depoisDeAcao(); void recarregar()
  }

  const voltar = () => ctx.irPara("estrategias")

  if (erro) return <div className="space-y-3"><BotaoVoltar onClick={voltar} /><Aviso tom="grave">{erro}</Aviso></div>
  if (!f) return <div className="space-y-3"><BotaoVoltar onClick={voltar} /><Vazio>A ler a estratégia…</Vazio></div>

  const mudarModo = (campo: CampoModo, valor: (typeof MODOS)[number]) => {
    const pedido = { tipo: "estrategia" as const, slug: f.slug, campo, valor }
    const palavra = palavraDeConfirmacao(pedido)!
    const aviso = valor === "live" ? "LIVE abre ordens REAIS nas contas dos clientes." : "O serviço do VPS relê em ≤ 10 s."
    if (!pedirPalavra(`${NOME_CAMPO[campo]} · ${f.slug} → ${valor}\n\n${aviso}`, palavra)) return
    void escrever(`mestre:${campo}`, { accao: "mestres", slug: f.slug, pedido: { ...pedido, confirmacao: palavra } })
  }
  const alternarRotaProvider = (routeId: string, campo: "copia" | "t2t", valor: boolean) => {
    const nome = campo === "copia" ? "a cópia" : "o Tap to Trade"
    if (!pedirPalavra(`${valor ? "Religar" : "Pausar"} ${nome} da rota ${routeId}.${campo === "copia" && !valor ? "\n\nA pausa chega à MTM Auto (ativo=false) antes da CopyFactory." : ""}`, "CONFIRMAR")) return
    void escrever(`rp:${routeId}:${campo}`, { accao: "rota_provider", routeId, campo, value: valor })
  }
  const alternarSubscritor = (ref: string, quem: string, ligar: boolean) => {
    if (!pedirPalavra(`${ligar ? "Ligar" : "Desligar"} ${quem} ${ligar ? "a" : "de"} ${f.nome}.\n\nMuda o que o cliente escolheu e ressincroniza as rotas (a rota fica pausada enquanto houver posições abertas).`, "CONFIRMAR")) return
    void escrever(`sub:${ref}`, { accao: "subscritor", ref, ligar })
  }

  const t2tRotas = f.rotas.filter((r) => r.tipo === "t2t")
  const graves = f.contradicoes.filter((c) => c.gravidade === "grave").length

  return (
    <div className="space-y-5">
      {/* ── cabeçalho ── */}
      <div className="flex flex-wrap items-start gap-3">
        <BotaoVoltar onClick={voltar} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight text-white [text-wrap:balance]">{f.nome}</h2>
          <p className="font-mono text-[11px] text-zinc-500">{f.slug} · {f.tipo ?? "—"} · {f.equipa ? `equipa ${f.equipa.nome ?? f.equipa.id.slice(0, 8)}` : "casa"}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pilula tom={f.ativo ? "ok" : "neutro"}>{f.ativo ? "listada" : "não listada"}</Pilula>
            <Pilula tom={f.espelhar ? "ok" : "neutro"}>{f.espelhar ? "a executar" : "não executa (MTM Auto)"}</Pilula>
            {f.apagada && <Pilula tom="grave">escondida</Pilula>}
            {f.mestre && <Pilula tom={TOM_MODO(f.mestre.modo)}>motor {f.mestre.modo}</Pilula>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Botao onClick={() => ctx.irPara("copia", { estrategia: f.slug })} title="O quadro de controlo de cópias, filtrado a esta estratégia"><span className="inline-flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> Ver no quadro de cópias</span></Botao>
          <Botao onClick={() => ctx.irPara("sinais", { estrategia: f.id })}>Sinais</Botao>
          <Botao onClick={() => void recarregar()} disabled={aCarregar}><span className="inline-flex items-center gap-1"><RefreshCcw className="h-3 w-3" /> Reler</span></Botao>
        </div>
      </div>

      {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}

      {/* ── 1. ATENÇÃO: elos que se contradizem ── */}
      <section aria-label="Atenção" className="space-y-1.5">
        {f.contradicoes.length === 0
          ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-200">Cadeia coerente: nenhum elo contradiz outro.</p>
          : (
            <>
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Atenção · {f.contradicoes.length} contradição(ões){graves ? ` · ${graves} grave(s)` : ""}</p>
              {f.contradicoes.map((c) => (
                <Aviso key={c.id} tom={c.gravidade === "grave" ? "grave" : c.gravidade === "aviso" ? "aviso" : "info"}>
                  <span className="mr-1.5 font-mono text-[10px] uppercase opacity-70">{c.elos.join(" × ")}</span>{c.texto}
                </Aviso>
              ))}
            </>
          )}
      </section>

      {/* ── 2. CONTROLO: a cadeia, de ponta a ponta ── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ol className="space-y-3">
          <Elo n={1} titulo="Fonte do sinal" estado={<Pilula tom={TOM_FONTE[f.fonte.estado]}>{NOME_FONTE[f.fonte.estado]}</Pilula>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
              <Dado rotulo="Tipo">{f.fonte.tipo ?? "—"}</Dado>
              <Dado rotulo="De onde">{f.fonte.texto}</Dado>
              <Dado rotulo={f.fonte.chat ? "Chat" : "Conta"}><span className="font-mono">{f.fonte.chat ?? f.fonte.conta ?? "—"}</span></Dado>
              <Dado rotulo="Último sinal">{f.fonte.ultimoSinal ? `há ${fmtIdade(idadeDe(f.fonte.ultimoSinal))}` : "nunca"}</Dado>
              <Dado rotulo="Canal do chat (T2T)"><span className="font-mono">{f.fonte.canalChat}</span></Dado>
            </dl>
            {f.fonte.desligada && <p className="mt-2 text-[11px] text-rose-300">Desligada a {f.fonte.desligada.em.slice(0, 10)}{f.fonte.desligada.motivo ? ` — ${f.fonte.desligada.motivo}` : ""}. Religar uma fonte é decisão do dono (fica fora dos botões).</p>}
            {!f.mestre && !f.apagada && (
              <div className="mt-2 flex items-center gap-2">
                <Botao tom="ouro" disabled={!f.pode.registar || ocupado === "registar"} onClick={() => void escrever("registar", { accao: "registar" })} title="Cria a mestre SIM, a linha do motor em SOMBRA, as rotas e o canal">Registar na cadeia (sombra)</Botao>
                <span className="text-[10.5px] text-zinc-500">Sem mestre nossa: executa o caminho antigo.</span>
              </div>
            )}
          </Elo>

          <Elo n={2} titulo="Conta mestre" estado={f.mestre ? <Pilula tom={f.mestre.executor === "motor" ? "ok" : "neutro"} title={f.mestre.executorNota}>{f.mestre.executor === "motor" ? "motor das mestres" : f.mestre.executor}</Pilula> : <Pilula>sem mestre</Pilula>}>
            {!f.mestre ? <Vazio>Esta estratégia não está registada no motor das mestres.</Vazio> : (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                  <Dado rotulo="Conta"><span className="font-mono">{f.mestre.conta?.login ?? "— em falta"}</span></Dado>
                  <Dado rotulo="Saldo / equity"><span className="font-mono tabular-nums">{fmtNum(f.mestre.conta?.saldo, 2)} / {fmtNum(f.mestre.conta?.equity, 2)}</span></Dado>
                  <Dado rotulo="Posições abertas agora"><span className="font-mono tabular-nums">{f.mestre.posicoesAbertas}</span></Dado>
                  <Dado rotulo="CopyFactory">{f.mestre.copyfactoryPorCortar.length ? <span className="text-amber-300">{f.mestre.copyfactoryPorCortar.join(", ")} por cortar</span> : "cortada / sem"}</Dado>
                </dl>
                <div className="space-y-1.5">
                  {CAMPOS.map((campo) => {
                    const actual = campo === "modo" ? f.mestre!.modo : campo === "sinal_modo" ? f.mestre!.sinalModo : f.mestre!.t2tModo
                    const bloqueio = f.mestre!.bloqueioLive[campo]
                    return (
                      <div key={campo} className="flex flex-wrap items-center gap-2">
                        <span className="w-40 text-[11.5px] text-zinc-300">{NOME_CAMPO[campo]}</span>
                        <div role="radiogroup" aria-label={NOME_CAMPO[campo]} className="inline-flex overflow-hidden rounded-md border border-white/10">
                          {MODOS.map((m) => (
                            <button
                              key={m} type="button" role="radio" aria-checked={actual === m}
                              disabled={!f.pode.mestres || actual === m || ocupado != null || (m === "live" && Boolean(bloqueio))}
                              onClick={() => mudarModo(campo, m)}
                              title={m === "live" && bloqueio ? bloqueio : undefined}
                              className={`px-2.5 py-1 text-[11px] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C] disabled:cursor-not-allowed ${actual === m ? (m === "live" ? "bg-rose-500/20 text-rose-200" : m === "sombra" ? "bg-sky-500/15 text-sky-200" : "bg-zinc-700/50 text-zinc-200") : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40"}`}
                            >{m}</button>
                          ))}
                        </div>
                        {bloqueio && actual !== "live" && <span className="text-[10.5px] text-zinc-500">live bloqueado: {bloqueio}</span>}
                      </div>
                    )
                  })}
                  {!f.pode.mestres && <p className="text-[10.5px] text-zinc-500">Os modos da mestre são do motor da casa — só o admin do site / super admin os muda.</p>}
                </div>
                <p className="text-[10.5px] text-zinc-500">Motor {f.motor.kill ? "em KILL" : f.motor.ligado ? "ligado" : "desligado"} · live {f.motor.liveDesbloqueado ? "desbloqueado" : "bloqueado"} · VPS {f.motor.escritaNoProcesso ? "a escrever" : "em sombra"}. Kill-switch e modo por conta: «Motor das mestres» na lista de estratégias.</p>
              </div>
            )}
          </Elo>

          <Elo n={3} titulo="Rotas" estado={<span className="font-mono text-[11px] text-zinc-400">{f.rotas.filter((r) => r.efectivo === "live").length} live · {f.rotas.filter((r) => r.efectivo === "sombra").length} sombra · {f.rotas.filter((r) => r.pausadaMotivo).length} pausada(s)</span>}>
            {f.rotasProvider.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] p-2">
                <span className="text-[10.5px] uppercase tracking-wider text-zinc-500">Rota provider</span>
                {f.rotasProvider.map((rp) => (
                  <span key={rp.routeId} className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-zinc-400">{rp.label}</span>
                    <Interruptor ligado={rp.copia} rotulo="cópia" disabled={!f.pode.rota_provider || ocupado != null} onClick={() => alternarRotaProvider(rp.routeId, "copia", !rp.copia)} />
                  </span>
                ))}
              </div>
            )}
            {f.rotas.length === 0 ? <Vazio>Nenhuma rota — ninguém recebe esta estratégia pelo motor.</Vazio> : (
              <Tabela min={860}>
                <thead><tr><th className={th}>Destino</th><th className={th}>Tipo</th><th className={th}>Agora</th><th className={th}>Estado</th><th className={th}>Lote</th><th className={th}>Abertas</th><th className={th}>Último evento</th><th className={th}>Direito</th><th className={th} /></tr></thead>
                <tbody>
                  {f.rotas.map((r) => (
                    <tr key={r.id}>
                      <td className={td}><button type="button" className="text-left hover:text-[#E9C46A]" onClick={() => ctx.abrir({ tipo: "conta", id: r.ref })}><span className="block text-zinc-100">{r.quem}</span><span className="block text-[10.5px] text-zinc-500">{r.email ?? r.ref}</span></button></td>
                      <td className={td}>{r.tipo === "t2t" ? "T2T" : r.tipo}</td>
                      <td className={td}><Pilula tom={TOM_MODO(r.efectivo)} title={r.motivo}>{r.efectivo}</Pilula></td>
                      <td className={`${td} text-[11px]`}>{r.pausadaMotivo ? <span className="text-amber-300">pausada · {r.pausadaMotivo}</span> : r.activa ? r.estado || "activa" : "inactiva"}</td>
                      <td className={`${td} font-mono text-[11px]`}>{r.lote}</td>
                      <td className={`${td} font-mono tabular-nums`}>{r.abertas}</td>
                      <td className={`${td} font-mono text-[11px]`}>{r.ultimoEvento ? `há ${fmtIdade(idadeDe(r.ultimoEvento))}` : "—"}</td>
                      <td className={td}>{r.temDireito == null ? <span className="text-zinc-600">?</span> : <Pilula tom={r.temDireito ? "ok" : "grave"}>{r.temDireito ? "sim" : "sem direito"}</Pilula>}</td>
                      <td className={td}>
                        {r.tipo !== "t2t" && /^(site|auto|wt|funded):/.test(r.ref) && (
                          <Botao tom={r.pausadaMotivo ? "ouro" : "perigo"} disabled={!f.pode.subscritor || ocupado != null} onClick={() => alternarSubscritor(r.ref, r.email ?? r.quem, Boolean(r.pausadaMotivo))}>{r.pausadaMotivo ? "Religar" : "Desligar"}</Botao>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Elo>

          <Elo n={4} titulo="Subscritores" estado={<span className="font-mono text-[11px] text-zinc-400">{f.subscritores.mtmauto.filter((s) => s.ativo).length} MTM Auto · {f.subscritores.funded.length} Funded · {t2tRotas.length} T2T</span>}>
            <div className="space-y-3">
              <Bloco titulo={`MTM Auto (${f.subscritores.mtmauto.length})`}>
                {f.subscritores.mtmauto.length === 0 ? <Vazio>Ninguém subscreve na MTM Auto.</Vazio> : (
                  <Tabela min={760}>
                    <thead><tr><th className={th}>Quem</th><th className={th}>Conta</th><th className={th}>Estado</th><th className={th}>Auto-aceitar</th><th className={th}>Lote</th><th className={th}>Rota</th><th className={th}>Direito</th><th className={th} /></tr></thead>
                    <tbody>
                      {f.subscritores.mtmauto.map((s) => (
                        <tr key={s.id}>
                          <td className={td}><button type="button" className="hover:text-[#E9C46A]" onClick={() => ctx.abrir({ tipo: "utilizador", id: s.userId })}>{s.email ?? s.userId.slice(0, 8)}</button></td>
                          <td className={`${td} font-mono text-[11px]`}>{s.contaId ? s.contaId.slice(0, 8) : "—"}</td>
                          <td className={td}><Pilula tom={s.ativo ? "ok" : "neutro"}>{s.ativo ? "activa" : "inactiva"}</Pilula></td>
                          <td className={td}>{s.autoAceitar ? "sim" : "não"}</td>
                          <td className={`${td} font-mono text-[11px]`}>{s.lote}</td>
                          <td className={td}>{s.temRota ? <span className="text-emerald-300">sim</span> : s.ativo ? <span className="text-amber-300">sem rota</span> : <span className="text-zinc-600">—</span>}</td>
                          <td className={td}>{s.temDireito == null ? "?" : <Pilula tom={s.temDireito ? "ok" : "grave"}>{s.temDireito ? "sim" : "não"}</Pilula>}</td>
                          <td className={td}>{s.contaId && <Botao tom={s.ativo ? "perigo" : "ouro"} disabled={!f.pode.subscritor || ocupado != null} onClick={() => alternarSubscritor(`auto:${s.contaId}`, s.email ?? s.userId, !s.ativo)}>{s.ativo ? "Desligar" : "Ligar"}</Botao>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                )}
              </Bloco>
              <Bloco titulo={`Contas MTM Funded que seguem (${f.subscritores.funded.length})`}>
                {f.subscritores.funded.length === 0 ? <Vazio>Nenhuma conta MTM Funded segue esta estratégia.</Vazio> : (
                  <div className="flex flex-wrap gap-1.5">
                    {f.subscritores.funded.map((c) => (
                      <button key={c.id} type="button" onClick={() => ctx.abrir({ tipo: "conta", id: `funded:${c.id}` })} className="rounded-md border border-white/[0.08] px-2 py-1 text-left text-[11px] transition-colors hover:border-[#D2A63C]/40">
                        <span className="font-mono text-zinc-200">{c.login ?? c.id.slice(0, 8)}</span> <span className="text-zinc-500">{c.email ?? ""} · {c.estado ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Bloco>
              <Bloco titulo={`Ligações T2T que recebem o canal ${f.fonte.canalChat} (${t2tRotas.length})`}>
                {f.rotasProvider.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {f.rotasProvider.map((rp) => <Interruptor key={rp.routeId} ligado={rp.t2t} rotulo={`Tap to Trade · ${rp.label}`} disabled={!f.pode.rota_provider || ocupado != null} onClick={() => alternarRotaProvider(rp.routeId, "t2t", !rp.t2t)} />)}
                  </div>
                )}
                {t2tRotas.length === 0 ? <Vazio>Nenhuma ligação T2T recebe esta estratégia pela mestre.</Vazio> : (
                  <ul className="space-y-1">
                    {t2tRotas.map((r) => <li key={r.id} className="text-[11.5px] text-zinc-300">{r.email ?? r.quem} <span className="text-zinc-500">· {r.efectivo}{r.pausadaMotivo ? ` · pausada (${r.pausadaMotivo})` : ""}{r.ultimoEvento ? ` · último evento há ${fmtIdade(idadeDe(r.ultimoEvento))}` : ""}</span></li>)}
                  </ul>
                )}
              </Bloco>
            </div>
          </Elo>
        </ol>

        {/* A mesma coluna do quadro de cópias — o retrato rápido, igual nos dois sítios. */}
        <aside className="space-y-2 xl:sticky xl:top-4 xl:self-start">
          <p className="px-1 text-[10.5px] uppercase tracking-wider text-zinc-500">No quadro de cópias</p>
          {f.no ? <ColunaCadeia n={f.no} /> : <Vazio>Fora da cadeia.</Vazio>}
        </aside>
      </div>

      {/* ── 3. GESTÃO: o que a estratégia faz às posições ── */}
      <section className="space-y-3">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Gestão</h3>
        {!f.pode.opcoes
          ? <Aviso tom="info">Só leitura: esta estratégia não é da tua equipa.</Aviso>
          : <OpcoesEstrategia providerId={f.id} versao={ctx.versao} aoGravar={() => { ctx.depoisDeAcao(); void recarregar() }} />}
        <SaidasParciais f={f} ocupado={ocupado != null} aoGravar={(saidas) => void escrever("saidas", { accao: "saidas", saidas_pct: saidas })} />
        <Espelho f={f} ocupado={ocupado != null} escrever={escrever} />
        <p className="text-[10.5px] text-zinc-500">Lotes por cliente e travas da mestre (janela, fim de semana, drawdown do dia) editam-se no quadro de cópias — <button type="button" className="text-[#D2A63C] hover:underline" onClick={() => ctx.irPara("copia", { estrategia: f.slug })}>abrir filtrado a esta estratégia</button>.</p>
      </section>

      {/* ── 4. DETALHE ── */}
      <Recolhivel titulo="Detalhe técnico" descricao="Ids e o que vem da base, para conferir.">
        <dl className="grid grid-cols-1 gap-1 font-mono text-[11px] text-zinc-400 sm:grid-cols-2">
          <div>provider: {f.id}</div>
          <div>conta mestre: {f.mestre?.conta?.id ?? "—"}</div>
          <div>espelho: {f.espelho.contaId ?? "—"}</div>
          <div>executor: {f.mestre?.executorNota ?? "—"}</div>
        </dl>
        <a href={`${process.env.NEXT_PUBLIC_MTM_AUTO_BASE_URL || "https://mtm-auto.vercel.app"}/definicoes/admin`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-[#D2A63C]">Admin da MTM Auto (equipas, cupões, pagamentos) <ExternalLink className="h-3 w-3" /></a>
      </Recolhivel>
    </div>
  )
}

function BotaoVoltar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-[#D2A63C]/40 hover:text-white">
      <ArrowLeft className="h-3 w-3" /> Estratégias
    </button>
  )
}

/** Um elo da cadeia: número, título, estado à direita, e o conteúdo com o seu interruptor. */
function Elo({ n, titulo, estado, children }: { n: number; titulo: string; estado?: ReactNode; children: ReactNode }) {
  return (
    <li className="relative list-none rounded-2xl border border-white/[0.06] bg-zinc-950/70 pl-11 pr-4 pb-4 pt-3">
      <span aria-hidden className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-md bg-[#D2A63C]/15 font-mono text-[12px] font-semibold text-[#D2A63C] ring-1 ring-[#D2A63C]/30">{n}</span>
      <span aria-hidden className="absolute bottom-0 left-[1.45rem] top-10 w-px bg-gradient-to-b from-[#D2A63C]/25 to-transparent" />
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-zinc-100">{titulo}</h3>
        {estado}
      </header>
      {children}
    </li>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</dt>
      <dd className="truncate text-zinc-200">{children}</dd>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] uppercase tracking-wider text-zinc-500">{titulo}</p>
      {children}
    </div>
  )
}

function Interruptor({ ligado, rotulo, onClick, disabled }: { ligado: boolean; rotulo: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition-colors duration-200 hover:border-[#D2A63C]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`relative h-3.5 w-6 rounded-full transition-colors duration-200 ${ligado ? "bg-[#D2A63C]" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-black transition-transform duration-200 ${ligado ? "translate-x-3" : "translate-x-0.5"}`} />
      </span>
      {rotulo}
    </button>
  )
}

/** Saídas parciais (`saidas_pct`) — só se escreviam na MTM Auto; agora também aqui, pela mesma linha. */
function SaidasParciais({ f, ocupado, aoGravar }: { f: FichaEstrategia; ocupado: boolean; aoGravar: (s: number[] | null) => void }) {
  const inicial = (f.saidasPct ?? []).join(", ")
  const [texto, setTexto] = useState(inicial)
  const valores = texto.trim() ? texto.split(/[,;\s]+/).filter(Boolean).map(Number) : []
  const invalido = valores.some((v) => !Number.isFinite(v) || v <= 0 || v > 100) || valores.reduce((a, v) => a + v, 0) > 100
  return (
    <div className="rounded-xl border border-white/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Saídas parciais (% por TP)</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!f.pode.saidas || f.apagada} placeholder="ex.: 50, 30, 20" aria-label="Saídas parciais em percentagem"
          className="w-48 rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11.5px] text-zinc-100 outline-none focus:border-[#D2A63C] disabled:opacity-40" />
        <Botao tom="ouro" disabled={!f.pode.saidas || ocupado || invalido || texto === inicial} onClick={() => { if (pedirPalavra(`Saídas parciais de ${f.nome}: ${valores.length ? valores.join(" / ") + " %" : "sem parciais"}.`, "CONFIRMAR")) aoGravar(valores.length ? valores : null) }}>Gravar</Botao>
        {invalido && <span className="text-[10.5px] text-rose-300">Cada saída entre 0 e 100 e a soma até 100.</span>}
      </div>
    </div>
  )
}

/** Fonte de execução (mestre/espelho) e o espelho provider — tudo o que era do relatório antigo. */
function Espelho({ f, ocupado, escrever }: { f: FichaEstrategia; ocupado: boolean; escrever: (k: string, c: Record<string, unknown>) => Promise<void> }) {
  const cfg = f.espelho.config as { seguirFechos?: string; seguirParciais?: boolean; copiarNiveisIniciais?: boolean }
  return (
    <div className="rounded-xl border border-white/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Espelho provider (caminho antigo)</p>
      {!f.espelho.contaId ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sem conta espelho.</span>
          {f.pode.espelho && !f.mestre && <Botao disabled={ocupado} onClick={() => { if (pedirPalavra(`Criar uma conta SIM da casa como espelho de ${f.nome}.`, "CONFIRMAR")) void escrever("espelho:criar", { accao: "espelho", sub: "criar_conta" }) }}>Criar conta espelho</Botao>}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-zinc-300">{f.espelho.contaId.slice(0, 8)}</span>
          <Interruptor ligado={f.espelho.ativo} rotulo="espelho ligado" disabled={!f.pode.espelho || ocupado} onClick={() => { if (pedirPalavra(`${f.espelho.ativo ? "Desligar" : "Ligar"} o espelho de ${f.nome}.`, "CONFIRMAR")) void escrever("espelho:ligar", { accao: "espelho", sub: "ligar", ativo: !f.espelho.ativo }) }} />
          <label className="inline-flex items-center gap-1 text-[11px] text-zinc-400">fechos
            <select value={cfg.seguirFechos ?? "humanos"} disabled={!f.pode.espelho || ocupado} onChange={(e) => void escrever("espelho:config", { accao: "espelho", sub: "config", config: { ...cfg, seguirFechos: e.target.value } })} className="rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[11px]">
              <option value="humanos">humanos</option><option value="todos">todos</option><option value="nenhum">nenhum</option>
            </select>
          </label>
          <Interruptor ligado={cfg.seguirParciais === true} rotulo="parciais" disabled={!f.pode.espelho || ocupado} onClick={() => void escrever("espelho:config", { accao: "espelho", sub: "config", config: { ...cfg, seguirParciais: !cfg.seguirParciais } })} />
        </div>
      )}
      {!f.mestre && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[10.5px] text-zinc-500">Fonte de execução:</span>
          <Botao disabled={!f.pode.fonte || ocupado} onClick={() => { if (pedirPalavra(`Fonte de execução de ${f.nome} → mestre.`, "CONFIRMAR")) void escrever("fonte", { accao: "fonte", fonte: "mestre" }) }}>Usar mestre</Botao>
          <Botao disabled={!f.pode.fonte || ocupado || !f.espelho.contaId} onClick={() => { if (pedirPalavra(`Fonte de execução de ${f.nome} → espelho (a base recusa sem veredicto alinhado).`, "CONFIRMAR")) void escrever("fonte", { accao: "fonte", fonte: "espelho" }) }}>Usar espelho</Botao>
        </div>
      )}
    </div>
  )
}
