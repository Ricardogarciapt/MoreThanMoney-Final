"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CAMPOS_POR_TIPO, campoVisivel, camposEmFalta, nomesDosRamos, problemasDoFunil,
  resumoDoNo, valoresPorOmissao, type Campo,
} from "@/lib/funis-campos"
import {
  Copy, Download, Loader2, PlayCircle, Sparkles, Upload, RotateCcw, Trash2, Save, ZoomIn, ZoomOut, Maximize2,
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
  config?: Record<string, unknown>
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


/**
 * O formulário de um bloco — desenhado a partir da tabela de campos, não escrito à mão.
 *
 * Sabe oito tipos de campo e mais nada. Cada bloco novo é uma entrada em `CAMPOS_POR_TIPO`, não
 * um formulário novo aqui: dez formulários independentes derivam uns dos outros até nenhum se
 * parecer com o vizinho, e um tipo novo obrigaria sempre a mexer no editor.
 *
 * Chama-se a si próprio para o tipo `lista`, onde cada linha é outro conjunto de campos.
 */
function CamposDoBloco({
  campos,
  valores,
  mensagens,
  funis,
  aoMudar,
}: {
  campos: Campo[]
  valores: Record<string, unknown>
  mensagens: Array<{ chave: string; titulo: string }>
  funis: Array<{ id: string; nome: string }>
  aoMudar: (chave: string, valor: unknown) => void
}) {
  if (!campos.length) return null

  return (
    <div className="space-y-2.5 rounded-lg border bg-neutral-50 p-2.5">
      {campos.filter((c) => campoVisivel(c, valores)).map((c) => {
        const v = valores[c.chave] ?? c.padrao ?? ""

        const rotulo = (
          <label className="text-[11px] font-medium text-neutral-600">
            {c.rotulo}
            {c.sufixo && <span className="ml-1 font-normal text-neutral-600">({c.sufixo})</span>}
            {c.obrigatorio && <span className="ml-0.5 text-red-500">*</span>}
            {c.dica && <span className="ml-1 font-normal text-neutral-600">· {c.dica}</span>}
          </label>
        )
        const ajuda = c.ajuda ? <p className="mt-0.5 text-[11px] text-neutral-600">{c.ajuda}</p> : null

        // Um aviso não guarda valor nenhum: está ali para explicar.
        if (c.tipo === "aviso") {
          return (
            <p key={c.chave} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              {c.ajuda}
            </p>
          )
        }

        if (c.tipo === "lista") {
          const linhas = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
          const mexerLinha = (i: number, chave: string, valor: unknown) => {
            const proximas = linhas.map((l, j) => (j === i ? { ...l, [chave]: valor } : l))
            if (valor === "" || valor == null) delete proximas[i][chave]
            aoMudar(c.chave, proximas)
          }
          return (
            <div key={c.chave}>
              {rotulo}
              {ajuda}
              <div className="mt-1 space-y-1.5">
                {linhas.map((linha, i) => (
                  <div key={i} className="rounded border bg-white p-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10.5px] font-bold uppercase tracking-wide text-neutral-600">
                        {i + 1}
                      </span>
                      <button
                        onClick={() => aoMudar(c.chave, linhas.filter((_, j) => j !== i))}
                        className="text-neutral-600 hover:text-red-500"
                        title="Apagar esta linha"
                      >
                        ×
                      </button>
                    </div>
                    <CamposDoBloco
                      campos={c.linha ?? []}
                      valores={linha}
                      mensagens={mensagens}
                      funis={funis}
                      aoMudar={(chave, valor) => mexerLinha(i, chave, valor)}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => aoMudar(c.chave, [...linhas, valoresDaLinha(c.linha ?? [])])}
                className="mt-1 w-full rounded border border-dashed py-1 text-[11px] text-neutral-600 hover:bg-white"
              >
                + {c.rotuloAcrescentar ?? "Acrescentar"}
              </button>
            </div>
          )
        }

        if (c.tipo === "booleano") {
          return (
            <label key={c.chave} className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={v === true} onChange={(e) => aoMudar(c.chave, e.target.checked)} className="mt-0.5" />
              <span>
                <span className="text-[11px] font-medium text-neutral-600">{c.rotulo}</span>
                {c.ajuda && <span className="block text-[11px] text-neutral-600">{c.ajuda}</span>}
              </span>
            </label>
          )
        }

        // As três escolhas partilham o mesmo desenho; só a lista muda de origem.
        const opcoes =
          c.tipo === "mensagem"
            ? mensagens.map((m) => ({ valor: m.chave, rotulo: m.titulo }))
            : c.tipo === "funil"
              ? funis.map((f) => ({ valor: f.id, rotulo: f.nome }))
              : c.opcoes

        if (opcoes) {
          return (
            <div key={c.chave}>
              {rotulo}
              <select
                value={String(v)}
                onChange={(e) => aoMudar(c.chave, e.target.value)}
                className="mt-0.5 w-full rounded-md border bg-white px-2 py-1 text-[12px]"
              >
                <option value="">— escolher —</option>
                {opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                ))}
              </select>
              {ajuda}
            </div>
          )
        }

        if (c.tipo === "texto_longo") {
          return (
            <div key={c.chave}>
              {rotulo}
              <textarea
                value={String(v)}
                rows={3}
                placeholder={c.exemplo}
                onChange={(e) => aoMudar(c.chave, e.target.value)}
                className="mt-0.5 w-full rounded-md border bg-white px-2 py-1 text-[12px]"
              />
              {ajuda}
            </div>
          )
        }

        return (
          <div key={c.chave}>
            {rotulo}
            <Input
              type={c.tipo === "numero" ? "number" : "text"}
              value={String(v)}
              placeholder={c.exemplo}
              onChange={(e) => aoMudar(c.chave, c.tipo === "numero" ? Number(e.target.value) : e.target.value)}
              className="mt-0.5 h-8 text-[12px]"
            />
            {ajuda}
          </div>
        )
      })}
    </div>
  )
}

/** Os valores com que uma linha nova de uma lista nasce. */
function valoresDaLinha(campos: Campo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of campos) if (c.padrao !== undefined) out[c.chave] = c.padrao
  return out
}

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
  /**
   * A altura da tela acompanha a janela.
   *
   * Estava fixa em 620px: num portátil sobrava barra branca por baixo, num monitor grande
   * desperdiçava metade do ecrã — e num mapa o espaço visível é a funcionalidade, porque é o que
   * decide quantos passos se veem de uma vez sem arrastar.
   */
  const [altura, setAltura] = useState(620)
  useEffect(() => {
    const medir = () => {
      const topo = tela.current?.getBoundingClientRect().top ?? 260
      // 24px de folga por baixo — colar ao fundo da janela parece um corte, não um limite.
      setAltura(Math.max(420, window.innerHeight - topo - 24))
    }
    medir()
    window.addEventListener("resize", medir)
    return () => window.removeEventListener("resize", medir)
  }, [])
  /** O assistente: uma pergunta sobre ESTE funil, e a resposta dele. */
  /** As mensagens editáveis do funil — para o campo que escolhe uma em vez de duplicar o texto. */
  const [mensagens, setMensagens] = useState<Array<{ chave: string; titulo: string }>>([])
  useEffect(() => {
    fetch("/api/admin/social/mensagens", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.mensagens)) {
          setMensagens(j.mensagens.map((m: { chave: string; titulo: string }) => ({ chave: m.chave, titulo: m.titulo })))
        }
      })
      // Sem a lista o campo fica vazio e escreve-se o texto à mão — não vale interromper nada.
      .catch(() => {})
  }, [])

  /** O ensaio: percorrer o funil com uma pessoa real, sem lhe tocar. */
  const [ensaio, setEnsaio] = useState<Array<{ no: string; tipo: string; titulo: string; fez: string }> | null>(null)
  const [aEnsaiar, setAEnsaiar] = useState(false)

  /** A IA a montar o funil, e o JSON a entrar e a sair. */
  const [pedidoIA, setPedidoIA] = useState("")
  const [aMontar, setAMontar] = useState(false)
  const [painelJson, setPainelJson] = useState<"nenhum" | "exportar" | "importar" | "ia">("nenhum")
  const [jsonColado, setJsonColado] = useState("")

  const [pergunta, setPergunta] = useState("")
  const [aPensar, setAPensar] = useState(false)
  const [resposta, setResposta] = useState<string | null>(null)

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

  /**
   * Pergunta à IA sobre o funil que está no ecrã.
   *
   * Manda o DESENHO junto — blocos, tipos e ligações. Um assistente que não vê o funil só dá
   * conselhos de manual, e disso está a internet cheia.
   */
  const perguntarAoAssistente = async () => {
    if (!funil) return
    setAPensar(true)
    setResposta(null)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch("/api/admin/social/estudio", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ acao: "funil", pedido: pergunta, funil }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || "Não respondeu")
      setResposta(String(j.resposta ?? ""))
    } catch (e) {
      toast({ title: "Não deu", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAPensar(false)
    }
  }

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
      // Nasce com o razoável já lá dentro: um bloco em branco obriga a preencher tudo antes de
      // fazer alguma coisa, e o que fica por preencher parece esquecido em vez de propositado.
      nos: [...x2.nos, {
        id, tipo, titulo: BLOCOS[tipo].rotulo,
        x: Math.max(0, x), y: Math.max(0, y), seguintes: [],
        config: valoresPorOmissao(tipo),
      }],
    })))
    setSelecionado(id)
    setSujo(true)
  }

  if (aLer) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-neutral-600" /></div>
  }
  if (!funil) return <p className="py-20 text-center text-sm text-neutral-600">Sem funis.</p>

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
        {/* JSON para fora e para dentro.
            É o que torna um funil uma COISA: copia-se, guarda-se, manda-se a outra pessoa — e,
            se for para vender, é isto que se entrega. Um funil que só existe dentro da nossa base
            não é um produto, é uma configuração. */}
        <Button size="sm" variant="ghost" onClick={() => setPainelJson(painelJson === "exportar" ? "nenhum" : "exportar")} title="Copiar este funil em JSON">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPainelJson(painelJson === "importar" ? "nenhum" : "importar")} title="Colar um funil em JSON">
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPainelJson(painelJson === "ia" ? "nenhum" : "ia")} title="Pedir à IA que monte o funil">
          <Sparkles className="h-3.5 w-3.5" />
        </Button>

        {/* Ensaiar antes de ligar. Percorre o funil com uma pessoa a sério e mostra o que
            aconteceria — sem enviar, etiquetar ou chamar nada. */}
        <Button
          size="sm" variant="outline"
          disabled={aEnsaiar}
          onClick={async () => {
            setAEnsaiar(true)
            setEnsaio(null)
            try {
              const r = await fetch("/api/admin/social/funil-ensaio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ funilId: funil.id }),
              })
              const j = await r.json()
              if (j.ok) setEnsaio(j.passos)
              else toast({ title: "Não deu para ensaiar", description: j.erro })
            } catch {
              toast({ title: "Não deu para ensaiar" })
            }
            setAEnsaiar(false)
          }}
        >
          <PlayCircle className="mr-1 h-3.5 w-3.5" />
          {aEnsaiar ? "A correr…" : "Ensaiar"}
        </Button>

        <Button size="sm" onClick={() => gravar()} disabled={!sujo || aGravar}>
          <Save className="mr-1 h-3.5 w-3.5" /> {aGravar ? "A guardar…" : "Guardar"}
        </Button>
      </div>

      <p className="text-xs text-neutral-600">{funil.descricao}</p>

      <div className="flex gap-3">
        {/* Paleta de blocos */}
        <div className="w-40 shrink-0 space-y-1 rounded-xl border bg-white p-2">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Blocos</p>
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
            style={{ height: altura }}
            className="relative cursor-grab overflow-hidden rounded-xl border bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:20px_20px] active:cursor-grabbing"
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
                      <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: b.borda }}>
                        {b.rotulo}
                      </span>
                      <span className="flex-1" />
                      {(() => {
                        const falta = camposEmFalta(CAMPOS_POR_TIPO[n.tipo] ?? [], n.config ?? {})
                        return falta.length ? (
                          <span className="text-[10.5px] font-bold text-amber-600" title={`Falta: ${falta.join(", ")}`}>
                            falta {falta.length}
                          </span>
                        ) : null
                      })()}
                      {semSaida && <span className="ml-1 text-[10.5px] font-bold text-red-600">sem saída</span>}
                    </div>
                    <p className="mt-0.5 text-[12.5px] font-semibold leading-snug" style={{ color: b.texto }}>{n.titulo}</p>
                    {n.detalhe && <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{n.detalhe}</p>}
                    {/* O que o bloco está CONFIGURADO a fazer, numa linha. Sem isto um mapa com
                        trinta caixas obriga a clicar em cada uma para saber o que faz — e a razão
                        de haver mapa é precisamente não ter de o fazer. */}
                    {(() => {
                      const r = resumoDoNo(n.tipo, n.config)
                      return r ? (
                        <p className="mt-1 truncate rounded bg-white/70 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-600" title={r}>
                          {r}
                        </p>
                      ) : null
                    })()}

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

          {/* O que está partido no desenho.
              Nenhum destes se vê a olho num mapa com trinta caixas — e os três já aconteceram
              aqui: uma seta para um bloco apagado, um passo sem caminho até ele, um ciclo. */}
          {(() => {
            const problemas = problemasDoFunil(funil.nos)
            if (!problemas.length) return null
            const erros = problemas.filter((p) => p.gravidade === "erro")
            return (
              <div className="absolute right-3 top-3 max-h-[40%] w-72 overflow-auto rounded-lg border bg-white/95 p-2 shadow-sm">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
                  {erros.length ? `${erros.length} a corrigir` : "Reparos"} · {problemas.length}
                </p>
                <div className="space-y-1">
                  {problemas.slice(0, 12).map((pb, i) => (
                    <button
                      key={i}
                      onClick={() => pb.noId && setSelecionado(pb.noId)}
                      className={`block w-full rounded px-1.5 py-1 text-left text-[11px] leading-snug hover:bg-neutral-100 ${
                        pb.gravidade === "erro" ? "text-red-600" : "text-amber-700"
                      }`}
                    >
                      {pb.texto}
                    </button>
                  ))}
                  {problemas.length > 12 && (
                    <p className="px-1.5 text-[11px] text-neutral-600">e mais {problemas.length - 12}</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* JSON e IA. Ficam por cima da tela porque é sobre ela que se quer olhar enquanto se
              lê o que vai entrar. */}
          {painelJson !== "nenhum" && (
            <div className="absolute left-1/2 top-3 z-10 w-[520px] max-w-[90%] -translate-x-1/2 rounded-lg border bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-600">
                  {painelJson === "exportar" && "Copiar este funil"}
                  {painelJson === "importar" && "Colar um funil"}
                  {painelJson === "ia" && "Pedir à IA que monte"}
                </p>
                <button onClick={() => setPainelJson("nenhum")} className="text-neutral-600 hover:text-neutral-900">×</button>
              </div>

              {painelJson === "exportar" && (
                <>
                  <textarea
                    readOnly
                    rows={8}
                    value={JSON.stringify(funil, null, 2)}
                    className="w-full rounded border bg-neutral-50 p-2 font-mono text-[10.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(funil, null, 2))
                      toast({ title: "Copiado" })
                    }}>Copiar</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      // Descarregar da um ficheiro com nome - e o que se manda a alguem.
                      const b = new Blob([JSON.stringify(funil, null, 2)], { type: "application/json" })
                      const a = document.createElement("a")
                      a.href = URL.createObjectURL(b)
                      a.download = `funil-${funil.id}.json`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}>Descarregar</Button>
                  </div>
                </>
              )}

              {painelJson === "importar" && (
                <>
                  <textarea
                    rows={8}
                    value={jsonColado}
                    onChange={(e) => setJsonColado(e.target.value)}
                    placeholder="Cola aqui o JSON de um funil"
                    className="w-full rounded border p-2 font-mono text-[10.5px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => {
                      try {
                        const f = JSON.parse(jsonColado) as Funil
                        if (!Array.isArray(f.nos) || !f.nos.length) throw new Error("sem blocos")
                        // Entra como funil NOVO e nao por cima do aberto: importar por cima
                        // apagaria trabalho sem avisar, e o desfazer aqui nao existe.
                        const novoF = { ...f, id: `${f.id || "importado"}-${Date.now().toString(36)}` }
                        setFunis((x) => [...x, novoF])
                        setAtivo(funis.length)
                        setSujo(true)
                        setPainelJson("nenhum")
                        setJsonColado("")
                        toast({ title: "Importado", description: "Entrou como funil novo - o que estava aberto ficou intacto." })
                      } catch (e) {
                        toast({ title: "JSON invalido", description: e instanceof Error ? e.message : "nao deu para ler" })
                      }
                    }}>Importar</Button>
                  </div>
                </>
              )}

              {painelJson === "ia" && (
                <>
                  <textarea
                    rows={3}
                    value={pedidoIA}
                    onChange={(e) => setPedidoIA(e.target.value)}
                    placeholder="Ex.: funil para quem comenta SINAIS num reel, com follow-up a 24h e uma fuga marcada para quem nao responde"
                    className="w-full rounded border p-2 text-[12px]"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" disabled={aMontar || !pedidoIA.trim()} onClick={async () => {
                      setAMontar(true)
                      try {
                        const r = await fetch("/api/admin/social/funil-ia", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pedido: pedidoIA, existente: funil }),
                        })
                        const j = await r.json()
                        if (j.ok) {
                          setFunis((x) => [...x, j.funil as Funil])
                          setAtivo(funis.length)
                          setSujo(true)
                          setPainelJson("nenhum")
                          setPedidoIA("")
                          const pr = (j.problemas ?? []) as Array<{ texto: string }>
                          toast({
                            title: "Funil montado",
                            description: pr.length
                              ? `${pr.length} coisa(s) a rever - ve o painel de problemas.`
                              : "Sem problemas no desenho. Ensaia antes de ligar.",
                          })
                        } else {
                          toast({ title: "Nao montou", description: j.erro })
                        }
                      } catch {
                        toast({ title: "Nao montou" })
                      }
                      setAMontar(false)
                    }}>
                      {aMontar ? "A montar..." : "Montar"}
                    </Button>
                    <span className="text-[10.5px] text-neutral-600">
                      Entra como funil novo. Nada e enviado ate ligares o motor.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* O que o ensaio viu. Fica por cima da tela porque é sobre ELA que se quer olhar
              enquanto se lê o caminho. */}
          {ensaio && (
            <div className="absolute bottom-3 right-3 max-h-[55%] w-96 overflow-auto rounded-lg border bg-white/98 p-2.5 shadow-lg">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-600">
                  Ensaio · {ensaio.length} passos · não tocou em ninguém
                </p>
                <button onClick={() => setEnsaio(null)} className="text-neutral-600 hover:text-neutral-700">×</button>
              </div>
              <ol className="space-y-1">
                {ensaio.map((p, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setSelecionado(p.no)}
                      className="block w-full rounded px-1.5 py-1 text-left hover:bg-neutral-100"
                    >
                      <span className="text-[11px] font-medium text-neutral-800">
                        {i + 1}. {p.titulo}
                      </span>
                      <span className="block text-[11px] leading-snug text-neutral-600">{p.fez}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Zoom */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border bg-white/95 p-1 shadow-sm">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z * 0.85))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-10 text-center text-[11px] tabular-nums text-neutral-600">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.15))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={encaixar} title="Encaixar no ecrã">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-2 py-1 text-[11px] text-neutral-600">
            arrasta o fundo para mover · ⌘/ctrl + roda para ampliar
          </p>
        </div>

        {/* Painel do bloco */}
        <div className="w-60 shrink-0 space-y-3 rounded-xl border bg-white p-3">
          {!noSelecionado ? (
            <>
              <p className="text-sm font-semibold">O mapa</p>
              <p className="text-xs leading-relaxed text-neutral-600">
                Escolhe um bloco à esquerda para o acrescentar. Arrasta a bolinha de baixo de um
                bloco para outro para os ligar. Os marcados <b className="text-red-600">sem saída</b>{" "}
                são onde o funil trava — é isso que este mapa serve para ver.
              </p>
              <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
                Isto é o desenho, não o motor. Quem responde no Telegram continua a ser o código —
                mexer aqui documenta, não muda o comportamento.
              </p>

              {/* O assistente vê o funil que está no ecrã. Sem isso só dava conselhos de manual. */}
              <div className="border-t pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-[#D2A63C]" /> Perguntar à IA
                </p>
                <Input
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  placeholder="onde é que este funil trava?"
                  className="mt-1.5 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && !aPensar && perguntarAoAssistente()}
                />
                <Button size="sm" className="mt-1.5 w-full" disabled={aPensar} onClick={perguntarAoAssistente}>
                  {aPensar ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> A ler o funil…</> : "Analisar"}
                </Button>
                {resposta && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-2.5 text-[11.5px] leading-relaxed text-neutral-700">
                    {resposta}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-neutral-600">Título</label>
                <Input value={noSelecionado.titulo} onChange={(e) => mexerNo(noSelecionado.id, { titulo: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-neutral-600">Detalhe</label>
                <Input value={noSelecionado.detalhe ?? ""} onChange={(e) => mexerNo(noSelecionado.id, { detalhe: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-neutral-600">Tipo</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(Object.keys(BLOCOS) as TipoDeNo[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => mexerNo(noSelecionado.id, { tipo: t })}
                      className="rounded-full border px-2 py-0.5 text-[11px]"
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

              {/* A configuração do tipo escolhido. É o que faltava: até aqui via-se a forma do
                  funil e ia-se ao código saber o conteúdo. */}
              <CamposDoBloco
                campos={CAMPOS_POR_TIPO[noSelecionado.tipo] ?? []}
                valores={noSelecionado.config ?? {}}
                mensagens={mensagens}
                funis={funis.filter((f) => f.id !== funil.id).map((f) => ({ id: f.id, nome: f.nome }))}
                aoMudar={(chave, valor) =>
                  mexerNo(noSelecionado.id, {
                    // Um campo esvaziado sai do saco em vez de lá ficar como "". Guardar vazios
                    // faz o resumo do bloco mostrar coisas que ninguém escolheu.
                    config: (() => {
                      const c = { ...(noSelecionado.config ?? {}) }
                      if (valor === "" || valor == null) delete c[chave]
                      else c[chave] = valor
                      return c
                    })(),
                  })
                }
              />

              <div>
                <label className="text-xs text-neutral-600">Vai para</label>
                <div className="mt-1 space-y-1">
                  {noSelecionado.seguintes.length === 0 && (
                    <p className="text-[11px] text-neutral-600">Nada — arrasta a bolinha para ligar.</p>
                  )}
                  {noSelecionado.seguintes.map((s, i) => (
                    <div key={s} className="flex items-center justify-between gap-1 rounded border px-2 py-1 text-[11px]">
                      {/* Numa condição as duas setas não são iguais: uma é o sim e a outra o não.
                          Sem nome, o mapa mostra que se parte em dois e esconde o que interessa. */}
                      {nomesDosRamos(noSelecionado.tipo, noSelecionado.config)[i] && (
                        <span className="shrink-0 rounded bg-neutral-200 px-1 font-medium">
                          {nomesDosRamos(noSelecionado.tipo, noSelecionado.config)[i]}
                        </span>
                      )}
                      <span className="flex-1 truncate">{funil.nos.find((x) => x.id === s)?.titulo ?? s}</span>
                      <button
                        onClick={() => mexerNo(noSelecionado.id, { seguintes: noSelecionado.seguintes.filter((x) => x !== s) })}
                        className="shrink-0 text-neutral-600 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                size="sm" variant="ghost" className="w-full"
                onClick={() => {
                  // O clone fica ao lado e sem ligações de saída: herdar as setas do original
                  // faria dois blocos a apontar para o mesmo sítio sem ninguém ter pedido.
                  const novo = {
                    ...noSelecionado,
                    id: `n${Date.now().toString(36)}`,
                    titulo: `${noSelecionado.titulo} (cópia)`,
                    x: noSelecionado.x + 40,
                    y: noSelecionado.y + 40,
                    seguintes: [],
                    config: { ...(noSelecionado.config ?? {}) },
                  }
                  setFunis((f) => f.map((x, i) => (i !== ativo ? x : { ...x, nos: [...x.nos, novo] })))
                  setSelecionado(novo.id)
                  setSujo(true)
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar bloco
              </Button>

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
