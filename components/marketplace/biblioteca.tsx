"use client"

/**
 * A BIBLIOTECA — o que se comprou, e a porta para abrir.
 *
 * ── A DECISÃO NÃO É DAQUI ─────────────────────────────────────────────────────────────────
 *
 * O `aberto` e o `conteudo_url` vêm da rota. Este ecrã NÃO decide se alguém tem acesso, e não pode
 * decidir: se o servidor mandasse sempre o link e o ecrã desenhasse um cadeado por cima, bastava
 * abrir o inspector para o ter. É exactamente esse o defeito do cartão de cursos do /live, onde o
 * `url` de uma playlist VIP chega a quem não é VIP.
 *
 * Aqui, quando a porta está fechada, o `conteudo_url` vem NULO da rota. Não há nada para inspeccionar.
 *
 * Um produto cujo acesso expirou continua a aparecer, com a data. Vê-lo desaparecer da lista é pior
 * do que vê-lo fechado: a pessoa julga que perdeu a compra e escreve para o suporte.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, ExternalLink, Lock, ShoppingBag, Info } from "lucide-react"

type Item = {
  compraId: string
  produtoId: string
  slug: string | null
  titulo: string
  subtitulo: string | null
  tipo: string | null
  imagem_url: string | null
  educador: { display_name: string } | null
  estado: string
  pago_em: string
  acesso_expira_em: string | null
  aberto: boolean
  conteudo_url: string | null
  conteudo_nota: string | null
}

const PORQUE_FECHADO = (i: Item): string => {
  if (i.estado === "reembolsada") return "Esta compra foi reembolsada."
  if (i.estado === "anulada") return "Esta compra foi anulada."
  if (i.acesso_expira_em && Date.parse(i.acesso_expira_em) <= Date.now()) {
    return `O acesso terminou a ${new Date(i.acesso_expira_em).toLocaleDateString("pt-PT")}.`
  }
  return "O acesso a este produto está fechado. Fala connosco."
}

export default function Biblioteca() {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [acabouDeComprar, setAcabouDeComprar] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/marketplace/biblioteca")
      const j = await r.json().catch(() => ({ itens: [] }))
      setItens(j.itens ?? [])
    })()
    // O `success_url` do Stripe traz `?comprado=<slug>`. Serve para o ecrã confirmar a compra em
    // vez de a pessoa ter de a procurar numa lista.
    const p = new URLSearchParams(window.location.search)
    setAcabouDeComprar(p.get("comprado"))
  }, [])

  const abrir = useCallback((i: Item) => {
    if (!i.conteudo_url) return
    window.open(i.conteudo_url, "_blank", "noopener,noreferrer")
  }, [])

  if (itens === null) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> A carregar…
      </div>
    )
  }

  if (!itens.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center">
        <ShoppingBag className="mx-auto mb-3 text-zinc-600" size={28} />
        <p className="text-zinc-400">Ainda não compraste nada no marketplace.</p>
        <Link href="/marketplace" className="mt-3 inline-block text-sm text-[#D2A63C] hover:underline">
          Ver o que está à venda
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {acabouDeComprar && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Compra concluída. Está aqui em baixo — obrigado.
        </div>
      )}

      {itens.map((i) => (
        <div key={i.compraId} className="flex flex-wrap items-start gap-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
          {i.imagem_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.imagem_url} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
          )}

          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-100">{i.titulo}</div>
            {i.subtitulo && <div className="mt-0.5 text-sm text-zinc-400">{i.subtitulo}</div>}
            <div className="mt-1 text-xs text-zinc-500">
              {i.educador?.display_name ? `${i.educador.display_name} · ` : ""}
              Comprado a {new Date(i.pago_em).toLocaleDateString("pt-PT")}
              {i.acesso_expira_em && i.aberto
                ? ` · acesso até ${new Date(i.acesso_expira_em).toLocaleDateString("pt-PT")}`
                : ""}
            </div>

            {i.aberto && i.conteudo_nota && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-300">
                <Info size={12} className="mt-0.5 shrink-0 text-[#D2A63C]" />
                <span>{i.conteudo_nota}</span>
              </div>
            )}

            {!i.aberto && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                <Lock size={12} /> {PORQUE_FECHADO(i)}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {i.aberto && i.conteudo_url ? (
              <button
                onClick={() => abrir(i)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-2 text-sm font-medium text-black hover:bg-[#BB8525]"
              >
                <ExternalLink size={14} /> Abrir
              </button>
            ) : null}
            {i.slug && (
              <Link href={`/marketplace/${i.slug}`} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                Ficha
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
