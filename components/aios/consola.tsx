"use client"

/**
 * O AIOS EM REACT — a portagem de `public/aios/index.html`.
 *
 * ═══ O QUE MUDOU, E O QUE NÃO ══════════════════════════════════════════════════════════════
 *
 * O aspecto é o MESMO: o CSS veio inteiro para `app/aios/aios.module.css` e as classes são as
 * mesmas. Isto é uma portagem, não um redesenho — trocar a tecnologia e o desenho ao mesmo tempo
 * deixa sem resposta a pergunta «qual dos dois partiu isto?».
 *
 * O que mudou é tudo o que o iframe escondia:
 *
 *  · A CHAVE DA FISH AUDIO SAIU DO BROWSER. Estava em claro no HTML e ia para o computador de
 *    quem abrisse a página. Agora a fala passa por `/api/aios/voz`, fechada a admins.
 *  · O estado é estado, não `document.getElementById`. O original tinha 26 chamadas a `getElementById`
 *    e mudava classes à mão; qualquer alteração ao HTML partia o JavaScript em silêncio.
 *  · Os laços param. `setInterval` de dois minutos, relógio de um segundo e `requestAnimationFrame`
 *    ficavam a correr para sempre — no iframe morriam com a página, aqui teriam de ser limpos.
 *  · O reconhecimento de voz é parado no fim. Um `SpeechRecognition` vivo mantém o microfone
 *    aberto, e um microfone aberto numa página que a pessoa já deixou não se explica a ninguém.
 *
 * ═══ O QUE FICA POR FAZER, E ESTÁ DITO ═════════════════════════════════════════════════════
 *
 * O quadro de Conteúdo (kanban) e o funil continuam com números escritos à mão no código, como
 * estavam. Não os inventei nem os liguei: ligar um quadro de conteúdo a dados reais é uma
 * funcionalidade, não uma portagem, e metê-la aqui misturava as duas coisas. Estão marcados no
 * ecrã com «exemplo» para ninguém os ler como reais — que era o que acontecia antes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Particulas from "./particulas"
import s from "@/app/aios/aios.module.css"
import {
  AGENTES, IDS_AGENTES, SOPS, lerComandoDeVoz, pedacoDoStream,
  type IdAgente, type Separador,
} from "@/lib/aios/agentes"

type Mensagem = { id: number; tipo: "user" | "ai" | "system"; texto: string; agente?: IdAgente }
type Estado = "on" | "off" | "warn"
type Marcacao = { invitee_name?: string; name?: string; event_type_slug?: string; event_type?: string; start_time?: string; status?: string }

const CHECKLIST = [
  "Ver métricas do dia",
  "Rever marcações pendentes",
  "Publicar conteúdo IG",
  "Responder DMs quentes",
  "Rever flows ManyChat",
  "Check scanner XAUUSD",
]

/** De quanto em quanto tempo se relê o que é externo. Dois minutos, como no original. */
const RELER_MS = 120_000

