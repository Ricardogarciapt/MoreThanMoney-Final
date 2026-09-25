'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Award } from 'lucide-react'

/**
 * A VITRINE DE CERTIFICADOS do MTM Funded.
 *
 * Mostra certificados REAIS assim que existam — os últimos emitidos, com o nome como o seu
 * dono o escreveu. Enquanto não houver seis, completa-se com exemplares em branco, marcados
 * como tal. Inventar nomes de pessoas que não existem para encher uma vitrine é exactamente o
 * que faz este mercado ter má fama, e um dia alguém pergunta por um deles.
 *
 * Roda sozinha, mas pára assim que alguém lhe toca: uma vitrine que continua a andar enquanto
 * se tenta ler um certificado é uma vitrine irritante.
 */

export interface CertificadoVitrine {
  codigo: string
  tipo: string
  nome: string
  emitidoEm: string
  exemplar?: boolean
}

const NOMES: Record<string, string> = {
  participacao: 'Participação',
  classificacao: 'Classificação',
  desafio: 'Desafio concluído',
  financiado: 'Trader Financiado',
  payout: 'Pagamento',
}

export default function VitrineCertificados({ certificados }: { certificados: CertificadoVitrine[] }) {
  const [i, setI] = useState(0)
  const [parado, setParado] = useState(false)

  useEffect(() => {
    if (parado || certificados.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % certificados.length), 4500)
    return () => clearInterval(t)
  }, [parado, certificados.length])

  if (!certificados.length) return null

  const ir = (d: number) => {
    setParado(true)
    setI((n) => (n + d + certificados.length) % certificados.length)
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setParado(true)}
      onFocus={() => setParado(true)}
    >
      <div className="overflow-hidden rounded-2xl">
        {/* A curva de animacao vem pelo `style` e nao por uma classe arbitraria de
            easing: em classe, o Tailwind avisava em cada build que era ambigua.
            Como ja havia aqui um `style`, o resultado e o mesmo e o build fica limpo. */}
        <div
          className="flex transition-transform duration-700"
          style={{
            transform: `translateX(-${i * 100}%)`,
            transitionTimingFunction: "cubic-bezier(0.16, 0.7, 0.3, 1)",
          }}
        >
          {certificados.map((c) => (
            <article key={c.codigo} className="w-full shrink-0 px-1">
              <div className="vidro flex h-full flex-col items-center p-8 text-center sm:p-10">
                <Award className="h-9 w-9 text-[#D2A63C]" />
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[#D2A63C]">
                  {NOMES[c.tipo] ?? c.tipo}
                </p>
                <p className="mt-3 text-2xl font-bold text-white sm:text-3xl">{c.nome}</p>
                <p className="mt-2 text-sm text-[#a9a49a]">
                  {new Date(c.emitidoEm).toLocaleDateString('pt-PT', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </p>
                <p className="mt-5 font-mono text-xs text-[#7b756a]">{c.codigo}</p>
                {c.exemplar ? (
                  <p className="mt-4 rounded-full border border-zinc-700 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-500">
                    exemplar
                  </p>
                ) : (
                  <a
                    href={`/mtmfunded/certificado/${c.codigo}`}
                    className="mt-5 text-xs text-[#D2A63C] hover:underline"
                  >
                    verificar
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {certificados.length > 1 && (
        <>
          <button
            onClick={() => ir(-1)}
            aria-label="Anterior"
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-2 text-zinc-400 backdrop-blur hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => ir(1)}
            aria-label="Seguinte"
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-2 text-zinc-400 backdrop-blur hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mt-5 flex justify-center gap-1.5">
            {certificados.map((c, n) => (
              <button
                key={c.codigo}
                onClick={() => { setParado(true); setI(n) }}
                aria-label={`Certificado ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  n === i ? 'w-6 bg-[#D2A63C]' : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
