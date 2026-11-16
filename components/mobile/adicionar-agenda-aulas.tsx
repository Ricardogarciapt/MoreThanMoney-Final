"use client"

/**
 * «Recebe as aulas na tua agenda» — o aluno subscreve o feed .ics das aulas ao vivo no Google
 * Calendar ou no calendário da Apple/Outlook. Sem login no Google: a agenda dele vai buscar o
 * horário sozinha e avisa 15 minutos antes. Ver lib/aulas-ics.ts.
 */
import { CalendarPlus } from "lucide-react"
import { linksSubscricao } from "@/lib/aulas-ics"

const FEED = "https://www.morethanmoney.pt/api/aulas/agenda.ics"

export default function AdicionarAgendaAulas() {
  const { google, apple } = linksSubscricao(FEED)
  return (
    <div className="mt-3 rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-white">
        <CalendarPlus className="h-4 w-4 text-[#D2A63C]" aria-hidden />
        Recebe as aulas na tua agenda
      </p>
      <p className="mt-1 text-xs text-white/60">O horário entra no teu calendário e atualiza sozinho. Avisa 15 minutos antes.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={google} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black">
          Google Calendar
        </a>
        <a href={apple} className="rounded-lg border border-[#D2A63C]/40 px-3 py-1.5 text-xs font-semibold text-[#E9C46A]">
          Apple / Outlook
        </a>
      </div>
    </div>
  )
}
