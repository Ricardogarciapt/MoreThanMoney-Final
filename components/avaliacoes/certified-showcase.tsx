"use client"

import { useEffect, useState } from "react"
import { BadgeCheck } from "lucide-react"
import CertificateRender from "@/components/avaliacoes/certificate-render"
import type { CertTemplate } from "@/lib/avaliacoes/config"

type Item = { name: string; course: string; template: string; grade: string | null; code: string; date: string }

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
  const track = [...items, ...items] // duplica para loop contínuo

  return (
    <section className="overflow-hidden py-4">
      <style>{`
        @keyframes mtm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .mtm-marquee-track { animation: mtm-marquee 90s linear infinite; }
        .mtm-marquee-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .mtm-marquee-track { animation: none; overflow-x: auto; } }
      `}</style>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/10 px-4 py-1.5 text-xs font-medium text-[#D2A63C]">
          <BadgeCheck className="h-3.5 w-3.5" /> {total} certificados emitidos
        </div>
        <h2 className="text-2xl font-bold text-white md:text-3xl">{title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400">{subtitle}</p>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black to-transparent" />

        <div className="flex w-max mtm-marquee-track gap-4 px-2">
          {track.map((it, i) => (
            <div key={i} className="w-[240px] flex-shrink-0">
              <CertificateRender
                template={it.template as CertTemplate}
                courseTitle={it.course}
                name={it.name}
                gradeText={it.grade}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
