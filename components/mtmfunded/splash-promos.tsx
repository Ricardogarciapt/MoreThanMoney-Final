'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * O SPLASH DAS PROMOÇÕES A DECORRER.
 *
 * Aparece uma vez por campanha e por browser. Três decisões que o separam dos pop-ups que
 * toda a gente fecha sem ler:
 *
 * · A CHAVE guardada inclui a campanha. Uma campanha nova volta a aparecer a quem já fechou a
 *   anterior; fechar esta não esconde as seguintes para sempre.
 * · Só entra se HOUVER promoções vivas. A lista vem da base de dados, do servidor — sem
 *   campanha activa, o componente não renderiza nada e não há pop-up nenhum a fechar.
 * · Espera um segundo e meio. Saltar para cima de quem acabou de chegar é a diferença entre
 *   uma oferta e uma emboscada — e o pouco que a pessoa já leu faz a oferta significar algo.
 *
 * Fecha com o botão, com Escape e com um clique fora. Um pop-up sem saída óbvia custa mais
 * visitas do que a promoção ganha.
 */

export interface Promo {
  /** Identificador da campanha — entra na chave guardada. */
  campanha: string
  etiqueta: string
  titulo: string
  detalhe: string
  /** O que a pessoa carrega. */
  cta: string
  href: string
  /** Código a copiar, quando a promoção é um cupão. */
  codigo?: string
  /** Quando acaba, para o contador. */
  acabaEm?: string
}

export default function SplashPromos({ promos }: { promos: Promo[] }) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const chave = promos.length ? `mtmfunded.splash.${promos.map((p) => p.campanha).join('+')}` : ''

  useEffect(() => {
    if (!chave) return
    // O localStorage falha em janelas privadas e com cookies de terceiros bloqueados. Falhando
    // a leitura, mostra-se — mais vale um pop-up a mais do que uma campanha que ninguém vê.
    let jaViu = false
    try {
      jaViu = localStorage.getItem(chave) === '1'
    } catch {
      jaViu = false
    }
    if (jaViu) return

    const t = setTimeout(() => setAberto(true), 1500)
    return () => clearTimeout(t)
  }, [chave])

  const fechar = () => {
    setAberto(false)
    try {
      localStorage.setItem(chave, '1')
    } catch {
      // Sem armazenamento, volta a aparecer na próxima visita. É o mal menor.
    }
  }

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    // Bloquear o scroll do fundo: com o modal aberto, rolar a página por baixo dá a sensação
    // de que o clique não fez nada.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  if (!promos.length || !aberto) return null

  const copiar = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(codigo)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Sem permissão de área de transferência, o código continua visível para copiar à mão.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      style={{ animation: 'splashEntra .35s cubic-bezier(.16,.7,.3,1)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Promoções a decorrer"
    >
      <style>{`
        @keyframes splashEntra{from{opacity:0}to{opacity:1}}
        @keyframes splashSobe{from{opacity:0;transform:translateY(26px) scale(.97)}to{opacity:1;transform:none}}
      `}</style>

      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#d2a63c]/35 bg-[#0c0c12] shadow-[0_40px_120px_-40px_rgba(210,166,60,.55)]"
        style={{ animation: 'splashSobe .45s cubic-bezier(.16,.7,.3,1)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle,rgba(210,166,60,.45),transparent 68%)' }}
        />

        <button
          onClick={fechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/25 hover:text-white"
        >
          ✕
        </button>

        <div className="relative px-7 pb-7 pt-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mtmfunded/logo-mtm-funded-v2.webp"
            alt="MTM Funded"
            width={112}
            height={34}
            className="mb-5 h-9 w-auto"
          />

          <p className="font-mono text-[10.5px] uppercase tracking-[.22em] text-[#d2a63c]">
            Lançamento · a decorrer
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            Duas formas de começar hoje
          </h2>

          <div className="mt-5 space-y-3">
            {promos.map((p) => (
              <div
                key={p.campanha + p.titulo}
                className="rounded-xl border border-white/10 bg-white/[.03] p-4 transition hover:border-[#d2a63c]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-block rounded-full bg-[#d2a63c]/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[.16em] text-[#eccb78]">
                      {p.etiqueta}
                    </span>
                    <p className="mt-2 font-semibold leading-snug text-white">{p.titulo}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{p.detalhe}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={p.href}
                    onClick={fechar}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#d2a63c] px-4 py-2 text-[13px] font-semibold text-[#08080a] transition hover:-translate-y-0.5"
                  >
                    {p.cta} →
                  </Link>
                  {p.codigo && (
                    <button
                      onClick={() => copiar(p.codigo as string)}
                      className="inline-flex items-center gap-2 rounded-full border border-dashed border-[#d2a63c]/45 px-3.5 py-2 font-mono text-[12px] tracking-wider text-[#eccb78] transition hover:border-[#d2a63c]"
                    >
                      {copiado === p.codigo ? 'copiado ✓' : `${p.codigo} ⧉`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-zinc-600">
            Contas simuladas, com dinheiro virtual. As regras de cada desafio estão publicadas
            nesta página antes de te inscreveres.
          </p>
        </div>
      </div>
    </div>
  )
}
