/**
 * Jornada Fast Start MTM — partilhada entre email de boas-vindas e /fast-start.
 * Liga MoreThanMoney × IQONIC → app → conta → MTMcopier → site → Skool.
 */

export const CALENDLY_ONBOARDING_URL =
  'https://calendly.com/morethanmoneypt/onboarding-de-novos-membros'

export const SKOOL_FAST_START_URL =
  'https://www.skool.com/morethanmoney-1132/classroom/6124701a?md=0bdb4c0a86a84614ad1ddea4de3baa21'

export const MTM_APRESENTACAO_PATH = '/apresentacao'

export const APP_ACCOUNT_OPEN_PATH = '/app-mobile/accountopen'

export interface FastStartJourneyStep {
  number: number
  title: string
  description: string
  ctaLabel: string
  ctaUrl: string
  /** Rótulo no preview visual do email (simula print do site) */
  previewPath: string
  previewHint: string
}

export function resolveSiteBase(siteUrl?: string): string {
  return (siteUrl ?? 'https://www.morethanmoney.pt').replace(/\/$/, '')
}

export function getFastStartJourneySteps(siteUrl?: string): FastStartJourneyStep[] {
  const base = resolveSiteBase(siteUrl)

  return [
    {
      number: 1,
      title: 'MTM × IQONIC — A tua oportunidade',
      description:
        'Percebe o ecossistema MoreThanMoney + IQONIC: educação, copy trading e negócio digital num só plano.',
      ctaLabel: 'Ver apresentação MTM × IQONIC',
      ctaUrl: `${base}${MTM_APRESENTACAO_PATH}`,
      previewPath: '/apresentacao',
      previewHint: 'Apresentação de oportunidade 2026',
    },
    {
      number: 2,
      title: 'Agenda o teu Onboarding',
      description:
        'Marca uma chamada de 30 min com a equipa MTM para alinharmos objetivos, ferramentas e próximos passos.',
      ctaLabel: 'Agendar no Calendly',
      ctaUrl: CALENDLY_ONBOARDING_URL,
      previewPath: '/onboarding',
      previewHint: 'Sessão 1-on-1 · 30 minutos',
    },
    {
      number: 3,
      title: 'Instala a App MoreThanMoney',
      description:
        'Abre /app-mobile no telemóvel, segue o tutorial guiado (~2 min) e faz uma breve apresentação pessoal no Chat da comunidade.',
      ctaLabel: 'Abrir App MTM',
      ctaUrl: `${base}/app-mobile`,
      previewPath: '/app-mobile',
      previewHint: 'Tutorial · Feed · Chat · Scanner',
    },
    {
      number: 4,
      title: 'Abre a tua conta de trading',
      description:
        'Independentemente da academia que escolheres (IQONIC, Skool ou outra), abre conta demo ou real na app — guia passo a passo TMGM + MT5.',
      ctaLabel: 'Abrir conta de trading',
      ctaUrl: `${base}${APP_ACCOUNT_OPEN_PATH}`,
      previewPath: APP_ACCOUNT_OPEN_PATH,
      previewHint: 'TMGM · KYC · MT5 · UID MTM',
    },
    {
      number: 5,
      title: 'MTMcopier — Escolhe uma estratégia',
      description:
        'Liga a tua conta MT5 e escolhe copiar a estratégia MTM (Premium ou Trade Ideas) ou os grupos de sinais Telegram.',
      ctaLabel: 'Configurar MTMcopier',
      ctaUrl: `${base}/mtmcopy`,
      previewPath: '/mtmcopy',
      previewHint: 'Estratégia MTM · Grupos · Copy trader',
    },
    {
      number: 6,
      title: 'Fast Start Skool — Formação Forex',
      description:
        'Completa o módulo «Início Rápido de Investimentos Forex» no Skool: ebook, apps, scanner GoldKiller e avaliação.',
      ctaLabel: 'Ir para o Skool',
      ctaUrl: SKOOL_FAST_START_URL,
      previewPath: 'skool.com/morethanmoney',
      previewHint: 'Sê bem-vindo à mudança · BootCamp Forex',
    },
  ]
}
