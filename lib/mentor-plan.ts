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
    title: "Assistir a uma sessão ao vivo",
    description: "Aprende com uma sessão em direto com o mentor e escreve 3 apontamentos do que percebeste.",
    phase: "fast-start",
    dueHours: 24,
    xpReward: 60,
  },
  {
    code: "h24_10_leads",
    title: "Configurar conta demo ou ligar a corretora",
    description: "Abre a conta demo ou liga a tua conta na corretora parceira (Abrir Conta) para praticares com segurança.",
    phase: "launch",
    dueHours: 30,
    xpReward: 50,
  },
  {
    code: "h36_3_followups",
    title: "Definir regra de risco por operação",
    description: "Escolhe o valor que aceitas perder por operação e regista essa regra no diário antes da próxima entrada.",
    phase: "launch",
    dueHours: 48,
    xpReward: 55,
  },
  {
    code: "h48_rising_star_push",
    title: "Primeira semana com plano de trading escrito",
    description: "Escreve o teu plano da semana: o que vais observar, em que condições entras e como gerês o risco.",
    phase: "launch",
    dueHours: 72,
    xpReward: 90,
  },
  {
    code: "h72_bronze_star_push",
    title: "Revisão semanal dos resultados",
    description: "Revê pips, erros e ajustes da semana, e escolhe uma única coisa a melhorar na seguinte.",
    phase: "launch",
    dueHours: 96,
    xpReward: 120,
  },
]
