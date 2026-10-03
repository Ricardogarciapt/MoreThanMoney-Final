/**
 * Jornada Fast Start MTM — partilhada entre o email de boas-vindas e /fast-start.
 *
 * Liga a apresentação → onboarding → app → conta → MTM Copy → comunidade.
 *
 * O IQONIC saiu daqui a 2026-08-28. Foi removido do site em 2026-06-26, mas continuava a ser a
 * PRIMEIRA coisa que um membro novo lia no email de boas-vindas — a apresentar-lhe um produto
 * que já não existe. Um funil que abre com uma promessa que não se pode cumprir não perde só
 * aquele passo: perde a confiança para os cinco seguintes.
 */
import { LINK_AGENDAR_ONBOARDING } from './agenda/link'

/**
 * O NOME FICA, O DESTINO MUDA (30/09/2026). O Calendly foi substituído pela agenda da casa
 * (`/agendar`) — ver `lib/agenda/link.ts`. A constante mantém o nome antigo porque é importada em
 * vários sítios e renomeá-la num commit de substituição de ferramenta era misturar duas mudanças;
 * o que importa é que ninguém volte a escrever um endereço destes à mão.
 *
 * @deprecated usa `LINK_AGENDAR_ONBOARDING` de `lib/agenda/link.ts`.
 */
export const CALENDLY_ONBOARDING_URL = LINK_AGENDAR_ONBOARDING

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
      title: 'MoreThanMoney — A tua oportunidade',
      description:
        'Percebe o ecossistema: educação, sinais acompanhados, copy trading e a comunidade, num só plano.',
      ctaLabel: 'Ver a apresentação',
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
        'Independentemente da academia que escolheres (Skool ou outra), abre conta demo ou real na app — guia passo a passo PU Prime + MT5.',
      ctaLabel: 'Abrir conta de trading',
      ctaUrl: `${base}${APP_ACCOUNT_OPEN_PATH}`,
      previewPath: APP_ACCOUNT_OPEN_PATH,
      previewHint: 'PU Prime · KYC · MT5 · UID MTM',
    },
    {
      number: 5,
      // O MTM Copy foi descontinuado (fase 1): a cópia automática vive agora só no MTM Auto.
      title: 'MTM Auto — Escolhe uma estratégia',
      description:
        'Liga a tua conta MT5 no MTM Auto e escolhe que estratégia MTM copias, com o teu risco.',
      ctaLabel: 'Abrir o MTM Auto',
      ctaUrl: `${base}/mtmauto`,
      previewPath: '/mtmauto',
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
