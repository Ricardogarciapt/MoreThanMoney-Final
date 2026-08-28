"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, RotateCcw, Trash2, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

/**
 * O mapa dos funis: caixas e setas, arrastáveis.
 *
 * O funil vivia em três sítios ao mesmo tempo — no código que responde no Telegram, nas mensagens
 * que ele envia e na cabeça de quem o montou. Ninguém via o desenho inteiro, e por isso ninguém
 * dava por um caminho que não levava a lado nenhum.
 *
 * As ferramentas de funis boas fazem todas a mesma coisa, e é a coisa certa: o que decide um
 * desenho não é a lista de passos, é a LIGAÇÃO entre eles. Por isso aqui o que se arrasta são as
 * caixas, e o que se vê são as setas — incluindo as que acabam em nada, que são as que interessa
 * ver.
 *
 * ── O que isto não faz ────────────────────────────────────────────────────────────────────────
 * Não executa. O motor continua a ser o código do Telegram e do ManyChat. Isto é o desenho e a
 * documentação viva dele. Prometer que arrastar uma caixa muda o comportamento seria mentir — e
 * um mapa em que não se confia é pior do que não haver mapa.
 */

type TipoDeNo = "entrada" | "mensagem" | "espera" | "condicao" | "destino" | "saida"

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

/** Cada tipo tem a sua cor. A cor é o que se lê primeiro num mapa com trinta caixas. */
const CORES: Record<TipoDeNo, { fundo: string; borda: string; texto: string; rotulo: string }> = {
  entrada: { fundo: "#ecfdf5", borda: "#10b981", texto: "#065f46", rotulo: "entrada" },
  mensagem: { fundo: "#fffbeb", borda: "#D2A63C", texto: "#78350f", rotulo: "mensagem" },
  espera: { fundo: "#f5f3ff", borda: "#8b5cf6", texto: "#4c1d95", rotulo: "espera" },
  condicao: { fundo: "#eff6ff", borda: "#3b82f6", texto: "#1e3a8a", rotulo: "condição" },
  destino: { fundo: "#f0fdf4", borda: "#22c55e", texto: "#14532d", rotulo: "destino" },
  saida: { fundo: "#fef2f2", borda: "#ef4444", texto: "#7f1d1d", rotulo: "fuga" },
}

const LARGURA = 230
const ALTURA = 78

