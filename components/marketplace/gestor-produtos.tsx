"use client"

/**
 * PRODUTOS E CURSOS — o editor de produtos do marketplace.
 *
 * ── UM COMPONENTE, DOIS PAPÉIS, TRÊS SÍTIOS ───────────────────────────────────────────────
 *
 * Monta-se no separador «Produtos e Cursos» do estúdio do educador, na página
 * `/educador/marketplace`, e no painel do admin. O papel vem do SERVIDOR (`papel` na resposta do
 * GET) e é ele que decide o que aparece — não uma propriedade passada pelo ecrã que o monta.
 *
 * Isto é deliberado. Se o papel viesse por `prop`, montar o componente com `papel="admin"` no sítio
 * errado dava a um educador os campos do admin. Vindo da rota, o pior que pode acontecer é o ecrã
 * desenhar um campo a mais — e a rota recusa-o de qualquer maneira, porque é ela que tem a lista
 * (`camposPermitidos`). O ecrã esconde; o servidor recusa. Nunca só o ecrã.
 *
 * ── O QUE A IA FAZ, E O QUE NÃO GRAVA ─────────────────────────────────────────────────────
 *
 * Os dois botões de IA devolvem PROPOSTAS e não gravam nada. A descrição aparece no formulário para
 * a pessoa ler, corrigir e decidir; a imagem aparece num modal e só vira capa se ela disser que sim.
 * Um botão de IA que grava por cima do que alguém escreveu à mão é um botão que se carrega uma vez
 * e nunca mais.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Loader2, Plus, Sparkles, ImagePlus, FileImage, Download, Trash2,
  Send, EyeOff, CreditCard, AlertTriangle, CheckCircle2, X, ArrowUp, ArrowDown,
} from "lucide-react"
import {
  CATEGORIAS,
  IMAGENS_MAX,
  PERIODICIDADES,
  euros,
  galeriaParaGravar,
  periodicidadeParaGravar,
  sufixoDoPeriodo,
  sugestaoDaCategoria,
} from "@/lib/marketplace/regras"
import CupoesEducador from "@/components/marketplace/cupoes-educador"

type Produto = {
  id: string; slug: string; titulo: string; subtitulo: string | null; descricao: string | null
  tipo: string; imagem_url: string | null; imagens: string[] | null; preco_cents: number; moeda: string
  recorrente: boolean; periodicidade: string; requer_morada: boolean
  conteudo_url: string | null; conteudo_nota: string | null
  estado: string; activo: boolean; dono: string; educator_id: string | null
  partilha_pct: number | null; stripe_price_id: string | null; checkout_externo_url: string | null
  campanha_pct: number | null; campanha_inicio: string | null; campanha_fim: string | null
  campanha_tier: string | null
  motivo_recusa: string | null; publicado_em: string | null
  desempenho: { vendas: number; aReceberCents: number }
}

type Dados = {
  papel: "admin" | "educador"
  marketplaceLigado: boolean
  revisaoObrigatoria: boolean
  camposPermitidos: string[]
  vendedor: { activo: boolean; partilha_pct: number; temConta: boolean } | null
  /** Só vem preenchida ao admin. O educador não precisa de saber quem mais vende aqui. */
  educadores: Array<{ id: string; display_name: string; specialty: string | null }>
  produtos: Produto[]
  extracto: { vendas: number; brutoCents: number; aReceberCents: number }
}

const ROTA = "/api/marketplace/gestao"

const ESTADOS: Record<string, { texto: string; cor: string }> = {
  rascunho: { texto: "Rascunho", cor: "bg-zinc-700/60 text-zinc-300" },
  em_revisao: { texto: "Em revisão", cor: "bg-amber-500/15 text-amber-300" },
  publicado: { texto: "Publicado", cor: "bg-emerald-500/15 text-emerald-300" },
  retirado: { texto: "Retirado", cor: "bg-zinc-800 text-zinc-500" },
}

const TIERS = [
  { id: "all", nome: "Todos" },
  { id: "app_member", nome: "Membros" },
  { id: "premium", nome: "Premium" },
  { id: "vip", nome: "VIP" },
]

