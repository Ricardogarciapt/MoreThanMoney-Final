"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

type StorySlide = {
  id: string
  title: string
  content: string
  highlight?: string
  cta?: { label: string; href: string }
}

// Fonte única de verdade para o conteúdo da história
const useRicardoStory = () => {
  return useMemo<StorySlide[]>(
    () => [
      {
        id: "origens",
        title: "De onde vim",
        content:
          "Nasci e cresci na zona histórica do Porto, criado por uma família adotiva. A pobreza ensinou‑me a procurar, no desconforto, um ponto positivo. Acreditei cedo que a liberdade é construída, não herdada — e que a disciplina abre portas.",
        highlight: "A origem não determina o destino — a disciplina, sim.",
      },
      {
        id: "militar",
        title: "Percurso militar",
        content:
          "Em 2004 entrei no Exército, em 2008 nos Fuzileiros e em 2010 nas forças de segurança. Criei barreiras saudáveis: resiliência, método e foco. Faltava‑me, porém, educação financeira — compreender dinheiro, risco e alocação.",
        highlight: "Força sem método financeiro limita o potencial.",
      },
      {
        id: "descobertas",
        title: "As descobertas",
        content:
          "Descobri o trading e o network marketing. Mundos diferentes, a mesma lição: conhecimento certo liberta. Comecei do zero com uma regra simples — aprender, aplicar, ensinar.",
        highlight: "Conhecimento aplicado torna‑se liberdade.",
      },
      {
        id: "iqonic",
        title: "IQONIC",
        content:
          "Na IQONIC cresci como educador e mentor. Liderar equipas e formar pessoas mostrou‑me o impacto de um método claro e de uma mentalidade forte para criar rendimento sustentável.",
        highlight: "Liderança é serviço + método + consistência.",
      },
      {
        id: "mtm",
        title: "Nasce a MoreThanMoney",
        content:
          "A MTM é comunidade e educação financeira prática. Um ecossistema com cursos, scanners e acompanhamento — para transformar esforço em autonomia real.",
        highlight: "Mais do que dinheiro: evolução e autonomia.",
      },
      {
        id: "hoje",
        title: "O meu papel hoje",
        content:
          "Sou mentor e construtor. O dinheiro é ferramenta; o verdadeiro ativo é quem te tornas no processo. A minha missão é ajudar mais pessoas a definirem — e atingirem — a sua liberdade.",
        highlight: "Define a tua liberdade. Depois constrói‑a.",
      },
      {
        id: "valores",
        title: "Valores que me guiam",
        content:
          "Disciplina acima de motivação. Integridade acima de atalhos. Partilha acima de ego. Estes princípios moldam as minhas decisões — e os projetos que construo.",
        highlight: "Resultados seguem princípios — sempre.",
      },
      {
        id: "resultados",
        title: "Resultados com método",
        content:
          "Estruturei processos que qualquer pessoa comprometida pode seguir: educação prática, scanners objetivos e acompanhamento. Não prometo sorte — ensino método.",
        highlight: "Sem método, não há consistência.",
      },
      {
        id: "convite",
        title: "O próximo passo",
        content:
          "Se queres acelerar a tua curva de aprendizagem, junta‑te à comunidade e começa com um plano guiado. O melhor momento para começar foi ontem — o segundo melhor é agora.",
        highlight: "Começa pequeno. Pensa grande. Age já.",
        cta: { label: "Começar agora", href: "https://forms.gle/W49zpDDt1VFBsaev7" },
      },
    ],
    []
  )
}

export default function RicardoStoryCard() {
  const slides = useRicardoStory()
  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)

  const goTo = (i: number) => {
    const max = slides.length
    const next = ((i % max) + max) % max
    setIndex(next)
  }

  const next = () => goTo(index + 1)
  const prev = () => goTo(index - 1)

  // Auto-play robusto, pausa em hover/focus, retoma em blur/mouseleave
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      if (progressRef.current) clearInterval(progressRef.current)
      progressRef.current = null
      return
    }
    intervalRef.current = setInterval(next, 5000)
    // animação de progresso (0→100 em 5s)
    setProgress(0)
    if (progressRef.current) clearInterval(progressRef.current)
    progressRef.current = setInterval(() => {
      setProgress((p) => (p >= 100 ? 100 : p + 2)) // ~5s a 100ms
    }, 100)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      if (progressRef.current) clearInterval(progressRef.current)
      progressRef.current = null
    }
  }, [isPlaying, index])

  // Acessibilidade: setas do teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.matches(":focus-within, :hover")) return
      if (e.key === "ArrowRight") next()
      if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index])

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-5xl mx-auto rounded-2xl overflow-hidden border border-[#D2A63C]/30 bg-gradient-to-br from-black/80 to-[#0c0b09] shadow-[0_0_40px_rgba(210,166,60,0.15)]"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
    >
      {/* Barra de progresso */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#D2A63C]/20">
        <div
          className="h-full bg-[#D2A63C] transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#D2A63C]/20 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#D2A63C] text-black font-extrabold grid place-items-center">RG</div>
          <div>
            <h3 className="text-[#F3F3E6] text-lg font-semibold leading-tight">A minha história</h3>
            <p className="text-xs text-gray-400">MoreThanMoney · IQONIC</p>
          </div>
        </div>

        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#D2A63C]/30 text-[#F3F3E6] hover:bg-[#D2A63C]/10 transition-colors"
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span className="text-xs hidden sm:inline">{isPlaying ? "Pausar" : "Reproduzir"}</span>
        </button>
      </div>

      {/* Slides */}
      <div className="relative">
        <div className="min-h-[220px] md:min-h-[240px] lg:min-h-[260px] p-6 md:p-10">
          <h4 className="text-[#D2A63C] text-xl md:text-2xl font-bold mb-3 tracking-tight">
            {slides[index].title}
          </h4>
          <p className="text-[#F3F3E6]/90 text-base md:text-lg leading-relaxed max-w-3xl">
            {slides[index].content}
          </p>
          {slides[index].highlight && (
            <p className="mt-4 text-[#F3F3E6] text-sm md:text-base italic opacity-90">
              “{slides[index].highlight}”
            </p>
          )}
          {slides[index].cta && (
            <div className="mt-6">
              <a
                href={slides[index].cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-2 rounded-md bg-[#D2A63C] text-black font-semibold hover:bg-[#BB8525] transition-colors"
              >
                {slides[index].cta.label}
              </a>
            </div>
          )}
        </div>

        {/* Controles laterais */}
        <div className="absolute inset-y-0 left-0 right-0 pointer-events-none">
          <div className="flex items-center justify-between h-full">
            <button
              onClick={prev}
              className="pointer-events-auto m-2 md:m-3 p-2 rounded-full bg-black/50 border border-[#D2A63C]/30 text-[#F3F3E6] hover:bg-black/70 transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              className="pointer-events-auto m-2 md:m-3 p-2 rounded-full bg-black/50 border border-[#D2A63C]/30 text-[#F3F3E6] hover:bg-black/70 transition-colors"
              aria-label="Seguinte"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Dots de progresso */}
      <div className="px-6 pb-6 -mt-2">
        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              aria-label={`Ir para ${s.title}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "bg-[#D2A63C] w-10" : "bg-[#D2A63C]/30 w-4 hover:bg-[#D2A63C]/60"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
