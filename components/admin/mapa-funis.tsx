"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, RotateCcw, Trash2, Save, ZoomIn, ZoomOut, Maximize2,
  MessageSquare, GitBranch, Clock, Zap, Webhook, Shuffle, CornerDownRight, Flag, LogIn, AlertTriangle,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

/**
 * O mapa dos funis: blocos, ligações, zoom e arrasto.
 *
 * O funil vivia em três sítios ao mesmo tempo — no código que responde no Telegram, nas mensagens
 * que ele envia e na cabeça de quem o montou. Ninguém via o desenho inteiro, e por isso ninguém
 * dava por um caminho que não levava a lado nenhum.
 *
 * ── Porque é assim e não de outra maneira ─────────────────────────────────────────────────────
 * As ferramentas deste género — ManyChat, n8n, os construtores de funis — convergiram todas no
 * mesmo desenho, e a convergência não é moda: é o que funciona. Três coisas em concreto:
 *
 *  · a tela move-se e amplia-se, porque um funil a sério não cabe num ecrã e obrigar a fazer
 *    scroll perde a noção do todo, que é a única coisa que um mapa dá;
 *  · liga-se ARRASTANDO da bolinha de saída de um bloco para outro, não escolhendo de uma lista:
 *    a lista obriga a saber o nome do destino, o arrasto só obriga a vê-lo;
 *  · os blocos são de TIPOS com cor e ícone, porque num mapa com trinta caixas a cor lê-se antes
 *    do texto.
 *
 * ── O que isto NÃO faz ────────────────────────────────────────────────────────────────────────
 * Não executa. O motor continua a ser o código do Telegram e do ManyChat. Isto é o desenho e a
 * documentação viva dele — e está escrito no próprio painel, porque um mapa em que se acredita
 * que muda o comportamento é pior do que não haver mapa.
 */

type TipoDeNo =
  | "entrada" | "mensagem" | "espera" | "condicao" | "acao"
  | "webhook" | "divisao" | "irpara" | "destino" | "saida"

interface No {
  id: string
  tipo: TipoDeNo
  titulo: string
  detalhe?: string
  x: number
  y: number
  seguintes: string[]
  mensagem?: string
}

interface Funil {
  id: string
  nome: string
  descricao: string
  nos: No[]
}

/** Cada tipo tem cor e ícone. Num mapa com trinta caixas, a cor lê-se antes do texto. */
const BLOCOS: Record<TipoDeNo, {
  rotulo: string
  fundo: string
  borda: string
  texto: string
  Icone: typeof MessageSquare
  ajuda: string
}> = {
  entrada:  { rotulo: "Entrada",   fundo: "#ecfdf5", borda: "#10b981", texto: "#065f46", Icone: LogIn,           ajuda: "Por onde a pessoa entra no funil" },
  mensagem: { rotulo: "Mensagem",  fundo: "#fffbeb", borda: "#D2A63C", texto: "#78350f", Icone: MessageSquare,   ajuda: "O que se envia" },
  espera:   { rotulo: "Espera",    fundo: "#f5f3ff", borda: "#8b5cf6", texto: "#4c1d95", Icone: Clock,           ajuda: "Um intervalo antes do passo seguinte" },
  condicao: { rotulo: "Condição",  fundo: "#eff6ff", borda: "#3b82f6", texto: "#1e3a8a", Icone: GitBranch,       ajuda: "O caminho parte-se em dois" },
  acao:     { rotulo: "Ação",      fundo: "#fdf4ff", borda: "#a855f7", texto: "#581c87", Icone: Zap,             ajuda: "Etiquetar, dar cupão, mudar o estado" },
  webhook:  { rotulo: "Automação", fundo: "#f0f9ff", borda: "#0ea5e9", texto: "#075985", Icone: Webhook,         ajuda: "Chama algo de fora (n8n, ManyChat, API)" },
  divisao:  { rotulo: "Teste A/B", fundo: "#fff7ed", borda: "#f97316", texto: "#7c2d12", Icone: Shuffle,         ajuda: "Divide o tráfego para comparar" },
  irpara:   { rotulo: "Ir para",   fundo: "#f8fafc", borda: "#64748b", texto: "#0f172a", Icone: CornerDownRight, ajuda: "Salta para outro funil" },
  destino:  { rotulo: "Destino",   fundo: "#f0fdf4", borda: "#22c55e", texto: "#14532d", Icone: Flag,            ajuda: "Onde queremos que a pessoa chegue" },
  saida:    { rotulo: "Fuga",      fundo: "#fef2f2", borda: "#ef4444", texto: "#7f1d1d", Icone: AlertTriangle,   ajuda: "Onde se perde gente" },
}