const VAZIO = {
  titulo: "", subtitulo: "", descricao: "", tipo: "curso",
  preco_cents: 0, recorrente: false, requer_morada: false,
  // A periodicidade do formulário é SEMPRE uma das recorrentes, mesmo com «cobra outra vez»
  // desligado: é o que a pessoa escolheu para quando ligar. O que se GRAVA passa por
  // `periodicidadeParaGravar`, que a põe em «unica» se não houver recorrência — e é aí que a
  // coerência com a restrição da 157 se garante, e não na memória do formulário.
  periodicidade: "mensal",
  conteudo_url: "", conteudo_nota: "", imagem_url: "",
  /** A galeria, SEM a capa. A capa é `imagem_url` e não se repete aqui. */
  imagens: [] as string[],
  campanha_pct: 0, campanha_inicio: "", campanha_fim: "", campanha_tier: "app_member",
  /**
   * De quem é o produto. Só o admin vê este campo: um educador cria sempre para si, e o
   * `educator_id` dele vem da SESSÃO na rota — nunca do corpo do pedido, que é o que impede
   * criar um produto em nome de outra pessoa.
   *
   * "" = ainda não escolheu · "casa" = produto da MTM · um uuid = o educador.
   */
  dono_escolhido: "",
}

/** `datetime-local` quer `YYYY-MM-DDTHH:mm`; a base de dados devolve ISO com segundos e fuso. */
const paraInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "")
const paraIso = (v: string) => (v ? new Date(v).toISOString() : null)

