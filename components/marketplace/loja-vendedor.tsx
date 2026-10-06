"use client"

/**
 * A LOJA DE UM VENDEDOR — o que distingue um multivendedor de uma loja.
 *
 * Numa loja normal, clicar no nome de quem vende não faz nada, porque quem vende é sempre o mesmo.
 * Aqui leva a um sítio: a pessoa, o que ela faz, e tudo o que ela tem à venda. É esta página que
 * transforma «catorze produtos» em «uma casa e os seus educadores».
 *
 * A CASA TEM LOJA COMO OS OUTROS (`/marketplace/loja/casa`), e isso é deliberado. Fazer da casa uma
 * excepção — sem loja, sem página, só um rótulo — obrigava a montra a ter dois comportamentos ao
 * clicar no vendedor, e o segundo só seria testado no dia em que o primeiro educador publicasse.
 * Hoje a loja da casa é a única com produtos, e é ela que prova que o caminho funciona.
 *
 * Reutiliza a rota da montra com `?vendedor=`: a visibilidade, o preço com campanha e o
 * `podeComprar` são calculados pelas mesmas funções, uma vez só. Uma segunda rota para «os
 * produtos de X» era uma segunda oportunidade de um produto retirado continuar à venda num sítio.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Loader2, Store } from "lucide-react"
import { euros, type Vendedor } from "@/lib/marketplace/regras"
import Sufixo from "@/components/marketplace/sufixo-periodo"
import { agruparMontra } from "@/lib/marketplace/grupos"

type Preco = {
  baseCents: number; cents: number; descontoPct: number
  emCampanha: boolean; acabaEm: string | null; moeda: string
}
type Produto = {
  id: string; slug: string; titulo: string; subtitulo: string | null
  tipo: string; categoria: string; imagem_url: string | null
  recorrente: boolean; periodicidade: string; preco: Preco; vendedor: Vendedor
  jaComprou: boolean; podeComprar: boolean; motivoSemCompra: string | null
  /** 195 — variantes agrupadas: um cartão por grupo. */
  grupo?: string | null; variante_nome?: string | null; variante_ordem?: number | null
}
type Loja = {
  id: string; nome: string; nota: string | null; bio: string | null
  avatarUrl: string | null; ehACasa: boolean
}

export default function LojaVendedor({ id }: { id: string }) {
  const [loja, setLoja] = useState<Loja | null | "nao-existe">(null)
  const [produtos, setProdutos] = useState<Produto[]>([])

  const ler = useCallback(async () => {
    try {
      const r = await fetch(`/api/marketplace/produtos?vendedor=${encodeURIComponent(id)}`)
      const j = await r.json()
      setProdutos(j.produtos ?? [])
      setLoja(j.loja ?? "nao-existe")
    } catch {
      setLoja("nao-existe")
    }
  }, [id])

  useEffect(() => { void ler() }, [ler])

  // 195 — um cartão por produto: as variantes (Mensal, Anual, Vitalício…) escolhem-se na ficha.
  const entradas = useMemo(() => agruparMontra(produtos), [produtos])

  if (loja === null) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> A carregar…
      </div>
    )
  }

  if (loja === "nao-existe") {
    return (
      <div className="py-20 text-center">
        <p className="text-zinc-400">Esta loja não existe ou já não está aberta.</p>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-[#D2A63C] hover:underline">
          Ver o marketplace
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Marketplace
      </Link>

      {/* ── A montra do vendedor ─────────────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#D2A63C]/[0.08] via-[#191920] to-[#0e0e12] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          {loja.avatarUrl ? (
            <Image
              src={loja.avatarUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 font-mono text-2xl font-semibold text-[#D2A63C]"
            >
              {loja.ehACasa ? "M" : loja.nome.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D2A63C]">
              {loja.ehACasa ? <Store size={11} /> : null}
              {loja.ehACasa ? "Loja da casa" : "Educador"}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50">{loja.nome}</h1>
            {loja.nota && <p className="mt-0.5 text-sm text-zinc-400">{loja.nota}</p>}
          </div>
        </div>
        {loja.bio && <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-zinc-400">{loja.bio}</p>}
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          {entradas.length} {entradas.length === 1 ? "produto à venda" : "produtos à venda"}
        </p>
      </header>

      {produtos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          Ainda não há nada à venda nesta loja.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entradas.map(({ chave, principal: p, variantes, maisBarata }) => (
            <Link
              key={chave}
              href={`/marketplace/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[#D2A63C]/35"
            >
              {p.imagem_url ? (
                <div className="relative h-36 w-full bg-black/40">
                  <Image src={p.imagem_url} alt="" fill className="object-cover" unoptimized />
                </div>
              ) : (
                // A mesma capa-em-falta da montra: um painel da casa, e não um rectângulo cinzento.
                <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#1b1b22] via-[#141419] to-[#0e0e12]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#D2A63C]/70">
                    {p.categoria}
                  </span>
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#D2A63C]">{p.categoria}</span>
                <h2 className="mt-1 font-medium leading-snug text-zinc-100 group-hover:text-[#eccb78]">{p.titulo}</h2>
                {p.subtitulo && <p className="mt-0.5 text-xs text-zinc-400">{p.subtitulo}</p>}
                <span className="mt-auto pt-4 text-lg font-semibold text-zinc-100">
                  {variantes.length > 1 ? (
                    <>
                      <span className="mr-1 text-xs font-normal text-zinc-500">desde</span>
                      {maisBarata.preco.cents === 0 ? "Grátis" : euros(maisBarata.preco.cents, maisBarata.preco.moeda)}
                      <Sufixo p={maisBarata} className="text-xs" />
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        {variantes.map((v) => v.variante_nome).filter(Boolean).join(" · ")}
                      </span>
                    </>
                  ) : p.preco.baseCents === 0 ? (
                    "Grátis"
                  ) : (
                    <>
                      {p.preco.emCampanha && (
                        <span className="mr-1.5 text-xs font-normal text-zinc-500 line-through">
                          {euros(p.preco.baseCents, p.preco.moeda)}
                        </span>
                      )}
                      {euros(p.preco.cents, p.preco.moeda)}
                      {/* O período vem da coluna `periodicidade` (157) — nunca adivinhado. Quatro
                          dos produtos publicados são ANUAIS. Ver a nota em `vitrine.tsx`. */}
                      <Sufixo p={p} className="text-xs" />
                    </>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
