"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, Settings2, TrendingUp } from "lucide-react"

/**
 * O que seguir — igual ao ecrã de Estratégias da app MTM Auto.
 *
 * Substitui os "chips" de fontes que estavam aqui antes. Aqueles eram uma segunda configuração,
 * ao lado da que já existia na MTM Auto, e duas telas a decidir a mesma coisa acabam sempre por
 * discordar — normalmente no dia em que um sinal não abre e ninguém percebe qual das duas mandou.
 *
 * Cada estratégia mostra o histórico REAL dela, calculado no MTM Auto a partir dos sinais deste
 * produto. Seguir aqui é seguir lá: é a mesma subscrição, na mesma tabela.
 *
 * O que NÃO se faz aqui é ligar a cópia automática — a rota força `autoAceitar: false`. Seguir
 * é escolher o que se quer VER para aceitar à mão; a cópia automática é a parte paga.
 */
type Provedor = {
  id: string
  nome: string
  descricao: string | null
  segue: boolean
  automatico?: boolean
  sinais?: number
  acerto?: number | null
  pips?: number | null
}

/** Estado dos controlos admin (GET/POST /api/admin/mtmcopy/t2t-controls). */
type AdminControls = {
  strategies: { routeId: string; label: string; copyEnabled: boolean; tapToTrade: boolean; hasAccount: boolean }[]
  extras: { channel: string; label: string; active: boolean }[]
}

/** Um interruptor que diz o estado pela COR: verde a seguir, vermelho a não seguir. */
/**
 * O retrato de uma estratégia: como correu, e quanto se arrisca nela.
 *
 * A lista dizia só "A seguir", e seguir uma fonte sem saber se ela ganha é uma escolha às cegas.
 * A roda dentada define o risco DAQUELA estratégia — as fontes não são iguais e um número único
 * fazia o risco certo para uma ser o errado para a outra.
 *
 * O motor (trailing stop, trailing profit, parciais na fonte) não se mexe aqui: é do provedor, é
 * igual para toda a gente que a segue, e administra-se no /admin.
 */
