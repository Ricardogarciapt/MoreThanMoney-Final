"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { CheckCircle2, Bot, Target, Users, MessageSquare, TrendingUp, CalendarCheck2 } from "lucide-react"

type AgentContext = "fast-start" | "onboarding"

interface OnboardingBusinessAIAgentProps {
  context: AgentContext
  userKey?: string
}

interface ChecklistItem {
  id: string
  label: string
}

const dayChecklist: ChecklistItem[] = [
  { id: "broker", label: "Configurar broker, ligar MT4 e escolher demo/real." },
  { id: "onboarding", label: "Completar onboarding e entrar na call de onboarding." },
  { id: "first_trade", label: "Aplicar conhecimento e executar primeira trade com mentor." },
  { id: "launch_business", label: "Iniciar lançamento de negócio e outreach diário." },
  { id: "development", label: "Fazer 30 min/dia de desenvolvimento pessoal." },
]

const launchChecklist: ChecklistItem[] = [
  { id: "launch_training", label: "Assistir ao treino Launch your business." },
  { id: "list40", label: "Criar lista de 40 contactos qualificados." },
  { id: "invite_scripts", label: "Convidar com scripts corretos." },
  { id: "webinar_reminder", label: "Enviar lembrete antes do webinar/chamada." },
  { id: "calls_3way", label: "Fazer chamadas a 3 com mentor." },
]

const prospectScripts = {
  first: [
    "Hey you’ve a great profile, I would love to connect or collab with you",
    "Hey [name], I would love to connect with you on a business level. Would you be open to marketing or promoting?",
    "Hey, you have a great profile. What do you do?",
  ],
  second: [
    "Before I give you details, have you ever made money from social media?",
    "Before I explain, have you ever traded before?",
  ],
  third: ["Perfect, are you free tonight at 9pm? (Se não, sugerir horário alternativo.)"],
  fourth: ["Great, I’ll send you the details and we connect after the call."],
}

const faqItems = [
  {
    q: "O que é a MoreThanMoney (MTM)?",
    a: "A MTM é um ecossistema premium de educação, trading e crescimento de negócio digital, com acompanhamento estruturado para execução diária.",
  },
  {
    q: "O que recebo ao entrar?",
    a: "Recebes plano de onboarding, acesso a formação prática, estrutura de acompanhamento e sistema para crescer como estudante, trader/copytrader e business builder.",
  },
  {
    q: "O que é copytrading? Preciso de experiência?",
    a: "Copytrading permite replicar estratégias de traders experientes. Não exige experiência prévia, mas exige gestão de risco e disciplina.",
  },
  {
    q: "Quais são os riscos no trading?",
    a: "Há risco real de perda parcial ou total de capital. O objetivo é reduzir risco com plano, gestão e consistência; nunca investir dinheiro que não possas perder.",
  },
  {
    q: "Como encontro pessoas para o negócio?",
    a: "Começa pela lista de 40 contactos, executa 10 abordagens por dia, faz follow-up 3 vezes e usa chamadas a 3 com mentor para aumentar conversão.",
  },
  {
    q: "E se as pessoas disserem não?",
    a: "É normal. Mantém volume e processo. Regra operacional: 1 em 7 tende a converter com execução correta e follow-up consistente.",
  },
]

