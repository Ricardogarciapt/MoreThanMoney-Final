import {
  passwordChangedEmailTemplate,
  passwordRecoveryEmailTemplate,
  registrationAdminEmailTemplate,
  registrationRejectedEmailTemplate,
  scannerAccessEmailTemplate,
  welcomeEmailTemplate,
  onboardingLaunchEmailTemplate,
} from './email-templates'
import { ONBOARDING_EMAIL_COPY } from './onboarding-email-copy'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from './mail-transport'

async function sendHtmlMail(to: string, subject: string, html: string) {
  const transporter = createMailTransporter()
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    html: prepareBrandedEmailHtml(html),
    attachments: brandedMailAttachments(),
  })
}

export async function sendRegistrationNotification(userEmail: string, userName: string, userId: string) {
  const siteUrl = getSiteUrl()
  const approveUrl = `${siteUrl}/api/approve/${userId}?action=approve`
  const rejectUrl = `${siteUrl}/api/approve/${userId}?action=reject`

  try {
    await sendHtmlMail(
      'morethanmoneypt@gmail.com',
      '🔔 Novo Pedido de Registo — MoreThanMoney',
      registrationAdminEmailTemplate(userName, userEmail, approveUrl, rejectUrl, siteUrl),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}

export async function sendWelcomeEmail(userEmail: string, userName: string, username: string, lang: string = 'pt') {
  const siteUrl = getSiteUrl()
  const copy = ONBOARDING_EMAIL_COPY[lang] || ONBOARDING_EMAIL_COPY.pt
  try {
    await sendHtmlMail(
      userEmail,
      copy.subject, // assunto no idioma do membro
      // Onboarding mail atualizado (plano de 48h, traduzido, encaminha para /onboarding).
      onboardingLaunchEmailTemplate(userName, siteUrl, lang),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}

export async function sendPasswordRecoveryEmail(
  userEmail: string,
  userName: string,
  username: string,
  resetLink: string,
) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      '🔐 Recuperar password — MoreThanMoney',
      passwordRecoveryEmailTemplate(userName, userEmail, username, resetLink, siteUrl),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email de recuperação:', error)
    return { success: false, error }
  }
}

export async function sendPasswordChangedEmail(
  userEmail: string,
  userName: string,
  username: string,
) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      '✅ Password actualizada — MoreThanMoney',
      passwordChangedEmailTemplate(userName, userEmail, username, siteUrl),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar confirmação de password:', error)
    return { success: false, error }
  }
}

export async function sendScannerAccessEmail(
  userEmail: string,
  userName: string,
  scannerName: string,
  tradingviewUsername: string,
  /** Links dos scripts (lib/scanners/links-tradingview.ts → linksDoPlano(planId)). */
  scriptLinks: readonly { nome: string; url: string }[] = [],
) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      `🔓 Acesso ao ${scannerName} — instruções TradingView`,
      scannerAccessEmailTemplate(userName, scannerName, tradingviewUsername, siteUrl, scriptLinks),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email de acesso ao scanner:', error)
    return { success: false, error }
  }
}

export async function sendMTMcopierSetupNotification(
  userEmail: string,
  userName: string,
  telegramChannel?: string | null,
  mt5Server?: string | null,
  mt5Last4?: string | null,
) {
  try {
    await sendHtmlMail(
      'morethanmoneypt@gmail.com',
      `🔗 Novo addon MTMcopier activado — ${userName}`,
      `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#f8f9fa; padding:20px;">
        <div style="text-align:center; background:linear-gradient(135deg,#D2A63C,#BB8525); padding:24px; border-radius:12px 12px 0 0;">
          <img src="${getEmailLogoSrc()}" alt="MTM" width="140" />
        </div>
        <div style="background:white; padding:24px; border-radius:0 0 12px 12px;">
          <h2 style="color:#D2A63C;">Novo MTMcopier activado</h2>
          <p><strong>Nome:</strong> ${userName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Canal Telegram:</strong> ${telegramChannel || '—'}</p>
          <p><strong>Servidor MT5:</strong> ${mt5Server || '—'}</p>
          <p><strong>Conta MT5:</strong> ${mt5Last4 ? `····${mt5Last4}` : '—'}</p>
        </div>
      </div>
      `,
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar notificação MTMcopier:', error)
    return { success: false, error }
  }
}

export async function sendRejectionEmail(userEmail: string, userName: string) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      'Pedido de Registo — MoreThanMoney',
      registrationRejectedEmailTemplate(userName, siteUrl),
    )
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}

/**
 * Email pós-compra de um e-book: link para a Biblioteca e links diretos assinados (1 ano) para as
 * três línguas, para quem fecha a página antes de chegar à Biblioteca. Um só email, em PT, EN e ES,
 * porque o checkout não sabe em que língua a pessoa lê.
 */
export async function sendEbookPurchaseEmail(p: {
  to: string
  nome?: string | null
  titulo: string
  linkBiblioteca: string
  links: { pt: string; en: string; es: string }
}) {
  const ouro = '#D2A63C'
  const btn = (href: string, txt: string) =>
    `<a href="${href}" style="display:inline-block;background:${ouro};color:#0b0b0d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;margin:4px 6px 4px 0">${txt}</a>`
  const bloco = (titulo: string, texto: string, ler: string, link: string, biblioteca: string) =>
    `<h2 style="color:${ouro};font-size:18px;margin:28px 0 8px">${titulo}</h2><p style="margin:0 0 12px;line-height:1.55">${texto}</p>${btn(link, ler)}${btn(p.linkBiblioteca, biblioteca)}`
  const ola = p.nome ? `, ${p.nome.split(' ')[0]}` : ''
  const html = `<div style="font-family:Arial,sans-serif;background:#0b0b0d;color:#eee;padding:28px;border-radius:14px;max-width:600px">
<h1 style="color:#E9C46A;font-size:22px;margin:0 0 6px">«${p.titulo}»</h1>
${bloco(`Obrigado${ola}!`, 'O teu livro está pronto. Abre-o já no link abaixo (válido por um ano) ou, quando quiseres, na tua Biblioteca, com a conta com que compraste.', 'Ler em português', p.links.pt, 'A minha Biblioteca')}
${bloco('English', 'Your book is ready. Open it with the link below (valid for one year) or anytime in your Library.', 'Read in English', p.links.en, 'My Library')}
${bloco('Español', 'Tu libro está listo. Ábrelo con el enlace de abajo (válido un año) o cuando quieras en tu Biblioteca.', 'Leer en español', p.links.es, 'Mi Biblioteca')}
<p style="margin:28px 0 0;font-size:12px;color:#999">Conteúdo educativo, não constitui consultoria financeira. · MoreThanMoney.pt</p></div>`
  await sendHtmlMail(p.to, `O teu livro: «${p.titulo}» · Your book · Tu libro`, html)
}