const LARGURA = 216
const ALTURA = 76
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2

export function MapaFunis() {
  const { toast } = useToast()
  const [funis, setFunis] = useState<Funil[]>([])
  const [ativo, setAtivo] = useState(0)
  const [aLer, setALer] = useState(true)
  const [aGravar, setAGravar] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [selecionado, setSelecionado] = useState<string | null>(null)

  /** Zoom e deslocação da tela. */
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  /** A ligação que está a ser arrastada, da bolinha de saída até largar. */
  const [aLigar, setALigar] = useState<{ de: string; x: number; y: number } | null>(null)

  const tela = useRef<HTMLDivElement>(null)
  const arrastoNo = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const arrastoTela = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch("/api/admin/social/funis", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" })
      const j = await r.json()
      if (j.ok) setFunis(j.funis)
    } catch {
      toast({ title: "Não deu para ler os funis", variant: "destructive" })
    } finally {
      setALer(false)
    }
  }, [toast])

  useEffect(() => { carregar() }, [carregar])

  const gravar = async (repor = false) => {
    setAGravar(true)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch("/api/admin/social/funis", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(repor ? { repor: true } : { funis }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setFunis(j.funis)
      setSujo(false)
      toast({ title: repor ? "Reposto o desenho do código" : "Mapa guardado" })
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAGravar(false)
    }
  }

  const funil = funis[ativo]

  const mexerNo = (id: string, patch: Partial<No>) => {
    setFunis((f) => f.map((x, i) => (i !== ativo ? x : { ...x, nos: x.nos.map((n) => (n.id === id ? { ...n, ...patch } : n)) })))
    setSujo(true)
  }

  /** Coordenadas do rato em coordenadas DA TELA — sem isto, com zoom tudo cai ao lado. */
  const naTela = (e: { clientX: number; clientY: number }) => {
    const caixa = tela.current?.getBoundingClientRect()
    if (!caixa) return { x: 0, y: 0 }
    return { x: (e.clientX - caixa.left - pan.x) / zoom, y: (e.clientY - caixa.top - pan.y) / zoom }
  }

  // ── Arrastar blocos, tela e ligações ────────────────────────────────────────────────────────

  const aoMover = (e: React.PointerEvent) => {
    if (arrastoNo.current) {
      const p = naTela(e)
      // Preso à grelha de 10: sem isto o mapa fica sempre torto, e um mapa torto lê-se pior.
      mexerNo(arrastoNo.current.id, {
        x: Math.max(0, Math.round((p.x - arrastoNo.current.dx) / 10) * 10),
        y: Math.max(0, Math.round((p.y - arrastoNo.current.dy) / 10) * 10),
      })
      return
    }
    if (arrastoTela.current) {
      setPan({
        x: arrastoTela.current.panX + (e.clientX - arrastoTela.current.x),
        y: arrastoTela.current.panY + (e.clientY - arrastoTela.current.y),
      })
      return
    }
    if (aLigar) {
      const p = naTela(e)
      setALigar({ ...aLigar, x: p.x, y: p.y })
    }
  }

  const aoLevantar = (e: React.PointerEvent) => {
    // Largar uma ligação em cima de um bloco fecha a seta. Em cima de nada, desiste — arrastar
    // para o vazio é o gesto natural de "afinal não".
    if (aLigar) {
      const alvo = (e.target as HTMLElement).closest("[data-no]")?.getAttribute("data-no")
      if (alvo && alvo !== aLigar.de) {
        const origem = funil?.nos.find((n) => n.id === aLigar.de)
        if (origem && !origem.seguintes.includes(alvo)) {
          mexerNo(aLigar.de, { seguintes: [...origem.seguintes, alvo] })
        }
      }
      setALigar(null)
    }
    arrastoNo.current = null
    arrastoTela.current = null
  }

  const aoRodar = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    // Amplia à volta do CURSOR e não do canto: ampliar pelo canto obriga a reencontrar o sítio
    // onde se estava a olhar, a cada passo.
    const caixa = tela.current?.getBoundingClientRect()
    if (!caixa) return
    const rx = e.clientX - caixa.left
    const ry = e.clientY - caixa.top
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (e.deltaY < 0 ? 1.1 : 0.9)))
    setPan({ x: rx - ((rx - pan.x) / zoom) * novo, y: ry - ((ry - pan.y) / zoom) * novo })
    setZoom(novo)
  }

  /** Encaixa o funil inteiro no ecrã. É o botão que se usa mais depois de arrastar. */
  const encaixar = useCallback(() => {
    const caixa = tela.current?.getBoundingClientRect()
    if (!caixa || !funil?.nos.length) return
    const maxX = Math.max(...funil.nos.map((n) => n.x + LARGURA))
    const maxY = Math.max(...funil.nos.map((n) => n.y + ALTURA))
    const minX = Math.min(...funil.nos.map((n) => n.x))
    const minY = Math.min(...funil.nos.map((n) => n.y))
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((caixa.width - 60) / (maxX - minX), (caixa.height - 60) / (maxY - minY))))
    setZoom(z)
    setPan({ x: 30 - minX * z, y: 30 - minY * z })
  }, [funil])

  useEffect(() => { if (funil) encaixar() }, [ativo, funil, encaixar])

  const acrescentar = (tipo: TipoDeNo) => {
    const caixa = tela.current?.getBoundingClientRect()
    const id = `no-${Date.now()}`
    // Nasce no meio do que está a ser visto — nascer em (0,0) obrigava a procurá-lo.
    const x = Math.round((((caixa?.width ?? 600) / 2 - pan.x) / zoom - LARGURA / 2) / 10) * 10
    const y = Math.round((((caixa?.height ?? 400) / 2 - pan.y) / zoom - ALTURA / 2) / 10) * 10
    setFunis((f) => f.map((x2, i) => (i !== ativo ? x2 : {
      ...x2,
      nos: [...x2.nos, { id, tipo, titulo: BLOCOS[tipo].rotulo, x: Math.max(0, x), y: Math.max(0, y), seguintes: [] }],
    })))
    setSelecionado(id)
    setSujo(true)
  }

  if (aLer) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
  }
  if (!funil) return <p className="py-20 text-center text-sm text-neutral-500">Sem funis.</p>

  const noSelecionado = funil.nos.find((n) => n.id === selecionado) ?? null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {funis.map((f, i) => (
          <button
            key={f.id}
            onClick={() => { setAtivo(i); setSelecionado(null); setALigar(null) }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              i === ativo ? "bg-neutral-900 text-white" : "border bg-white text-neutral-600"
            }`}
          >
            {f.nome}
          </button>
        ))}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => gravar(true)} disabled={aGravar} title="Voltar ao desenho que o código faz hoje">
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Repor
        </Button>
        <Button size="sm" onClick={() => gravar()} disabled={!sujo || aGravar}>
          <Save className="mr-1 h-3.5 w-3.5" /> {aGravar ? "A guardar…" : "Guardar"}
        </Button>
      </div>

      <p className="text-xs text-neutral-500">{funil.descricao}</p>

      <div className="flex gap-3">
        {/* Paleta de blocos */}
        <div className="w-40 shrink-0 space-y-1 rounded-xl border bg-white p-2">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Blocos</p>
          {(Object.keys(BLOCOS) as TipoDeNo[]).map((t) => {
            const b = BLOCOS[t]
            return (
              <button
                key={t}
                onClick={() => acrescentar(t)}
                title={b.ajuda}
                className="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12px] transition hover:shadow-sm"
                style={{ borderColor: `${b.borda}55`, background: b.fundo, color: b.texto }}
              >
                <b.Icone className="h-3.5 w-3.5 shrink-0" style={{ color: b.borda }} />
                {b.rotulo}
              </button>
            )
          })}
        </div>

        {/* A tela */}
        <div className="relative flex-1">
          <div
            ref={tela}
            onWheel={aoRodar}
            onPointerMove={aoMover}
            onPointerUp={aoLevantar}
            onPointerLeave={aoLevantar}
            onPointerDown={(e) => {
              // Arrastar no vazio move a tela — é o gesto que toda a gente tenta primeiro.
              if ((e.target as HTMLElement).closest("[data-no]")) return
              arrastoTela.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
              setSelecionado(null)
            }}
            className="relative h-[620px] cursor-grab overflow-hidden rounded-xl border bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:20px_20px] active:cursor-grabbing"
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: 4000,
                height: 3000,
                position: "relative",
              }}
            >
              <svg width={4000} height={3000} className="pointer-events-none absolute inset-0">
                <defs>
                  <marker id="ponta" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                    <path d="M0,0 L9,4.5 L0,9 z" fill="#9ca3af" />
                  </marker>
                </defs>
                {funil.nos.flatMap((n) =>
                  n.seguintes.map((idDestino) => {
                    const d = funil.nos.find((x) => x.id === idDestino)
                    if (!d) return null
                    const x1 = n.x + LARGURA / 2
                    const y1 = n.y + ALTURA
                    const x2 = d.x + LARGURA / 2
                    const y2 = d.y
                    // Curva em S: retas cruzadas ficam impossíveis de seguir com o olho.
                    const meio = (y1 + y2) / 2
                    return (
                      <path
                        key={`${n.id}-${idDestino}`}
                        d={`M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2 - 5}`}
                        stroke="#9ca3af" strokeWidth="1.5" fill="none" markerEnd="url(#ponta)"
                      />
                    )
                  }),
                )}
                {/* A ligação em curso, a seguir o rato. */}
                {aLigar && (() => {
                  const o = funil.nos.find((n) => n.id === aLigar.de)
                  if (!o) return null
                  return (
                    <path
                      d={`M${o.x + LARGURA / 2},${o.y + ALTURA} L${aLigar.x},${aLigar.y}`}
                      stroke="#111" strokeWidth="1.5" strokeDasharray="4 3" fill="none"
                    />
                  )
                })()}
              </svg>

              {funil.nos.map((n) => {
                const b = BLOCOS[n.tipo] ?? BLOCOS.mensagem
                const semSaida = n.seguintes.length === 0 && n.tipo !== "saida" && n.tipo !== "destino"
                return (
                  <div
                    key={n.id}
                    data-no={n.id}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).dataset.porta) return
                      const p = naTela(e)
                      arrastoNo.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y }
                      setSelecionado(n.id)
                    }}
                    className="absolute cursor-grab select-none rounded-xl border-2 p-2.5 shadow-sm active:cursor-grabbing"
                    style={{
                      left: n.x, top: n.y, width: LARGURA, minHeight: ALTURA,
                      background: b.fundo,
                      borderColor: selecionado === n.id ? "#111" : b.borda,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <b.Icone className="h-3 w-3 shrink-0" style={{ color: b.borda }} />
                      <span className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: b.borda }}>
                        {b.rotulo}
                      </span>
                      <span className="flex-1" />
                      {semSaida && <span className="text-[9.5px] font-bold text-red-600">sem saída</span>}
                    </div>
                    <p className="mt-0.5 text-[12.5px] font-semibold leading-snug" style={{ color: b.texto }}>{n.titulo}</p>
                    {n.detalhe && <p className="mt-0.5 text-[10.5px] leading-snug text-neutral-500">{n.detalhe}</p>}

                    {/* A bolinha de saída: arrasta-se dela para outro bloco. Ligar por arrasto em
                        vez de escolher de uma lista só obriga a VER o destino, não a saber o nome. */}
                    <div
                      data-porta="1"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        const p = naTela(e)
                        setALigar({ de: n.id, x: p.x, y: p.y })
                      }}
                      title="Arrasta daqui para outro bloco"
                      className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 bg-white"
                      style={{ borderColor: b.borda }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Zoom */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border bg-white/95 p-1 shadow-sm">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z * 0.85))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-10 text-center text-[11px] tabular-nums text-neutral-500">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.15))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={encaixar} title="Encaixar no ecrã">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-2 py-1 text-[10.5px] text-neutral-400">
            arrasta o fundo para mover · ⌘/ctrl + roda para ampliar
          </p>
        </div>

        {/* Painel do bloco */}
        <div className="w-60 shrink-0 space-y-3 rounded-xl border bg-white p-3">
          {!noSelecionado ? (
            <>
              <p className="text-sm font-semibold">O mapa</p>
              <p className="text-xs leading-relaxed text-neutral-500">
                Escolhe um bloco à esquerda para o acrescentar. Arrasta a bolinha de baixo de um
                bloco para outro para os ligar. Os marcados <b className="text-red-600">sem saída</b>{" "}
                são onde o funil trava — é isso que este mapa serve para ver.
              </p>
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
                Isto é o desenho, não o motor. Quem responde no Telegram continua a ser o código —
                mexer aqui documenta, não muda o comportamento.
              </p>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-neutral-500">Título</label>
                <Input value={noSelecionado.titulo} onChange={(e) => mexerNo(noSelecionado.id, { titulo: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Detalhe</label>
                <Input value={noSelecionado.detalhe ?? ""} onChange={(e) => mexerNo(noSelecionado.id, { detalhe: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Tipo</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(Object.keys(BLOCOS) as TipoDeNo[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => mexerNo(noSelecionado.id, { tipo: t })}
                      className="rounded-full border px-2 py-0.5 text-[10.5px]"
                      style={{
                        background: noSelecionado.tipo === t ? BLOCOS[t].fundo : "transparent",
                        borderColor: noSelecionado.tipo === t ? BLOCOS[t].borda : "#e5e5e5",
                        color: noSelecionado.tipo === t ? BLOCOS[t].texto : "#666",
                      }}
                    >
                      {BLOCOS[t].rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500">Vai para</label>
                <div className="mt-1 space-y-1">
                  {noSelecionado.seguintes.length === 0 && (
                    <p className="text-[11px] text-neutral-400">Nada — arrasta a bolinha para ligar.</p>
                  )}
                  {noSelecionado.seguintes.map((s) => (
                    <div key={s} className="flex items-center justify-between gap-1 rounded border px-2 py-1 text-[11px]">
                      <span className="truncate">{funil.nos.find((x) => x.id === s)?.titulo ?? s}</span>
                      <button
                        onClick={() => mexerNo(noSelecionado.id, { seguintes: noSelecionado.seguintes.filter((x) => x !== s) })}
                        className="shrink-0 text-neutral-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                size="sm" variant="ghost" className="w-full text-red-500"
                onClick={() => {
                  setFunis((f) => f.map((x, i) => (i !== ativo ? x : {
                    ...x,
                    // Apagar um bloco apaga também as setas que APONTAVAM para ele — senão ficam
                    // setas para o nada, que é pior do que não ter mapa.
                    nos: x.nos.filter((n) => n.id !== noSelecionado.id)
                      .map((n) => ({ ...n, seguintes: n.seguintes.filter((s) => s !== noSelecionado.id) })),
                  })))
                  setSelecionado(null)
                  setSujo(true)
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar bloco
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
