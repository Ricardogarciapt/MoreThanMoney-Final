"use client"

/**
 * A VITRINE — a montra multivendedor da MTM, e a biblioteca de quem já comprou.
 *
 * Um componente para os dois sítios (site e app-mobile) de propósito. A alternativa era um ecrã
 * web e um ecrã mobile, e foi assim que o gating de conteúdo do /live acabou com quatro cópias da
 * mesma regra a discordarem umas das outras — o VIP com cadeado na web e sem cadeado na app.
 *
 * O ecrã NÃO decide nada. O `podeComprar`, o `motivoSemCompra`, o `preco` e o `vendedor` vêm já
 * decididos da rota, que os calcula com as mesmas funções que o servidor usa para recusar o
 * pedido. É isso que garante que o botão e o travão nunca discordam.
 *
 * ── O QUE FAZ DISTO UM MULTIVENDEDOR E NÃO UMA LISTA DE PRODUTOS ──────────────────────────
 *
 * Quatro coisas, e nenhuma é decoração:
 *
 *   1. O VENDEDOR em cada cartão, por cima do nome do produto. É a marca de água: quem chega vê
 *      logo que a loja é de várias pessoas. Hoje o único vendedor é a casa — ver `vendedorDoProduto`
 *      em `regras.ts` para a razão de isso não esconder a linha.
 *   2. A TIRA DE VENDEDORES no topo, que é ao mesmo tempo assinatura e navegação.
 *   3. A PROCURA em destaque, não escondida num canto.
 *   4. As CATEGORIAS visíveis, não num menu que é preciso abrir.
 *
 * ── O QUE FICOU DE FORA, E PORQUÊ ─────────────────────────────────────────────────────────
 *
 * «Mais vendidos» e estrelas de avaliação. Não há uma única venda nem uma única avaliação, e uma
 * secção «mais vendidos» construída sobre zero vendas é uma ordem inventada com ar de facto — que
 * é a mesma família de mentira que a regra da casa proíbe nos números de trading. Quando houver
 * vendas, entra, e a função que as ordena já tem onde viver (`vendedoresDaMontra`).
 *
 * ── AS CAPAS QUE FALTAM ───────────────────────────────────────────────────────────────────
 *
 * Treze dos catorze produtos não têm imagem (o gerador gratuito passou a exigir conta — está
 * contado em `imagens-gratis.ts`). Numa montra, treze rectângulos cinzentos leem-se como uma
 * página meio carregada. Por isso o que falta NÃO é um vazio: é um painel da casa, escuro com
 * ouro, com a inicial da categoria. Intencional em vez de partido, e sai sozinho do caminho
 * quando a imagem real chegar.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { lojaExternaDe } from "@/lib/marketplace/regras"
import Link from "next/link"
import { Loader2, Lock, ShoppingBag, ExternalLink, Search, Store, X } from "lucide-react"
import { euros, precoAntesDaLoja, procuraCasa, type Vendedor } from "@/lib/marketplace/regras"
import Sufixo from "@/components/marketplace/sufixo-periodo"

type Autor = { id: string; display_name: string; avatar_url: string | null; specialty: string | null }
/** O preço JÁ DECIDIDO pela rota. O cartão não recalcula desconto nenhum. */
type Preco = {
  baseCents: number; cents: number; descontoPct: number
  emCampanha: boolean; acabaEm: string | null; moeda: string
}
type Produto = {
  id: string
  slug: string
  titulo: string
  subtitulo: string | null
  descricao: string | null
  tipo: string
  categoria: string
  imagem_url: string | null
  preco_cents: number
  moeda: string
  /** 193 — ex.: «Tech Crypto», dentro de «Produtos». */
  subcategoria?: string | null
  /** 193 — o «antes» da loja oficial em promoção (lido pelo cron). */
  preco_base_cents?: number | null
  recorrente: boolean
  /** De quanto em quanto tempo se cobra (157). É ela que escreve «/mês» ou «/ano». */
  periodicidade: string
  /** 158 — escolhido no admin para ir ao cimo da montra. */
  destaque: boolean
  preco: Preco
  educador: Autor | null
  vendedor: Vendedor
  jaComprou: boolean
  podeComprar: boolean
  motivoSemCompra: string | null
}
type Item = {
  compraId: string
  produtoId: string
  titulo: string
  subtitulo: string | null
  tipo: string | null
  imagem_url: string | null
  educador: Autor | null
  estado: string
  acesso_expira_em: string | null
  aberto: boolean
  conteudo_url: string | null
  conteudo_nota: string | null
}

