import nodemailer from 'nodemailer'

// Criar transporter com Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || ''
    }
  })
}

// Enviar email de notificação para admin
export async function sendRegistrationNotification(userEmail: string, userName: string, userId: string) {
  const transporter = createTransporter()
  
  const approveUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/approve/${userId}?action=approve`
  const rejectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/approve/${userId}?action=reject`

  const mailOptions = {
    from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
    to: 'morethanmoneypt@gmail.com',
    subject: '🔔 Novo Pedido de Registo - MoreThanMoney',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: #000; margin: 0;">🔔 Novo Pedido de Registo!</h1>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #efb810;">Informações do Candidato</h2>
          <table style="width: 100%; margin: 20px 0;">
            <tr><td style="padding: 8px 0;"><strong>Nome:</strong></td><td>${userName}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Email:</strong></td><td>${userEmail}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Data:</strong></td><td>${new Date().toLocaleString('pt-PT')}</td></tr>
          </table>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approveUrl}" style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px; font-weight: bold;">
              ✅ Aprovar Membro
            </a>
            <a href="${rejectUrl}" style="display: inline-block; background: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px; font-weight: bold;">
              ❌ Rejeitar
            </a>
          </div>
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}

// Enviar email de boas-vindas
export async function sendWelcomeEmail(userEmail: string, userName: string, username: string) {
  const transporter = createTransporter()

  const mailOptions = {
    from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: '🎉 Bem-vindo à MoreThanMoney!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: white; padding: 0;">
        <div style="background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); padding: 40px; text-align: center;">
          <h1 style="color: #000; margin: 0;">🎉 Bem-vindo à MoreThanMoney!</h1>
          <p style="color: #000; margin: 10px 0 0 0;">A tua jornada começa agora!</p>
        </div>
        
        <div style="padding: 30px;">
          <h2 style="color: #efb810;">Olá ${userName}! 👋</h2>
          <p style="line-height: 1.6;">Parabéns! A tua conta foi aprovada e agora fazes parte da família MoreThanMoney!</p>
          
          <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #efb810;">
            <h3 style="color: #efb810; margin: 0 0 15px 0;">🔐 Os Teus Dados de Login</h3>
            <p style="margin: 5px 0;"><strong style="color: #efb810;">Email:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;"><strong style="color: #efb810;">Username:</strong> ${username}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); color: #000; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">
              Fazer Login Agora
            </a>
          </div>
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}

// Enviar email com instruções de acesso aos scanners TradingView (após compra via Stripe)
export async function sendScannerAccessEmail(
  userEmail: string,
  userName: string,
  scannerName: string,
  tradingviewUsername: string
) {
  const transporter = createTransporter()

  const mailOptions = {
    from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: `🔓 Acesso ao ${scannerName} — instruções TradingView`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: white; padding: 0;">
        <div style="background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); padding: 40px; text-align: center;">
          <h1 style="color: #000; margin: 0;">🔓 Acesso Confirmado!</h1>
          <p style="color: #000; margin: 10px 0 0 0;">${scannerName}</p>
        </div>

        <div style="padding: 30px;">
          <h2 style="color: #efb810;">Olá ${userName}! 👋</h2>
          <p style="line-height: 1.6;">
            Obrigado pela tua compra! Vamos agora configurar o teu acesso ao indicador no TradingView.
          </p>

          <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #efb810;">
            <h3 style="color: #efb810; margin: 0 0 10px 0;">📋 O username que nos indicaste</h3>
            <p style="margin: 5px 0; font-size: 18px;"><strong>${tradingviewUsername}</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 13px; color: #999;">
              Vamos usar este username para te convidar para o script no TradingView. Se não estiver correto, responde a este email o quanto antes.
            </p>
          </div>

          <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #efb810; margin: 0 0 15px 0;">🔍 Como confirmar o teu username do TradingView</h3>
            <ol style="line-height: 1.8; padding-left: 20px; margin: 0;">
              <li>Inicia sessão em <a href="https://www.tradingview.com" style="color:#efb810;">tradingview.com</a></li>
              <li>Clica no teu avatar/foto de perfil (canto superior direito)</li>
              <li>Vai a <strong>"Perfil"</strong> — o teu username aparece no URL: tradingview.com/u/<strong>o-teu-username</strong>/</li>
              <li>Confirma que é exatamente esse o nome que nos enviaste (maiúsculas/minúsculas incluídas)</li>
            </ol>
          </div>

          <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #efb810; margin: 0 0 15px 0;">✅ Como aceitar o convite ao script (acesso por convite)</h3>
            <ol style="line-height: 1.8; padding-left: 20px; margin: 0;">
              <li>Vamos adicionar o teu username à lista de acesso do script — isto pode demorar até <strong>24h úteis</strong></li>
              <li>Quando o acesso for concedido, recebes uma notificação do TradingView (sino no canto superior)</li>
              <li>Abre um gráfico em <a href="https://www.tradingview.com/chart/" style="color:#efb810;">tradingview.com/chart</a></li>
              <li>Clica em <strong>"Indicadores"</strong> (no topo do gráfico) → separador <strong>"Os Meus Scripts"</strong> (Invite-only scripts)</li>
              <li>Vais ver o indicador disponível — clica para o adicionar ao gráfico</li>
            </ol>
            <p style="margin: 15px 0 0 0; font-size: 13px; color: #999;">
              💡 Dica: se não vires o script após 24h, confirma que o teu username está correto e contacta-nos a responder a este email.
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/scanner" style="display: inline-block; background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); color: #000; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">
              Ver os Meus Scanners
            </a>
          </div>

          <p style="line-height: 1.6; font-size: 13px; color: #999; text-align: center;">
            Qualquer dúvida, responde a este email — a equipa MoreThanMoney está aqui para ajudar. 🚀
          </p>
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email de acesso ao scanner:', error)
    return { success: false, error }
  }
}

