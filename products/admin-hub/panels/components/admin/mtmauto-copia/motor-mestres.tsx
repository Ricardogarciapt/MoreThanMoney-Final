"use client"

import { useState } from "react"
import { ChevronDown, Loader2, OctagonX, Power } from "lucide-react"
import type { PainelMestresLido } from "@/lib/mestres/servidor/painel-leitura"
import { NOME_CAMPO, palavraDeConfirmacao, type CampoModo, type EstrategiaPainel, type PedidoMestres } from "@/lib/mestres/painel"
import type { ModoEstrategia } from "@/lib/mestres/tipos"
import { Aviso, BotaoRecarregar, Cartao, Etiqueta, Tabela, confirmarEscrita, ms, pedirAdmin, quando, td, th, useDadosAdmin } from "./comum"

/**
 * MOTOR DAS MESTRES (116) — o topo da tab Estratégias de /admin/mtmauto-copia.
 *
 * Por estratégia: quem executa hoje (motor / CopyFactory / legado), os três modos (propagação, sinal,
 * T2T), a conta-mestre SIM, rotas e contas em live, corte da CopyFactory, últimas ordens e alertas.
 * Controlos: modo por estratégia, modo por conta, kill-switch — todos com palavra de confirmação e
 * verificados no servidor (soAdmin + guardas + trigger da base).
 */

const TOM_MODO: Record<string, "ok" | "aviso" | "grave" | "neutro" | "info"> = { live: "grave", sombra: "info", desligado: "neutro", parado: "neutro" }
const TOM_EXEC = { motor: "ouro", copyfactory: "aviso", legado: "neutro" } as const
const NOME_EXEC = { motor: "Motor das mestres", copyfactory: "CopyFactory", legado: "Legado" } as const
const TOM_ORDEM: Record<string, "ok" | "aviso" | "grave" | "neutro" | "info"> = { ok: "ok", sombra: "info", erro: "grave", recusado: "aviso", bloqueado: "aviso", saltado: "neutro", enviando: "aviso" }

