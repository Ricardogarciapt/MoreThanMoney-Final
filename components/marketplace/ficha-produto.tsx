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
import { euros } from "@/lib/marketplace/regras"

type Preco = {
  baseCents: number; cents: number; descontoPct: number
  emCampanha: boolean; acabaEm: string | null; moeda: string
}
type Produto = {
  id: string; slug: string; titulo: string; subtitulo: string | null; descricao: string | null
  tipo: string; categoria: string; imagem_url: string | null; recorrente: boolean
  educador: { display_name: string; specialty: string | null } | null
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
        body: JSON.stringify({ produtoId: produto.id, cupao, referral }),
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
  }, [produto, cupao, referral])

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

  return (
    <div className="space-y-6">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Marketplace
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {p.imagem_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imagem_url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
          )}

          <div>
            <span className="text-xs uppercase tracking-wide text-[#D2A63C]">{p.categoria}</span>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{p.titulo}</h1>
            {p.subtitulo && <p className="mt-1 text-zinc-400">{p.subtitulo}</p>}
            {p.educador && (
              <p className="mt-2 text-sm text-zinc-500">
                Por {p.educador.display_name}
                {p.educador.specialty ? ` · ${p.educador.specialty}` : ""}
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
              {/* Não diz «/mês»: `recorrente` é um booleano e não distingue mensal de anual, e
                  quatro dos produtos publicados são ANUAIS. Ver a nota igual em `vitrine.tsx`. */}
              {p.recorrente && <span className="ml-1 text-base font-normal text-zinc-500">subscrição</span>}
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
          ) : !autenticado ? (
            /* Sem sessão: um caminho só, e o que a pessoa ia fazer a seguir de qualquer maneira.
               O cupão e o código de quem indicou ficam de fora daqui de propósito — escrevê-los
               antes de entrar era perdê-los no login. Voltam a aparecer depois, nesta mesma
               página, porque o `redirect` traz a pessoa ao sítio exacto. */
            <>
              <Link
                href={`/login?redirect=/marketplace/${p.slug}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#D2A63C] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#BB8525]"
              >
                <Tag size={15} /> Entrar para comprar
              </Link>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                A compra fica agarrada à tua conta — é assim que o acesso ao produto funciona depois.
              </p>
            </>
          ) : p.podeComprar ? (
            <>
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
