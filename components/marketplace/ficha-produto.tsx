"use client"

/**
 * A FICHA DE UM PRODUTO — o que a pessoa lê antes de decidir, e onde decide.
 *
 * ── PORQUE É QUE ISTO PRECISOU DE EXISTIR ─────────────────────────────────────────────────
 *
 * O checkout já mandava o comprador para `/marketplace/<slug>` no `cancel_url` e para
 * `/marketplace/biblioteca` no `success_url`. Nenhuma das duas páginas existia. Ou seja: quem
 * desistisse do pagamento caía num 404, e quem PAGASSE também — a compra ficava registada e o
 * cliente aterrava numa página que não existe, sem ver o que tinha acabado de comprar.
 *
 * Um marketplace em que se paga e não se vê o que se comprou não é um marketplace por acabar: é um
 * marketplace avariado, e era esse o estado.
 *
 * ── O PREÇO VEM DECIDIDO ──────────────────────────────────────────────────────────────────
 *
 * Como na vitrine: o `preco` e o `podeComprar` chegam já calculados da rota, com as mesmas funções
 * que o servidor usa para recusar o pedido. O ecrã não recalcula desconto nenhum — se recalculasse,
 * mostrava um número e o Stripe cobrava outro.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, ArrowLeft, Tag, Clock, ExternalLink } from "lucide-react"
import { euros, galeriaDoProduto, nomeDoAutor } from "@/lib/marketplace/regras"
import { codigoDeAgenteGuardado } from "@/lib/agentes/atribuicao-browser"
import Sufixo from "@/components/marketplace/sufixo-periodo"

type Preco = {
  baseCents: number; cents: number; descontoPct: number
  emCampanha: boolean; acabaEm: string | null; moeda: string
}
type Produto = {
  id: string; slug: string; titulo: string; subtitulo: string | null; descricao: string | null
  tipo: string; categoria: string; imagem_url: string | null; recorrente: boolean
  periodicidade: string
  /** A galeria, SEM a capa — a capa é `imagem_url`. Ver `galeriaDoProduto`. */
  imagens: string[] | null
  educador: { display_name: string; specialty: string | null } | null
  /** Nome de marca do vendedor. Nulo = assina o educador. */
  vendedor_nome?: string | null
  educator_id?: string | null
  dono?: string | null
  jaComprou: boolean; podeComprar: boolean; motivoSemCompra: string | null
  preco: Preco
}

/**
 * O que se diz a quem não pode comprar.
 *
 * `ios_iap_required` NÃO leva link nenhum para fora, nem sequer texto que sugira «vai ao site». Um
 * caminho para checkout externo dentro da app é a Guideline 3.1.1 à letra.
 */
const PORQUE_NAO: Record<string, string> = {
  ios_iap_required: "Disponível em breve na app.",
  marketplace_desligado: "Ainda não está à venda.",
  vendedor_inactivo: "Temporariamente indisponível.",
  produto_indisponivel: "Temporariamente indisponível.",
  ja_comprado: "Já é teu.",
}

