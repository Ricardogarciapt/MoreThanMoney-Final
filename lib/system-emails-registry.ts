/**
 * Registo central dos emails transaccionais MTM — usado no admin e nos envios automáticos.
 */

import {
  dcaOpportunityEmailTemplate,
  onboarding1EmailTemplate,
  onboarding2EmailTemplate,
  onboarding3EmailTemplate,
  onboarding4EmailTemplate,
  onboardingScheduleEmailTemplate,
  passwordChangedEmailTemplate,
  passwordRecoveryEmailTemplate,
  registrationAdminEmailTemplate,
  registrationRejectedEmailTemplate,
  scannerAccessEmailTemplate,
  visionAnnouncementEmailTemplate,
  welcomeEmailTemplate,
  adminBroadcastEmailTemplate,
} from './email-templates'
import { CALENDLY_ONBOARDING_URL, SKOOL_FAST_START_URL } from './fast-start-journey'
import { getSiteUrl } from './mail-transport'

export type SystemEmailCategory = 'transactional' | 'onboarding' | 'marketing' | 'security'

export interface SystemEmailDefinition {
  id: string
  name: string
  subject: string
  category: SystemEmailCategory
  /** Quando o email é enviado automaticamente */
  trigger: string
  automated: boolean
  /** Ordem na sequência de onboarding (se aplicável) */
  sequenceStep?: number
  sequenceDelay?: string
}

export interface SystemEmailSampleData {
  userName: string
  userEmail: string
  username: string
  siteUrl: string
  skoolUrl: string
  calendlyUrl: string
}

export const SYSTEM_EMAILS: SystemEmailDefinition[] = [
  {
    id: 'welcome',
    name: 'Boas-vindas + Fast Start MoreThanMoney',
    subject: '🎉 Bem-vindo à MoreThanMoney!',
    category: 'transactional',
    trigger: 'Primeira subscrição activa — Stripe, App Store, Google Play ou aprovação admin',
    automated: true,
  },
  {
    id: 'registration_admin',
    name: 'Alerta admin — novo registo',
    subject: '🔔 Novo Pedido de Registo — MoreThanMoney',
    category: 'transactional',
    trigger: 'Quando um utilizador submete pedido de registo (notify-registration)',
    automated: true,
  },
  {
    id: 'registration_rejected',
    name: 'Registo recusado',
    subject: 'Pedido de Registo — MoreThanMoney',
    category: 'transactional',
    trigger: 'Quando o admin rejeita um pedido de registo',
    automated: true,
  },
  {
    id: 'onboarding_schedule',
    name: 'Agendar Onboarding (Calendly)',
    subject: 'Agende o seu onboarding gratuito com a equipa MTM',
    category: 'onboarding',
    trigger: 'Sequência automática de emails (CRON email-marketing/sequences)',
    automated: true,
    sequenceStep: 1,
    sequenceDelay: 'Imediato após inscrição na sequência',
  },
  {
    id: 'onboarding_1',
    name: 'Onboarding — Dia 1: Plataforma',
    subject: 'Guia de Onboarding MTM - Passo 1',
    category: 'onboarding',
    trigger: 'Sequência automática (CRON)',
    automated: true,
    sequenceStep: 2,
    sequenceDelay: '+1 dia',
  },
  {
    id: 'onboarding_2',
    name: 'Onboarding — Dia 2: App Mobile',
    subject: 'App Mobile MTM - Teu dashboard no bolso',
    category: 'onboarding',
    trigger: 'Sequência automática (CRON)',
    automated: true,
    sequenceStep: 3,
    sequenceDelay: '+2 dias',
  },
  {
    id: 'onboarding_3',
    name: 'Onboarding — Dia 3: Scanners & Portfolios',
    subject: 'Scanners & Portfolios MTM - Ferramentas profissionais',
    category: 'onboarding',
    trigger: 'Sequência automática (CRON)',
    automated: true,
    sequenceStep: 4,
    sequenceDelay: '+3 dias',
  },
  {
    id: 'onboarding_4',
    name: 'Onboarding — Skool Community',
    subject: 'Junta-te à Comunidade Skool MTM',
    category: 'onboarding',
    trigger: 'Sequência automática (CRON)',
    automated: true,
    sequenceStep: 5,
    sequenceDelay: '+5 dias',
  },
  {
    id: 'password_recovery',
    name: 'Recuperar password',
    subject: '🔐 Recuperar password — MoreThanMoney',
    category: 'security',
    trigger: 'Quando o utilizador pede reset de password (forgot-password)',
    automated: true,
  },
  {
    id: 'password_changed',
    name: 'Password actualizada',
    subject: '✅ Password actualizada — MoreThanMoney',
    category: 'security',
    trigger: 'Após alteração de password com sucesso',
    automated: true,
  },
  {
    id: 'scanner_access',
    name: 'Acesso Scanner TradingView',
    subject: '🔓 Acesso ao Scanner — instruções TradingView',
    category: 'transactional',
    trigger: 'Após compra/activação de scanner via Stripe webhook',
    automated: true,
  },
  {
    id: 'vision_announcement',
    name: 'Anúncio Visão MTM',
    subject: 'A Nossa Jornada Juntos - MoreThanMoney',
    category: 'marketing',
    trigger: 'Campanha manual ou sequência marketing',
    automated: false,
  },
  {
    id: 'dca_opportunity',
    name: 'Alerta Oportunidades DCA',
    subject: '🚀 Oportunidades DCA Detectadas!',
    category: 'marketing',
    trigger: 'Scanner DCA diário / campanha automática',
    automated: true,
  },
  {
    id: 'admin_broadcast',
    name: 'Notificação admin (campanha)',
    subject: 'Notificação MoreThanMoney',
    category: 'marketing',
    trigger: 'Envio manual via Admin → Notificações → Campanhas',
    automated: false,
  },
]

