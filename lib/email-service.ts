import {
  passwordChangedEmailTemplate,
  passwordRecoveryEmailTemplate,
  registrationAdminEmailTemplate,
  registrationRejectedEmailTemplate,
  scannerAccessEmailTemplate,
  welcomeEmailTemplate,
  onboardingLaunchEmailTemplate,
} from './email-templates'
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

export async function sendWelcomeEmail(userEmail: string, userName: string, username: string) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      '🎉 Bem-vindo à MoreThanMoney — o teu onboarding está pronto!',
      // Onboarding mail atualizado (plano de 48h, encaminha para /onboarding).
      // O welcomeEmailTemplate (Fast Start) fica disponível como legado.
      onboardingLaunchEmailTemplate(userName, siteUrl),
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
) {
  const siteUrl = getSiteUrl()
  try {
    await sendHtmlMail(
      userEmail,
      `🔓 Acesso ao ${scannerName} — instruções TradingView`,
      scannerAccessEmailTemplate(userName, scannerName, tradingviewUsername, siteUrl),
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
