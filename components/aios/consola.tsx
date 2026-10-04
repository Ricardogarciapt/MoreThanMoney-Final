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
 * O quadro de Conteúdo e o funil foram ligados a dados reais a 30/09, logo a seguir à portagem —
 * ver `app/api/aios/painel/route.ts`. Traziam números escritos à mão desde Junho («4.2K views»,
 * «892 likes»), e um painel de decisão com números inventados é pior do que um painel vazio: o
 * vazio faz-se perguntas, o inventado faz-se acreditar.
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
type Cartao = { id: string; titulo: string; etiqueta: string; pilar: string | null; quando: string | null; permalink: string | null; erro: string | null }
type Coluna = { chave: string; titulo: string; cor: string; cartoes: Cartao[] }
type DegrauFunil = { icone: string; rotulo: string; sub: string; n: number; pct: number | null }
type Prospeto = { id: string; hashtag: string; permalink: string; excerto: string; pontuacao: number; porque: string | null; gostos: number; comentarios: number }
type Painel = {
  quadro: Coluna[]; funil: DegrauFunil[]; lidoEm: string
  radar: { pendentes: number; porTrabalhar: Prospeto[] }
  fuga: { leadsSemDm: number; leadsTotal: number; pessoas: number; jaNossas: string[] }
}

