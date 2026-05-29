type MentorTaskSeed = {
  code: string
  title: string
  description: string
  phase: "onboarding" | "fast-start" | "launch"
  dueHours: number
  xpReward: number
}

export const MENTOR_72H_TASKS: MentorTaskSeed[] = [
  {
    code: "h0_onboarding_call",
    title: "Agendar chamada de onboarding",
    description: "Marca a tua sessão de onboarding para alinhar objetivos e foco de execução.",
    phase: "onboarding",
    dueHours: 6,
    xpReward: 40,
  },
  {
    code: "h6_fast_start_step1",
    title: "Completar Fast Start passo 1",
    description: "Ativa a visão certa e o plano de ação para as primeiras 24h.",
    phase: "fast-start",
    dueHours: 12,
    xpReward: 35,
  },
  {
    code: "h12_3way_call",
    title: "Fazer 1 sessão Mentor / 3-Way",
    description: "Executa uma chamada a 3 com apoio do mentor para acelerar resultados.",
    phase: "fast-start",
    dueHours: 24,
    xpReward: 60,
  },
  {
    code: "h24_10_leads",
    title: "Registar 10 leads qualificados",
    description: "Preenche a pipeline inicial com 10 leads reais.",
    phase: "launch",
    dueHours: 30,
    xpReward: 50,
  },
  {
    code: "h36_3_followups",
    title: "Completar 3 follow-ups",
    description: "Executa follow-up estruturado e move leads no funil.",
    phase: "launch",
    dueHours: 48,
    xpReward: 55,
  },
  {
    code: "h48_rising_star_push",
    title: "Plano Rising Star",
    description: "Alcança 2 PE Left + 2 PE Right com execução orientada.",
    phase: "launch",
    dueHours: 72,
    xpReward: 90,
  },
  {
    code: "h72_bronze_star_push",
    title: "Plano Bronze Star",
    description: "Meta: 2 PE Left, 2 PE Right e 700 CV em cada perna.",
    phase: "launch",
    dueHours: 96,
    xpReward: 120,
  },
]

