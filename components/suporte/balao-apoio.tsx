"use client"

/**
 * O BALÃO DE APOIO — chat de apoio ao cliente, um componente só, para qualquer página da casa.
 *
 * Reutilizável de propósito: monta-se no site principal (conditional-navbar-footer) e no site de
 * apresentação (/solucoes), e fala sempre com a MESMA API (/api/suporte) e o MESMO CRM.
 *
 * O que o dono pediu (16/11/2026) e onde está:
 *   · Canto inferior DIREITO, sem tapar nada no telemóvel: botão de 56 px colado ao canto, acima da
 *     barra de gestos (safe-area), e o painel abre como folha de baixo no telemóvel.
 *   · Primeira resposta IMEDIATA com triagem por assunto: a saudação e os botões de assunto estão
 *     no próprio componente (zero rede), e a resposta ao botão escolhido aparece logo.
 *   · Reclamações e reembolsos: o servidor escala ao Ricardo; aqui só se mostra o que ele decidiu
 *     e se pede um email para lhe responderem.
 *
 * Estado no browser: só a chave da conversa e as mensagens (localStorage), para continuar ao
 * voltar à página. Nada de dados de conta.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, MessageCircle, Send, X } from "lucide-react"

type Autor = "cliente" | "agente" | "equipa" | "sistema"
type Msg = { id: number; autor: Autor; texto: string; local?: boolean }
type Estado = "com_agente" | "a_aguardar_equipa" | "escalada" | "resolvida"

const ASSUNTOS: Array<{ id: string; rotulo: string; resposta: string }> = [
  { id: "acessos", rotulo: "Acessos e conta", resposta: "Vamos resolver o acesso. Conta-me o que acontece quando tentas entrar (e com que email te registaste, se te lembrares)." },
  { id: "pagamentos", rotulo: "Pagamentos", resposta: "Diz-me o que se passa com o pagamento ou a subscrição: o plano, a data e o que esperavas ver." },
  { id: "app", rotulo: "App e ferramentas", resposta: "Qual é a ferramenta (app, WebTrader, scanner, MTM Auto…) e o que está a falhar? Se der, diz-me o telemóvel ou o browser." },
  { id: "vendas", rotulo: "Planos e preços", resposta: "Ótimo! Diz-me o que procuras (aprender, scanners, cópia, conta financiada) e indico-te o caminho certo." },
  { id: "outro", rotulo: "Outro assunto", resposta: "Escreve à vontade, estou aqui para ajudar." },
]

const SAUDACAO = "Olá! Sou o apoio da MoreThanMoney e respondo já. Sobre o que é?"
const CHAVE_LS = "mtm.apoio.v1"

type Guardado = { chave: string | null; msgs: Msg[]; estado: Estado; temEmail: boolean }

function ler(): Guardado | null {
  try {
    const v = localStorage.getItem(CHAVE_LS)
    return v ? (JSON.parse(v) as Guardado) : null
  } catch {
    return null
  }
}
function guardar(g: Guardado) {
  try {
    localStorage.setItem(CHAVE_LS, JSON.stringify({ ...g, msgs: g.msgs.slice(-60) }))
  } catch {
    /* modo privado: a conversa só não sobrevive ao recarregar */
  }
}

