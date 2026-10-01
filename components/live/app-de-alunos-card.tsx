"use client"

/**
 * O CARTÃO DA APP DE ALUNOS, e o modal que explica como se lá entra.
 *
 * Quem decide o que isto mostra é `lib/lms/app-de-alunos.ts` — e a razão de a decisão viver lá
 * fora, com guarda ao lado, é uma só: este curso COBRA-SE FORA, por isso o nosso `jaComprou` é
 * falso até para quem pagou ontem. Um cadeado ingénuo mandava a aluna comprar outra vez, e isso
 * não dá erro nenhum: dá uma cliente zangada.
 *
 * Por isso o modal não afirma nada sobre quem está do outro lado. Diz o que sabe — que o acesso
 * vem com o curso, e que a compra é na loja da academia — e oferece as duas portas.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { euros } from "@/lib/marketplace/regras"
import { portaDaApp, textoDoAcesso, type ProdutoDoAcesso } from "@/lib/lms/app-de-alunos"

export default function AppDeAlunosCard({
  appUrl,
  produtoSlug,
  nomeDoCanal,
}: {
  appUrl?: string | null
  produtoSlug?: string | null
  nomeDoCanal?: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [produto, setProduto] = useState<ProdutoDoAcesso | null>(null)

  useEffect(() => {
    const slug = String(produtoSlug ?? "").trim()
    if (!slug) return
    let vivo = true
    fetch("/api/marketplace/produtos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((res) => {
        if (!vivo) return
        const lista: ProdutoDoAcesso[] = res?.produtos ?? res?.data ?? []
        setProduto(lista.find((p) => p?.slug === slug) ?? null)
      })
      // Sem o produto o cartão continua a abrir a app — só não sabe mostrar o preço nem o caminho
      // para comprar. É melhor do que esconder a app por causa de um fetch que falhou.
      .catch(() => setProduto(null))
    return () => {
      vivo = false
    }
  }, [produtoSlug])

  const porta = portaDaApp({ app_alunos_url: appUrl, app_alunos_produto_slug: produtoSlug }, produto)
  if (!porta.mostrar) return null

  const titulo = produto?.titulo ?? nomeDoCanal ?? "o curso"
  const abrirApp = (
    <a href={porta.appUrl} target="_blank" rel="noopener noreferrer">
      <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
        Abrir a app de alunos
        <ExternalLink className="ml-2 h-4 w-4" />
      </Button>
    </a>
  )

  return (
    <div className="rounded-xl border border-[#D2A63C]/25 bg-gray-950/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-[#D2A63C]" />
          <div>
            <p className="font-medium text-zinc-100">As aulas vivem na app da academia</p>
            <p className="text-sm text-zinc-400">
              O canal é para as sessões ao vivo e para rever. O curso em si abre-se lá.
            </p>
          </div>
        </div>
        {/*
          Quem já tem acesso entra direito. Quem não sabemos — que, neste curso, é toda a gente —
          passa pelo modal, para não bater num ecrã de entrada sem perceber porquê.
        */}
        {porta.modo === "entra" ? (
          abrirApp
        ) : (
          <Button
            onClick={() => setAberto(true)}
            className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
          >
            Entrar na app
          </Button>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="border-[#D2A63C]/30 bg-gray-950 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C]">Como se entra na app</DialogTitle>
            <DialogDescription className="text-zinc-300">
              {textoDoAcesso(porta, produto?.titulo)}
            </DialogDescription>
          </DialogHeader>

          {produto && (
            <div className="rounded-lg border border-gray-800 bg-black/40 p-3">
              <p className="text-sm font-medium text-zinc-100">{titulo}</p>
              <p className="mt-1 text-lg font-semibold text-[#E9C46A]">
                {euros(produto.preco_cents, produto.moeda ?? "eur")}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {/* A porta de quem já é aluna vem PRIMEIRO: não se recebe quem já pagou com um
                convite a pagar outra vez. */}
            <a
              href={porta.modo === "duas_portas" ? porta.appUrl : "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAberto(false)}
            >
              <Button variant="outline" className="w-full border-gray-600 text-zinc-200 sm:w-auto">
                Já sou aluna — entrar
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
            {porta.modo === "duas_portas" && porta.produtoHref && (
              <Link href={porta.produtoHref} onClick={() => setAberto(false)}>
                <Button className="w-full bg-[#D2A63C] text-black hover:bg-[#BB8525] sm:w-auto">
                  Ver o curso
                </Button>
              </Link>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