export default function OnboardingBusinessAIAgent({ context, userKey }: OnboardingBusinessAIAgentProps) {
  // Chave única por utilizador para manter onboarding e fast-start interligados.
  const STORAGE_KEY = `mtm_execution_hub_global_${userKey || "anonymous"}`
  const [isFirstUseComplete, setIsFirstUseComplete] = useState(false)
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [profileAnswers, setProfileAnswers] = useState<Record<string, string>>({})
  const [completedDay, setCompletedDay] = useState<Record<string, boolean>>({})
  const [completedLaunch, setCompletedLaunch] = useState<Record<string, boolean>>({})
  const [dailyReach, setDailyReach] = useState(0)
  const [dailyShares, setDailyShares] = useState(0)
  const [dailyFollowUps, setDailyFollowUps] = useState(0)
  const [fastStartPercent, setFastStartPercent] = useState(0)
  const [syncingFastStart, setSyncingFastStart] = useState(false)

  const firstUseQuestions = [
    {
      id: "experience",
      title: "Qual é a tua experiência atual?",
      options: ["Iniciante total", "Já estudei mas sem consistência", "Intermédio", "Avançado"],
    },
    {
      id: "focus",
      title: "Onde queres focar primeiro?",
      options: ["Trading", "Copytrading", "Negócio / rede", "Equilibrar Trading + Negócio"],
    },
    {
      id: "time",
      title: "Quantos minutos por dia consegues dedicar?",
      options: ["30 min", "60 min", "90 min", "120+ min"],
    },
    {
      id: "risk",
      title: "Perfil de risco atual?",
      options: ["Conservador", "Moderado", "Agressivo com controlo", "Ainda não sei"],
    },
    {
      id: "goal",
      title: "Objetivo principal nos próximos 90 dias?",
      options: ["Disciplina e rotina", "Primeiros resultados no trading", "Primeiras conversões no negócio", "Escalar equipa"],
    },
    {
      id: "support",
      title: "Nível de suporte que precisas?",
      options: ["Checklist e autonomia", "Mentoria semanal", "Acompanhamento próximo diário", "Mistura de autonomia + mentoria"],
    },
  ]

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      setIsFirstUseComplete(Boolean(parsed.isFirstUseComplete))
      setProfileAnswers(parsed.profileAnswers || {})
      setCompletedDay(parsed.completedDay || {})
      setCompletedLaunch(parsed.completedLaunch || {})
      setDailyReach(parsed.dailyReach || 0)
      setDailyShares(parsed.dailyShares || 0)
      setDailyFollowUps(parsed.dailyFollowUps || 0)
    } catch {
      // ignore
    }
  }, [STORAGE_KEY])

  useEffect(() => {
    const payload = {
      isFirstUseComplete,
      profileAnswers,
      completedDay,
      completedLaunch,
      dailyReach,
      dailyShares,
      dailyFollowUps,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [
    STORAGE_KEY,
    isFirstUseComplete,
    profileAnswers,
    completedDay,
    completedLaunch,
    dailyReach,
    dailyShares,
    dailyFollowUps,
  ])

  const refreshFastStart = async () => {
    try {
      const res = await fetch("/api/fast-start/progress", { cache: "no-store" })
      const json = await res.json()
      if (json?.success && json?.progress) {
        setFastStartPercent(Number(json.progress.progress_percent || 0))
      }
    } catch {
      // ignore
    }
  }

  const syncMentorSeed = async () => {
    try {
      await fetch("/api/mentor/overview", { cache: "no-store" })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshFastStart()
    syncMentorSeed()
    const id = setInterval(refreshFastStart, 15000)
    return () => clearInterval(id)
  }, [])

  const dayProgress = useMemo(() => {
    const completed = dayChecklist.filter((item) => completedDay[item.id]).length
    return Math.round((completed / dayChecklist.length) * 100)
  }, [completedDay])

  const launchProgress = useMemo(() => {
    const completed = launchChecklist.filter((item) => completedLaunch[item.id]).length
    return Math.round((completed / launchChecklist.length) * 100)
  }, [completedLaunch])

  const nextAction =
    dayChecklist.find((item) => !completedDay[item.id])?.label ||
    "Checklist Day 1-7 completa. Avança para execução de negócio e accountability diária."

  const personalizedPlan = useMemo(() => {
    if (!isFirstUseComplete) return []

    const focus = profileAnswers.focus || ""
    const time = profileAnswers.time || ""
    const exp = profileAnswers.experience || ""

    const plan: string[] = []
    plan.push("Completar Day 1–7 Checklist por ordem e confirmar cada etapa no painel.")
    if (focus.includes("Trading") || focus.includes("Copytrading")) {
      plan.push("Prioridade Trading: setup broker + primeira trade com mentor em ambiente controlado.")
    }
    if (focus.includes("Negócio") || focus.includes("rede") || focus.includes("Equilibrar")) {
      plan.push("Prioridade Negócio: lista de 40 leads, 10 contactos/dia, 1 apresentação/dia.")
    }
    if (time === "30 min") {
      plan.push("Plano de 30 min: 15 min formação + 10 min prospeção + 5 min follow-up.")
    } else if (time === "60 min") {
      plan.push("Plano de 60 min: 20 min formação + 25 min execução + 15 min follow-up.")
    } else {
      plan.push("Plano expandido: bloco diário com formação, execução e revisão de métricas.")
    }
    if (exp.includes("Iniciante")) {
      plan.push("Ritmo recomendado: foco em fundamentos, evitar complexidade e reforçar consistência.")
    }
    return plan
  }, [isFirstUseComplete, profileAnswers])

  const accountabilityMessage = useMemo(() => {
    const gaps: string[] = []
    if (dailyReach < 10) gaps.push(`faltam ${10 - dailyReach} contactos para o objetivo diário`)
    if (dailyShares < 1) gaps.push("falta partilhar o negócio com pelo menos 1 pessoa")
    if (dailyFollowUps < 3) gaps.push("falta completar follow-up estruturado")

    if (gaps.length === 0) {
      return "Excelente execução hoje. Mantém consistência e duplica o processo com a equipa."
    }
    return `Ação recomendada agora: ${gaps.join(" | ")}.`
  }, [dailyReach, dailyShares, dailyFollowUps])

  const contextLabel =
    context === "fast-start" ? "Painel de Execução • Fast Start" : "Painel de Execução • Onboarding"

  const markFastStartStep = async (stepNumber: number) => {
    setSyncingFastStart(true)
    try {
      await fetch("/api/fast-start/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_number: stepNumber }),
      })
      await refreshFastStart()
    } finally {
      setSyncingFastStart(false)
    }
  }

  if (!isFirstUseComplete) {
    const question = firstUseQuestions[currentQuestionIdx]

    return (
      <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
        <CardHeader className="border-b border-gray-800">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-[#D2A63C] flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Checklist de Diagnóstico
            </CardTitle>
            <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/40">
              Primeira Utilização
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-gray-300 mb-4">
            Antes de avançar, responde ao diagnóstico rápido para mapear os teus próximos passos com precisão.
          </p>
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Pergunta {currentQuestionIdx + 1} de {firstUseQuestions.length}</span>
              <span>{Math.round(((currentQuestionIdx + 1) / firstUseQuestions.length) * 100)}%</span>
            </div>
            <Progress value={Math.round(((currentQuestionIdx + 1) / firstUseQuestions.length) * 100)} className="h-2 bg-gray-800" />
          </div>

          <div className="rounded-lg border border-gray-700 bg-black/30 p-4 mb-4">
            <p className="text-white font-semibold mb-3">{question.title}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {question.options.map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant="outline"
                  className={`justify-start border-gray-700 text-gray-200 hover:bg-[#D2A63C]/20 ${
                    profileAnswers[question.id] === opt ? "bg-[#D2A63C]/20 border-[#D2A63C]/50 text-[#D2A63C]" : ""
                  }`}
                  onClick={() => setProfileAnswers((prev) => ({ ...prev, [question.id]: opt }))}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-gray-700 text-gray-200"
              disabled={currentQuestionIdx === 0}
              onClick={() => setCurrentQuestionIdx((v) => Math.max(0, v - 1))}
            >
              Voltar
            </Button>
            {currentQuestionIdx < firstUseQuestions.length - 1 ? (
              <Button
                type="button"
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                disabled={!profileAnswers[question.id]}
                onClick={() => setCurrentQuestionIdx((v) => v + 1)}
              >
                Próxima
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                disabled={!profileAnswers[question.id]}
                onClick={() => setIsFirstUseComplete(true)}
              >
                Gerar Plano
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
      <CardHeader className="border-b border-gray-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-[#D2A63C] flex items-center gap-2">
            <Bot className="w-5 h-5" />
            {contextLabel}
          </CardTitle>
          <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/40">
            Onboarding & Business Coach
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-300">Sincronização onboarding + fast-start ativa</p>
          <p className="mt-1 text-xs text-gray-200">
            Progresso oficial Fast Start: <strong>{fastStartPercent}%</strong>. O mesmo estado é usado em ambas as páginas.
          </p>
        </div>

        <div className="rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4">
          <p className="text-sm text-gray-200">
            Objetivo: transformar cada novo registo em <strong>estudante ativo</strong>,{" "}
            <strong>trader/copytrader ativo</strong> e <strong>business builder ativo</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-2">Próxima ação sugerida: {nextAction}</p>
        </div>

        <Card className="bg-black/30 border-gray-700">
          <CardHeader>
            <CardTitle className="text-sm text-white">Plano Personalizado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-gray-200">
            {personalizedPlan.map((item) => (
              <p key={item}>• {item}</p>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-gray-700 text-gray-200"
              onClick={() => {
                setIsFirstUseComplete(false)
                setCurrentQuestionIdx(0)
              }}
            >
              Refazer Checklist Questions
            </Button>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-300 font-semibold">Day 1–7 Checklist</span>
              <span className="text-xs text-blue-300">{dayProgress}%</span>
            </div>
            <Progress value={dayProgress} className="h-2 bg-gray-800 mb-3" />
            <div className="space-y-2">
              {dayChecklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    const wasCompleted = Boolean(completedDay[item.id])
                    setCompletedDay((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                    // Ligação gamify -> Fast Start real (1:1 com os primeiros passos-chave).
                    if (!wasCompleted) {
                      if (item.id === "onboarding") await markFastStartStep(1)
                      if (item.id === "first_trade") await markFastStartStep(3)
                      if (item.id === "launch_business") await markFastStartStep(4)
                    }
                  }}
                  className={`w-full text-left text-xs rounded-md border p-2 transition ${
                    completedDay[item.id]
                      ? "bg-green-600/15 border-green-500/40 text-green-300"
                      : "bg-gray-800/60 border-gray-700 text-gray-200 hover:border-[#D2A63C]/40"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-purple-300 font-semibold">Launch Checklist</span>
              <span className="text-xs text-purple-300">{launchProgress}%</span>
            </div>
            <Progress value={launchProgress} className="h-2 bg-gray-800 mb-3" />
            <div className="space-y-2">
              {launchChecklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setCompletedLaunch((prev) => ({
                      ...prev,
                      [item.id]: !prev[item.id],
                    }))
                  }
                  className={`w-full text-left text-xs rounded-md border p-2 transition ${
                    completedLaunch[item.id]
                      ? "bg-green-600/15 border-green-500/40 text-green-300"
                      : "bg-gray-800/60 border-gray-700 text-gray-200 hover:border-[#D2A63C]/40"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="bg-black/30 border-gray-700">
            <CardHeader>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#D2A63C]" />
                Scripts de Prospecção (Sequência)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-gray-200">
              <div>
                <p className="text-[#D2A63C] font-semibold mb-1">1ª Mensagem</p>
                {prospectScripts.first.map((s) => (
                  <p key={s} className="mb-1">• {s}</p>
                ))}
              </div>
              <div>
                <p className="text-[#D2A63C] font-semibold mb-1">2ª Mensagem</p>
                {prospectScripts.second.map((s) => (
                  <p key={s} className="mb-1">• {s}</p>
                ))}
              </div>
              <div>
                <p className="text-[#D2A63C] font-semibold mb-1">3ª e 4ª Mensagem</p>
                <p>• {prospectScripts.third[0]}</p>
                <p>• {prospectScripts.fourth[0]}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/30 border-gray-700">
            <CardHeader>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <CalendarCheck2 className="w-4 h-4 text-[#D2A63C]" />
                Accountability Diário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="text-gray-300">
                  Reach-outs
                  <input
                    type="number"
                    min={0}
                    value={dailyReach}
                    onChange={(e) => setDailyReach(Number(e.target.value || 0))}
                    className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                  />
                </label>
                <label className="text-gray-300">
                  Shares
                  <input
                    type="number"
                    min={0}
                    value={dailyShares}
                    onChange={(e) => setDailyShares(Number(e.target.value || 0))}
                    className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                  />
                </label>
                <label className="text-gray-300">
                  Follow-ups
                  <input
                    type="number"
                    min={0}
                    value={dailyFollowUps}
                    onChange={(e) => setDailyFollowUps(Number(e.target.value || 0))}
                    className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                  />
                </label>
              </div>
              <div className="rounded-md border border-[#D2A63C]/40 bg-[#D2A63C]/10 p-3 text-xs text-gray-200">
                {accountabilityMessage}
              </div>
              <p className="text-[11px] text-gray-400">
                Regra operacional: rastrear leads, fazer 3 follow-ups e marcar “not interested” sem resposta.
                Conversão de referência: 1 em 7.
              </p>
            </CardContent>
          </Card>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          <AccordionItem value="faq" className="border border-gray-700 rounded-md px-3">
            <AccordionTrigger className="text-sm text-white">FAQ MTM / IQONIC / Trading / Negócio</AccordionTrigger>
            <AccordionContent className="space-y-2 text-xs text-gray-300">
              {faqItems.map((item) => (
                <div key={item.q}>
                  <p className="text-[#D2A63C] font-semibold">{item.q}</p>
                  <p>{item.a}</p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="skills" className="border border-gray-700 rounded-md px-3">
            <AccordionTrigger className="text-sm text-white">7 Skills de Network Marketing</AccordionTrigger>
            <AccordionContent className="text-xs text-gray-300 space-y-1">
              <p>1) Prospecting  2) Inviting  3) Presenting  4) Following up</p>
              <p>5) Closing  6) Getting customers started  7) Promoting events</p>
              <p className="text-gray-400">Tarefa diária padrão: 10 contactos, 1 apresentação, 3 follow-ups, 1 convite para evento.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="telegram" className="border border-gray-700 rounded-md px-3">
            <AccordionTrigger className="text-sm text-white">Telegram Mode (Comandos)</AccordionTrigger>
            <AccordionContent className="text-xs text-gray-300 space-y-1">
              <p><strong>/start</strong> onboarding inicial</p>
              <p><strong>/checklist</strong> progresso de execução</p>
              <p><strong>/prospect</strong> scripts de abordagem</p>
              <p><strong>/faq</strong> respostas rápidas</p>
              <p><strong>/launch</strong> passos do lançamento de negócio</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-[#D2A63C] hover:bg-[#BB8525] text-black">
            <Target className="w-4 h-4 mr-1" />
            Foco em Execução
          </Button>
          <Button size="sm" variant="outline" className="border-gray-700 text-gray-200">
            <Users className="w-4 h-4 mr-1" />
            Modo Mentor / 3-Way Calls
          </Button>
          <Button size="sm" variant="outline" className="border-gray-700 text-gray-200">
            <TrendingUp className="w-4 h-4 mr-1" />
            Tracking Leads & Conversões
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={syncingFastStart}
            className="border-emerald-500/40 text-emerald-300"
            onClick={refreshFastStart}
          >
            {syncingFastStart ? "A sincronizar..." : "Sincronizar progresso"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