export function MapaFunis() {
  const { toast } = useToast()
  const [funis, setFunis] = useState<Funil[]>([])
  const [ativo, setAtivo] = useState(0)
  const [aLer, setALer] = useState(true)
  const [aGravar, setAGravar] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  /** De onde parte a seta que se está a desenhar. */
  const [aLigar, setALigar] = useState<string | null>(null)
  const tela = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch("/api/admin/social/funis", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
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
    setFunis((f) =>
      f.map((x, i) =>
        i !== ativo ? x : { ...x, nos: x.nos.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
      ),
    )
    setSujo(true)
  }

  // ── Arrastar ────────────────────────────────────────────────────────────────────────────────

  const aoDescer = (e: React.PointerEvent, n: No) => {
    if (aLigar) {
      // A segunda caixa fecha a seta. Ligar a si própria faria um laço que o mapa desenha por
      // cima de si mesmo e não significa nada.
      if (aLigar !== n.id) {
        const origem = funil.nos.find((x) => x.id === aLigar)
        if (origem && !origem.seguintes.includes(n.id)) {
          mexerNo(aLigar, { seguintes: [...origem.seguintes, n.id] })
        }
      }
      setALigar(null)
      return
    }
    const caixa = tela.current?.getBoundingClientRect()
    if (!caixa) return
    arrasto.current = { id: n.id, dx: e.clientX - caixa.left - n.x, dy: e.clientY - caixa.top - n.y }
    setSelecionado(n.id)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const aoMover = (e: React.PointerEvent) => {
    const a = arrasto.current
    const caixa = tela.current?.getBoundingClientRect()
    if (!a || !caixa) return
    mexerNo(a.id, {
      // Preso à grelha de 10: sem isto o mapa fica sempre torto, e um mapa torto lê-se pior.
      x: Math.max(0, Math.round((e.clientX - caixa.left - a.dx) / 10) * 10),
      y: Math.max(0, Math.round((e.clientY - caixa.top - a.dy) / 10) * 10),
    })
  }

  const aoLevantar = () => { arrasto.current = null }

  // ── Desenhar ────────────────────────────────────────────────────────────────────────────────

  if (aLer) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (!funil) return <p className="py-20 text-center text-sm text-neutral-500">Sem funis.</p>

  const alturaTela = Math.max(600, ...funil.nos.map((n) => n.y + ALTURA + 60))
  const larguraTela = Math.max(900, ...funil.nos.map((n) => n.x + LARGURA + 60))
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
        <div
          ref={tela}
          onPointerMove={aoMover}
          onPointerUp={aoLevantar}
          className="relative flex-1 overflow-auto rounded-xl border bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:20px_20px]"
          style={{ height: 620 }}
        >
          <div style={{ width: larguraTela, height: alturaTela, position: "relative" }}>
            {/* As setas. Desenhadas por baixo das caixas para não taparem o texto. */}
            <svg width={larguraTela} height={alturaTela} className="pointer-events-none absolute inset-0">
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
                  // Curva em S: linhas retas cruzadas ficam impossíveis de seguir com o olho.
                  const meio = (y1 + y2) / 2
                  return (
                    <path
                      key={`${n.id}-${idDestino}`}
                      d={`M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2 - 4}`}
                      stroke="#9ca3af"
                      strokeWidth="1.5"
                      fill="none"
                      markerEnd="url(#ponta)"
                    />
                  )
                }),
              )}
            </svg>

            {funil.nos.map((n) => {
              const c = CORES[n.tipo]
              const semSaida = n.seguintes.length === 0 && n.tipo !== "saida" && n.tipo !== "destino"
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => aoDescer(e, n)}
                  className="absolute cursor-grab select-none rounded-xl border-2 p-2.5 shadow-sm active:cursor-grabbing"
                  style={{
                    left: n.x,
                    top: n.y,
                    width: LARGURA,
                    minHeight: ALTURA,
                    background: c.fundo,
                    borderColor: selecionado === n.id ? "#111" : c.borda,
                    outline: aLigar === n.id ? "2px dashed #111" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: c.borda }}>
                      {c.rotulo}
                    </span>
                    {/* Um passo sem saída é onde o funil trava. Vale mais vê-lo do que contá-lo. */}
                    {semSaida && <span className="text-[10px] font-bold text-red-600">sem saída</span>}
                  </div>
                  <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: c.texto }}>
                    {n.titulo}
                  </p>
                  {n.detalhe && <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{n.detalhe}</p>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Painel do nó selecionado */}
        <div className="w-64 shrink-0 space-y-3 rounded-xl border bg-white p-3">
          {!noSelecionado ? (
            <>
              <p className="text-sm font-semibold">O mapa</p>
              <p className="text-xs leading-relaxed text-neutral-500">
                Arrasta as caixas para arrumar. Toca numa para a editar. As caixas marcadas{" "}
                <b className="text-red-600">sem saída</b> são onde o funil trava — é isso que este
                mapa serve para ver.
              </p>
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
                Isto é o desenho, não o motor. Quem responde no Telegram continua a ser o código —
                mexer aqui documenta, não muda o comportamento.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  const id = `no-${Date.now()}`
                  setFunis((f) =>
                    f.map((x, i) =>
                      i !== ativo
                        ? x
                        : { ...x, nos: [...x.nos, { id, tipo: "mensagem" as TipoDeNo, titulo: "Novo passo", x: 40, y: 40, seguintes: [] }] },
                    ),
                  )
                  setSelecionado(id)
                  setSujo(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Novo passo
              </Button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-neutral-500">Título</label>
                <Input
                  value={noSelecionado.titulo}
                  onChange={(e) => mexerNo(noSelecionado.id, { titulo: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Detalhe</label>
                <Input
                  value={noSelecionado.detalhe ?? ""}
                  onChange={(e) => mexerNo(noSelecionado.id, { detalhe: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Tipo</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(Object.keys(CORES) as TipoDeNo[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => mexerNo(noSelecionado.id, { tipo: t })}
                      className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={{
                        background: noSelecionado.tipo === t ? CORES[t].fundo : "transparent",
                        borderColor: noSelecionado.tipo === t ? CORES[t].borda : "#e5e5e5",
                        color: noSelecionado.tipo === t ? CORES[t].texto : "#666",
                      }}
                    >
                      {CORES[t].rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500">Vai para</label>
                <div className="mt-1 space-y-1">
                  {noSelecionado.seguintes.map((s) => (
                    <div key={s} className="flex items-center justify-between gap-1 rounded border px-2 py-1 text-[11px]">
                      <span className="truncate">{funil.nos.find((x) => x.id === s)?.titulo ?? s}</span>
                      <button
                        onClick={() =>
                          mexerNo(noSelecionado.id, {
                            seguintes: noSelecionado.seguintes.filter((x) => x !== s),
                          })
                        }
                        className="shrink-0 text-neutral-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant={aLigar === noSelecionado.id ? "default" : "outline"}
                    className="w-full"
                    onClick={() => setALigar(aLigar === noSelecionado.id ? null : noSelecionado.id)}
                  >
                    {aLigar === noSelecionado.id ? "Toca no destino…" : "Ligar a outro passo"}
                  </Button>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="w-full text-red-500"
                onClick={() => {
                  setFunis((f) =>
                    f.map((x, i) =>
                      i !== ativo
                        ? x
                        : {
                            ...x,
                            // Apagar um passo apaga também as setas que APONTAVAM para ele —
                            // senão ficam setas para o nada, que é pior do que não ter mapa.
                            nos: x.nos
                              .filter((n) => n.id !== noSelecionado.id)
                              .map((n) => ({ ...n, seguintes: n.seguintes.filter((s) => s !== noSelecionado.id) })),
                          },
                    ),
                  )
                  setSelecionado(null)
                  setSujo(true)
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar passo
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