// Notificar a equipa quando alguém ativa o addon MTMcopier (Telegram → MT5)
// — a ligação Telegram/MT5 é finalizada manualmente pela equipa por segurança,
// por isso este email é o gatilho para o follow-up de onboarding.
export async function sendMTMcopierSetupNotification(
  userEmail: string,
  userName: string,
  telegramChannel?: string | null,
  mt5Server?: string | null,
  mt5Last4?: string | null
) {
  const transporter = createTransporter()

  const mailOptions = {
    from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
    to: 'morethanmoneypt@gmail.com',
    subject: `🔗 Novo addon MTMcopier activado — ${userName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: #000; margin: 0;">🔗 Novo MTMcopier Activado!</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #efb810;">Dados para o onboarding manual</h2>
          <table style="width: 100%; margin: 20px 0;">
            <tr><td style="padding: 8px 0;"><strong>Nome:</strong></td><td>${userName}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Email:</strong></td><td>${userEmail}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Canal Telegram:</strong></td><td>${telegramChannel || '— (utilizador ainda não pré-configurou)'}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Servidor MT5:</strong></td><td>${mt5Server || '—'}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Conta MT5 (últimos dígitos):</strong></td><td>${mt5Last4 ? `····${mt5Last4}` : '—'}</td></tr>
          </table>
          <p style="line-height: 1.6;">
            Próximo passo: contactar o utilizador em canal seguro para finalizar a ligação
            (autenticação Telegram + ligação à conta MT5). Marcar como "connected" em
            <code>mtmcopy_connections</code> assim que estiver operacional.
          </p>
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar notificação MTMcopier:', error)
    return { success: false, error }
  }
}


// Enviar email de rejeição
export async function sendRejectionEmail(userEmail: string, userName: string) {
  const transporter = createTransporter()

  const mailOptions = {
    from: `"MoreThanMoney" <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: 'Pedido de Registo - MoreThanMoney',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: white; padding: 0;">
        <div style="background: linear-gradient(135deg, #efb810 0%, #f9db5c 100%); padding: 40px; text-align: center;">
          <h1 style="color: #000; margin: 0;">MoreThanMoney</h1>
        </div>
        
        <div style="padding: 30px;">
          <h2 style="color: #efb810;">Olá ${userName}</h2>
          <p style="line-height: 1.6;">Obrigado pelo seu interesse na MoreThanMoney.</p>
          <p style="line-height: 1.6;">Após análise do seu pedido, infelizmente não podemos aprovar o seu registo neste momento.</p>
          
          <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #efb810;">
            <p style="margin: 0;">Se tiver questões, pode contactar-nos:</p>
            <p style="margin: 10px 0;"><a href="mailto:morethanmoneypt@gmail.com" style="color: #efb810;">morethanmoneypt@gmail.com</a></p>
          </div>
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    console.error('Erro ao enviar email:', error)
    return { success: false, error }
  }
}