export default function ConsolaAios() {
  // ── estado ────────────────────────────────────────────────────────────────
  const [agente, setAgente] = useState<IdAgente>("content_creation")
  const [separador, setSeparador] = useState<Separador>("chat")
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    { id: 0, tipo: "system", texto: "— JARVIS iniciado —" },
    {
      id: 1, tipo: "ai", agente: "content_creation",
      texto: "Olá Ricardo! Estou pronto para criar conteúdo para o teu Instagram. Podes pedir-me hooks para Reels, captions, scripts de 60s, ou ideias para os próximos posts. O que precisas hoje?",
    },
  ])
  const [aPensar, setAPensar] = useState(false)
  const [entrada, setEntrada] = useState("")
  const [relogio, setRelogio] = useState("--:--:--")
  const [toast, setToast] = useState<string | null>(null)
  const [feitos, setFeitos] = useState<Set<number>>(new Set())
  const [tokens, setTokens] = useState(0)

  const [aOuvir, setAOuvir] = useState(false)
  const [aFalar, setAFalar] = useState(false)
  const [vozTexto, setVozTexto] = useState("Pronto para receber ordens, Ricardo. Os sistemas estão a inicializar.")

  const [estados, setEstados] = useState<{ supabase: Estado; n8n: Estado; voz: Estado }>({ supabase: "warn", n8n: "warn", voz: "off" })
  const [metricas, setMetricas] = useState<{ total: string; activos: string; novos: string; marcacoes: string }>({ total: "—", activos: "—", novos: "—", marcacoes: "—" })
  const [marcacoes, setMarcacoes] = useState<Marcacao[] | null>(null)
  const [n8n, setN8n] = useState<{ online: boolean | null; disco: string }>({ online: null, disco: "—" })

  const fimDoChat = useRef<HTMLDivElement>(null)
  const historico = useRef<Array<{ role: string; content: string }>>([])
  const reconhecimento = useRef<{ stop: () => void } | null>(null)
  const aFalarRef = useRef(false)
  const proximoId = useRef(2)

  const mostrarToast = useCallback((m: string) => setToast(m), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── relógio ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setRelogio(new Date().toLocaleTimeString("pt-PT", { hour12: false }))
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => { fimDoChat.current?.scrollIntoView({ block: "end" }) }, [mensagens, aPensar])

  const juntar = useCallback((m: Omit<Mensagem, "id">) => {
    setMensagens((x) => [...x, { ...m, id: proximoId.current++ }])
  }, [])

  // ── leituras reais ────────────────────────────────────────────────────────
  const lerMetricas = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard-gestao/metrics", { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      const v = (...c: unknown[]) => String(c.find((x) => x !== undefined && x !== null) ?? "—")
      setMetricas({
        total: v(d.totalUsers, d.users?.total),
        activos: v(d.activeUsers, d.users?.active),
        novos: v(d.newUsers30d, d.users?.new_30d),
        marcacoes: v(d.activeBookings, d.bookings?.active),
      })
      setEstados((e) => ({ ...e, supabase: "on" }))
    } catch {
      setEstados((e) => ({ ...e, supabase: "warn" }))
    }
  }, [])

  const lerMarcacoes = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard-gestao/bookings?limit=10", { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setMarcacoes(d.bookings ?? d ?? [])
    } catch {
      setMarcacoes([])
    }
  }, [])

  const lerN8n = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/n8n-vps?cmd=status", { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setN8n({ online: Boolean(d.n8nRunning), disco: String(d.diskUsage ?? "—") })
      setEstados((e) => ({ ...e, n8n: d.n8nRunning ? "on" : "off" }))
    } catch {
      setEstados((e) => ({ ...e, n8n: "warn" }))
    }
  }, [])

  useEffect(() => {
    void lerMetricas(); void lerN8n(); void lerMarcacoes()
    const i = setInterval(() => { void lerMetricas(); void lerN8n() }, RELER_MS)
    const t = setTimeout(() => setVozTexto("Sistemas carregados. Pronto para receber ordens, Ricardo."), 3000)
    return () => { clearInterval(i); clearTimeout(t) }
  }, [lerMetricas, lerN8n, lerMarcacoes])

  // ── falar ─────────────────────────────────────────────────────────────────
  const falar = useCallback(async (texto: string) => {
    if (!texto || aFalarRef.current) return
    aFalarRef.current = true
    setAFalar(true)
    try {
      const r = await fetch("/api/aios/voz", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: texto.slice(0, 300) }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const url = URL.createObjectURL(await r.blob())
      const audio = new Audio(url)
      audio.onended = () => { aFalarRef.current = false; setAFalar(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { aFalarRef.current = false; setAFalar(false); URL.revokeObjectURL(url) }
      await audio.play()
    } catch {
      aFalarRef.current = false
      setAFalar(false)
    }
  }, [])

  // ── chat ──────────────────────────────────────────────────────────────────
  const enviar = useCallback(async (texto: string) => {
    const t = texto.trim()
    if (!t) return
    setEntrada("")
    juntar({ tipo: "user", texto: t })
    historico.current.push({ role: "user", content: t })
    setSeparador("chat")
    setAPensar(true)

    try {
      const r = await fetch("/api/dashboard-gestao/chat", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: historico.current, agentId: agente }),
      })
      if (!r.ok || !r.body) throw new Error(`API ${r.status}`)
      setAPensar(false)

      const meuId = proximoId.current++
      setMensagens((x) => [...x, { id: meuId, tipo: "ai", agente, texto: "" }])

      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let completo = ""
      let sobra = ""
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        // As linhas de SSE podem vir cortadas a meio entre dois pedaços. Sem guardar a sobra,
        // perdia-se uma linha de texto de cada vez que isso acontecia — e acontece com frequência.
        const bruto = sobra + dec.decode(value, { stream: true })
        const linhas = bruto.split("\n")
        sobra = linhas.pop() ?? ""
        for (const linha of linhas) {
          const pedaco = pedacoDoStream(linha)
          if (!pedaco) continue
          completo += pedaco
          setTokens((n) => n + pedaco.split(" ").length)
          setMensagens((x) => x.map((m) => (m.id === meuId ? { ...m, texto: completo } : m)))
        }
      }

      historico.current.push({ role: "assistant", content: completo })
      if (completo) {
        setVozTexto(completo.slice(0, 150) + (completo.length > 150 ? "…" : ""))
        void falar(completo)
      }
    } catch (e) {
      setAPensar(false)
      juntar({ tipo: "ai", agente, texto: `Erro: ${e instanceof Error ? e.message : "falhou"}. Confirma que a sessão de admin está activa.` })
    }
  }, [agente, juntar, falar])

  const escolherAgente = useCallback((id: IdAgente) => {
    setAgente(id)
    juntar({ tipo: "system", texto: `— Agente alterado para ${AGENTES[id].emoji} ${AGENTES[id].nome} —` })
    mostrarToast(`${AGENTES[id].emoji} ${AGENTES[id].nome} activado`)
  }, [juntar, mostrarToast])

  // ── ouvir ─────────────────────────────────────────────────────────────────
  const pararDeOuvir = useCallback(() => {
    reconhecimento.current?.stop()
    reconhecimento.current = null
    setAOuvir(false)
    setEstados((e) => ({ ...e, voz: "off" }))
  }, [])

  const ouvir = useCallback(() => {
    type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onstart: null | (() => void); onresult: null | ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void); onerror: null | ((e: { error: string }) => void); onend: null | (() => void) }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
    const Motor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Motor) { mostrarToast("Voz não suportada neste browser"); return }

    const sr = new Motor()
    sr.lang = "pt-PT"
    sr.continuous = true
    sr.interimResults = true
    sr.onstart = () => { setAOuvir(true); setEstados((e) => ({ ...e, voz: "on" })) }
    sr.onresult = (e) => {
      let t = ""
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript
      setVozTexto(t)
      setEntrada(t)
      const ultimo = e.results[e.results.length - 1]
      if (!ultimo?.isFinal) return

      const accao = lerComandoDeVoz(t)
      if (accao.tipo === "agente") escolherAgente(accao.id)
      else if (accao.tipo === "separador") { setSeparador(accao.nome); if (accao.nome === "activity") void lerMarcacoes(); if (accao.dizer) void falar(accao.dizer) }
      else if (accao.tipo === "recarregar") { if (accao.o_que === "metricas") void lerMetricas(); else void lerN8n(); void falar(accao.dizer) }
      else if (accao.tipo === "perguntar") void enviar(accao.texto)
    }
    sr.onerror = (e) => { mostrarToast(`Erro de voz: ${e.error}`); pararDeOuvir() }
    sr.onend = () => pararDeOuvir()
    sr.start()
    reconhecimento.current = sr
  }, [enviar, escolherAgente, falar, lerMarcacoes, lerMetricas, lerN8n, mostrarToast, pararDeOuvir])

  // O microfone NÃO fica aberto quando a página sai. Ver o cabeçalho.
  useEffect(() => () => { reconhecimento.current?.stop() }, [])

  const proximas = useMemo(() => (marcacoes ?? []).slice(0, 3), [marcacoes])
  const badge = n8n.online === null ? { t: "A verificar", c: s.yellow } : n8n.online ? { t: "ONLINE", c: s.green } : { t: "OFFLINE", c: s.red }

  return (
    <div className={s.raiz}>
      <Particulas className={s.particles} />
      <div className={s["hud-frame"]}>
        <div className={`${s["hud-corner"]} ${s.tl}`} /><div className={`${s["hud-corner"]} ${s.tr}`} />
        <div className={`${s["hud-corner"]} ${s.bl}`} /><div className={`${s["hud-corner"]} ${s.br}`} />
      </div>

      <div className={s.app}>
        <header className={s.header}>
          <div className={s["header-brand"]}><div className={s["logo-ring"]}>J</div>JARVIS · MTM AI OS</div>
          <div className={s["header-status"]}>
            <span><span className={`${s["status-dot"]} ${s[estados.supabase]}`} />Supabase</span>
            <span><span className={`${s["status-dot"]} ${s[estados.n8n]}`} />n8n</span>
            <span><span className={`${s["status-dot"]} ${s[estados.voz]}`} />Voz</span>
            <button
              type="button" className={`${s["wake-btn"]} ${aOuvir ? s.listening : ""}`}
              onClick={() => (aOuvir ? pararDeOuvir() : ouvir())}
            >
              {aOuvir ? "🔴 A ouvir…" : "🎙 Ei AIOS"}
            </button>
            <span className={s.clock}>{relogio}</span>
          </div>
        </header>

        <aside className={s["left-panel"]}>
          <div className={s["panel-section"]}>
            <div className={s["panel-title"]}>12 Agentes</div>
            <div className={s["agents-grid"]}>
              {IDS_AGENTES.map((id) => (
                <button
                  key={id} type="button"
                  className={`${s["agent-btn"]} ${agente === id ? s.active : ""}`}
                  style={agente === id ? { color: AGENTES[id].cor } : undefined}
                  onClick={() => escolherAgente(id)}
                >
                  <span className={s["agent-icon"]}>{AGENTES[id].emoji}</span>
                  <span className={s["agent-name"]} style={{ color: AGENTES[id].cor }}>{AGENTES[id].nome}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={s["panel-section"]}>
            <div className={s["panel-title"]}>CEO Checklist</div>
            <div className={s.checklist}>
              {CHECKLIST.map((t, i) => (
                <div
                  key={t} className={`${s["check-item"]} ${feitos.has(i) ? s.done : ""}`}
                  onClick={() => setFeitos((f) => { const n = new Set(f); n.has(i) ? n.delete(i) : n.add(i); return n })}
                >
                  <div className={s["check-box"]}>{feitos.has(i) ? "✓" : ""}</div>{t}
                </div>
              ))}
            </div>
          </div>

          <div className={s["panel-section"]}>
            <div className={s["panel-title"]}>Métricas</div>
            <div className={s["metrics-mini"]}>
              <div className={s["metric-card"]}><div className={s["metric-val"]}>{metricas.total}</div><div className={s["metric-lbl"]}>Membros</div></div>
              <div className={s["metric-card"]}><div className={s["metric-val"]}>{metricas.marcacoes}</div><div className={s["metric-lbl"]}>Marcações</div></div>
              <div className={s["metric-card"]}><div className={s["metric-val"]}>{metricas.novos}</div><div className={s["metric-lbl"]}>Novos 30d</div></div>
              <div className={s["metric-card"]}><div className={s["metric-val"]}>{metricas.activos}</div><div className={s["metric-lbl"]}>Activos</div></div>
            </div>
          </div>
        </aside>

        <main className={s.main}>
          <div className={s["voice-area"]}>
            <div
              className={`${s["voice-ring"]} ${aFalar ? s.speaking : ""} ${aOuvir ? s.listening : ""}`}
              onClick={() => (aOuvir ? pararDeOuvir() : ouvir())}
            >
              <div className={s["ring-pulse"]} /><div className={s["ring-pulse"]} /><div className={s["ring-pulse"]} />
              <span className={s["voice-icon"]}>🎙</span>
            </div>
            <div className={s["voice-status"]}>
              {aFalar ? "JARVIS A FALAR…" : aOuvir ? "A OUVIR…" : 'DI ALGO… ou usa "Ei, AIOS"'}
            </div>
            <div className={s["voice-output"]}>{vozTexto}</div>
          </div>

          <div className={s["content-area"]}>
            <div className={s["tab-bar"]}>
              {([["chat", "💬 Chat"], ["funnel", "📊 Funil MTM"], ["kanban", "📋 Conteúdo"], ["activity", "⚡ Actividade"]] as const).map(([id, rotulo]) => (
                <div
                  key={id} className={`${s.tab} ${separador === id ? s.active : ""}`}
                  onClick={() => { setSeparador(id); if (id === "activity") void lerMarcacoes() }}
                >
                  {rotulo}
                </div>
              ))}
            </div>

            {separador === "chat" && (
              <>
                <div className={s["chat-messages"]}>
                  {mensagens.map((m) => (
                    <div key={m.id} className={`${s.msg} ${s[m.tipo]}`}>
                      {m.tipo === "ai" && m.agente && (
                        <div className={s["msg-agent"]}>{AGENTES[m.agente].emoji} AGENTE {AGENTES[m.agente].nome.toUpperCase()}</div>
                      )}
                      <span style={{ whiteSpace: "pre-wrap" }}>{m.texto}</span>
                    </div>
                  ))}
                  {aPensar && (
                    <div className={`${s.msg} ${s.ai}`}>
                      <div className={s["msg-agent"]}>{AGENTES[agente].emoji} AGENTE {AGENTES[agente].nome.toUpperCase()}</div>
                      <div className={s["msg-thinking"]}><span /><span /><span /></div>
                    </div>
                  )}
                  <div ref={fimDoChat} />
                </div>
                <div className={s["chat-input-row"]}>
                  <input
                    className={s["chat-input"]} value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void enviar(entrada) }}
                    placeholder="Escreve ao agente… ou usa o botão de voz"
                  />
                  <button type="button" className={s["chat-send"]} onClick={() => void enviar(entrada)}>Enviar</button>
                </div>
              </>
            )}

            {separador === "funnel" && (
              <div className={s["funnel-tab"]}>
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
                  Membros e marcações vêm do Supabase. As duas primeiras linhas são <strong>exemplo</strong> — o
                  Instagram e o ManyChat ainda não estão ligados a este quadro.
                </p>
                {([
                  ["👁️", "Seguidores Instagram", "@morethanmoney.pt", "—", "100%", true],
                  ["💬", "Leads ManyChat", "Subscribers activos", "—", "—", true],
                  ["📅", "Marcações", "Chamadas marcadas", metricas.marcacoes, "", false],
                  ["⭐", "Membros MTM", "Comunidade activa", metricas.total, "", false],
                ] as const).map(([icone, rotulo, sub, num, pct, exemplo], i) => (
                  <div key={rotulo} className={s["funnel-step"]}>
                    <div className={s["funnel-bar"]} style={{ width: ["100%", "35%", "15%", "8%"][i] }} />
                    <div className={s["funnel-content"]}>
                      <span className={s["funnel-icon"]}>{icone}</span>
                      <div className={s["funnel-info"]}>
                        <div className={s["funnel-label"]}>{rotulo}{exemplo && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> · exemplo</span>}</div>
                        <div className={s["funnel-sub"]}>{sub}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className={s["funnel-num"]}>{num}</div>
                        <div className={s["funnel-pct"]}>{pct}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {separador === "kanban" && (
              <div className={s["kanban-tab"]}>
                <p style={{ gridColumn: "1/-1", fontSize: 11, color: "var(--text-dim)" }}>
                  Quadro de <strong>exemplo</strong> — ainda não está ligado ao calendário de conteúdo real.
                </p>
                {([
                  ["💡 IDEIAS", "#60a5fa", [["REEL", "5 erros que te mantêm pobre", "CTA: SISTEMA"], ["CARROSSEL", "O que aprendi nos últimos 12 meses", "CTA: RESULTADOS"]]],
                  ["✍️ EM CRIAÇÃO", "#fbbf24", [["REEL", "Como saí das 40h/semana em 8 meses", "CTA: LIBERDADE"]]],
                  ["📅 AGENDADO", "#34d399", [["REEL", "Mindset vs resultados", "18:00"]]],
                  ["✅ PUBLICADO", "#D2A63C", [["POST", "O scanner e a zona de ouro", "—"]]],
                ] as const).map(([titulo, cor, cartoes]) => (
                  <div key={titulo} className={s["kanban-col"]}>
                    <div className={s["kanban-col-header"]} style={{ background: `${cor}1a`, color: cor }}>{titulo}</div>
                    {cartoes.map(([tag, t, meta]) => (
                      <div key={t} className={s["kanban-card"]}>
                        <span className={s["card-tag"]} style={{ background: `${cor}26`, color: cor }}>{tag}</span>
                        <div className={s["card-title"]}>{t}</div>
                        <div className={s["card-meta"]}>{meta}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {separador === "activity" && (
              <div className={s["activity-tab"]}>
                <div>
                  {marcacoes === null ? (
                    <div className={`${s.msg} ${s.system}`} style={{ display: "block", padding: 16, textAlign: "center" }}>A carregar…</div>
                  ) : marcacoes.length === 0 ? (
                    <div className={`${s.msg} ${s.system}`} style={{ display: "block", padding: 12, textAlign: "center" }}>Sem marcações recentes</div>
                  ) : marcacoes.map((b, i) => {
                    const estado = b.status ?? "active"
                    const cor = estado === "cancelled" ? "#f87171" : estado === "completed" ? "#60a5fa" : "#34d399"
                    return (
                      <div key={i} className={s["activity-item"]}>
                        <div className={s["activity-dot"]} style={{ background: cor }} />
                        <div>
                          <div className={s["activity-text"]}><strong>{b.invitee_name ?? b.name ?? "Utilizador"}</strong> — {(b.event_type_slug ?? b.event_type ?? "reunião").replace(/-/g, " ")}</div>
                          <div className={s["activity-time"]}>
                            {b.start_time ? new Date(b.start_time).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                            {" · "}<span style={{ color: cor }}>{estado}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className={s["right-panel"]}>
          <div className={s["right-section"]}>
            <div className={s["right-title"]}>n8n · Automações VPS</div>
            {["n8n Engine", "JARVIS Telegram", "ManyChat Sync", "Voice Bridge"].map((n) => (
              <div key={n} className={s["n8n-row"]}><span>{n}</span><span className={`${s["n8n-badge"]} ${badge.c}`}>{badge.t}</span></div>
            ))}
            <div className={s["n8n-row"]} style={{ border: "none", paddingTop: 8 }}>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Disco VPS</span>
              <span style={{ fontSize: 11, fontFamily: "monospace" }}>{n8n.disco}</span>
            </div>
          </div>

          <div className={s["right-section"]}>
            <div className={s["right-title"]}>Próximas Marcações</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {marcacoes === null ? "A carregar…" : proximas.length === 0 ? "Sem marcações activas" : proximas.map((b, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{b.invitee_name ?? b.name ?? "—"}</div>
                  <div style={{ fontSize: 10 }}>{b.start_time ? new Date(b.start_time).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={s["sops-panel"]}>
            <div className={s["right-title"]}>SOPs Rápidos</div>
            {Object.entries(SOPS).map(([id, sop]) => (
              <div
                key={id} className={s["sop-item"]}
                onClick={() => { escolherAgente(sop.agente); setSeparador("chat"); setEntrada(sop.pedido); mostrarToast("🚀 SOP carregado — clica Enviar") }}
              >
                <div className={s["sop-title"]}>{sop.titulo}</div>
                <div className={s["sop-desc"]}>{sop.descricao}</div>
                <span className={s["sop-trigger"]}>{sop.gatilho}</span>
              </div>
            ))}
          </div>
        </aside>

        <footer className={s.footer}>
          <div>JARVIS v2.0 · MTM AI OS · <Link href="/dashboard-gestao" style={{ color: "var(--gold)", textDecoration: "none" }}>← Dashboard Gestão</Link></div>
          <div className={s["voice-waveform"]}>
            {[8, 14, 10, 16, 8, 12].map((h, i) => (
              <div key={i} className={`${s["wave-bar"]} ${aOuvir || aFalar ? s.active : ""}`} style={{ ["--h" as string]: `${h}px`, ["--d" as string]: `${0.35 + i * 0.05}s`, height: 4 }} />
            ))}
          </div>
          <div><span>Tokens: ~{tokens}</span> · <span style={{ color: "var(--gold)" }}>Agente: {AGENTES[agente].emoji} {AGENTES[agente].nome}</span></div>
        </footer>
      </div>

      {toast && <div className={`${s.toast} ${s.show}`}>{toast}</div>}
    </div>
  )
}
