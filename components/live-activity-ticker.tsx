"use client"

import { useEffect, useState } from "react"
import { ShoppingBag, UserPlus, TrendingUp, X } from "lucide-react"

// ─── Simulador de prova social em tempo real ──────────────────────────────────
// Mostra notificações simuladas de novas compras, registos e resultados para
// criar sensação de atividade ao vivo na landing page. Os dados são gerados
// aleatoriamente a partir de listas de nomes, localidades e produtos reais da MTM.

type ActivityType = "purchase" | "signup" | "result"

interface ActivityEvent {
  id: number
  type: ActivityType
  name: string
  location: string
  detail: string
  minutesAgo: number
}

const FIRST_NAMES = [
  "João", "Maria", "Pedro", "Ana", "Carlos", "Beatriz", "Miguel", "Sofia",
  "Rui", "Catarina", "André", "Mariana", "Tiago", "Inês", "Bruno", "Carla",
  "Hugo", "Patrícia", "Nuno", "Joana", "Diogo", "Filipa", "Ricardo", "Sara",
  "Vasco", "Marta", "Gonçalo", "Vânia", "Fábio", "Daniela",
]

const LOCATIONS = [
  "Lisboa", "Porto", "Braga", "Coimbra", "Faro", "Setúbal", "Aveiro",
  "Leiria", "Évora", "Viseu", "Guimarães", "Funchal", "Ponta Delgada",
  "Santarém", "Viana do Castelo", "Covilhã", "Cascais", "Sintra", "Almada",
  "Matosinhos", "Vila Real", "Beja", "Portimão", "Suíça", "Luxemburgo",
]

const PRODUCTS = [
  "o Pack Premium",
  "o Pack Scanners",
  "o Pack Membro",
  "o Scanner Gold Killer",
  "o Scanner MTM V3.4",
  "o Sensei",
  "o Plano em 3 Passos",
  "o acesso à Trading Floor",
  "os cursos MoreThanMoney",
  "uma vaga na Mentoria MTM",
]

const RESULTS = [
  "+450 pips no Gold Killer",
  "+1.2K pips este mês",
  "Withdraw Club alcançado",
  "+320 pips com o Scanner V3.4",
  "+680 pips em 2 semanas",
  "Rising Star conquistado",
  "+910 pips no Sensei",
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateEvent(id: number): ActivityEvent {
  const roll = Math.random()
  const type: ActivityType = roll < 0.55 ? "purchase" : roll < 0.8 ? "signup" : "result"
  const name = `${randomFrom(FIRST_NAMES)} ${randomFrom(["S.", "M.", "F.", "C.", "R.", "P.", "A.", "L."])}.`
  const location = randomFrom(LOCATIONS)
  const minutesAgo = Math.floor(Math.random() * 18) + 1

  let detail = ""
  if (type === "purchase") {
    detail = `acabou de adquirir ${randomFrom(PRODUCTS)}`
  } else if (type === "signup") {
    detail = "juntou-se agora à comunidade MTM"
  } else {
    detail = `acabou de registar ${randomFrom(RESULTS)}`
  }

  return { id, name, location, detail, minutesAgo }
}

const ICONS: Record<ActivityType, typeof ShoppingBag> = {
  purchase: ShoppingBag,
  signup: UserPlus,
  result: TrendingUp,
}

const COLORS: Record<ActivityType, string> = {
  purchase: "text-[#D2A63C]",
  signup: "text-emerald-400",
  result: "text-sky-400",
}

export default function LiveActivityTicker() {
  const [event, setEvent] = useState<ActivityEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (dismissed) return

    let showTimeout: ReturnType<typeof setTimeout>
    let hideTimeout: ReturnType<typeof setTimeout>

    const cycle = () => {
      setEvent(generateEvent(Date.now()))
      setVisible(true)

      hideTimeout = setTimeout(() => {
        setVisible(false)
      }, 5500)
    }

    // Primeira notificação aparece pouco depois de carregar a página
    showTimeout = setTimeout(cycle, 4000)

    const interval = setInterval(() => {
      cycle()
    }, 12000)

    return () => {
      clearTimeout(showTimeout)
      clearTimeout(hideTimeout)
      clearInterval(interval)
    }
  }, [dismissed])

  if (dismissed || !event) return null

  const Icon = ICONS[event.type]
  const color = COLORS[event.type]
  if (!Icon) return null

  return (
    <div
      className={`fixed bottom-5 left-5 z-50 max-w-xs transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-[#D2A63C]/20 bg-gray-900/95 backdrop-blur-md shadow-2xl shadow-black/40 p-4 pr-8 relative">
        <button
          onClick={() => {
            setVisible(false)
            setDismissed(true)
          }}
          aria-label="Fechar notificação"
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className={`mt-0.5 rounded-full bg-gray-800 p-2 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="text-sm leading-snug">
          <p className="text-white">
            <span className="font-semibold">{event.name}</span>{" "}
            <span className="text-gray-300">de {event.location}</span>
          </p>
          <p className="text-gray-400">{event.detail}</p>
          <p className="text-xs text-gray-600 mt-1">
            há {event.minutesAgo} {event.minutesAgo === 1 ? "minuto" : "minutos"} · verificado ✓
          </p>
        </div>
      </div>
    </div>
  )
}