export default function GestorProdutos() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [form, setForm] = useState<typeof VAZIO & { id?: string }>(VAZIO)
  const [aEditar, setAEditar] = useState(false)
  const [aGravar, setAGravar] = useState(false)
  const [aPedirIa, setAPedirIa] = useState<"texto" | "imagem" | null>(null)
  // A URL que está a ser escrita para acrescentar à galeria. Fora do `form` de propósito: é um
  // rascunho do ecrã, não um campo do produto, e ao gravar não tem de ir a sítio nenhum.
  const [novaImagem, setNovaImagem] = useState("")
  const [modalImagem, setModalImagem] = useState<string | null>(null)
  const [modalFlyer, setModalFlyer] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch(ROTA)
    if (r.status === 401) {
      setErro("Entra com a tua conta de educador para veres os teus produtos.")
      return
    }
    const j = await r.json()
    if (!r.ok) { setErro(j.error ?? "Não foi possível carregar."); return }
    setDados(j)
  }, [])

  useEffect(() => { void ler() }, [ler])

  const podeVer = useCallback((campo: string) => dados?.camposPermitidos?.includes(campo) ?? false, [dados])

  const abrir = useCallback((p?: Produto) => {
    setNota(null); setErro(null)
    if (!p) { setForm(VAZIO); setAEditar(true); return }
    setForm({
      id: p.id,
      titulo: p.titulo, subtitulo: p.subtitulo ?? "", descricao: p.descricao ?? "",
      tipo: p.tipo, preco_cents: p.preco_cents, recorrente: p.recorrente, requer_morada: p.requer_morada,
      // «unica» não é uma opção do selector (só aparece quando há recorrência), por isso um produto
      // de pagamento único abre em «mensal» — o que ele passaria a ser se alguém ligasse a caixa.
      periodicidade: p.periodicidade && p.periodicidade !== "unica" ? p.periodicidade : "mensal",
      conteudo_url: p.conteudo_url ?? "", conteudo_nota: p.conteudo_nota ?? "", imagem_url: p.imagem_url ?? "",
      imagens: Array.isArray(p.imagens) ? p.imagens : [],
      campanha_pct: Number(p.campanha_pct ?? 0),
      campanha_inicio: paraInput(p.campanha_inicio), campanha_fim: paraInput(p.campanha_fim),
      campanha_tier: p.campanha_tier ?? "app_member",
      // A editar não se escolhe dono: o campo nem aparece. Fica o que o produto já tem, para o
      // estado do formulário não ter buracos.
      dono_escolhido: p.dono === "casa" ? "casa" : (p.educator_id ?? ""),
    })
    setAEditar(true)
  }, [])

  const gravar = useCallback(async (accao?: "publicar" | "retirar") => {
    setAGravar(true); setErro(null); setNota(null)
    try {
      const corpo: Record<string, unknown> = {
        titulo: form.titulo, subtitulo: form.subtitulo || null, descricao: form.descricao || null,
        tipo: form.tipo, preco_cents: Math.round(Number(form.preco_cents) || 0),
        recorrente: form.recorrente, requer_morada: form.requer_morada,
        periodicidade: periodicidadeParaGravar(form.recorrente, form.periodicidade),
        conteudo_url: form.conteudo_url || null, conteudo_nota: form.conteudo_nota || null,
        imagem_url: form.imagem_url || null,
        // Limpo AQUI e outra vez na rota. Não por desconfiança do servidor: é para o tecto de 8 e a
        // ausência da capa serem a mesma regra nos dois lados — a versão do ecrã existe para a
        // pessoa ver o que vai gravar, a do servidor para valer para quem não passe por este ecrã.
        imagens: galeriaParaGravar(form.imagem_url, form.imagens),
        campanha_pct: Number(form.campanha_pct) || 0,
        campanha_inicio: paraIso(form.campanha_inicio), campanha_fim: paraIso(form.campanha_fim),
        campanha_tier: form.campanha_tier,
      }
      // Só na CRIAÇÃO e só o admin. Mudar o dono de um produto que já existe é outra operação —
      // há vendas e repartições presas a ele — e não se faz por engano num formulário de edição.
      if (!form.id && dados?.papel === "admin") {
        if (form.dono_escolhido === "casa") corpo.dono = "casa"
        else if (form.dono_escolhido) corpo.educator_id = form.dono_escolhido
      }
      if (accao) corpo.accao = accao

      const r = form.id
        ? await fetch(ROTA, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, id: form.id }) })
        : await fetch(ROTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })

      const j = await r.json()
      if (!r.ok) { setErro(j.error ?? "Não foi possível gravar."); return }
      if (j.avisoStripe) setNota(j.avisoStripe)
      else if (accao === "publicar") setNota(dados?.papel === "admin" ? "Publicado." : "Enviado para revisão. A MTM aprova e fica no ar.")
      else setNota("Gravado.")
      setAEditar(false)
      setForm(VAZIO)
      await ler()
    } finally {
      setAGravar(false)
    }
  }, [form, dados?.papel, ler])

  const accaoSimples = useCallback(async (id: string, accao: "publicar" | "retirar") => {
    setErro(null); setNota(null)
    const r = await fetch(ROTA, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, accao }) })
    const j = await r.json()
    if (!r.ok) { setErro(j.error ?? "Não foi possível."); return }
    await ler()
  }, [ler])

  const apagar = useCallback(async (id: string) => {
    setErro(null); setNota(null)
    const r = await fetch(`${ROTA}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    const j = await r.json()
    if (!r.ok) { setErro(j.error ?? "Não foi possível apagar."); return }
    await ler()
  }, [ler])

  const sincronizarPreco = useCallback(async (id: string) => {
    setErro(null); setNota(null)
    const r = await fetch(ROTA, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, accao: "sincronizar_preco" }) })
    const j = await r.json()
    if (!r.ok) { setErro(j.error ?? "Não foi possível falar com o Stripe."); return }
    setNota(j.criouPreco ? "Preço criado no Stripe. O produto já pode ser comprado." : "O preço no Stripe já estava certo.")
    await ler()
  }, [ler])

  // ── A GALERIA ───────────────────────────────────────────────────────────────────────────
  //
  // Três operações e nada mais: acrescentar, remover, trocar de lugar. Não há «editar» a URL de uma
  // imagem já na lista — trocar uma imagem é remover e acrescentar, e um campo de texto por imagem
  // numa lista de oito é uma parede de caixas onde se corrige a linha errada sem dar por isso.

  const acrescentarImagem = useCallback((url: string) => {
    const limpa = url.trim()
    if (!limpa) return
    setForm((f) => {
      if (f.imagens.length >= IMAGENS_MAX) {
        setErro(`A galeria leva no máximo ${IMAGENS_MAX} imagens além da capa. Remove uma para acrescentar outra.`)
        return f
      }
      // A capa não entra na galeria, e uma imagem já lá não entra duas vezes: `galeriaParaGravar`
      // decide as duas coisas, para o ecrã não ter uma segunda opinião sobre a mesma regra.
      const nova = galeriaParaGravar(f.imagem_url, [...f.imagens, limpa])
      if (nova.length === f.imagens.length) {
        setErro(limpa === f.imagem_url.trim() ? "Essa imagem já é a capa." : "Essa imagem já está na galeria.")
        return f
      }
      setErro(null)
      return { ...f, imagens: nova }
    })
    setNovaImagem("")
  }, [])

  const removerImagem = useCallback((i: number) => {
    setErro(null)
    setForm((f) => ({ ...f, imagens: f.imagens.filter((_, j) => j !== i) }))
  }, [])

  /** Troca com a vizinha. `delta` é −1 ou +1; nos extremos não faz nada (o botão está desligado). */
  const moverImagem = useCallback((i: number, delta: -1 | 1) => {
    setForm((f) => {
      const j = i + delta
      if (j < 0 || j >= f.imagens.length) return f
      const lista = [...f.imagens]
      ;[lista[i], lista[j]] = [lista[j], lista[i]]
      return { ...f, imagens: lista }
    })
  }, [])

  // ── A IA ────────────────────────────────────────────────────────────────────────────────

  const pedirDescricao = useCallback(async () => {
    if (!form.id) { setErro("Grava o produto primeiro — a IA precisa de saber a que produto se refere."); return }
    setAPedirIa("texto"); setErro(null)
    try {
      const r = await fetch(ROTA, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, accao: "ia_descricao", titulo: form.titulo, tipo: form.tipo, descricao: form.descricao, preco_cents: form.preco_cents }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.error ?? "A IA não respondeu."); return }
      // Proposta, não gravação: entra no formulário e a pessoa decide.
      setForm((f) => ({
        ...f,
        subtitulo: j.sugestao?.subtitulo || f.subtitulo,
        descricao: j.sugestao?.descricao || f.descricao,
      }))
      setNota("Texto sugerido. Lê, corrige o que quiseres, e grava.")
    } finally {
      setAPedirIa(null)
    }
  }, [form])

  const pedirImagem = useCallback(async () => {
    if (!form.id) { setErro("Grava o produto primeiro."); return }
    setAPedirIa("imagem"); setErro(null)
    try {
      const r = await fetch(ROTA, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id, accao: "ia_imagem", titulo: form.titulo, tipo: form.tipo, descricao: form.descricao }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.error ?? "A imagem não foi gerada."); return }
      setModalImagem(j.imagem_url)
    } finally {
      setAPedirIa(null)
    }
  }, [form])

  const totais = useMemo(() => dados?.extracto ?? { vendas: 0, brutoCents: 0, aReceberCents: 0 }, [dados])

  if (erro && !dados) {
    return <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{erro}</div>
  }
  if (!dados) {
    return <div className="flex items-center gap-2 py-12 text-sm text-zinc-500"><Loader2 className="animate-spin" size={16} /> A carregar…</div>
  }

  const ehAdmin = dados.papel === "admin"

  return (
    <div className="space-y-5">
      {/* ── Avisos de estado ─────────────────────────────────────────────────────────────── */}
      {!dados.marketplaceLigado && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>O marketplace está desligado. Podes preparar os produtos; só não ficam à venda até a MTM o ligar.</span>
        </div>
      )}
      {!ehAdmin && dados.vendedor && !dados.vendedor.activo && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>A tua conta de vendedor ainda não foi activada. Prepara tudo — publicamos quando activarmos.</span>
        </div>
      )}
      {erro && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{erro}</div>}
      {nota && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>{nota}</span>
        </div>
      )}

      {/* ── O extracto (só o educador) ───────────────────────────────────────────────────── */}
      {!ehAdmin && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { r: "Vendas", v: String(totais.vendas) },
            { r: "Facturado", v: euros(totais.brutoCents) },
            { r: "A receber", v: euros(totais.aReceberCents) },
          ].map((c) => (
            <div key={c.r} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{c.r}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{c.v}</div>
            </div>
          ))}
          {dados.vendedor && (
            <p className="col-span-3 text-xs text-zinc-500">
              Ficas com {dados.vendedor.partilha_pct}% de cada venda. A percentagem é o acordo com a MTM e
              fica congelada em cada venda — não muda as vendas antigas.
            </p>
          )}
        </div>
      )}

      {/* ── A lista ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">
          {ehAdmin ? "Todos os produtos" : "Os meus produtos"}
          <span className="ml-2 text-zinc-500">({dados.produtos.length})</span>
        </h3>
        <button
          onClick={() => abrir()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/35 bg-[#D2A63C]/12 px-3 py-1.5 text-sm text-[#D2A63C] hover:bg-[#D2A63C]/20"
        >
          <Plus size={14} /> Novo produto
        </button>
      </div>

      {dados.produtos.length === 0 && !aEditar && (
        <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
          Ainda não tens produtos. Cria o primeiro — um curso, uma mentoria, um EA, o que vendas.
        </p>
      )}

      <div className="space-y-2">
        {dados.produtos.map((p) => {
          const est = ESTADOS[p.estado] ?? ESTADOS.rascunho
          const semPreco = p.preco_cents > 0 && !p.stripe_price_id && !p.checkout_externo_url
          return (
            <div key={p.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{p.titulo}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${est.cor}`}>{est.texto}</span>
                    {p.dono === "casa" && (
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">Da casa</span>
                    )}
                    {Number(p.campanha_pct ?? 0) > 0 && (
                      <span className="rounded bg-[#D2A63C]/15 px-1.5 py-0.5 text-[10px] text-[#D2A63C]">
                        −{p.campanha_pct}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {CATEGORIAS.find((c) => c.id === p.tipo)?.nome ?? p.tipo}
                    {" · "}
                    {p.preco_cents === 0 ? "Grátis" : euros(p.preco_cents, p.moeda)}
                    {/* O período REAL e não «/mês» fixo: quatro dos produtos publicados são anuais,
                        e era esta linha a dizer ao dono que o Premium anual custava 624 €/mês. */}
                    {sufixoDoPeriodo(p).texto ? `${sufixoDoPeriodo(p).junto ? "" : " "}${sufixoDoPeriodo(p).texto}` : ""}
                    {p.desempenho.vendas > 0 && ` · ${p.desempenho.vendas} venda(s) · ${euros(p.desempenho.aReceberCents)}`}
                  </div>
                  {p.motivo_recusa && (
                    <div className="mt-1.5 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-200">
                      Recusado: {p.motivo_recusa}
                    </div>
                  )}
                  {semPreco && (
                    <div className="mt-1.5 text-xs text-amber-300">
                      Tem preço mas não tem cobrança ligada — carrega em «Preço no Stripe» para poder ser comprado.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => abrir(p)} className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
                    Editar
                  </button>
                  <button
                    onClick={() => setModalFlyer(`/api/marketplace/ia/flyer?id=${p.id}&t=${Date.now()}`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    <FileImage size={12} /> Flyer
                  </button>
                  {p.preco_cents > 0 && (
                    <button
                      onClick={() => void sincronizarPreco(p.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <CreditCard size={12} /> Preço no Stripe
                    </button>
                  )}
                  {p.estado !== "publicado" && (
                    <button
                      onClick={() => void accaoSimples(p.id, "publicar")}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Send size={12} /> {ehAdmin ? "Publicar" : "Pedir publicação"}
                    </button>
                  )}
                  {p.estado === "publicado" && (
                    <button
                      onClick={() => void accaoSimples(p.id, "retirar")}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                    >
                      <EyeOff size={12} /> Retirar
                    </button>
                  )}
                  {p.estado === "rascunho" && (
                    <button
                      onClick={() => void apagar(p.id)}
                      className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Apagar rascunho"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Os códigos de desconto (só o educador) ───────────────────────────────────────
          O admin não os vê aqui de propósito: os cupões da casa — packs, MTM Funded, parcerias,
          Apple — gerem-se no /admin/coupons, e duas portas para a mesma tabela com listas
          diferentes é como se acaba a apagar no sítio errado. */}
      {!ehAdmin && (
        <CupoesEducador
          produtos={dados.produtos.map((p) => ({ id: p.id, titulo: p.titulo }))}
          partilhaPct={dados.vendedor?.partilha_pct ?? null}
        />
      )}

      {/* ── O formulário ─────────────────────────────────────────────────────────────────── */}
      {aEditar && (
        <div className="space-y-4 rounded-xl border border-[#D2A63C]/25 bg-black/60 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-zinc-100">{form.id ? "Editar produto" : "Novo produto"}</h4>
            <button onClick={() => { setAEditar(false); setForm(VAZIO) }} className="text-zinc-500 hover:text-zinc-300" aria-label="Fechar">
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/*
              DE QUEM É O PRODUTO — só o admin, e só ao criar.

              A rota já exigia esta escolha e já recusava sem ela; o que faltava era o campo. Sem
              ele o admin só conseguia criar produtos da casa, e um curso de educador tinha de
              nascer por SQL.
            */}
            {!form.id && dados?.papel === "admin" && (
              <label className="sm:col-span-2 block">
                <span className="text-xs text-zinc-400">De quem é este produto</span>
                <select
                  value={form.dono_escolhido}
                  onChange={(e) => setForm({ ...form, dono_escolhido: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                >
                  {/* Vazio por omissão de propósito: escolher o dono é uma decisão, e um valor
                      pré-seleccionado faz com que ela passe sem ninguém reparar. */}
                  <option value="">— escolhe —</option>
                  <option value="casa">MoreThanMoney (produto da casa)</option>
                  {(dados.educadores ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.display_name}{e.specialty ? ` · ${e.specialty}` : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-zinc-500">
                  Um produto de educador conta para o extracto dele e pode ser editado por ele. Não se muda depois.
                </span>
              </label>
            )}

            <label className="sm:col-span-2 block">
              <span className="text-xs text-zinc-400">Título</span>
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                placeholder="Mentoria de Price Action — 8 semanas"
              />
            </label>

            <label className="block">
              <span className="text-xs text-zinc-400">Categoria</span>
              <select
                value={form.tipo}
                onChange={(e) => {
                  // A categoria SUGERE a recorrência e a morada. Não impõe: quem quiser uma mentoria
                  // mensal ou merchandise digital contraria à mão logo abaixo.
                  const s = sugestaoDaCategoria(e.target.value)
                  setForm({ ...form, tipo: e.target.value, recorrente: s.recorrente, requer_morada: s.requerMorada })
                }}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              >
                {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-zinc-400">Preço (€)</span>
              <input
                type="number" min={0} step="0.01"
                value={(Number(form.preco_cents) / 100).toString()}
                onChange={(e) => setForm({ ...form, preco_cents: Math.round(Number(e.target.value) * 100) })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            {/* ── Cobra outra vez, e de quanto em quanto tempo ─────────────────────────────
                Eram uma pergunta só («Cobrar todos os meses»), e é por isso que o Premium anual
                andou a anunciar-se a 624 €/mês: a caixa dizia que repetia e o ecrã concluiu o resto.
                São DUAS perguntas e agora estão as duas no formulário. */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={form.recorrente} onChange={(e) => setForm({ ...form, recorrente: e.target.checked })} />
                Cobra outra vez (subscrição)
              </label>
              {form.recorrente && (
                <label className="block">
                  <span className="text-xs text-zinc-400">De quanto em quanto tempo</span>
                  <select
                    value={form.periodicidade}
                    onChange={(e) => setForm({ ...form, periodicidade: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                  >
                    {/* «Pagamento único» fica de fora: aqui já se sabe que repete, e oferecê-la era
                        oferecer a combinação que a restrição da base recusa. */}
                    {PERIODICIDADES.filter((x) => x.id !== "unica").map((x) => (
                      <option key={x.id} value={x.id}>{x.nome}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    É isto que escreve «{sufixoDoPeriodo({ recorrente: true, periodicidade: form.periodicidade }).texto}» na
                    montra e que decide o intervalo do preço no Stripe.
                  </span>
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.requer_morada} onChange={(e) => setForm({ ...form, requer_morada: e.target.checked })} />
              Pedir morada de envio
            </label>

            <label className="sm:col-span-2 block">
              <span className="text-xs text-zinc-400">Subtítulo</span>
              <input
                value={form.subtitulo}
                onChange={(e) => setForm({ ...form, subtitulo: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="sm:col-span-2 block">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Descrição</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => void pedirDescricao()}
                    disabled={aPedirIa !== null}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D2A63C]/35 px-2 py-1 text-[11px] text-[#D2A63C] hover:bg-[#D2A63C]/12 disabled:opacity-50"
                  >
                    {aPedirIa === "texto" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    Gerar por IA
                  </button>
                  <button
                    onClick={() => void pedirImagem()}
                    disabled={aPedirIa !== null}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {aPedirIa === "imagem" ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
                    Imagem por IA
                  </button>
                </div>
              </div>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={7}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                placeholder="O que a pessoa aprende, o que recebe, e para quem é. Pelo menos 30 caracteres."
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                A IA escreve uma proposta a partir do título e do que já escreveste. Nunca inventa números de
                resultados — se um número não estiver aqui, não aparece no texto.
              </span>
            </label>

            <label className="sm:col-span-2 block">
              <span className="text-xs text-zinc-400">Imagem de capa (URL)</span>
              <input
                value={form.imagem_url}
                onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                É esta que a montra desenha em todos os cartões. A galeria abaixo só aparece na ficha.
              </span>
            </label>

            {/* ── A galeria ─────────────────────────────────────────────────────────────────
                A capa está SEMPRE em primeiro e não se remove daqui — é a `imagem_url`, e mostrá-la
                nesta lista com um botão de apagar convidava a apagar a capa a pensar que se estava a
                arrumar a galeria. Aparece só como referência, com a etiqueta «Capa». */}
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-zinc-400">Galeria (só na ficha do produto)</span>
                <span className="text-[11px] text-zinc-500">{form.imagens.length}/{IMAGENS_MAX}</span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {form.imagem_url.trim() && (
                  <div className="relative h-20 w-24 overflow-hidden rounded-lg border border-[#D2A63C]/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imagem_url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[10px] text-[#D2A63C]">Capa</span>
                  </div>
                )}
                {form.imagens.map((url, i) => (
                  <div key={url} className="relative h-20 w-24 overflow-hidden rounded-lg border border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/70 py-0.5">
                      <button
                        type="button" onClick={() => moverImagem(i, -1)} disabled={i === 0}
                        aria-label={`Mover a imagem ${i + 1} para trás`}
                        className="text-zinc-300 hover:text-white disabled:opacity-25"
                      ><ArrowUp size={12} /></button>
                      <button
                        type="button" onClick={() => moverImagem(i, 1)} disabled={i === form.imagens.length - 1}
                        aria-label={`Mover a imagem ${i + 1} para a frente`}
                        className="text-zinc-300 hover:text-white disabled:opacity-25"
                      ><ArrowDown size={12} /></button>
                      <button
                        type="button" onClick={() => removerImagem(i)}
                        aria-label={`Remover a imagem ${i + 1}`}
                        className="text-red-300 hover:text-red-200"
                      ><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  value={novaImagem}
                  onChange={(e) => setNovaImagem(e.target.value)}
                  /* Enter acrescenta. Sem isto, quem cola uma URL e carrega em Enter submetia o
                     formulário e gravava o produto a meio de estar a montar a galeria. */
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentarImagem(novaImagem) } }}
                  placeholder="https://… e Enter"
                  className="flex-1 rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => acrescentarImagem(novaImagem)}
                  disabled={!novaImagem.trim() || form.imagens.length >= IMAGENS_MAX}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Plus size={14} /> Acrescentar
                </button>
              </div>
              <span className="mt-1 block text-[11px] text-zinc-500">
                A capa é a primeira e não se apaga aqui. As setas mudam a ordem em que aparecem na ficha.
                Máximo {IMAGENS_MAX} além da capa — a ficha tem de abrir depressa no telemóvel, que é onde a
                maioria compra.
              </span>
            </div>

            <label className="sm:col-span-2 block">
              <span className="text-xs text-zinc-400">Link do conteúdo — para onde vai o comprador depois de pagar</span>
              <input
                value={form.conteudo_url}
                onChange={(e) => setForm({ ...form, conteudo_url: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                placeholder="https://…"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Nunca aparece na montra. Só é entregue a quem comprou.
              </span>
            </label>

            <label className="sm:col-span-2 block">
              <span className="text-xs text-zinc-400">Nota de acesso (opcional)</span>
              <input
                value={form.conteudo_nota}
                onChange={(e) => setForm({ ...form, conteudo_nota: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                placeholder="Password da pasta, instruções, horário das sessões…"
              />
            </label>
          </div>

          {/* ── A campanha ──────────────────────────────────────────────────────────────── */}
          <fieldset className="rounded-lg border border-zinc-800 p-3">
            <legend className="px-1 text-xs text-zinc-400">Campanha de desconto</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="text-[11px] text-zinc-500">Desconto (%)</span>
                <input
                  type="number" min={0} max={90}
                  value={form.campanha_pct}
                  onChange={(e) => setForm({ ...form, campanha_pct: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-2 py-1.5 text-sm text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-500">Para quem</span>
                <select
                  value={form.campanha_tier}
                  onChange={(e) => setForm({ ...form, campanha_tier: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-2 py-1.5 text-sm text-zinc-100"
                >
                  {TIERS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-500">Começa</span>
                <input
                  type="datetime-local" value={form.campanha_inicio}
                  onChange={(e) => setForm({ ...form, campanha_inicio: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-2 py-1.5 text-sm text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-500">Acaba</span>
                <input
                  type="datetime-local" value={form.campanha_fim}
                  onChange={(e) => setForm({ ...form, campanha_fim: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-2 py-1.5 text-sm text-zinc-100"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Sem datas, vale desde já e não acaba. O desconto aparece já no preço a quem tem direito — não é
              um código para escrever. Máximo 90%.
              {Number(form.campanha_pct) > 0 && Number(form.preco_cents) > 0 && (
                <> Fica em <strong className="text-[#D2A63C]">
                  {euros(Math.round(Number(form.preco_cents)) - Math.floor((Number(form.preco_cents) * Number(form.campanha_pct)) / 100))}
                </strong>.</>
              )}
            </p>
          </fieldset>

          {ehAdmin && podeVer("partilha_pct") && (
            <p className="text-[11px] text-zinc-500">
              A partilha e o interruptor do produto editam-se no Centro → Marketplace, onde estão ao lado do
              extracto do educador.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void gravar()}
              disabled={aGravar}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {aGravar ? <Loader2 size={14} className="animate-spin" /> : "Gravar"}
            </button>
            {form.id && (
              <button
                onClick={() => void gravar("publicar")}
                disabled={aGravar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Send size={14} /> {ehAdmin ? "Gravar e publicar" : "Gravar e pedir publicação"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: a imagem gerada ───────────────────────────────────────────────────────── */}
      {modalImagem && (
        <Modal onFechar={() => setModalImagem(null)} titulo="Imagem gerada">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={modalImagem} alt="Imagem gerada por IA" className="max-h-[60vh] w-auto rounded-lg" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { setForm((f) => ({ ...f, imagem_url: modalImagem })); setModalImagem(null); setNota("Imagem escolhida. Grava para ficar.") }}
              className="rounded-lg border border-[#D2A63C]/35 bg-[#D2A63C]/12 px-3 py-1.5 text-sm text-[#D2A63C]"
            >
              Usar como capa
            </button>
            <button
              onClick={() => { acrescentarImagem(modalImagem); setModalImagem(null); setNota("Imagem acrescentada à galeria. Grava para ficar.") }}
              disabled={form.imagens.length >= IMAGENS_MAX}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 disabled:opacity-40"
            >
              Acrescentar à galeria
            </button>
            <a href={modalImagem} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">
              <Download size={14} /> Descarregar
            </a>
            <button onClick={() => void pedirImagem()} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">
              Gerar outra
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: o flyer ───────────────────────────────────────────────────────────────── */}
      {modalFlyer && (
        <Modal onFechar={() => setModalFlyer(null)} titulo="Flyer do produto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={modalFlyer} alt="Flyer do produto" className="max-h-[60vh] w-auto rounded-lg" />
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={modalFlyer} download="flyer.png" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/35 bg-[#D2A63C]/12 px-3 py-1.5 text-sm text-[#D2A63C]">
              <Download size={14} /> Descarregar
            </a>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            1080×1350, pronto para Instagram. O fundo é a capa do produto; o texto e o preço vêm da ficha,
            para não haver flyers com preços que já não existem.
          </p>
        </Modal>
      )}
    </div>
  )
}

function Modal({ titulo, children, onFechar }: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-100">{titulo}</h4>
          <button onClick={onFechar} className="text-zinc-500 hover:text-zinc-300" aria-label="Fechar"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