/**
 * O que se diz a quem não pode comprar.
 *
 * `ios_iap_required` é o caso da Apple e é o mais importante: NÃO leva link nenhum para fora, nem
 * sequer texto que sugira «vai ao site». Um link para um checkout externo dentro da app é a
 * Guideline 3.1.1 à letra, e é por onde uma submissão cai. Diz-se o que é, e fica por ali — que é
 * exactamente o que o ecrã das aulas pagas já faz e passou revisão.
 */
const PORQUE_NAO: Record<string, string> = {
  ios_iap_required: "Disponível em breve na app.",
  marketplace_desligado: "Ainda não está à venda.",
  vendedor_inactivo: "Temporariamente indisponível.",
  produto_indisponivel: "Temporariamente indisponível.",
}

/** Quantas categorias se mostram antes do «ver todas». Seis cabem numa linha em ecrã de portátil. */
const CATEGORIAS_A_MOSTRAR = 6

export function Vitrine({ compacto = false }: { compacto?: boolean }) {
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [vendedores, setVendedores] = useState<(Vendedor & { produtos: number })[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [ligado, setLigado] = useState(true)
  const [autenticado, setAutenticado] = useState(true)
  const [aComprar, setAComprar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string | null>(null)
  // 193 — o filtro de segundo nível, só dentro de «Produtos».
  const [subcategoria, setSubcategoria] = useState<string | null>(null)
  const [todasCategorias, setTodasCategorias] = useState(false)
  const [termo, setTermo] = useState("")

  const ler = useCallback(async () => {
    const [v, b] = await Promise.all([
      fetch("/api/marketplace/produtos").then((r) => r.json()).catch(() => ({ produtos: [] })),
      // A biblioteca é de quem tem sessão. Num visitante anónimo responde vazio, e o `catch`
      // trata-a como vazia — a montra pública não pode ficar em branco por causa disto.
      fetch("/api/marketplace/biblioteca").then((r) => r.json()).catch(() => ({ itens: [] })),
    ])
    setProdutos(v.produtos ?? [])
    setVendedores(v.vendedores ?? [])
    setLigado(v.ligado !== false)
    setAutenticado(v.autenticado !== false)
    setItens(b.itens ?? [])
  }, [])

  useEffect(() => { void ler() }, [ler])

  const comprar = useCallback(async (produtoId: string) => {
    // Produto de terceiros (categoria «Produtos»): vai directo à loja oficial, sem conta nem checkout nosso.
    const daLista = (produtos ?? []).find((x) => x.id === produtoId) as { tipo: string; checkout_externo_url?: string | null } | undefined
    const loja = daLista ? lojaExternaDe(daLista) : null
    if (loja) { window.open(loja, "_blank", "noopener,noreferrer"); return }
    setAComprar(produtoId)
    setAviso(null)
    try {
      const r = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId }),
      })
      const j = await r.json()
      // `externo` é o caminho de compra ANTIGO de um produto da casa — `/upgrade`,
      // `/scanner-access`, `/sensei-ea`. Esses fluxos provisionam o acesso, mandam o email e
      // creditam o MLM; o checkout novo só cobrava.
      if (r.ok && (j.url || j.externo)) {
        window.location.href = j.url ?? j.externo
        return
      }
      setAviso(j.error ?? "Não foi possível abrir o pagamento.")
    } catch {
      setAviso("Não foi possível abrir o pagamento.")
    } finally {
      setAComprar(null)
    }
  }, [produtos])

  const categorias = useMemo(
    () => Array.from(new Map((produtos ?? []).map((p) => [p.tipo, p.categoria])).entries()),
    [produtos],
  )

  // As subcategorias da categoria escolhida (hoje só «Produtos» as tem). Saem dos produtos que
  // existem, como as categorias: um filtro sem nada lá dentro é um beco.
  const subcategorias = useMemo(() => {
    if (!categoria) return []
    const conta = new Map<string, number>()
    for (const p of produtos ?? []) {
      if (p.tipo === categoria && p.subcategoria) conta.set(p.subcategoria, (conta.get(p.subcategoria) ?? 0) + 1)
    }
    return Array.from(conta.entries())
  }, [produtos, categoria])

  const visiveis = useMemo(
    () =>
      (produtos ?? []).filter(
        (p) =>
          (!categoria || p.tipo === categoria) &&
          (!subcategoria || p.subcategoria === subcategoria) &&
          procuraCasa(p, termo),
      ),
    [produtos, categoria, subcategoria, termo],
  )

  /**
   * As campanhas a correr, para as faixas de destaque.
   *
   * A faixa só existe quando HÁ campanha. Um bloco «destaque» permanentemente vazio, ou preenchido
   * com um produto qualquer a fingir de promoção, é pior do que não haver bloco nenhum: ensina
   * quem visita a ignorar aquele sítio da página, e no dia em que houver campanha a sério ninguém
   * olha para lá.
   */
  const emCampanha = useMemo(() => (produtos ?? []).filter((p) => p.preco.emCampanha).slice(0, 2), [produtos])

  /**
   * OS DESTAQUES (158) — o que a casa quer vender agora, escolhido no admin.
   *
   * Só aparecem quando NÃO há filtro nem procura: quem escreveu «sensei» na caixa quer o Sensei, e
   * uma fila de destaques por cima dos resultados empurra para baixo exactamente o que ele pediu.
   * A montra completa a seguir mostra-os na mesma — a fila é uma segunda porta, não uma secção que
   * rouba produtos à grelha, porque um produto que aparece em cima e desaparece da lista faz quem
   * procura julgar que ele já não está à venda.
   */
  const destacados = useMemo(
    () => (categoria || termo.trim() ? [] : (produtos ?? []).filter((p) => p.destaque).slice(0, 6)),
    [produtos, categoria, termo],
  )

  if (produtos === null) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> A carregar…
      </div>
    )
  }

  const abertos = itens.filter((i) => i.aberto)
  const fechados = itens.filter((i) => !i.aberto)
  const categoriasVisiveis = todasCategorias ? categorias : categorias.slice(0, CATEGORIAS_A_MOSTRAR)

  return (
    <div className="space-y-10">
      {aviso && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{aviso}</p>
      )}

      {/* O que já é meu vem PRIMEIRO. Quem já comprou vem abrir, não vem comprar outra vez. */}
      {itens.length > 0 && (
        <section>
          <Kicker>O que compraste</Kicker>
          <div className={`grid gap-3 ${compacto ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {abertos.map((i) => (
              <a
                key={i.compraId}
                href={i.conteudo_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-[#D2A63C]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-zinc-100">{i.titulo}</h3>
                  <ExternalLink size={14} className="mt-1 shrink-0 text-[#D2A63C]" />
                </div>
                {i.educador && <p className="mt-1 text-xs text-zinc-500">{i.educador.display_name}</p>}
                {i.conteudo_nota && <p className="mt-2 text-xs text-zinc-400">{i.conteudo_nota}</p>}
                {i.acesso_expira_em && (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Acesso até {new Date(i.acesso_expira_em).toLocaleDateString("pt-PT")}
                  </p>
                )}
              </a>
            ))}
            {/* Um produto a que se perdeu o acesso continua a aparecer, com a razão. Vê-lo
                desaparecer sem explicação é o que faz alguém escrever para o suporte. */}
            {fechados.map((i) => (
              <div key={i.compraId} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.01] p-4 opacity-60">
                <div className="flex items-start gap-2">
                  <Lock size={14} className="mt-1 shrink-0 text-zinc-500" />
                  <h3 className="font-medium text-zinc-400">{i.titulo}</h3>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {i.estado === "reembolsada"
                    ? "Reembolsado."
                    : i.acesso_expira_em
                      ? `O acesso terminou a ${new Date(i.acesso_expira_em).toLocaleDateString("pt-PT")}.`
                      : "Sem acesso."}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!ligado || produtos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 text-zinc-600" size={28} />
          <p className="text-sm text-zinc-400">Ainda não há nada à venda por aqui.</p>
          <p className="mt-1 text-xs text-zinc-600">Os educadores estão a preparar os primeiros produtos.</p>
        </div>
      ) : (
        <>
          {/* ── A tira de vendedores ─────────────────────────────────────────────────────
              Assinatura e navegação ao mesmo tempo. Escondida no modo compacto (app): lá o ecrã
              é estreito e esta tira empurrava os produtos para fora da primeira dobra. */}
          {!compacto && vendedores.length > 0 && (
            <section>
              <Kicker>Quem vende aqui</Kicker>
              <div className="flex flex-wrap gap-2">
                {vendedores.map((v) => (
                  <Link
                    key={v.id}
                    href={`/marketplace/loja/${v.id}`}
                    className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition-colors hover:border-[#D2A63C]/45"
                  >
                    <MarcaDoVendedor vendedor={v} tamanho={30} />
                    <span className="leading-tight">
                      <span className="block text-sm text-zinc-100 group-hover:text-[#D2A63C]">{v.nome}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {v.produtos} {v.produtos === 1 ? "produto" : "produtos"}
                        {v.nota ? ` · ${v.nota}` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Em destaque ───────────────────────────────────────────────────────────── */}
          {destacados.length > 0 && (
            <section>
              <Kicker>Em destaque</Kicker>
              <div className={`grid gap-4 ${compacto ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {destacados.map((p) => (
                  <Cartao
                    key={`destaque-${p.id}`}
                    produto={p}
                    autenticado={autenticado}
                    aComprar={aComprar === p.id}
                    onComprar={() => comprar(p.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── As faixas de campanha ────────────────────────────────────────────────────
              Só existem quando há campanha a correr. Ver a nota em `emCampanha`. */}
          {emCampanha.length > 0 && (
            <section className={`grid gap-3 ${emCampanha.length > 1 ? "md:grid-cols-2" : ""}`}>
              {emCampanha.map((p) => (
                <Link
                  key={p.id}
                  href={`/marketplace/${p.slug}`}
                  className="group relative overflow-hidden rounded-2xl border border-[#D2A63C]/30 bg-gradient-to-br from-[#D2A63C]/[0.12] via-[#191920] to-[#0e0e12] p-6 transition-colors hover:border-[#D2A63C]/60"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#D2A63C]">
                    −{p.preco.descontoPct}% · campanha
                  </span>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">{p.titulo}</h3>
                  {p.subtitulo && <p className="mt-1 max-w-[42ch] text-sm text-zinc-400">{p.subtitulo}</p>}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-sm text-zinc-500 line-through">{euros(p.preco.baseCents, p.preco.moeda)}</span>
                    <span className="text-2xl font-semibold text-[#eccb78]">{euros(p.preco.cents, p.preco.moeda)}</span>
                  </div>
                  {p.preco.acabaEm && (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Até {new Date(p.preco.acabaEm).toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </Link>
              ))}
            </section>
          )}

          {/* ── A procura e as categorias ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Procurar por produto, categoria ou vendedor"
                aria-label="Procurar no marketplace"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none"
              />
              {termo && (
                <button
                  type="button"
                  onClick={() => setTermo("")}
                  aria-label="Limpar a procura"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {categorias.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <Pilula activa={categoria === null} onClick={() => { setCategoria(null); setSubcategoria(null) }}>
                  Tudo ({produtos.length})
                </Pilula>
                {categoriasVisiveis.map(([tipo, nome]) => (
                  <Pilula key={tipo} activa={categoria === tipo} onClick={() => { setCategoria(tipo); setSubcategoria(null) }}>
                    {nome} ({produtos.filter((x) => x.tipo === tipo).length})
                  </Pilula>
                ))}
                {categorias.length > CATEGORIAS_A_MOSTRAR && (
                  <button
                    type="button"
                    onClick={() => setTodasCategorias((v) => !v)}
                    className="rounded-full px-3 py-1 text-xs text-[#D2A63C] underline decoration-dotted underline-offset-4 hover:text-[#eccb78]"
                  >
                    {todasCategorias ? "ver menos" : `ver todas (${categorias.length})`}
                  </button>
                )}
              </div>
            )}

            {subcategorias.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-l border-[#D2A63C]/30 pl-3">
                <Pilula activa={subcategoria === null} onClick={() => setSubcategoria(null)}>
                  Todos
                </Pilula>
                {subcategorias.map(([nome, n]) => (
                  <Pilula key={nome} activa={subcategoria === nome} onClick={() => setSubcategoria(nome)}>
                    {nome} ({n})
                  </Pilula>
                ))}
              </div>
            )}
          </section>

          {/* ── A montra ─────────────────────────────────────────────────────────────── */}
          <section>
            {itens.length > 0 && <Kicker>À venda</Kicker>}
            {visiveis.length === 0 ? (
              // Uma procura sem resultados NÃO é uma loja vazia, e tem de o dizer com outras
              // palavras — senão quem procurou «xpto» conclui que a montra não tem nada.
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
                <p className="text-sm text-zinc-400">Nada encontrado para o que procuraste.</p>
                <button
                  type="button"
                  onClick={() => { setTermo(""); setCategoria(null); setSubcategoria(null) }}
                  className="mt-2 text-xs text-[#D2A63C] hover:underline"
                >
                  Ver tudo outra vez
                </button>
              </div>
            ) : (
              <div className={`grid gap-4 ${compacto ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {visiveis.map((p) => (
                  <Cartao
                    key={p.id}
                    produto={p}
                    autenticado={autenticado}
                    aComprar={aComprar === p.id}
                    onComprar={() => comprar(p.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ── As peças ──────────────────────────────────────────────────────────────────────────────

/** O rótulo mono em maiúsculas com espaçamento largo. É a voz visual da casa (ver a /new-landing). */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D2A63C]">{children}</h2>
  )
}

function Pilula({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        activa
          ? "border-[#D2A63C] bg-[#D2A63C]/10 text-[#D2A63C]"
          : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A marca do vendedor: o avatar dele, ou o monograma da casa.
 *
 * A casa não tem avatar (não é uma linha de `lms_educators`), e pôr-lhe uma imagem genérica de
 * pessoa era fingir que é alguém. O monograma em ouro é o que ela É — uma marca.
 */
export function MarcaDoVendedor({ vendedor, tamanho = 26 }: { vendedor: Vendedor; tamanho?: number }) {
  if (vendedor.avatarUrl) {
    return (
      <Image
        src={vendedor.avatarUrl}
        alt=""
        width={tamanho}
        height={tamanho}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: tamanho, height: tamanho }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 font-mono font-semibold text-[#D2A63C]"
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.42) }}
    >
      {vendedor.ehACasa ? "M" : vendedor.nome.slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * A capa que falta.
 *
 * Um painel da casa com a inicial da categoria, e não um rectângulo cinzento. A diferença não é
 * de gosto: treze rectângulos cinzentos leem-se como uma página que não acabou de carregar, e é
 * isso que faz alguém recarregar ou sair.
 */
function CapaEmFalta({ categoria }: { categoria: string }) {
  return (
    <div className="relative flex h-40 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#1b1b22] via-[#141419] to-[#0e0e12]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(210,166,60,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(210,166,60,.07) 1px,transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <span className="relative font-mono text-[10px] uppercase tracking-[0.25em] text-[#D2A63C]/70">{categoria}</span>
    </div>
  )
}

function Cartao({
  produto: p,
  autenticado,
  aComprar,
  onComprar,
}: {
  produto: Produto
  autenticado: boolean
  aComprar: boolean
  onComprar: () => void
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[#D2A63C]/35">
      {/* O cartão LEVA À FICHA. Sem isto, a descrição completa, a campanha, o campo do cupão e o
          de quem indicou não tinham como ser alcançados: a única coisa clicável num cartão era
          «Comprar», e comprar às cegas é o que faz devolver. */}
      <Link href={`/marketplace/${p.slug}`} aria-label={p.titulo}>
        {p.imagem_url ? (
          <div className="relative h-40 w-full bg-black/40">
            <Image src={p.imagem_url} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : (
          <CapaEmFalta categoria={p.categoria} />
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {/* ── O VENDEDOR, POR CIMA DO NOME DO PRODUTO ──────────────────────────────────
            É a marca de água de um multivendedor. Leva à loja dele, e não à ficha do produto:
            são duas perguntas diferentes («o que é isto?» e «quem é esta pessoa?»). */}
        <Link
          href={`/marketplace/loja/${p.vendedor.id}`}
          className="mb-2 flex w-fit items-center gap-1.5 text-zinc-400 transition-colors hover:text-[#D2A63C]"
        >
          <MarcaDoVendedor vendedor={p.vendedor} tamanho={20} />
          <span className="text-[11px] leading-none">{p.vendedor.nome}</span>
          {p.vendedor.ehACasa && <Store size={11} className="text-[#D2A63C]/70" />}
        </Link>

        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#D2A63C]">
          {p.categoria}
          {p.subcategoria ? ` · ${p.subcategoria}` : ""}
        </span>
        <Link href={`/marketplace/${p.slug}`}>
          <h3 className="mt-1 font-medium leading-snug text-zinc-100 group-hover:text-[#eccb78]">{p.titulo}</h3>
        </Link>
        {p.subtitulo && <p className="mt-0.5 text-xs text-zinc-400">{p.subtitulo}</p>}
        {p.descricao && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{p.descricao}</p>}

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <span className="text-lg font-semibold text-zinc-100">
            {p.preco.baseCents === 0 ? (
              "Grátis"
            ) : (
              <>
                {p.preco.emCampanha ? (
                  <span className="mr-1.5 text-xs font-normal text-zinc-500 line-through">
                    {euros(p.preco.baseCents, p.preco.moeda)}
                  </span>
                ) : precoAntesDaLoja(p) ? (
                  <span className="mr-1.5 text-xs font-normal text-zinc-500 line-through">
                    {euros(precoAntesDaLoja(p), p.preco.moeda)}
                  </span>
                ) : null}
                {euros(p.preco.cents, p.preco.moeda)}
                {/* O PERÍODO CERTO, e não «/mês» nem «subscrição».
                    Visto com os olhos a 29/09: o cartão do «Membro · anual» dizia «336,00 €/mês» e
                    o do «Premium · anual» «624,00 €/mês». São produtos ANUAIS, e anunciar um preço
                    anual como mensal não é um erro de estilo: é a loja a mentir no número. Ficou
                    «subscrição» — vago mas verdadeiro — enquanto o modelo só tinha
                    `recorrente: boolean`. Agora há `periodicidade` (157) e `sufixoDoPeriodo` diz
                    «/ano», sem nunca adivinhar. */}
                <Sufixo p={p} className="text-xs" />
              </>
            )}
          </span>

          {p.jaComprou ? (
            <span className="text-xs text-emerald-400">Já é teu</span>
          ) : !autenticado ? (
            // A montra é pública e comprar já não exige login. Mas um cartão não tem sítio para o
            // email, e pedi-lo num cartão de uma grelha de doze era o pior ecrã possível — por isso
            // o visitante vai à FICHA do produto, onde a caixa de compra o pede uma vez e mostra ao
            // mesmo tempo o que está a comprar. Já não é um desvio ao login: é o passo seguinte da
            // compra.
            <Link
              href={`/marketplace/${p.slug}`}
              className="shrink-0 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Comprar
            </Link>
          ) : p.podeComprar ? (
            <button
              type="button"
              disabled={aComprar}
              onClick={onComprar}
              className="shrink-0 rounded-lg bg-[#D2A63C] px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {aComprar ? "A abrir…" : "Comprar"}
            </button>
          ) : (
            <span className="text-xs text-zinc-500">
              {PORQUE_NAO[p.motivoSemCompra ?? ""] ?? "Indisponível"}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default Vitrine