export default function MotorMestres() {
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<PainelMestresLido>("/api/admin/mtmauto-copia/mestres")
  const [aberta, setAberta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const enviar = async (p: PedidoMestres, texto: string, id: string) => {
    const palavra = palavraDeConfirmacao(p)
    let confirmacao: string | undefined
    if (palavra) {
      const ok = confirmarEscrita(texto, palavra)
      if (!ok) return
      confirmacao = ok
    }
    setOcupado(id)
    const r = await pedirAdmin<{ message?: string }>("/api/admin/mtmauto-copia/mestres", { method: "POST", body: { ...p, ...(confirmacao ? { confirmacao } : {}) } })
    setOcupado(null)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    void recarregar()
  }

  if (erro && !dados) return <Aviso tom="grave">Motor das mestres: {erro}</Aviso>
  if (!dados) return <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A ler o motor das mestres…</div>
  if (dados.pendente) return <Aviso tom="info">Motor das mestres: migração 116 por aplicar.</Aviso>

  const g = dados.global
  const t = dados.totais
  const alertasPorVer = dados.estrategias.flatMap((e) => e.alertas).filter((a) => !a.visto_em)

  const mudarModo = (e: EstrategiaPainel, campo: CampoModo, valor: ModoEstrategia) => {
    const atual = campo === "modo" ? e.modo : campo === "sinal_modo" ? e.sinalModo : e.t2tModo
    if (atual === valor) return
    const contasLive = e.rotas.filter((r) => r.contaModo === "live").map((r) => r.etiqueta ?? r.descricao ?? r.contaChave)
    const texto = valor === "live"
      ? campo === "modo"
        ? `Passar ${e.nome} a LIVE na propagação.\nO motor envia ORDENS REAIS da mestre SIM para as contas em live: ${contasLive.join(", ") || "nenhuma ainda (continuam em sombra até passares a conta)"}.\nA base recusa se a CopyFactory não estiver cortada ou o MTM Auto ainda executar esta estratégia.`
        : campo === "sinal_modo"
          ? `Passar o SINAL de ${e.nome} a LIVE: cada sinal abre na mestre SIM ${e.contaMestre?.login ?? ""} e o caminho antigo cala-se (a mestre passa a ser a fonte de verdade do chat/Telegram onde publica).`
          : `Passar o Tap to Trade de ${e.nome} a LIVE: os aceites do chat executam pelo motor nas contas dos clientes.`
      : atual === "live"
        ? `Tirar ${e.nome} de LIVE (${NOME_CAMPO[campo]} → ${valor}).\nAs posições JÁ abertas em live continuam a ser geridas até fechar; as novas deixam de ir para os clientes${valor === "desligado" ? " e o motor deixa de registar o que faria" : ""}.`
        : `${NOME_CAMPO[campo]} de ${e.nome}: ${atual} → ${valor}.`
    void enviar({ tipo: "estrategia", slug: e.slug, campo, valor }, texto, `${e.slug}:${campo}`)
  }

  const mudarConta = (contaChave: string, nome: string, valor: "sombra" | "live") => {
    const c = dados.contas.find((x) => x.contaChave === contaChave)
    const ests = (c?.estrategias ?? []).map((x) => x.slug).join(", ") || "—"
    const texto = valor === "live"
      ? `Passar a conta ${nome} a LIVE.\nPassa a receber ORDENS REAIS de todas as estratégias em live em que está: ${ests}.`
      : `Passar a conta ${nome} a sombra. Vale para todas as estratégias (${ests}); as posições já abertas em live continuam geridas até fechar.`
    void enviar({ tipo: "conta", contaChave, valor }, texto, `conta:${contaChave}`)
  }

  const kill = (valor: boolean) => void enviar(
    { tipo: "kill", valor },
    valor
      ? "KILL-SWITCH: o motor das mestres pára TUDO em ≤ 2 s — nem entradas nem SAÍDAS. As posições abertas nos clientes ficam só com o SL/TP da corretora."
      : "Levantar o kill-switch: o motor retoma. As aberturas atrasadas são recusadas; as saídas que ficaram na fila seguem.",
    "kill",
  )

  return (
    <section className="space-y-3 rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-sm font-semibold text-zinc-100">Motor das mestres</h3>
        <Etiqueta tom={g.estado === "kill" ? "grave" : g.estado === "live" ? "ok" : g.estado === "sem-pulso" ? "grave" : g.estado === "sombra" ? "info" : "neutro"}>
          {g.estado === "kill" ? "KILL accionado" : g.estado === "live" ? "a enviar em live" : g.estado === "sem-pulso" ? "serviço sem batimento" : g.estado === "sombra" ? "só sombra" : "desligado"}
        </Etiqueta>
        <Etiqueta tom={g.ligado ? "ok" : "neutro"}>motor {g.ligado ? "ligado" : "desligado"}</Etiqueta>
        <Etiqueta tom={g.liveDesbloqueado ? "aviso" : "neutro"}>live {g.liveDesbloqueado ? "desbloqueado" : "bloqueado"}</Etiqueta>
        <Etiqueta tom={g.escritaVps ? "aviso" : "neutro"} title="MESTRES_ESCRITA no processo do VPS (lido do batimento)">escrita VPS {g.escritaVps == null ? "?" : g.escritaVps ? "sim" : "não"}</Etiqueta>
        <Etiqueta tom={g.pulsoVivo ? "ok" : "grave"}>batimento {g.pulsoIdadeS == null ? "nunca" : `há ${g.pulsoIdadeS}s`}</Etiqueta>
        <div className="ml-auto flex items-center gap-2">
          {g.kill ? (
            <button type="button" disabled={ocupado === "kill"} onClick={() => kill(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">
              <Power className="h-3.5 w-3.5" /> Levantar kill
            </button>
          ) : (
            <button type="button" disabled={ocupado === "kill"} onClick={() => kill(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40">
              <OctagonX className="h-3.5 w-3.5" /> Kill-switch
            </button>
          )}
          <BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} />
        </div>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        As mestres são contas SIM da casa; o motor (VPS mtm-copia-contas) envia de cada mestre directamente para as contas dos clientes. Uma ordem só sai em live com: motor ligado, sem kill, live desbloqueado, MESTRES_ESCRITA=1, estratégia em live, conta em live e a CopyFactory da estratégia cortada. Ligar o motor e desbloquear o live fazem-se na base, não aqui.
      </p>
      {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}
      {dados.avisos.length > 0 && <Aviso>Leituras parciais: {dados.avisos.join(" · ")}</Aviso>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Cartao titulo="Estratégias em live" valor={`${t.estrategiasLive}/${t.estrategias}`} nota={`${t.estrategiasSombra} em sombra`} />
        <Cartao titulo="Contas em live" valor={t.contasLive} nota={`${dados.contas.length} no motor`} tom={t.contasLive ? "aviso" : undefined} />
        <Cartao titulo="Rotas em live" valor={`${t.rotasLive}/${t.rotas}`} nota="efectivas (todas as fechaduras)" />
        <Cartao titulo="Posições live abertas" valor={t.abertasLive} nota="cópias do motor nos clientes" />
        <Cartao titulo="Ordens 24 h" valor={t.ordens24h.total} nota={`${t.ordens24h.ok} ok · ${t.ordens24h.sombra} sombra · ${t.ordens24h.erro} erro`} tom={t.ordens24h.erro ? "aviso" : undefined} />
        <Cartao titulo="Latência p95" valor={ms(t.ordens24h.latP95Ms)} nota={`p50 ${ms(t.ordens24h.latP50Ms)} · facto → corretora`} />
        <Cartao titulo="Alertas" valor={t.alertasNovos} nota={`${t.alertas24h} nas últimas 24 h`} tom={t.alertasNovos ? "aviso" : undefined} />
      </div>

      {dados.alertas.length > 0 && (
        <div className="space-y-1">
          {dados.alertas.map((a) => <Aviso key={a.id} tom={a.severidade === "grave" ? "grave" : a.severidade === "info" ? "info" : "aviso"}><b>{a.titulo}</b> — {a.detalhe}</Aviso>)}
        </div>
      )}
      {alertasPorVer.length > 0 && (
        <button type="button" disabled={ocupado === "alertas"} onClick={() => void enviar({ tipo: "alertas_vistos", ids: alertasPorVer.map((a) => a.id) }, "", "alertas")} className="rounded-lg border border-zinc-700 px-3 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">
          Marcar {alertasPorVer.length} alerta(s) como vistos
        </button>
      )}

      <div className="space-y-2">
        {dados.estrategias.map((e) => {
          const abertaAgora = aberta === e.slug
          return (
            <div key={e.slug} className={`rounded-xl border ${e.avisos.length ? "border-amber-500/30" : "border-zinc-800"} bg-zinc-950/40`}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => setAberta(abertaAgora ? null : e.slug)} className="flex items-center gap-2 text-left">
                  <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${abertaAgora ? "rotate-180" : ""}`} />
                  <span className="text-sm font-semibold text-zinc-100">{e.nome}</span>
                </button>
                <Etiqueta tom={TOM_EXEC[e.executor]} title={e.executorNota}>executa: {NOME_EXEC[e.executor]}</Etiqueta>
                <Etiqueta tom="ouro" title={`conta SIM ${e.contaMestre?.id ?? "—"}`}>
                  {e.rotuloMestre} · {e.contaMestre?.login ?? "?"}{e.contaMestre?.etiqueta ? ` «${e.contaMestre.etiqueta}»` : ""}
                </Etiqueta>
                {e.cf.ids.length > 0 && <Etiqueta tom={e.cf.cortado ? "ok" : "aviso"} title={e.cf.cortadoEm ? `cortada ${quando(e.cf.cortadoEm)}` : "scripts/mestres/cortar-copyfactory.ts"}>CopyFactory {e.cf.ids.join(",")} {e.cf.cortado ? "cortada" : "por cortar"}</Etiqueta>}
                {e.mtmauto.incluir && <Etiqueta tom={e.mtmauto.cortadoEm ? "ok" : "neutro"}>MTM Auto {e.mtmauto.cortadoEm ? "cortado" : "ainda executa"}</Etiqueta>}
                {e.espelhoProviderAtivo && <Etiqueta tom={e.sinalModo === "live" ? "grave" : "neutro"} title="espelho provider antigo (082): copia a conta MetaApi do provider para a mestre SIM">espelho provider ligado</Etiqueta>}
                <span className="ml-auto text-[11px] text-zinc-500">
                  {e.nRotasLive}/{e.nRotas} rotas live · {e.nContasLive} conta(s) live · {e.abertasLive} aberta(s) · ordens 24 h {e.ordens24h.total}{e.ordens24h.erro ? ` (${e.ordens24h.erro} erro)` : ""}
                </span>
              </div>

              <div className="grid gap-2 border-t border-zinc-800/60 px-4 py-3 md:grid-cols-3">
                {(["modo", "sinal_modo", "t2t_modo"] as CampoModo[]).map((campo) => {
                  const atual = campo === "modo" ? e.modo : campo === "sinal_modo" ? e.sinalModo : e.t2tModo
                  const bloq = e.bloqueioLive[campo]
                  return (
                    <div key={campo}>
                      <p className="mb-1 text-[11px] text-zinc-500">{NOME_CAMPO[campo]}</p>
                      <div className="flex gap-1">
                        {(["desligado", "sombra", "live"] as ModoEstrategia[]).map((m) => {
                          const activo = atual === m
                          const recusado = m === "live" && !activo && Boolean(bloq)
                          return (
                            <button
                              key={m} type="button"
                              disabled={ocupado === `${e.slug}:${campo}` || activo || recusado}
                              title={recusado ? `A base recusa: ${bloq}` : undefined}
                              onClick={() => mudarModo(e, campo, m)}
                              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${activo
                                ? m === "live" ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40" : m === "sombra" ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30" : "bg-zinc-700/50 text-zinc-200 ring-1 ring-zinc-600"
                                : recusado ? "cursor-not-allowed bg-zinc-900 text-zinc-700" : "bg-zinc-900 text-zinc-500 hover:text-white"}`}
                            >
                              {m}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              {e.avisos.length > 0 && <div className="space-y-1 px-4 pb-3">{e.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}</div>}

              {abertaAgora && (
                <div className="space-y-3 border-t border-zinc-800 p-3">
                  <p className="text-[11px] text-zinc-500">
                    {e.executorNota}. Mestre SIM {e.contaMestre?.login ?? "—"} ({e.contaMestre?.estado ?? "?"}) · saldo {e.contaMestre?.saldo ?? "—"} · equity {e.contaMestre?.equity ?? "—"}.
                    {" "}Último sinal: {e.ultimoSinal ? `${e.ultimoSinal.symbol ?? ""} ${e.ultimoSinal.direcao ?? ""} (${e.ultimoSinal.modo}) ${quando(e.ultimoSinal.criado_em)}` : "nenhum nas últimas 24 h"}.
                  </p>
                  <Tabela>
                    <thead><tr><th className={th}>Conta</th><th className={th}>Rota</th><th className={th}>Conta no motor</th><th className={th}>Efectivo</th><th className={th}>Abertas live</th></tr></thead>
                    <tbody>
                      {e.rotas.length === 0 && <tr><td className={td} colSpan={5}>Sem rotas (scripts/mestres/sincronizar-rotas.ts).</td></tr>}
                      {e.rotas.map((r) => {
                        const nome = r.etiqueta ?? r.descricao ?? r.contaChave
                        return (
                          <tr key={r.id}>
                            <td className={td}>
                              {r.etiqueta && <span className="block text-[#E9C46A]">«{r.etiqueta}»</span>}
                              <span className="block">{r.descricao ?? r.destinoRef}</span>
                              <span className="block font-mono text-[10px] text-zinc-600">{r.contaChave}</span>
                            </td>
                            <td className={td}><Etiqueta>{r.tipo}</Etiqueta></td>
                            <td className={td}>
                              <div className="flex items-center gap-1">
                                <Etiqueta tom={TOM_MODO[r.contaModo]}>{r.contaModo}</Etiqueta>
                                <button type="button" disabled={ocupado === `conta:${r.contaChave}`} onClick={() => mudarConta(r.contaChave, nome, r.contaModo === "live" ? "sombra" : "live")} className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800">
                                  → {r.contaModo === "live" ? "sombra" : "live"}
                                </button>
                              </div>
                            </td>
                            <td className={td}><Etiqueta tom={TOM_MODO[r.efectivo]} title={r.motivo}>{r.efectivo}</Etiqueta><span className="mt-0.5 block text-[10px] text-zinc-500">{r.motivo}</span></td>
                            <td className={`${td} tabular-nums`}>{r.abertasLive}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </Tabela>
                  <Tabela>
                    <thead><tr><th className={th}>Quando</th><th className={th}>Conta</th><th className={th}>Tipo</th><th className={th}>Modo</th><th className={th}>Estado</th><th className={th}>Latência</th><th className={th}>Erro</th></tr></thead>
                    <tbody>
                      {e.ultimasOrdens.length === 0 && <tr><td className={td} colSpan={7}>Sem ordens nas últimas 24 h.</td></tr>}
                      {e.ultimasOrdens.map((o) => (
                        <tr key={String(o.id)}>
                          <td className={`${td} whitespace-nowrap`}>{quando(o.criado_em)}</td>
                          <td className={`${td} font-mono text-[10.5px]`}>{o.conta_chave ?? "—"}</td>
                          <td className={td}>{o.tipo}</td>
                          <td className={td}><Etiqueta tom={TOM_MODO[o.modo] ?? "neutro"}>{o.modo}</Etiqueta></td>
                          <td className={td}><Etiqueta tom={TOM_ORDEM[o.estado] ?? "neutro"}>{o.estado}</Etiqueta></td>
                          <td className={`${td} tabular-nums`}>{ms(o.latencia_total_ms)}{o.latencia_corretora_ms != null ? ` (corretora ${ms(o.latencia_corretora_ms)})` : ""}</td>
                          <td className={`${td} max-w-[260px] truncate text-rose-300`} title={o.erro ?? ""}>{o.erro ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                  {e.alertas.length > 0 && (
                    <div className="space-y-1">
                      {e.alertas.map((a) => <p key={String(a.id)} className={`text-[11px] ${a.visto_em ? "text-zinc-500" : "text-amber-300"}`}>{quando(a.criado_em)} · {a.tipo} · {a.mensagem}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <details className="rounded-xl border border-zinc-800">
        <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-zinc-300">Contas no motor ({dados.contas.length}) — modo por conta, falhas e limites</summary>
        <div className="p-3">
          <Tabela>
            <thead><tr><th className={th}>Conta</th><th className={th}>Dono</th><th className={th}>Estratégias</th><th className={th}>Modo</th><th className={th}>Falhas</th><th className={th}>Limites</th></tr></thead>
            <tbody>
              {dados.contas.map((c) => {
                const nome = c.etiqueta ?? c.descricao ?? c.contaChave
                return (
                  <tr key={c.contaChave}>
                    <td className={td}>
                      {c.etiqueta && <span className="block text-[#E9C46A]">«{c.etiqueta}»</span>}
                      <span className="block">{c.descricao ?? c.contaRef}</span>
                      <span className="block font-mono text-[10px] text-zinc-600">{c.contaChave}</span>
                    </td>
                    <td className={td}>{c.email ?? "—"}</td>
                    <td className={td}>{c.estrategias.map((x) => <span key={`${x.slug}:${x.tipo}`} className="mr-1 inline-block"><Etiqueta tom={TOM_MODO[x.efectivo]}>{x.slug}{x.tipo !== "estrategia" ? ` (${x.tipo})` : ""}: {x.efectivo}</Etiqueta></span>)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-1">
                        <Etiqueta tom={TOM_MODO[c.modo]}>{c.modo}</Etiqueta>
                        <button type="button" disabled={ocupado === `conta:${c.contaChave}`} onClick={() => mudarConta(c.contaChave, nome, c.modo === "live" ? "sombra" : "live")} className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800">
                          → {c.modo === "live" ? "sombra" : "live"}
                        </button>
                      </div>
                    </td>
                    <td className={td}>
                      {c.bloqueada ? <Etiqueta tom="grave">bloqueada</Etiqueta> : c.falhasSeguidas ? <Etiqueta tom="aviso">{c.falhasSeguidas} seguidas</Etiqueta> : <span className="text-zinc-600">0</span>}
                      {c.ultimaFalha && <span className="mt-0.5 block max-w-[220px] truncate text-[10px] text-zinc-500" title={c.ultimaFalha}>{quando(c.ultimaFalhaEm)} · {c.ultimaFalha}</span>}
                    </td>
                    <td className={`${td} text-[10.5px] text-zinc-400`}>
                      máx {c.limites.maxPosicoes} pos · {c.limites.maxRiscoTotalPct}% risco{c.limites.maxLoteTotal != null ? ` · ${c.limites.maxLoteTotal} lotes` : ""}{c.limites.loteFixoForcado != null ? ` · lote fixo ${c.limites.loteFixoForcado}` : ""}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        </div>
      </details>
    </section>
  )
}