export default function FichaProduto({ slug }: { slug: string }) {
  const [produto, setProduto] = useState<Produto | null | "nao-existe">(null)
  // A ficha é PÚBLICA. Sem isto, um visitante sem sessão via a caixa de compra inteira — cupão,
  // referral e botão — e o «Comprar» devolvia «Autenticação necessária» num aviso vermelho.
  const [autenticado, setAutenticado] = useState(true)
  // Qual das imagens está em grande. Índice e não URL: se o produto for recarregado com menos
  // imagens do que antes, um índice fora de alcance corrige-se com um `min` — uma URL que já não
  // existe na galeria deixava a ficha sem imagem nenhuma.
  const [activa, setActiva] = useState(0)
  const [email, setEmail] = useState("")
  /**
   * OPCIONAL, SEMPRE. Pede-se porque esta casa quase não tem telefones — 13% dos perfis a
   * 01/10/2026 — e é por aqui que entra quem ainda não é cliente. Mas não se obriga: obrigar um
   * telefone num checkout corta vendas, e trocar uma venda por um contacto é um mau negócio.
   */
  const [telefone, setTelefone] = useState("")
  const [cupao, setCupao] = useState("")
  const [referral, setReferral] = useState("")
  const [aComprar, setAComprar] = useState(false)
  const [erro, setErro] = useState<{ texto: string; campo?: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/marketplace/produtos?slug=${encodeURIComponent(slug)}`)
      const j = await r.json().catch(() => ({ produtos: [] }))
      setProduto(j.produtos?.[0] ?? "nao-existe")
      setAutenticado(j.autenticado !== false)
    })()
  }, [slug])

  // Um link partilhado pode trazer o código de quem indicou: /marketplace/x?ref=joao
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ref = p.get("ref")
    if (ref) setReferral(ref)
    if (p.get("cancelado")) setErro({ texto: "Pagamento cancelado. O produto continua aqui." })
  }, [])

  const comprar = useCallback(async () => {
    if (!produto || produto === "nao-existe") return
    setAComprar(true)
    setErro(null)
    try {
      const r = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `email` só vai quando não há sessão: com sessão, quem compra é quem está autenticado e o
        // servidor ignora o que vier no corpo — a identidade nunca vem do pedido.
        // `agenteCodigo` vai sempre e não tem campo no ecrã: quem compra não escolhe quem o
        // trouxe. Vem do link `?ag=` guardado no browser, e é só medição — nunca mexe no preço.
        body: JSON.stringify({
          produtoId: produto.id, cupao, referral, email, telefone,
          agenteCodigo: codigoDeAgenteGuardado(),
        }),
      })
      const j = await r.json()
      // Um produto da casa que mantém o caminho de compra antigo devolve `externo`.
      if (r.ok && (j.url || j.externo)) {
        window.location.href = j.url ?? j.externo
        return
      }
      // O erro traz `campo` quando é do cupão ou do referral: assim o aviso aparece no sítio certo
      // em vez de uma mensagem genérica no topo que não diz qual dos dois códigos está mal.
      setErro({ texto: j.error ?? "Não foi possível abrir o pagamento.", campo: j.campo })
    } catch {
      setErro({ texto: "Não foi possível abrir o pagamento." })
    } finally {
      setAComprar(false)
    }
  }, [produto, cupao, referral, email])

  if (produto === null) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> A carregar…
      </div>
    )
  }

  if (produto === "nao-existe") {
    return (
      <div className="py-20 text-center">
        <p className="text-zinc-400">Este produto não existe ou já não está à venda.</p>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-[#D2A63C] hover:underline">
          Ver o marketplace
        </Link>
      </div>
    )
  }

  const p = produto
  const acaba = p.preco.acabaEm ? new Date(p.preco.acabaEm) : null
  // A MESMA função que o servidor usa para gravar: a capa primeiro, o resto pela ordem do autor, sem
  // repetições. Montar a lista aqui à mão era arriscar que a ficha mostrasse a capa duas vezes.
  const galeria = galeriaDoProduto(p)

  return (
    <div className="space-y-6">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Marketplace
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* ── A GALERIA ────────────────────────────────────────────────────────────────
              A capa primeiro e a coluna `imagens` a seguir (`galeriaDoProduto`). Uma imagem só
              desenha-se como antes: sem miniaturas, que numa fila de uma sugerem que falta algo.

              A imagem grande é um estado LOCAL e não um link — trocar de imagem não muda de página,
              e quem voltar atrás no browser volta ao marketplace e não à segunda fotografia. */}
          {galeria.length > 0 && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={galeria[Math.min(activa, galeria.length - 1)]}
                alt=""
                className="aspect-[4/3] w-full rounded-xl border border-zinc-800 object-cover"
              />
              {galeria.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {galeria.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiva(i)}
                      /* `aria-label` com o número porque a miniatura não tem texto e o `alt` é
                         vazio: estas imagens são decorativas para quem lê o ecrã com a voz, mas o
                         BOTÃO tem de ser nomeável para se poder carregar nele. */
                      aria-label={`Ver imagem ${i + 1} de ${galeria.length}`}
                      aria-current={i === activa}
                      className={`h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg border transition ${
                        i === activa ? "border-[#D2A63C]" : "border-zinc-800 opacity-60 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <span className="text-xs uppercase tracking-wide text-[#D2A63C]">{p.categoria}</span>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{p.titulo}</h1>
            {p.subtitulo && <p className="mt-1 text-zinc-400">{p.subtitulo}</p>}
            {/* O nome do vendedor passa por `nomeDoAutor` e não lê o educador directamente: há
                produtos que se vendem sob uma marca (a She Is Faceless Academy) e não sob o nome
                de quem os fez. A especialidade só acompanha quando é mesmo a pessoa a assinar —
                «SHE IS FACELESS ACADEMY · Faceless Marketing» dizia a mesma coisa duas vezes. */}
            {(p.vendedor_nome || p.educador) && (
              <p className="mt-2 text-sm text-zinc-500">
                Por {nomeDoAutor(p, () => p.educador?.display_name)}
                {!p.vendedor_nome && p.educador?.specialty ? ` · ${p.educador.specialty}` : ""}
              </p>
            )}
          </div>

          {p.descricao && (
            <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
              {p.descricao.split(/\n{2,}/).map((par, i) => (
                <p key={i}>{par}</p>
              ))}
            </div>
          )}
        </div>

        {/* ── A caixa de compra ────────────────────────────────────────────────────────── */}
        <aside className="h-fit space-y-4 rounded-xl border border-zinc-800 bg-black/40 p-4 lg:sticky lg:top-4">
          <div>
            {p.preco.emCampanha && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500 line-through">{euros(p.preco.baseCents, p.preco.moeda)}</span>
                <span className="rounded bg-[#D2A63C]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#D2A63C]">
                  −{p.preco.descontoPct}%
                </span>
              </div>
            )}
            <div className="text-3xl font-semibold text-zinc-100">
              {p.preco.baseCents === 0 ? "Grátis" : euros(p.preco.cents, p.preco.moeda)}
              {/* O período vem da coluna `periodicidade` (157), nunca do `recorrente`: quatro dos
                  produtos publicados são ANUAIS. Ver a nota igual em `vitrine.tsx`. */}
              <Sufixo p={p} className="text-base" />
            </div>
            {acaba && (
              <p className="mt-1 flex items-center gap-1 text-xs text-[#D2A63C]">
                <Clock size={12} /> Campanha até {acaba.toLocaleDateString("pt-PT")}
              </p>
            )}
          </div>

          {p.jaComprou ? (
            <Link
              href="/marketplace/biblioteca"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300"
            >
              <ExternalLink size={14} /> Abrir na minha biblioteca
            </Link>
          ) : p.podeComprar ? (
            <>
              {/* ── SEM SESSÃO: O EMAIL, E MAIS NADA ─────────────────────────────────────────
                  Antes havia aqui um «Entrar para comprar» que mandava a pessoa ao login. Pedir
                  conta antes de vender é perder a venda de quem ainda não é cliente — e o
                  marketplace existe exactamente para vender a essa pessoa.

                  O email chega: a conta é criada no checkout e o produto fica agarrado a ela. O
                  cupão e o código de quem indicou continuam aqui ao lado, e agora NÃO se perdem —
                  não há login pelo meio onde os deixar cair.

                  O link para entrar fica, mas em segundo plano: quem já é membro ganha com isso
                  (a compra vai para a conta que já tem, e o preço de campanha de membro só se
                  aplica com sessão — ver `lib/marketplace/comprador.ts`). */}
              {!autenticado && (
                <>
                  <label className="block">
                    <span className="text-xs text-zinc-400">O teu email</span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErro(null) }}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                      placeholder="nome@email.com"
                    />
                    {erro?.campo === "email" && <span className="mt-1 block text-xs text-red-300">{erro.texto}</span>}
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Telemóvel (opcional)</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                      placeholder="912 345 678"
                    />
                  </label>
                  {/* O MOTIVO À FRENTE. Um campo de telefone sem explicação num checkout parece
                      recolha para vender a alguém, e as pessoas não o preenchem — com razão. Com o
                      motivo escrito, preenchem. */}
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    O telemóvel serve só para te avisarmos se houver algum problema com o teu acesso.
                  </p>

                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Criamos-te a conta com este email e enviamos-te o acesso depois do pagamento.{" "}
                    <Link href={`/login?redirect=/marketplace/${p.slug}`} className="text-[#D2A63C] hover:underline">
                      Já tenho conta
                    </Link>
                  </p>
                </>
              )}

              <label className="block">
                <span className="text-xs text-zinc-400">Código de desconto (opcional)</span>
                <input
                  value={cupao}
                  onChange={(e) => { setCupao(e.target.value); setErro(null) }}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm uppercase text-zinc-100"
                  placeholder="MKT20"
                />
                {erro?.campo === "cupao" && <span className="mt-1 block text-xs text-red-300">{erro.texto}</span>}
              </label>

              <label className="block">
                <span className="text-xs text-zinc-400">Quem te indicou (opcional)</span>
                <input
                  value={referral}
                  onChange={(e) => { setReferral(e.target.value); setErro(null) }}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
                  placeholder="username"
                />
                {erro?.campo === "referral" && <span className="mt-1 block text-xs text-red-300">{erro.texto}</span>}
              </label>

              <button
                onClick={() => void comprar()}
                disabled={aComprar}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#D2A63C] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#BB8525] disabled:opacity-60"
              >
                {aComprar ? <Loader2 size={15} className="animate-spin" /> : <Tag size={15} />}
                {aComprar ? "A abrir…" : "Comprar"}
              </button>

              {erro && !erro.campo && <p className="text-xs text-red-300">{erro.texto}</p>}

              <p className="text-[11px] leading-relaxed text-zinc-500">
                Pagamento seguro via Stripe. Depois de pagar, o produto aparece na tua biblioteca.
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-zinc-800 px-3 py-2.5 text-center text-sm text-zinc-400">
              {PORQUE_NAO[p.motivoSemCompra ?? ""] ?? "Não disponível."}
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
