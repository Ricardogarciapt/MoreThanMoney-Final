'use client'

/**
 * Gestão → Conversão. Por origem: quantos foram trabalhados, quantos avançaram, quantos fecharam e
 * quanto tempo demorou o primeiro contacto. Em cima, os leads quentes à espera de resposta.
 */
import { useEffect, useState } from 'react'
import type { PorOrigem } from '@/lib/vendas/conversao'

type Dados = {
  porOrigem: PorOrigem[]
  quentesParados: { id: string; nome: string; origem: string | null; horas: number }[]
  total: number
}

const OURO = '#D2A63C'
const horas = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`)

export default function ConversaoPainel() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/backoffice/conversao')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Falhou')
        setD(j as Dados)
      })
      .catch((e: Error) => setErro(e.message))
  }, [])

  if (erro) return <p className="text-red-400">{erro}</p>
  if (!d) return <p className="text-zinc-500">A contar…</p>

  return (
    <div className="space-y-6 text-sm text-zinc-200">
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <h2 className="mb-1 text-base font-semibold" style={{ color: OURO }}>
          Leads quentes à espera de resposta
        </h2>
        <p className="mb-3 text-xs text-zinc-500">Telegram, Instagram, formulário e agenda, ainda em «lead» há mais de 1 hora. Os primeiros minutos são os que mais pesam.</p>
        {d.quentesParados.length === 0 ? (
          <p className="text-emerald-400">Nenhum. Tudo respondido.</p>
        ) : (
          <ul className="space-y-1">
            {d.quentesParados.map((l) => (
              <li key={l.id}>
                <a href={`/backoffice/pipeline/ficha/${l.id}`} className="flex justify-between rounded-lg border border-white/5 px-3 py-2 hover:border-white/20">
                  <span>{l.nome} <span className="text-zinc-500">· {l.origem}</span></span>
                  <span className="text-amber-400">há {horas(l.horas)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4">
        <h2 className="mb-3 text-base font-semibold" style={{ color: OURO }}>
          Conversão por origem <span className="text-xs font-normal text-zinc-500">({d.total} negócios, desde sempre)</span>
        </h2>
        <table className="w-full min-w-[560px] text-left">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-1">Origem</th>
              <th>Total</th>
              <th>Trabalhados</th>
              <th>Avançaram</th>
              <th>Ganhos</th>
              <th>1.º contacto (mediana)</th>
            </tr>
          </thead>
          <tbody>
            {d.porOrigem.map((o) => (
              <tr key={o.origem} className="border-t border-white/5">
                <td className="py-2">{o.origem}</td>
                <td>{o.total}</td>
                <td>{o.trabalhados} {o.pctTrabalhados !== null && <span className="text-zinc-500">({o.pctTrabalhados}%)</span>}</td>
                <td>{o.avancados}</td>
                <td>{o.ganhos} {o.pctGanhos !== null && o.ganhos > 0 && <span className="text-zinc-500">({o.pctGanhos}%)</span>}</td>
                <td>{horas(o.medianaHorasContacto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-zinc-500">«Trabalhados» = saíram de lead. «Avançaram» = qualificado ou mais à frente. O tempo do 1.º contacto vem do histórico do negócio.</p>
      </section>
    </div>
  )
}
