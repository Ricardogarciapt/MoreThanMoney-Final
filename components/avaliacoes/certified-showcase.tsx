"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Award, BadgeCheck } from "lucide-react"

type Item = { name: string; course: string; grade: string | null; code: string; date: string }

export default function CertifiedShowcase({
  title = "Alunos já certificados",
  subtitle = "Prova real: pessoas que concluíram a formação MoreThanMoney e receberam o seu certificado oficial.",
}: {
  title?: string
  subtitle?: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let alive = true
    fetch("/api/avaliacoes/showcase")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        setItems(j.items || [])
        setTotal(j.total || 0)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!items.length) return null
  // duplica a lista para o loop contínuo
  const track = [...items, ...items]

  return (
    <section className="overflow-hidden py-4">
      <style>{`
        @keyframes mtm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .mtm-marquee-track { animation: mtm-marquee 60s linear infinite; }
        .mtm-marquee-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .mtm-marquee-track { animation: none; } }
      `}</style>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-4 py-1.5 text-xs font-medium text-[#D2A63C]">
          <BadgeCheck className="h-3.5 w-3.5" /> {total} certificados emitidos
        </div>
        <h2 className="text-2xl font-bold text-white md:text-3xl">{title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400">{subtitle}</p>
      </div>

      <div className="relative">
        {/* fades laterais */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black to-transparent" />

        <div className="flex w-max mtm-marquee-track gap-4">
          {track.map((it, i) => (
            <Link
              key={i}
              href={`/avaliacoes/validar/${it.code}`}
              className="group flex w-[260px] flex-shrink-0 items-center gap-3 rounded-xl border border-[#D2A63C]/20 bg-gradient-to-br from-gray-950 to-black p-4 transition-colors hover:border-[#D2A63C]/50"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/30">
                <Award className="h-5 w-5 text-[#D2A63C]" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{it.name}</p>
                <p className="truncate text-xs text-gray-400">{it.course}</p>
                {it.grade && <p className="text-[11px] font-medium text-[#D2A63C]">{it.grade}</p>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
