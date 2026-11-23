"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Pause, Clock, Pencil, X, Download, Copy, ChevronDown, RefreshCw, Music, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

/**
 * «Para aprovar» — pedido do Ricardo (23/11): «tornar mais fácil a organização para eu conseguir
 * aprovar ou saber o contexto». Uma peça por cartão, com tudo o que decide a aprovação à vista:
 * o vídeo com a capa, o guião, o funil, a palavra-chave (e se a automação dela está ligada),
 * a hora, a conta e de onde veio a ideia. Os botões são os do dia-a-dia: aprovar, pausar,
 * mudar a hora, editar a legenda, descartar.
 *
 * Quatro blocos, pela ordem em que pedem atenção: à tua espera → vai sair → reservas/teste →
 * pausados (fechado por omissão; são as pausas em massa e os tectos diários).
 */

type Contexto = {
  projetoId: string
  titulo: string | null
  tema: string | null
  gancho: string | null
  guiao: string | null
  funil: string | null
  palavraChave: string | null
  automacaoLigada: boolean | null
  tipo: string | null
  estilo: string | null
  molde: string | null
  audio: string | null
  ideia: string | null
}

type Item = {
  id: string
  conta: string
  contaId: string
  tipoMedia: string
  estado: string
  pausado: boolean
  hora: string
  legenda: string
  erro: string | null
  reservaDe: string | null
  origem: "trend" | "reel" | "carrossel" | "agente" | "manual"
  origemNome: string
  media: string[]
  video: string | null
  capa: string | null
  contexto: Contexto | null
}

const CONTAS = [
  { id: "todas", nome: "As duas contas" },
  { id: "ricardogarciapt", nome: "@ricardogarciapt" },
  { id: "morethanmoney.pt", nome: "@morethanmoney.pt" },
]

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

const diaDe = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" })

/** ISO → valor de <input type="datetime-local"> na hora de Lisboa. */
function paraInput(iso: string): string {
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
  return p.replace(" ", "T")
}

/** Valor do input (hora de Lisboa) → ISO. Acerta o fuso pela diferença do próprio instante. */
function deInput(v: string): string {
  const comoUtc = new Date(v + ":00Z")
  const lisboa = new Date(comoUtc.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }))
  const utc = new Date(comoUtc.toLocaleString("en-US", { timeZone: "UTC" }))
  return new Date(comoUtc.getTime() - (lisboa.getTime() - utc.getTime())).toISOString()
}