function ModalEstrategia({
  fonte,
  providerId,
  nome,
  aoFechar,
}: {
  /** Uma das duas: a fonte de sinais (T2T) ou a estratégia MTM Auto (que tem conta própria). */
  fonte?: string
  providerId?: string
  nome: string
  aoFechar: () => void
}) {
  const [d, setD] = useState<Record<string, unknown> | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ler = useCallback(async () => {
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      if (!tok) return
      const q = providerId ? `providerId=${encodeURIComponent(providerId)}` : `fonte=${encodeURIComponent(fonte ?? "")}`
      const r = await fetch(`/api/mtm-auto/estrategia?${q}&dias=90`, {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      if (j.ok) setD(j)
      else setErro(j.error ?? "Não deu para ler os números desta estratégia.")
    } catch {
      setErro("Não deu para ler os números desta estratégia.")
    }
  }, [fonte, providerId])

  useEffect(() => { ler() }, [ler])

  const gravar = async (contaId: string, corpo: Record<string, unknown>) => {
    setAGravar(true)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch("/api/mtm-auto/estrategia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ ...corpo, fonte, contaId }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.error ?? "Não deu para guardar.")
      else await ler()
    } finally {
      setAGravar(false)
    }
  }

  const desempenho = (d?.desempenho ?? {}) as Record<string, number | null>
  const contas = (d?.contas ?? []) as Record<string, unknown>[]
  const presets = (d?.presets ?? []) as Record<string, unknown>[]
  const alvos = ((d?.desempenho as { alvos?: { alvo: string; acertos: number }[] })?.alvos) ?? []
  const sinais = Number(desempenho.sinais ?? 0)

  const caixa = (t: string, valor: string, sub: string, cor: string) => (
    <div className="rounded-2xl border p-3" style={{ borderColor: "#23262F", background: "#12141A" }}>
      <p className="text-[10.5px] uppercase tracking-wider text-zinc-500">{t}</p>
      <p className="mt-1 text-[24px] font-bold tabular-nums" style={{ color: cor }}>{valor}</p>
      <p className="mt-0.5 text-[11.5px] text-zinc-500">{sub}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={aoFechar}>
      <div
        className="mt-auto max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t p-4"
        style={{ borderColor: "#23262F", background: "#0A0B0E", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[16px] font-bold text-white">{nome}</p>
          <button onClick={aoFechar} className="text-[13px] font-semibold text-[#D2A63C]">Fechar</button>
        </div>

        {!d && !erro && <p className="py-8 text-center text-[13px] text-zinc-500">A ler os números desta estratégia…</p>}

        {d && (
          <>
            {/* De quem são estes números: da conta que PRODUZ a estratégia, não da do cliente —
                essa está no separador Histórico. Quem abre isto quer saber se ELA ganha. */}
            <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">
              {(d.desempenho as { origem?: string }).origem === "provider"
                ? "A estratégia · últimos 90 dias"
                : "Os sinais desta fonte · últimos 90 dias"}
            </p>
            {(d.desempenho as { contaProvider?: string }).contaProvider && (
              <p className="mb-2 text-[11.5px] leading-snug text-zinc-500">
                Da conta que executa a {(d.desempenho as { contaProvider?: string }).contaProvider}. O teu
                resultado está no separador Histórico.
              </p>
            )}
            {/* A taxa de acerto e os pips só aparecem quando a medição os merece. Hoje o desfecho
                é calculado como se cada sinal fosse uma trade única, tudo-ou-nada: um sinal que
                chega ao primeiro alvo, tira parcial e depois volta ao stop com o resto conta como
                perda inteira. Quem o seguiu ficou com lucro; a tabela diz que perdeu. Mostrar isso
                era anunciar contra nós próprios um resultado que nem sequer é o real. */}
            {(d.desempenho as { medicaoFiavel?: boolean }).medicaoFiavel ? (
              <div className="grid grid-cols-2 gap-2">
                {caixa(
                  "Taxa de acerto",
                  desempenho.winrate != null ? `${desempenho.winrate}%` : "—",
                  `${desempenho.ganhos ?? 0}G / ${desempenho.perdas ?? 0}P`,
                  desempenho.winrate == null ? "#a1a1aa" : Number(desempenho.winrate) >= 50 ? "#28C878" : "#FF4D4D",
                )}
                {caixa("Trades", String(desempenho.fechados ?? 0), "fechadas no período", "#ffffff")}
                {caixa("Ganhos", String(desempenho.ganhos ?? 0), "trades ganhas", "#28C878")}
                {caixa("Perdas", String(desempenho.perdas ?? 0), "trades perdidas", "#FF4D4D")}
                {caixa("Break-even", String(desempenho.breakeven ?? 0), "saiu à entrada", "#D2A63C")}
                {/* Nunca o resultado em dinheiro: a conta é da casa, e o valor dizia ao cliente
                    o tamanho dela. O fator de lucro responde à mesma pergunta sem isso. */}
                {caixa(
                  "Fator de lucro",
                  desempenho.fatorLucro != null ? Number(desempenho.fatorLucro).toFixed(2) : "—",
                  "ganho por cada 1 perdido",
                  Number(desempenho.fatorLucro ?? 0) >= 1 ? "#28C878" : "#FF4D4D",
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {caixa("Sinais", String(sinais), "nos últimos 90 dias", "#ffffff")}
                  {caixa(
                    "Estiveram em lucro",
                    String(desempenho.esteveEmLucro ?? 0),
                    sinais > 0 ? `${Math.round(((desempenho.esteveEmLucro ?? 0) / sinais) * 100)}% dos sinais` : "—",
                    (desempenho.esteveEmLucro ?? 0) > 0 ? "#28C878" : "#a1a1aa",
                  )}
                </div>
                <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "rgba(210,166,60,0.85)" }}>
                  {(d.desempenho as { porqueNaoFiavel?: string }).porqueNaoFiavel}
                </p>
              </>
            )}

            {alvos.length > 0 && sinais > 0 && (
              <>
                <p className="mb-2 mt-4 text-[11px] uppercase tracking-wider text-zinc-500">Alvos atingidos</p>
                <div className="space-y-1.5">
                  {alvos.map((a) => (
                    <div key={a.alvo} className="flex items-center gap-3">
                      <span className="w-10 text-[13px] font-semibold text-white">{a.alvo}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full bg-[#28C878]"
                          style={{ width: `${Math.min(100, (a.acertos / sinais) * 100)}%` }}
                        />
                      </span>
                      <span className="w-9 text-right text-[13px] font-bold tabular-nums text-[#28C878]">{a.acertos}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {contas.length > 0 && fonte && (
              <>
                <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                  <Settings2 className="h-3.5 w-3.5" /> O teu risco nesta estratégia
                </p>
                {contas.map((c) => {
                  const proprio = Boolean(c.proprio)
                  const risco = proprio ? c.riscoPct : c.riscoDaConta
                  const teto = proprio ? c.riscoMaxPct : c.tetoDaConta
                  return (
                    <div key={String(c.id)} className="mb-2 rounded-2xl border p-3" style={{ borderColor: "#23262F", background: "#12141A" }}>
                      <p className="text-[13.5px] font-semibold text-white">{String(c.rotulo)}</p>
                      <p className="mt-0.5 text-[11.5px] text-zinc-500">
                        Risco {String(risco)}% · teto {String(teto)}% — {proprio ? "próprio desta estratégia" : "o mesmo da conta"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                          <button
                            key={String(p.id)}
                            disabled={aGravar}
                            onClick={() => gravar(String(c.id), { preset: p.id })}
                            className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-50"
                            style={{
                              borderColor: c.preset === p.id ? "#D2A63C" : "#23262F",
                              color: c.preset === p.id ? "#D2A63C" : "#a1a1aa",
                            }}
                          >
                            {String(p.nome)} · {String(p.riscoPct)}%
                          </button>
                        ))}
                        {/* Voltar ao risco da conta APAGA o próprio, em vez de copiar os números:
                            assim, mudar o risco da conta volta a valer aqui. */}
                        {proprio && (
                          <button
                            disabled={aGravar}
                            onClick={() => gravar(String(c.id), { limpar: true })}
                            className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11.5px] text-zinc-400 disabled:opacity-50"
                          >
                            Usar o risco da conta
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            <p className="mt-3 text-[11.5px] leading-snug text-zinc-500">
              O motor desta estratégia — trailing stop, trailing profit, parciais — é do provedor e
              é igual para toda a gente que a segue.{" "}
              {providerId
                ? "O risco da tua conta configura-se na app MTM Auto."
                : "O que escolhes aqui é quanto arriscas nela."}
            </p>
          </>
        )}

        {erro && <p className="mt-3 text-[12.5px] text-rose-400">{erro}</p>}
      </div>
    </div>
  )
}

function Interruptor({
  ligado,
  ocupado,
  onClick,
  rotulos = ["A seguir", "Parado"],
}: {
  ligado: boolean
  ocupado: boolean
  onClick: () => void
  /** [ligado, desligado] — os botões admin reutilizam o mesmo estilo com outro texto. */
  rotulos?: [string, string]
}) {
  return (
    <button
      onClick={onClick}
      disabled={ocupado}
      role="switch"
      aria-checked={ligado}
      className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-[12px] font-bold disabled:opacity-50"
      style={{
        border: `1px solid ${ligado ? "rgba(40,200,120,0.45)" : "rgba(255,77,77,0.40)"}`,
        background: ligado ? "rgba(40,200,120,0.12)" : "rgba(255,77,77,0.10)",
        color: ligado ? "#28C878" : "#FF4D4D",
      }}
    >
      {ocupado ? "…" : ligado ? rotulos[0] : rotulos[1]}
      <span
        className="relative block h-5 w-9 rounded-full transition-colors"
        style={{ background: ligado ? "#28C878" : "#FF4D4D" }}
      >
        <span
          className="absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform"
          style={{ left: ligado ? "1.125rem" : "0.125rem" }}
        />
      </span>
    </button>
  )
}

export default function MtmAutoEstrategias({
  fontes = [],
  onToggleFonte,
  porGuardar = false,
  aGuardarFontes = false,
  onGuardarFontes,
}: {
  /** As fontes Tap to Trade ATIVAS, e se a pessoa as está a receber. */
  fontes?: { key: string; label: string; ligada: boolean }[]
  onToggleFonte?: (key: string) => void
  porGuardar?: boolean
  aGuardarFontes?: boolean
  onGuardarFontes?: () => void
} = {}) {
  const [provs, setProvs] = useState<Provedor[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aMudar, setAMudar] = useState<string | null>(null)
  /** Qual estratégia está com o retrato aberto. */
  const [aberta, setAberta] = useState<{ fonte?: string; providerId?: string; nome: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // ── Controlo ADMIN (pausar cópia por estratégia · ligar/desligar fontes T2T) ──
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminCtl, setAdminCtl] = useState<AdminControls | null>(null)
  const [adminBusy, setAdminBusy] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [])

  useEffect(() => {
    let cancel = false
    const run = async () => {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user?.id
      if (!uid) return
      const { data: profile } = await supabase.from("profiles").select("user_type, is_active").eq("id", uid).maybeSingle()
      const admin = profile?.user_type === "admin" && profile?.is_active !== false
      if (cancel || !admin) return
      setIsAdmin(true)
      const tok = sess.session?.access_token
      const r = await fetch("/api/admin/mtmcopy/t2t-controls", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" })
      if (r.ok && !cancel) setAdminCtl(await r.json())
    }
    run().catch(() => {})
    return () => { cancel = true }
  }, [])

  const adminAction = async (busyKey: string, payload: Record<string, unknown>) => {
    setAdminBusy(busyKey)
    setAviso(null)
    try {
      const tok = await token()
      const r = await fetch("/api/admin/mtmcopy/t2t-controls", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? "Falhou")
      setAdminCtl({ strategies: j.strategies ?? [], extras: j.extras ?? [] })
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível guardar.")
    } finally {
      setAdminBusy(null)
    }
  }

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const tok = await token()
      if (!tok) return
      const r = await fetch("/api/mtm-auto/estrategias", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      setProvs(
        (j.providers ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nome: String(p.nome ?? ""),
          descricao: (p.descricao as string) ?? null,
          segue: p.segue === true || p.seguido === true,
          automatico: p.automatico === true || p.autoAceitar === true,
          sinais: Number(p.sinais ?? p.total ?? 0),
          acerto: p.acerto != null ? Number(p.acerto) : p.winRate != null ? Number(p.winRate) : null,
          pips: p.pips != null ? Number(p.pips) : null,
        })),
      )
    } catch {
      /* sem catálogo, o resto do separador continua a funcionar */
    } finally {
      setACarregar(false)
    }
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  const alternar = async (p: Provedor) => {
    setAMudar(p.id)
    setAviso(null)
    try {
      const tok = await token()
      const r = await fetch("/api/mtm-auto/estrategias", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: p.id, seguir: !p.segue }),
      })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setProvs((xs) => xs.map((x) => (x.id === p.id ? { ...x, segue: !p.segue } : x)))
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível guardar.")
    } finally {
      setAMudar(null)
    }
  }

  /**
   * As FONTES do Tap to Trade aparecem sempre.
   *
   * Só as estratégias do MTM Auto exigem Premium/VIP. Pôr as duas atrás do mesmo cadeado tirava
   * a um cliente com conta T2T ativa a única forma de escolher o que recebe — e ele continua a
   * poder aceitar sinais, portanto continua a precisar de escolher.
   */
  if (aCarregar && !provs.length && !fontes.length) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A ler as estratégias…
      </p>
    )
  }

  if (!provs.length && !fontes.length) {
    return <p className="py-10 text-center text-[13px] text-zinc-500">Sem fontes nem estratégias disponíveis.</p>
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[12px] leading-snug text-zinc-400">
        Escolhe o que queres seguir. Verde é a receber; vermelho é parado. Os sinais do que segues
        aparecem no separador Sinais, para aceitares um a um. Ligar a cópia automática faz-se na
        app MTM Auto.
      </p>

      {/* CONTROLO ADMIN — só o admin vê. Pausar a cópia pára a execução automática da
          estratégia (CopyFactory + MTM Auto, mesma tabela) até religar; desligar uma fonte
          T2T esconde-a dos clientes e tira o botão de aceitar dos chats. */}
      {isAdmin && adminCtl && (
        <div className="rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#D2A63C]">Controlo Admin</p>

          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Cópia automática por estratégia</p>
          {adminCtl.strategies.map((s) => (
            <div key={s.routeId} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#12141A] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white">{s.label}</p>
                <p className="text-[11px] text-zinc-500">
                  {s.copyEnabled ? "Cópia automática ativa" : "Cópia PAUSADA até religar"}
                  {!s.hasAccount && " · sem conta mestre"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Interruptor
                  ligado={s.copyEnabled}
                  ocupado={adminBusy === `copy:${s.routeId}`}
                  rotulos={["Cópia", "Pausa"]}
                  onClick={() => adminAction(`copy:${s.routeId}`, { action: "route_copy", routeId: s.routeId, value: !s.copyEnabled })}
                />
                <Interruptor
                  ligado={s.tapToTrade}
                  ocupado={adminBusy === `t2t:${s.routeId}`}
                  rotulos={["T2T", "T2T"]}
                  onClick={() => adminAction(`t2t:${s.routeId}`, { action: "route_t2t", routeId: s.routeId, value: !s.tapToTrade })}
                />
              </div>
            </div>
          ))}

          {adminCtl.extras.length > 0 && (
            <>
              <p className="pt-1 text-[11px] uppercase tracking-wider text-zinc-500">Fontes Tap to Trade extra</p>
              {adminCtl.extras.map((x) => (
                <div key={x.channel} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#12141A] p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white">{x.label}</p>
                    <p className="text-[11px] text-zinc-500">{x.active ? "Visível aos clientes no T2T" : "Oculta — clientes não aceitam"}</p>
                  </div>
                  <Interruptor
                    ligado={x.active}
                    ocupado={adminBusy === `extra:${x.channel}`}
                    rotulos={["Ativa", "Oculta"]}
                    onClick={() => adminAction(`extra:${x.channel}`, { action: "extra_channel", channel: x.channel, value: !x.active })}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* AS FONTES TAP TO TRADE ATIVAS.
          São as fontes que estão mesmo ligadas no sistema — não uma lista fixa. Uma lista fixa
          ofereceria fontes desligadas, e deixar alguém seguir o que não existe é prometer sinais
          que nunca chegam. */}
      {fontes.length > 0 && (
        <>
          <p className="px-1 pt-1 text-[11px] uppercase tracking-wider text-zinc-500">Fontes Tap to Trade</p>
          {fontes.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
              style={{ borderColor: f.ligada ? "rgba(40,200,120,0.30)" : "#23262F", background: "#12141A" }}
            >
              {/* O toque no corpo abre o retrato da fonte; o interruptor continua a ser só do
                  seguir. Seguir sem saber se ela ganha era uma escolha às cegas. */}
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta({ fonte: f.key, nome: f.label })}>
                <p className="text-[14px] font-semibold text-white">{f.label}</p>
                <p className="mt-0.5 text-[11.5px] text-zinc-500">
                  {f.ligada ? "Recebes os sinais desta fonte · toca para ver os números" : "Não recebes os sinais desta fonte"}
                </p>
              </button>
              <Interruptor ligado={f.ligada} ocupado={aGuardarFontes} onClick={() => onToggleFonte?.(f.key)} />
            </div>
          ))}
          {porGuardar && (
            <button
              onClick={onGuardarFontes}
              disabled={aGuardarFontes}
              className="w-full rounded-xl bg-[#D2A63C] py-2.5 text-[13px] font-bold text-black disabled:opacity-50"
            >
              {aGuardarFontes ? "A guardar…" : "Guardar alterações"}
            </button>
          )}
          {provs.length > 0 && (
            <p className="px-1 pt-2 text-[11px] uppercase tracking-wider text-zinc-500">Estratégias MTM Auto</p>
          )}
        </>
      )}

      {provs.length === 0 && fontes.length > 0 && (
        <p className="px-1 py-2 text-[12px] leading-snug text-zinc-500">
          As estratégias do MTM Auto são para membros Premium e VIP. As fontes acima continuam
          tuas e a funcionar no Tap to Trade.
        </p>
      )}

      {provs.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border p-3"
          style={{ borderColor: p.segue ? "rgba(40,200,120,0.30)" : "#23262F", background: "#12141A" }}
        >
          <div className="flex items-start justify-between gap-3">
            {/* O toque no corpo abre os números da conta que EXECUTA esta estratégia. */}
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta({ providerId: p.id, nome: p.nome })}>
              <p className="text-[14px] font-semibold text-white">{p.nome}</p>
              {p.descricao && <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">{p.descricao}</p>}
              {Boolean(p.sinais) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                  <TrendingUp className="h-3 w-3" />
                  {p.sinais} sinais
                  {p.acerto != null && ` · ${p.acerto}% de acerto`}
                  {p.pips != null && ` · ${p.pips >= 0 ? "+" : ""}${p.pips} pips`}
                </p>
              )}
              {p.automatico && (
                <p className="mt-1 text-[11.5px] text-[#D2A63C]">Cópia automática ligada na app MTM Auto</p>
              )}
            </button>
            <Interruptor ligado={p.segue} ocupado={aMudar === p.id} onClick={() => alternar(p)} />
          </div>
        </div>
      ))}

      {aviso && <p className="rounded-xl border border-zinc-800 p-2.5 text-[12.5px] text-rose-400">{aviso}</p>}

      {aberta && (
        <ModalEstrategia
          fonte={aberta.fonte}
          providerId={aberta.providerId}
          nome={aberta.nome}
          aoFechar={() => setAberta(null)}
        />
      )}
    </div>
  )
}