export default function BalaoApoio({ api = "/api/suporte", origem }: { api?: string; origem?: string }) {
  const [aberto, setAberto] = useState(false)
  const [chave, setChave] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [estado, setEstado] = useState<Estado>("com_agente")
  const [temEmail, setTemEmail] = useState(false)
  const [texto, setTexto] = useState("")
  const [email, setEmail] = useState("")
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [naoLidas, setNaoLidas] = useState(0)
  const [assuntoEscolhido, setAssuntoEscolhido] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLTextAreaElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const localId = useRef(-1)

  // Recuperar a conversa guardada.
  useEffect(() => {
    const g = ler()
    if (g) {
      setChave(g.chave)
      setMsgs(g.msgs ?? [])
      setEstado(g.estado ?? "com_agente")
      setTemEmail(Boolean(g.temEmail))
    }
  }, [])

  useEffect(() => {
    if (chave || msgs.length) guardar({ chave, msgs, estado, temEmail })
  }, [chave, msgs, estado, temEmail])

  useEffect(() => {
    if (aberto) fim.current?.scrollIntoView({ block: "end" })
  }, [msgs, aberto, aEnviar])

  const ultimoIdServidor = msgs.reduce((m, x) => (x.id > m ? x.id : m), 0)

  // Sincronizar: ao abrir e, enquanto a conversa está com pessoas, a cada 20 s (só com o painel aberto).
  const sincronizar = useCallback(async () => {
    if (!chave) return
    try {
      const r = await fetch(`${api}?chave=${encodeURIComponent(chave)}&depois=${ultimoIdServidor}`)
      if (!r.ok) return
      const j = await r.json()
      if (j?.conversa) {
        setEstado(j.conversa.estado)
        setTemEmail(Boolean(j.conversa.temEmail))
      }
      const novas = (j?.mensagens ?? []) as Msg[]
      if (novas.length) {
        setMsgs((atual) => {
          const ids = new Set(atual.map((m) => m.id))
          const add = novas.filter((m) => !ids.has(m.id) && m.autor !== "cliente")
          return add.length ? [...atual, ...add] : atual
        })
      }
    } catch {
      /* sem rede: tenta na próxima */
    }
  }, [api, chave, ultimoIdServidor])

  useEffect(() => {
    if (!aberto) return
    void sincronizar()
    if (estado !== "a_aguardar_equipa" && estado !== "escalada") return
    const t = setInterval(() => void sincronizar(), 20_000)
    return () => clearInterval(t)
  }, [aberto, estado, sincronizar])

  // Escape fecha; o foco volta ao botão.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false)
        botao.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    setNaoLidas(0)
    setTimeout(() => entrada.current?.focus(), 50)
    return () => window.removeEventListener("keydown", onKey)
  }, [aberto])

  function adicionarLocal(autor: Autor, t: string) {
    const m: Msg = { id: localId.current--, autor, texto: t, local: true }
    setMsgs((a) => [...a, m])
  }

  function escolherAssunto(a: (typeof ASSUNTOS)[number]) {
    // Resposta imediata, sem rede: é a primeira resposta que o dono quer instantânea.
    setAssuntoEscolhido(a.id)
    adicionarLocal("cliente", a.rotulo)
    adicionarLocal("agente", a.resposta)
    entrada.current?.focus()
  }

  async function enviar(t: string, opts: { soEmail?: boolean } = {}) {
    const limpo = t.trim()
    if (!limpo || aEnviar) return
    setErro(null)
    if (!opts.soEmail) {
      adicionarLocal("cliente", limpo)
      setTexto("")
    }
    setAEnviar(true)
    try {
      const historico = msgs
        .filter((m) => m.autor === "cliente" || m.autor === "agente")
        .slice(-8)
        .map((m) => ({ role: m.autor === "cliente" ? "user" : "assistant", content: m.texto }))
      const r = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chave,
          texto: opts.soEmail ? `O meu email é ${limpo}` : limpo,
          email: opts.soEmail ? limpo : undefined,
          assunto: assuntoEscolhido ?? undefined,
          pagina: typeof window !== "undefined" ? `${origem ? `${origem}:` : ""}${window.location.pathname}` : undefined,
          historico,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(j?.error || "Não consegui enviar. Tenta outra vez.")
        return
      }
      if (j.chave) setChave(j.chave)
      if (j.estado) setEstado(j.estado)
      if (opts.soEmail) {
        setTemEmail(true)
        setEmail("")
      }
      const novas = (j.respostas ?? []) as Msg[]
      setMsgs((a) => [...a, ...novas])
      if (!aberto && novas.length) setNaoLidas((n) => n + novas.length)
    } catch {
      setErro("Sem ligação. Verifica a internet e tenta outra vez.")
    } finally {
      setAEnviar(false)
    }
  }

  const emEspera = estado === "a_aguardar_equipa" || estado === "escalada"
  const semConversa = msgs.length === 0

  return (
    <>
      {aberto && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Apoio ao cliente MoreThanMoney"
          className="fixed z-[2147483640] flex flex-col overflow-hidden border border-[#D2A63C]/30 bg-[#0b0b0d] text-zinc-100 shadow-2xl shadow-black/70
            inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] top-auto max-h-[min(80dvh,620px)] rounded-2xl
            sm:inset-x-auto sm:right-6 sm:bottom-[calc(6rem+env(safe-area-inset-bottom))] sm:w-[380px] sm:max-h-[min(70vh,600px)]
            motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
        >
          <header className="flex items-center gap-3 border-b border-white/[0.07] bg-gradient-to-r from-[#D2A63C]/15 to-transparent px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D2A63C] text-black" aria-hidden="true">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#E9C46A]">Apoio MoreThanMoney</p>
              <p className="text-xs text-zinc-400" aria-live="polite">
                {estado === "escalada"
                  ? "Passado ao Ricardo · prioridade"
                  : estado === "a_aguardar_equipa"
                    ? "A equipa responde em até 15 min"
                    : "Resposta imediata"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAberto(false)
                botao.current?.focus()
              }}
              aria-label="Fechar o apoio"
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C]"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
            <Bolha autor="agente" texto={SAUDACAO} />
            {semConversa && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Assunto">
                {ASSUNTOS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => escolherAssunto(a)}
                    className="min-h-[44px] rounded-full border border-[#D2A63C]/40 px-3.5 text-sm text-[#E9C46A] transition hover:bg-[#D2A63C] hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E9C46A]"
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m) => (
              <Bolha key={m.id} autor={m.autor} texto={m.texto} />
            ))}
            {aEnviar && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> a escrever…
              </div>
            )}
            <div ref={fim} />
          </div>

          {emEspera && !temEmail && (
            <form
              className="flex gap-2 border-t border-white/[0.07] px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault()
                void enviar(email, { soEmail: true })
              }}
            >
              <label htmlFor="apoio-email" className="sr-only">O teu email, para te respondermos</label>
              <input
                id="apoio-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="O teu email (para te respondermos)"
                className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-base text-white outline-none focus:border-[#D2A63C] sm:text-sm"
              />
              <button
                type="submit"
                disabled={aEnviar || !email.trim()}
                className="min-h-[44px] rounded-lg bg-[#D2A63C]/20 px-3 text-sm font-medium text-[#E9C46A] disabled:opacity-40"
              >
                Guardar
              </button>
            </form>
          )}

          {erro && (
            <p role="alert" className="px-4 pb-1 text-xs text-red-300">
              {erro}
            </p>
          )}

          <form
            className="flex items-end gap-2 border-t border-white/[0.07] px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(texto)
            }}
          >
            <label htmlFor="apoio-texto" className="sr-only">Escreve a tua mensagem</label>
            <textarea
              id="apoio-texto"
              ref={entrada}
              rows={1}
              value={texto}
              maxLength={2000}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void enviar(texto)
                }
              }}
              placeholder="Escreve a tua mensagem…"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-base text-white outline-none focus:border-[#D2A63C] sm:text-sm"
            />
            <button
              type="submit"
              disabled={aEnviar || !texto.trim()}
              aria-label="Enviar mensagem"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D2A63C] text-black transition hover:bg-[#E9C46A] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E9C46A]"
            >
              {aEnviar ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="px-4 pb-3 text-[11px] leading-snug text-zinc-500">
            Conteúdo educativo, não constitui consultoria financeira. Nunca te pedimos palavras-passe nem dados de cartão.
          </p>
        </section>
      )}

      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={aberto ? "Fechar o apoio" : "Abrir o apoio ao cliente"}
        aria-expanded={aberto}
        className={`fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[2147483641] flex h-14 w-14 items-center justify-center rounded-full bg-[#D2A63C] text-black shadow-lg shadow-black/60 transition hover:bg-[#E9C46A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E9C46A] sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] ${
          aberto ? "max-sm:hidden" : ""
        }`}
      >
        {aberto ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-6 w-6" aria-hidden="true" />}
        {naoLidas > 0 && !aberto && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {naoLidas}
          </span>
        )}
      </button>
    </>
  )
}

function Bolha({ autor, texto }: { autor: Autor; texto: string }) {
  const doCliente = autor === "cliente"
  return (
    <div className={`flex ${doCliente ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] ${
          doCliente
            ? "rounded-br-md bg-[#D2A63C] text-black"
            : autor === "equipa"
              ? "rounded-bl-md border border-[#D2A63C]/40 bg-[#D2A63C]/10 text-zinc-100"
              : "rounded-bl-md bg-white/[0.06] text-zinc-100"
        }`}
      >
        {autor === "equipa" && <span className="mb-0.5 block text-[11px] font-semibold text-[#E9C46A]">Equipa MTM</span>}
        <Linkificar texto={texto} />
      </div>
    </div>
  )
}

/** Links clicáveis sem dangerouslySetInnerHTML: o texto vem de uma IA e de visitantes. */
function Linkificar({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline decoration-[#D2A63C]/60 underline-offset-2">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