export function getDefaultSampleData(overrides?: Partial<SystemEmailSampleData>): SystemEmailSampleData {
  const siteUrl = getSiteUrl()
  return {
    userName: 'Ricardo Garcia',
    userEmail: 'morethanmoneypt@gmail.com',
    username: 'ricardogarcia',
    siteUrl,
    skoolUrl: SKOOL_FAST_START_URL,
    calendlyUrl: CALENDLY_ONBOARDING_URL,
    ...overrides,
  }
}

export function getSystemEmailById(id: string): SystemEmailDefinition | undefined {
  return SYSTEM_EMAILS.find((e) => e.id === id)
}

export function renderSystemEmailHtml(
  templateId: string,
  sampleData?: Partial<SystemEmailSampleData>,
): { html: string; subject: string } | null {
  const def = getSystemEmailById(templateId)
  if (!def) return null

  const data = getDefaultSampleData(sampleData)
  const approveUrl = `${data.siteUrl}/api/approve/sample-user-id?action=approve`
  const rejectUrl = `${data.siteUrl}/api/approve/sample-user-id?action=reject`
  const resetLink = `${data.siteUrl}/reset-password?token=sample-token`

  let html = ''

  switch (templateId) {
    case 'welcome':
      html = welcomeEmailTemplate(data.userName, data.userEmail, data.username, data.siteUrl)
      break
    case 'registration_admin':
      html = registrationAdminEmailTemplate(
        data.userName,
        data.userEmail,
        approveUrl,
        rejectUrl,
        data.siteUrl,
      )
      break
    case 'registration_rejected':
      html = registrationRejectedEmailTemplate(data.userName, data.siteUrl)
      break
    case 'onboarding_schedule':
      html = onboardingScheduleEmailTemplate(data.userName, data.calendlyUrl, data.siteUrl)
      break
    case 'onboarding_1':
      html = onboarding1EmailTemplate(data.userName, data.siteUrl)
      break
    case 'onboarding_2':
      html = onboarding2EmailTemplate(data.userName, data.siteUrl)
      break
    case 'onboarding_3':
      html = onboarding3EmailTemplate(data.userName, data.siteUrl)
      break
    case 'onboarding_4':
      html = onboarding4EmailTemplate(data.userName, data.skoolUrl)
      break
    case 'password_recovery':
      html = passwordRecoveryEmailTemplate(
        data.userName,
        data.userEmail,
        data.username,
        resetLink,
        data.siteUrl,
      )
      break
    case 'password_changed':
      html = passwordChangedEmailTemplate(data.userName, data.userEmail, data.username, data.siteUrl)
      break
    case 'scanner_access':
      html = scannerAccessEmailTemplate(
        data.userName,
        'Scanner GoldKiller',
        data.username,
        data.siteUrl,
      )
      break
    case 'vision_announcement':
      html = visionAnnouncementEmailTemplate(data.userName, data.siteUrl)
      break
    case 'dca_opportunity':
      html = dcaOpportunityEmailTemplate(
        data.userName,
        [
          { name: 'Bitcoin (BTC)', discount: 18.5, category: 'Crypto' },
          { name: 'Ethereum (ETH)', discount: 12.3, category: 'Crypto' },
        ],
        data.siteUrl,
      )
      break
    case 'admin_broadcast':
      html = adminBroadcastEmailTemplate(
        'Exemplo de notificação',
        'Esta é uma pré-visualização de uma campanha enviada pelo painel admin. O conteúdo inclui logo MTM e footer oficial.',
        data.siteUrl,
      )
      break
    default:
      return null
  }

  return { html, subject: def.subject }
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.GMAIL_APP_PASSWORD?.trim())
}