const CHECKLIST = [
  "Ver métricas do dia",
  "Rever marcações pendentes",
  "Publicar conteúdo IG",
  "Responder DMs quentes",
  "Rever automações próprias (IG · WhatsApp · Telegram)",
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

  /**
   * O MOTOR: nuvem ou máquina do Ricardo.
   *
   * «nuvem» é o que sempre houve — `/api/dashboard-gestao/chat`, a API da Anthropic com os prompts
   * de cada agente. «local» é a ponte: fala com o Claude Code a correr no computador dele, que tem
   * as skills todas instaladas E acesso ao repositório. São capacidades diferentes, não duas
   * qualidades do mesmo: a nuvem sabe da MTM pelos prompts, o local sabe do CÓDIGO e pode mexer-lhe.
   *
   * A ponte só aparece se estiver mesmo de pé. Um botão que promete o que não existe é pior do que
   * não ter botão.
   */
  /**
   * AS GAVETAS. Em ecrã largo não existem — os dois painéis estão sempre lá e estes estados não
   * fazem nada. Abaixo de 1180px (direita) e 860px (esquerda) o CSS tira-os da grelha e passam a
   * sobrepor-se, e é então que isto serve para alguma coisa.
   *
   * Ficam FECHADAS por omissão: num telemóvel, abrir a página com um painel por cima do chat é
   * esconder aquilo a que se vem.
   */
  const [gavetaEsquerda, setGavetaEsquerda] = useState(false)
  const [gavetaDireita, setGavetaDireita] = useState(false)

  const [motor, setMotor] = useState<"nuvem" | "local">("nuvem")
  const [ponteViva, setPonteViva] = useState<boolean | null>(null)
  const [segredoPonte, setSegredoPonte] = useState("")
  const [pedirSegredo, setPedirSegredo] = useState(false)
  const sessaoLocal = useRef<string | null>(null)

  const [aOuvir, setAOuvir] = useState(false)
  const [aFalar, setAFalar] = useState(false)
  const [vozTexto, setVozTexto] = useState("Pronto para receber ordens, Ricardo. Os sistemas estão a inicializar.")

  const [estados, setEstados] = useState<{ supabase: Estado; n8n: Estado; voz: Estado }>({ supabase: "warn", n8n: "warn", voz: "off" })
  const [metricas, setMetricas] = useState<{ total: string; activos: string; novos: string; marcacoes: string }>({ total: "—", activos: "—", novos: "—", marcacoes: "—" })
  const [marcacoes, setMarcacoes] = useState<Marcacao[] | null>(null)
  const [n8n, setN8n] = useState<{ online: boolean | null; disco: string }>({ online: null, disco: "—" })
  const [painel, setPainel] = useState<Painel | null>(null)

  const fimDoChat = useRef<HTMLDivElement>(null)
  const historico = useRef<Array<{ role: string; content: string }>>([])
  const reconhecimento = useRef<{ stop: () => void } | null>(null)
  const aFalarRef = useRef(false)
  const proximoId = useRef(2)

  // A ponte vive em 127.0.0.1 — é a máquina do próprio Ricardo, por isso o endereço é fixo.
  const PONTE = "http://127.0.0.1:4319"

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem("aios.ponte.segredo")
      if (guardado) setSegredoPonte(guardado)
    } catch { /* localStorage bloqueado: pede-se o segredo outra vez, e mais nada */ }
    let vivo = true
    fetch(`${PONTE}/saude`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setPonteViva(Boolean(j?.ok)) })
      .catch(() => { if (vivo) setPonteViva(false) })
    return () => { vivo = false }
  }, [])

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

  /**
   * O funil e o quadro de conteúdo, dos dados reais. Uma leitura só para os dois porque são a
   * mesma pergunta feita ao mesmo momento — separá-las dava um funil de agora ao lado de um quadro
   * de há dois minutos, e a diferença aparecia como se fosse informação.
   */
  const lerPainel = useCallback(async () => {
    try {
      const r = await fetch("/api/aios/painel", { credentials: "include" })
      if (!r.ok) throw new Error(String(r.status))
      setPainel(await r.json())
    } catch {
      setPainel(null)
    }
  }, [])

  /**
   * Marcar um prospeto do radar. `usado` = fui lá comentar; `ignorado` = não presta.
   *
   * Tira-se da lista no ecrã ANTES de o servidor responder. Numa lista que se trabalha um a um, a
   * espera de meio segundo entre o clique e o cartão desaparecer faz clicar duas vezes — e o
   * segundo clique cai no cartão que entretanto subiu para aquele lugar.
   */
  const marcarProspeto = useCallback(async (id: string, estado: "usado" | "ignorado") => {
    setPainel((p) => (p ? { ...p, radar: { ...p.radar, porTrabalhar: p.radar.porTrabalhar.filter((x) => x.id !== id) } } : p))
    try {
      await fetch("/api/admin/social/radar", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, estado }),
      })
    } catch {
      mostrarToast("Não foi possível marcar — recarrega")
    }
  }, [mostrarToast])

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
    void lerMetricas(); void lerN8n(); void lerMarcacoes(); void lerPainel()
    const i = setInterval(() => { void lerMetricas(); void lerN8n(); void lerPainel() }, RELER_MS)
    const t = setTimeout(() => setVozTexto("Sistemas carregados. Pronto para receber ordens, Ricardo."), 3000)
    return () => { clearInterval(i); clearTimeout(t) }
  }, [lerMetricas, lerN8n, lerMarcacoes, lerPainel])

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

  /**
   * Mandar o pedido à máquina do Ricardo, pela ponte.
   *
   * A sessão guarda-se e devolve-se no pedido seguinte: sem isso, cada pergunta começava do zero e
   * o Claude Code não se lembrava do que tinha acabado de fazer no repositório — que é metade do
   * valor de ser ele a responder.
   */
  const enviarPelaPonte = useCallback(async (t: string, meuId: number) => {
    const r = await fetch(`${PONTE}/pedido`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-aios-segredo": segredoPonte },
      body: JSON.stringify({ pedido: t, sessao: sessaoLocal.current }),
    })
    if (r.status === 401) {
      setPedirSegredo(true)
      throw new Error("A ponte recusou o segredo. Corre `npx tsx aios-ponte/servidor.ts` e cola o segredo que ele escreve.")
    }
    if (!r.ok || !r.body) throw new Error(`A ponte respondeu ${r.status}.`)

    const leitor = r.body.getReader()
    const dec = new TextDecoder()
    let completo = ""
    let sobra = ""
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      const bruto = sobra + dec.decode(value, { stream: true })
      const linhas = bruto.split("\n")
      sobra = linhas.pop() ?? ""
      for (const linha of linhas) {
        if (!linha.startsWith("data: ")) continue
        let o: { texto?: string; sessao?: string; erro?: string; fim?: boolean }
        try { o = JSON.parse(linha.slice(6)) } catch { continue }
        if (o.sessao) sessaoLocal.current = o.sessao
        if (o.erro) { completo += `\n\n⚠️ ${o.erro}` }
        if (o.texto) completo += o.texto
        if (o.texto || o.erro) {
          setTokens((n) => n + String(o.texto ?? "").split(" ").length)
          setMensagens((x) => x.map((m) => (m.id === meuId ? { ...m, texto: completo } : m)))
        }
      }
    }
    return completo
  }, [segredoPonte])

  const enviar = useCallback(async (texto: string) => {
    const t = texto.trim()
    if (!t) return
    setEntrada("")
    juntar({ tipo: "user", texto: t })
    historico.current.push({ role: "user", content: t })
    setSeparador("chat")
    setAPensar(true)

    try {
      /**
       * O caminho local não passa pelo nosso servidor: o browser do Ricardo fala directamente com
       * a máquina dele. Passar pela Vercel era mandar o pedido dar a volta ao mundo para voltar ao
       * computador que está à frente dele — e obrigava o site a conseguir alcançá-lo, o que não
       * consegue nem deve.
       */
      if (motor === "local") {
        setAPensar(false)
        const meuId = proximoId.current++
        setMensagens((x) => [...x, { id: meuId, tipo: "ai", agente, texto: "" }])
        const completo = await enviarPelaPonte(t, meuId)
        historico.current.push({ role: "assistant", content: completo })
        return
      }

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
  }, [agente, juntar, falar, motor, enviarPelaPonte])

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
          <div className={s["header-brand"]}>
            {/* Só aparece quando o painel saiu da grelha — ver aios.module.css. Um botão para abrir
                um painel que já está aberto ensina a desconfiar do ecrã. */}
            <button
              type="button" className={s["alternar-painel"]} aria-label="Agentes e checklist"
              onClick={() => { setGavetaEsquerda((v) => !v); setGavetaDireita(false) }}
            >
              ☰
            </button>
            <div className={s["logo-ring"]}>J</div>JARVIS · MTM AI OS
          </div>
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
            <button
              type="button" className={s["alternar-painel"]} aria-label="Estado e SOPs"
              onClick={() => { setGavetaDireita((v) => !v); setGavetaEsquerda(false) }}
            >
              ▦
            </button>
          </div>
        </header>

        {/* O véu fecha a gaveta ao tocar fora. Sem ele, num telemóvel, só se fecha às cegas —
            e um painel que não se sabe fechar é um painel que tapa o ecrã. */}
        {(gavetaEsquerda || gavetaDireita) && (
          <div
            className={s.veu}
            onClick={() => { setGavetaEsquerda(false); setGavetaDireita(false) }}
            aria-hidden
          />
        )}

        <aside className={`${s["left-panel"]} ${gavetaEsquerda ? s.aberto : ""}`}>
          {/* O MOTOR. Só mostra o local quando a ponte responde de facto — um botão que promete
              o que não existe é pior do que não haver botão. */}
          <div className={s["panel-section"]}>
            <div className={s["panel-title"]}>Motor</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button
                type="button" onClick={() => setMotor("nuvem")}
                style={{
                  flex: 1, padding: "6px 8px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${motor === "nuvem" ? "#D2A63C" : "rgba(255,255,255,.14)"}`,
                  background: motor === "nuvem" ? "rgba(210,166,60,.12)" : "transparent",
                  color: motor === "nuvem" ? "#D2A63C" : "#9ca3af",
                }}
              >
                ☁️ Nuvem
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!ponteViva) return
                  setMotor("local")
                  if (!segredoPonte) setPedirSegredo(true)
                }}
                disabled={!ponteViva}
                title={ponteViva ? "Claude Code nesta máquina, com as skills todas" : "Ponte desligada"}
                style={{
                  flex: 1, padding: "6px 8px", fontSize: 11, borderRadius: 6,
                  cursor: ponteViva ? "pointer" : "not-allowed",
                  opacity: ponteViva ? 1 : 0.45,
                  border: `1px solid ${motor === "local" ? "#34d399" : "rgba(255,255,255,.14)"}`,
                  background: motor === "local" ? "rgba(52,211,153,.12)" : "transparent",
                  color: motor === "local" ? "#34d399" : "#9ca3af",
                }}
              >
                💻 Local
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: "#6b7280", lineHeight: 1.45 }}>
              {ponteViva === null && "À procura da ponte…"}
              {ponteViva === false && (
                <>Ponte desligada. Corre <code>npx tsx aios-ponte/servidor.ts</code> no repositório para usares o Claude Code e as skills.</>
              )}
              {ponteViva && motor === "local" && "Claude Code nesta máquina: skills todas e acesso ao repositório."}
              {ponteViva && motor === "nuvem" && "Ponte disponível. O local dá-te as skills e o código."}
            </div>
            {pedirSegredo && (
              <div style={{ marginTop: 6 }}>
                <input
                  type="password" placeholder="Segredo da ponte"
                  defaultValue={segredoPonte}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (!v) return
                    setSegredoPonte(v)
                    try { window.localStorage.setItem("aios.ponte.segredo", v) } catch { /* sem localStorage, pede-se outra vez */ }
                    setPedirSegredo(false)
                  }}
                  style={{
                    width: "100%", padding: "5px 7px", fontSize: 11, borderRadius: 6,
                    border: "1px solid rgba(255,255,255,.14)", background: "rgba(0,0,0,.4)", color: "#fff",
                  }}
                />
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>
                  A ponte escreve-o quando arranca. Fica só neste browser.
                </div>
              </div>
            )}
          </div>

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
                {!painel ? (
                  <p style={{ fontSize: 12, color: "var(--text-dim)" }}>A ler o funil…</p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
                      Radar do Instagram → leads → chamadas marcadas → membros. Percentagens sobre o topo do funil.
                    </p>
                    {painel.funil.map((d, i) => (
                      <div key={d.rotulo} className={s["funnel-step"]}>
                        {/* A barra é a percentagem REAL, com um mínimo visível: um degrau de 1,4%
                            desenhado a 1,4% da largura é uma linha que ninguém vê, e um degrau que
                            não se vê parece um degrau que não existe. */}
                        <div className={s["funnel-bar"]} style={{ width: `${Math.max(d.pct ?? 0, 4)}%` }} />
                        <div className={s["funnel-content"]}>
                          <span className={s["funnel-icon"]}>{d.icone}</span>
                          <div className={s["funnel-info"]}>
                            <div className={s["funnel-label"]}>{d.rotulo}</div>
                            <div className={s["funnel-sub"]}>{d.sub}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className={s["funnel-num"]}>{d.n.toLocaleString("pt-PT")}</div>
                            <div className={s["funnel-pct"]}>{d.pct == null ? "—" : `${d.pct}%`}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/*
                      A FUGA, em cima de tudo o resto. Nove pessoas comentaram a palavra-chave e a
                      mensagem com o link nunca lhes chegou — a app não tem permissão para responder
                      em privado, e o que saiu foi uma resposta pública. Um funil que mostra os
                      degraus e esconde o buraco por onde a água sai não serve para decidir nada.
                    */}
                    {painel.fuga.leadsSemDm > 0 && (
                      <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.4)", background: "rgba(248,113,113,.08)" }}>
                        <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600 }}>
                          ⚠️ {painel.fuga.leadsSemDm} de {painel.fuga.leadsTotal} comentários sem mensagem privada
                          {" "}({painel.fuga.pessoas} pessoa{painel.fuga.pessoas === 1 ? "" : "s"})
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>
                          A resposta pública saiu, e leva o link. O que faltou foi o Direct.
                          {painel.fuga.jaNossas.length > 0 && (
                            <> Destes, já são da casa: {painel.fuga.jaNossas.map((h) => `@${h}`).join(", ")} — não entram no funil de captação.</>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── O RADAR, para se trabalhar aqui ─────────────────────────────── */}
                    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "var(--gold)" }}>RADAR · POR TRABALHAR</span>
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{painel.radar.pendentes} à espera</span>
                      </div>
                      <p style={{ fontSize: 10.5, color: "var(--text-dim)", marginBottom: 8 }}>
                        A API do Instagram não deixa comentar em posts de terceiros nem mandar DM a quem não
                        nos escreveu. O radar encontra e ordena; comentar é teu. Marca aqui o que já foste fazer.
                      </p>
                      {painel.radar.porTrabalhar.length === 0 ? (
                        <p style={{ fontSize: 11, color: "var(--text-dim)" }}>Nada por trabalhar.</p>
                      ) : painel.radar.porTrabalhar.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--gold)", minWidth: 26 }}>{p.pontuacao}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 11.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.excerto || "(sem legenda)"}</div>
                            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>#{p.hashtag} · ♥ {p.gostos} · 💬 {p.comentarios}{p.porque ? ` · ${p.porque}` : ""}</div>
                          </div>
                          <a href={p.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--gold)", textDecoration: "none", whiteSpace: "nowrap" }}>abrir ↗</a>
                          <button type="button" onClick={() => void marcarProspeto(p.id, "usado")} style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 5, border: "1px solid rgba(52,211,153,.4)", background: "transparent", color: "#34d399", cursor: "pointer" }}>comentei</button>
                          <button type="button" onClick={() => void marcarProspeto(p.id, "ignorado")} style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}>ignorar</button>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 10 }}>
                      Lido às {new Date(painel.lidoEm).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </>
                )}
              </div>
            )}

            {separador === "kanban" && (
              <div className={s["kanban-tab"]}>
                {!painel ? (
                  <p style={{ gridColumn: "1/-1", fontSize: 12, color: "var(--text-dim)" }}>A ler o calendário…</p>
                ) : painel.quadro.every((c) => c.cartoes.length === 0) ? (
                  <p style={{ gridColumn: "1/-1", fontSize: 12, color: "var(--text-dim)" }}>Nada agendado nem publicado.</p>
                ) : painel.quadro.map((col) => (
                  <div key={col.chave} className={s["kanban-col"]}>
                    <div className={s["kanban-col-header"]} style={{ background: `${col.cor}1a`, color: col.cor }}>
                      {col.titulo} <span style={{ opacity: 0.6 }}>{col.cartoes.length}</span>
                    </div>
                    {col.cartoes.length === 0 && <p style={{ fontSize: 10, color: "var(--text-dim)", padding: "6px 2px" }}>vazio</p>}
                    {col.cartoes.map((c) => {
                      /* Um cartão publicado leva ao post; um que não foi publicado não leva a lado
                         nenhum, e por isso não finge ser clicável. */
                      const corpo = (
                        <>
                          <span className={s["card-tag"]} style={{ background: `${col.cor}26`, color: col.cor }}>{c.etiqueta}</span>
                          <div className={s["card-title"]}>{c.titulo}</div>
                          <div className={s["card-meta"]}>
                            {c.quando ? new Date(c.quando).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "sem data"}
                            {c.pilar ? ` · ${c.pilar}` : ""}
                          </div>
                          {c.erro && <div className={s["card-meta"]} style={{ color: "var(--red)" }}>{c.erro}</div>}
                        </>
                      )
                      return c.permalink ? (
                        <a key={c.id} className={s["kanban-card"]} href={c.permalink} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none" }}>{corpo}</a>
                      ) : (
                        <div key={c.id} className={s["kanban-card"]}>{corpo}</div>
                      )
                    })}
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

        <aside className={`${s["right-panel"]} ${gavetaDireita ? s.aberto : ""}`}>
          <div className={s["right-section"]}>
            <div className={s["right-title"]}>n8n · Automações VPS</div>
            {["n8n Engine", "JARVIS Telegram", "Voice Bridge"].map((n) => (
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