export function AprovarConteudo() {
  const { toast } = useToast()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [conta, setConta] = useState("todas")
  const [aCarregar, setACarregar] = useState(false)
  const [verPausados, setVerPausados] = useState(false)

  const pedir = useCallback(async (init?: RequestInit) => {
    const tok = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch("/api/admin/social/aprovar", {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) throw new Error(j.error || "Não respondeu")
    return j
  }, [])

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const j = await pedir()
      setItens(j.itens)
    } catch (e) {
      toast({ title: "Não deu para carregar", description: (e as Error).message, variant: "destructive" })
      setItens((x) => x ?? [])
    } finally {
      setACarregar(false)
    }
  }, [pedir, toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agir = useCallback(
    async (id: string, acao: string, valor?: string) => {
      try {
        await pedir({ method: "POST", body: JSON.stringify({ id, acao, valor }) })
        const dito: Record<string, string> = {
          aprovar: "Aprovado. Sai à hora marcada.",
          pausar: "Pausado. Volta para «à tua espera».",
          descartar: "Descartado.",
          hora: "Hora mudada.",
          legenda: "Legenda guardada.",
        }
        toast({ title: dito[acao] ?? "Feito" })
        carregar()
      } catch (e) {
        toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
      }
    },
    [pedir, toast, carregar],
  )

  const visiveis = useMemo(
    () => (itens ?? []).filter((i) => conta === "todas" || i.conta === conta),
    [itens, conta],
  )
  const agora = Date.now()
  const espera = visiveis.filter((i) => i.estado === "draft" && !i.pausado)
  const vaiSair = visiveis.filter((i) => ["approved", "processing", "publishing"].includes(i.estado))
  const reservas = visiveis.filter((i) => i.estado === "reserva")
  const falhados = visiveis.filter((i) => i.estado === "failed")
  const publicados = visiveis.filter((i) => i.estado === "published" && new Date(i.hora).getTime() > agora - 864e5)
  const pausados = visiveis.filter((i) => i.pausado)

  const porDia = (lista: Item[]) => {
    const m = new Map<string, Item[]>()
    for (const i of lista) {
      const d = diaDe(i.hora)
      m.set(d, [...(m.get(d) ?? []), i])
    }
    return Array.from(m.entries())
  }

  if (itens === null) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="h-64 animate-pulse rounded-2xl bg-zinc-900/60" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Resumo + conta: os números são botões que levam ao bloco. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-1">
          {CONTAS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setConta(c.id)}
              className={`rounded-lg px-3 py-1.5 text-xs transition active:scale-[0.98] ${
                conta === c.id ? "bg-[#D2A63C]/15 font-medium text-[#E9C46A] ring-1 ring-[#D2A63C]/40" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={carregar}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${aCarregar ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Contador n={espera.length} rotulo="À tua espera" ancora="espera" ouro />
        <Contador n={vaiSair.length} rotulo="Agendados" ancora="sair" />
        <Contador n={reservas.length} rotulo="Reservas (teste)" ancora="reservas" />
        <Contador n={publicados.length} rotulo="Publicados · 24 h" ancora="publicados" />
        <Contador n={falhados.length} rotulo="Falhados" ancora="falhados" alerta />
      </div>

      <Bloco id="espera" titulo="À tua espera" nota="Rascunhos e reels trend. Aprova, pausa ou descarta." vazio="Nada à tua espera. Tudo o que está na fila já tem decisão.">
        {espera.map((i) => (
          <Cartao key={i.id} i={i} agir={agir} />
        ))}
      </Bloco>

      <section id="sair" className="scroll-mt-4">
        <Cabeca titulo="Vai sair" nota="Aprovados, pela hora de Lisboa. Pausar devolve-o a «à tua espera»." />
        {vaiSair.length === 0 ? (
          <Vazio texto="Nada agendado." />
        ) : (
          porDia(vaiSair).map(([dia, lista]) => (
            <div key={dia} className="mb-5">
              <p className="mb-2 text-sm font-medium capitalize text-zinc-300">{dia} <span className="text-zinc-500">· {lista.length}</span></p>
              <div className="grid gap-3 md:grid-cols-2">
                {lista.map((i) => (
                  <Cartao key={i.id} i={i} agir={agir} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <Bloco
        id="reservas"
        titulo="Reservas do teste"
        nota="Cópia de cada reel que saiu como teste. Se o teste passar (≥ 2× a mediana em 24 h), a reserva publica sozinha; aos 7 dias expira."
        vazio="Sem reservas."
      >
        {reservas.map((i) => (
          <Cartao key={i.id} i={i} agir={agir} />
        ))}
      </Bloco>

      {falhados.length > 0 && (
        <Bloco id="falhados" titulo="Falhados" nota="O motivo está no cartão. Mudar a hora e aprovar volta a tentar." vazio="">
          {falhados.map((i) => (
            <Cartao key={i.id} i={i} agir={agir} />
          ))}
        </Bloco>
      )}

      <Bloco id="publicados" titulo="Publicados nas últimas 24 h" nota="Só para referência." vazio="Nada publicado nas últimas 24 h.">
        {publicados.map((i) => (
          <Cartao key={i.id} i={i} agir={agir} soLeitura />
        ))}
      </Bloco>

      {pausados.length > 0 && (
        <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/30 p-4">
          <button type="button" onClick={() => setVerPausados((v) => !v)} className="flex w-full items-center justify-between text-left">
            <span>
              <span className="text-sm font-medium text-zinc-300">Pausados ({pausados.length})</span>
              <span className="block text-xs text-zinc-500">Pausas em massa e tectos diários. Não precisam de ti.</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${verPausados ? "rotate-180" : ""}`} />
          </button>
          {verPausados && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {pausados.slice(0, 40).map((i) => (
                <Cartao key={i.id} i={i} agir={agir} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Contador({ n, rotulo, ancora, ouro, alerta }: { n: number; rotulo: string; ancora: string; ouro?: boolean; alerta?: boolean }) {
  const cor = ouro && n > 0 ? "text-[#E9C46A]" : alerta && n > 0 ? "text-red-300" : "text-zinc-100"
  return (
    <a
      href={`#${ancora}`}
      className="rounded-xl border border-white/[0.07] bg-zinc-900/50 px-4 py-3 transition hover:border-[#D2A63C]/40 active:scale-[0.99]"
    >
      <span className={`block text-2xl font-semibold tabular-nums tracking-tight ${cor}`}>{n}</span>
      <span className="mt-0.5 block text-xs text-zinc-500">{rotulo}</span>
    </a>
  )
}

function Cabeca({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{titulo}</h2>
      <p className="max-w-2xl text-xs text-zinc-500 [text-wrap:pretty]">{nota}</p>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-white/[0.08] p-4 text-sm text-zinc-500">{texto}</p>
}

function Bloco({ id, titulo, nota, vazio, children }: { id: string; titulo: string; nota: string; vazio: string; children: React.ReactNode[] }) {
  return (
    <section id={id} className="scroll-mt-4">
      <Cabeca titulo={titulo} nota={nota} />
      {children.length === 0 ? <Vazio texto={vazio} /> : <div className="grid gap-3 md:grid-cols-2">{children}</div>}
    </section>
  )
}

function Etiqueta({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "ouro" | "neutro" | "verde" | "alerta" | "azul" }) {
  const t = {
    ouro: "bg-[#D2A63C]/15 text-[#E9C46A]",
    neutro: "bg-white/[0.06] text-zinc-300",
    verde: "bg-emerald-950 text-emerald-300",
    alerta: "bg-red-950 text-red-300",
    azul: "bg-sky-950 text-sky-300",
  }[tom]
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>
}

const ESTADO: Record<string, { nome: string; tom: "ouro" | "neutro" | "verde" | "alerta" | "azul" }> = {
  draft: { nome: "Rascunho", tom: "neutro" },
  approved: { nome: "Aprovado", tom: "ouro" },
  processing: { nome: "A processar", tom: "azul" },
  publishing: { nome: "A publicar", tom: "azul" },
  reserva: { nome: "Reserva", tom: "azul" },
  published: { nome: "Publicado", tom: "verde" },
  failed: { nome: "Falhou", tom: "alerta" },
}

function Cartao({ i, agir, soLeitura }: { i: Item; agir: (id: string, acao: string, valor?: string) => void; soLeitura?: boolean }) {
  const { toast } = useToast()
  const [verGuiao, setVerGuiao] = useState(false)
  const [editarLegenda, setEditarLegenda] = useState(false)
  const [legenda, setLegenda] = useState(i.legenda)
  const [editarHora, setEditarHora] = useState(false)
  const [hora, setHora] = useState(paraInput(i.hora))
  const c = i.contexto
  const trend = i.origem === "trend"
  const est = ESTADO[i.estado] ?? { nome: i.estado, tom: "neutro" as const }
  const imagem = !i.video ? i.media.find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) ?? i.media[0] : null
  const conta = i.conta.startsWith("ricardo") ? "RG" : "MTM"
  const teste = i.tipoMedia === "REELS" && !trend && i.estado !== "reserva"

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(i.legenda)
      toast({ title: "Legenda copiada" })
    } catch {
      toast({ title: "Não deu para copiar", variant: "destructive" })
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/50">
      <div className="flex gap-3 p-3">
        {/* Media: vídeo com a capa por cima (o que aparece na grelha), ou a imagem. */}
        <div className="w-28 shrink-0 sm:w-32">
          {i.video ? (
            <video
              src={i.video}
              poster={i.capa ?? undefined}
              controls
              preload="none"
              playsInline
              className="aspect-[9/16] w-full rounded-lg bg-black object-cover"
            />
          ) : imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagem} alt={c?.titulo ?? "Imagem do post"} className="aspect-[4/5] w-full rounded-lg bg-black object-cover" />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg bg-black text-[11px] text-red-300">Sem media</div>
          )}
          {i.capa && i.video && (
            <a href={i.capa} target="_blank" rel="noreferrer" className="mt-1 block text-center text-[11px] text-zinc-500 hover:text-[#E9C46A]">
              Ver capa
            </a>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <Etiqueta tom={conta === "RG" ? "azul" : "ouro"}>{conta}</Etiqueta>
            <Etiqueta tom={est.tom}>{est.nome}</Etiqueta>
            {trend && (
              <Etiqueta tom="ouro">
                <Music className="h-3 w-3" /> Trend
              </Etiqueta>
            )}
            {teste && <Etiqueta>Reel de teste</Etiqueta>}
            {!i.video && <Etiqueta>{i.tipoMedia === "CAROUSEL" ? "Carrossel" : i.tipoMedia === "STORIES" ? "História" : i.tipoMedia === "REELS" ? "Reel" : "Imagem"}</Etiqueta>}
          </div>

          <p className="text-sm font-medium leading-snug text-zinc-100 [text-wrap:pretty]">
            {c?.gancho ?? c?.tema ?? (i.legenda.split("\n")[0] || i.origemNome)}
          </p>

          <p className="flex items-center gap-1 text-xs tabular-nums text-zinc-400">
            <Clock className="h-3 w-3" /> {fmtHora(i.hora)}
          </p>

          {/* O contexto que decide: para onde manda e com que palavra. */}
          {c && (
            <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-xs">
              {c.funil && (
                <>
                  <dt className="text-zinc-500">Funil</dt>
                  <dd className="text-zinc-200">{c.funil}</dd>
                </>
              )}
              {c.palavraChave && (
                <>
                  <dt className="text-zinc-500">Comenta</dt>
                  <dd className="text-zinc-200">
                    <span className="font-semibold text-[#E9C46A]">{c.palavraChave}</span>{" "}
                    {c.automacaoLigada ? (
                      <span className="text-emerald-400">· automação ligada</span>
                    ) : (
                      <span className="text-red-300">· sem automação</span>
                    )}
                  </dd>
                </>
              )}
              {(c.estilo || c.molde) && (
                <>
                  <dt className="text-zinc-500">Estilo</dt>
                  <dd className="text-zinc-400">{[c.estilo, c.molde].filter(Boolean).join(" · ")}</dd>
                </>
              )}
              {c.ideia && (
                <>
                  <dt className="text-zinc-500">Ideia</dt>
                  <dd className="truncate text-zinc-400" title={c.ideia}>{c.ideia}</dd>
                </>
              )}
            </dl>
          )}
          {!c && <p className="text-xs text-zinc-500">{i.origemNome}</p>}

          {trend && c?.audio && (
            <p className="rounded-lg bg-[#D2A63C]/10 px-2 py-1.5 text-xs text-[#E9C46A]">
              <Music className="mr-1 inline h-3 w-3" /> Junta na app: {c.audio.split(" — ")[0]}
            </p>
          )}
          {i.erro && !i.erro.startsWith("🎵") && (
            <p className="flex gap-1 text-xs text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {i.erro}
            </p>
          )}
        </div>
      </div>

      {/* Guião e legenda: fechados por omissão, abrem no mesmo cartão (sem janelas). */}
      <div className="border-t border-white/[0.05] px-3 py-2">
        <button type="button" onClick={() => setVerGuiao((v) => !v)} className="flex w-full items-center justify-between text-xs text-zinc-400 hover:text-zinc-200">
          {c?.guiao ? "Guião e legenda" : "Legenda"}
          <ChevronDown className={`h-3.5 w-3.5 transition ${verGuiao ? "rotate-180" : ""}`} />
        </button>
        {verGuiao && (
          <div className="mt-2 space-y-3 text-xs leading-relaxed">
            {c?.guiao && (
              <div>
                <p className="mb-0.5 text-[11px] uppercase tracking-wide text-zinc-500">O que a voz diz</p>
                <p className="whitespace-pre-wrap text-zinc-200">{c.guiao}</p>
              </div>
            )}
            <div>
              <p className="mb-0.5 text-[11px] uppercase tracking-wide text-zinc-500">Legenda</p>
              {editarLegenda ? (
                <div className="space-y-2">
                  <textarea
                    value={legenda}
                    onChange={(e) => setLegenda(e.target.value)}
                    rows={8}
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-xs text-zinc-100 focus:border-[#D2A63C]/60 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <Botao onClick={() => { agir(i.id, "legenda", legenda); setEditarLegenda(false) }} principal>
                      Guardar
                    </Botao>
                    <Botao onClick={() => { setLegenda(i.legenda); setEditarLegenda(false) }}>Cancelar</Botao>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-zinc-300">{i.legenda || "—"}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {editarHora && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-3 py-2">
          <input
            type="datetime-local"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="rounded-lg border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 [color-scheme:dark]"
          />
          <span className="text-[11px] text-zinc-500">hora de Lisboa</span>
          <Botao onClick={() => { agir(i.id, "hora", deInput(hora)); setEditarHora(false) }} principal>
            Guardar
          </Botao>
          <Botao onClick={() => setEditarHora(false)}>Cancelar</Botao>
        </div>
      )}

      {!soLeitura && (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/[0.05] p-2.5">
          {trend ? (
            <>
              {i.video && (
                <a href={i.video} download target="_blank" rel="noreferrer" className={classeBotao(true)}>
                  <Download className="h-3.5 w-3.5" /> Vídeo
                </a>
              )}
              <Botao onClick={copiar}>
                <Copy className="h-3.5 w-3.5" /> Legenda
              </Botao>
            </>
          ) : i.estado === "draft" || i.estado === "failed" ? (
            <Botao onClick={() => agir(i.id, "aprovar")} principal>
              <Check className="h-3.5 w-3.5" /> Aprovar
            </Botao>
          ) : i.estado === "approved" ? (
            <Botao onClick={() => agir(i.id, "pausar")}>
              <Pause className="h-3.5 w-3.5" /> Pausar
            </Botao>
          ) : null}
          {i.estado !== "reserva" && (
            <Botao onClick={() => setEditarHora((v) => !v)}>
              <Clock className="h-3.5 w-3.5" /> Hora
            </Botao>
          )}
          <Botao onClick={() => { setVerGuiao(true); setEditarLegenda(true) }}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Botao>
          <Botao onClick={() => agir(i.id, "descartar")} perigo>
            <X className="h-3.5 w-3.5" /> Descartar
          </Botao>
        </div>
      )}
    </article>
  )
}

const classeBotao = (principal?: boolean, perigo?: boolean) =>
  `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2A63C]/60 ${
    principal
      ? "bg-[#D2A63C] text-zinc-950 hover:bg-[#E9C46A]"
      : perigo
        ? "text-zinc-500 hover:bg-red-950/60 hover:text-red-300"
        : "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.09]"
  }`

function Botao({ children, onClick, principal, perigo }: { children: React.ReactNode; onClick: () => void; principal?: boolean; perigo?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={classeBotao(principal, perigo)}>
      {children}
    </button>
  )
}
