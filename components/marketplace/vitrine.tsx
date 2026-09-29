"use client"

/**
 * A VITRINE — a montra dos produtos dos educadores, e a biblioteca de quem já comprou.
 *
 * Um componente para os dois sítios (site e app-mobile) de propósito. A alternativa era um ecrã
 * web e um ecrã mobile, e foi assim que o gating de conteúdo do /live acabou com quatro cópias da
 * mesma regra a discordarem umas das outras — o VIP com cadeado na web e sem cadeado na app.
 *
 * O ecrã NÃO decide nada. O `podeComprar` e o `motivoSemCompra` vêm já decididos da rota, que os
 * calcula com as mesmas funções que o servidor usa para recusar o pedido. É isso que garante que
 * o botão e o travão nunca discordam.
 */

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Loader2, Lock, ShoppingBag, ExternalLink } from "lucide-react"
import { euros } from "@/lib/marketplace/regras"

type Autor = { id: string; display_name: string; avatar_url: string | null; specialty: string | null }
type Produto = {
  id: string
  slug: string
  titulo: string
  subtitulo: string | null
  descricao: string | null
  tipo: string
  imagem_url: string | null
  preco_cents: number
  moeda: string
  educador: Autor | null
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

export function Vitrine({ compacto = false }: { compacto?: boolean }) {
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [ligado, setLigado] = useState(true)
  const [aComprar, setAComprar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const ler = useCallback(async () => {
    const [v, b] = await Promise.all([
      fetch("/api/marketplace/produtos").then((r) => r.json()).catch(() => ({ produtos: [] })),
      fetch("/api/marketplace/biblioteca").then((r) => r.json()).catch(() => ({ itens: [] })),
    ])
    setProdutos(v.produtos ?? [])
    setLigado(v.ligado !== false)
    setItens(b.itens ?? [])
  }, [])

  useEffect(() => { void ler() }, [ler])

  const comprar = useCallback(async (produtoId: string) => {
    setAComprar(produtoId)
    setAviso(null)
    try {
      const r = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId }),
      })
      const j = await r.json()
      if (r.ok && j.url) {
        window.location.href = j.url
        return
      }
      setAviso(j.error ?? "Não foi possível abrir o pagamento.")
    } catch {
      setAviso("Não foi possível abrir o pagamento.")
    } finally {
      setAComprar(null)
    }
  }, [])

  if (produtos === null) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> A carregar…
      </div>
    )
  }

  const abertos = itens.filter((i) => i.aberto)
  const fechados = itens.filter((i) => !i.aberto)

  return (
    <div className="space-y-8">
      {aviso && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{aviso}</p>
      )}

      {/* O que já é meu vem PRIMEIRO. Quem já comprou vem abrir, não vem comprar outra vez. */}
      {itens.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[#D2A63C]">O que compraste</h2>
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

      <section>
        {itens.length > 0 && (
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[#D2A63C]">À venda</h2>
        )}
        {!ligado || produtos.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <ShoppingBag className="mx-auto mb-3 text-zinc-600" size={28} />
            <p className="text-sm text-zinc-400">Ainda não há nada à venda por aqui.</p>
            <p className="mt-1 text-xs text-zinc-600">Os educadores estão a preparar os primeiros produtos.</p>
          </div>
        ) : (
          <div className={`grid gap-4 ${compacto ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {produtos.map((p) => (
              <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                {p.imagem_url && (
                  <div className="relative h-36 w-full bg-black/40">
                    <Image src={p.imagem_url} alt={p.titulo} fill className="object-cover" unoptimized />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[10px] uppercase tracking-wider text-[#D2A63C]">{p.tipo}</span>
                  <h3 className="mt-1 font-medium text-zinc-100">{p.titulo}</h3>
                  {p.subtitulo && <p className="mt-0.5 text-xs text-zinc-400">{p.subtitulo}</p>}
                  {p.educador && (
                    <p className="mt-2 text-xs text-zinc-500">
                      por <span className="text-zinc-300">{p.educador.display_name}</span>
                      {p.educador.specialty ? ` · ${p.educador.specialty}` : ""}
                    </p>
                  )}
                  {p.descricao && <p className="mt-2 line-clamp-3 text-xs text-zinc-400">{p.descricao}</p>}

                  <div className="mt-4 flex items-center justify-between gap-2 pt-2">
                    <span className="text-lg font-semibold text-zinc-100">
                      {p.preco_cents === 0 ? "Grátis" : euros(p.preco_cents, p.moeda)}
                    </span>
                    {p.jaComprou ? (
                      <span className="text-xs text-emerald-400">Já é teu</span>
                    ) : p.podeComprar ? (
                      <button
                        type="button"
                        disabled={aComprar === p.id}
                        onClick={() => comprar(p.id)}
                        className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {aComprar === p.id ? "A abrir…" : "Comprar"}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">
                        {PORQUE_NAO[p.motivoSemCompra ?? ""] ?? "Indisponível"}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Vitrine
