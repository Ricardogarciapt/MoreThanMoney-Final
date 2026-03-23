// =====================================================
// EMAIL TEMPLATES - MoreThanMoney
// Templates HTML premium com componentes visuais
// =====================================================

// Cores MTM
const COLORS = {
  primary: '#D2A63C',
  primaryDark: '#BB8525',
  gold: '#F4D03F',
  black: '#0a0a0a',
  white: '#ffffff',
  gray: '#f8f9fa',
  grayDark: '#1a1a1a',
}

// Base Template (wrapper comum)
const baseTemplate = (content: string, preheader?: string) => `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  ${preheader ? `<meta name="description" content="${preheader}">` : ''}
  <title>MoreThanMoney</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .card { padding: 20px !important; }
      .button { padding: 14px 24px !important; font-size: 14px !important; }
      .h1 { font-size: 24px !important; }
      .h2 { font-size: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #f0f0f0;">
  ${preheader ? `<div style="display: none; max-height: 0px; overflow: hidden;">${preheader}</div>` : ''}
  
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0f0f0; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="background: white; max-width: 600px; width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
          ${content}
        </table>
        
        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="max-width: 600px; width: 100%; margin-top: 20px;">
          <tr>
            <td style="padding: 20px; text-align: center; color: #666; font-size: 12px; line-height: 18px;">
              <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} MoreThanMoney. Todos os direitos reservados.</p>
              <p style="margin: 0 0 10px 0;">
                <a href="{{unsubscribe_url}}" style="color: #666; text-decoration: underline;">Cancelar subscrição</a> | 
                <a href="{{preferences_url}}" style="color: #666; text-decoration: underline;">Preferências</a>
              </p>
              <p style="margin: 0; color: #999;">
                MoreThanMoney, Lda. | Portugal
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

// Componente: Header Premium
const headerComponent = (title: string, subtitle?: string, icon?: string) => `
<tr>
  <td style="background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 50%, ${COLORS.gold} 100%); padding: 50px 30px; text-align: center; position: relative;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          ${icon ? `<div style="font-size: 64px; margin-bottom: 20px;">${icon}</div>` : ''}
          <h1 class="h1" style="color: ${COLORS.black}; font-size: 32px; font-weight: 900; margin: 0 0 10px 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ${title}
          </h1>
          ${subtitle ? `<p style="color: ${COLORS.black}; font-size: 16px; font-weight: 600; margin: 0; opacity: 0.9;">${subtitle}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>
`

// Componente: Card de Conteúdo
const cardComponent = (title: string, content: string, icon?: string, accentColor?: string) => `
<tr>
  <td style="padding: 30px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: ${COLORS.gray}; border-radius: 12px; border-left: 4px solid ${accentColor || COLORS.primary}; overflow: hidden;">
      <tr>
        <td style="padding: 25px;">
          ${icon ? `<div style="font-size: 32px; margin-bottom: 15px;">${icon}</div>` : ''}
          <h2 class="h2" style="color: ${accentColor || COLORS.primary}; font-size: 22px; font-weight: 700; margin: 0 0 15px 0;">
            ${title}
          </h2>
          <div style="color: #333; font-size: 15px; line-height: 24px;">
            ${content}
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>
`

// Componente: Botão CTA Premium
const buttonComponent = (text: string, url: string, variant: 'primary' | 'secondary' = 'primary') => {
  const bgColor = variant === 'primary' 
    ? `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`
    : `linear-gradient(135deg, #28a745 0%, #20c997 100%)`
  
  return `
<tr>
  <td style="padding: 10px 30px 30px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <a href="${url}" class="button" style="display: inline-block; background: ${bgColor}; color: ${variant === 'primary' ? COLORS.black : COLORS.white}; padding: 18px 40px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 6px 20px rgba(210, 166, 60, 0.4); transition: transform 0.3s;">
            ${text}
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>
`
}

// Componente: Estatísticas (3 colunas)
const statsComponent = (stats: Array<{ value: string; label: string; icon: string }>) => `
<tr>
  <td style="padding: 20px 30px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        ${stats.map(stat => `
          <td align="center" style="padding: 15px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: ${COLORS.grayDark}; border-radius: 12px; padding: 20px;">
              <tr>
                <td align="center">
                  <div style="font-size: 36px; margin-bottom: 10px;">${stat.icon}</div>
                  <div style="color: ${COLORS.primary}; font-size: 28px; font-weight: 900; margin-bottom: 5px;">${stat.value}</div>
                  <div style="color: #999; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${stat.label}</div>
                </td>
              </tr>
            </table>
          </td>
        `).join('')}
      </tr>
    </table>
  </td>
</tr>
`

// Componente: Lista de Features (com ícones)
const featuresListComponent = (features: Array<{ title: string; description: string; icon: string }>) => `
<tr>
  <td style="padding: 20px 30px;">
    ${features.map(feature => `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px; background: white; border: 2px solid ${COLORS.gray}; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="60" valign="top">
                  <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    ${feature.icon}
                  </div>
                </td>
                <td valign="top">
                  <h3 style="color: ${COLORS.black}; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">
                    ${feature.title}
                  </h3>
                  <p style="color: #666; font-size: 14px; line-height: 22px; margin: 0;">
                    ${feature.description}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `).join('')}
  </td>
</tr>
`

// Componente: Divider com estilo
const dividerComponent = () => `
<tr>
  <td style="padding: 20px 30px;">
    <div style="height: 2px; background: linear-gradient(90deg, transparent 0%, ${COLORS.primary} 50%, transparent 100%);"></div>
  </td>
</tr>
`

// Componente: Texto simples
const textComponent = (content: string) => `
<tr>
  <td style="padding: 0 30px 20px; color: #333; font-size: 15px; line-height: 24px;">
    ${content}
  </td>
</tr>
`

// Componente: Imagem destacada
const imageComponent = (imageUrl: string, alt: string, linkUrl?: string) => {
  const img = `<img src="${imageUrl}" alt="${alt}" style="width: 100%; height: auto; display: block; border-radius: 12px;" />`
  
  return `
<tr>
  <td style="padding: 20px 30px;">
    ${linkUrl ? `<a href="${linkUrl}">${img}</a>` : img}
  </td>
</tr>
`
}

// =====================================================
// TEMPLATES PRONTOS
// =====================================================

// 1. BEM-VINDO (Novo Registo)
export const welcomeEmailTemplate = (userName: string, userEmail: string, username: string, siteUrl: string) => {
  const content = `
    ${headerComponent('🎉 Bem-vindo à MoreThanMoney!', 'A tua jornada começa agora', '🚀')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">
        Olá ${userName}! 👋
      </h2>
      <p style="margin-bottom: 15px;">
        Parabéns! A tua conta foi <strong>aprovada</strong> e agora fazes parte da família MoreThanMoney!
      </p>
      <p style="margin-bottom: 15px;">
        Estamos entusiasmados por te ter connosco. Preparámos tudo para começares a tua jornada rumo à liberdade financeira.
      </p>
    `)}
    
    ${cardComponent(
      '🔐 Os Teus Dados de Acesso',
      `
        <table style="width: 100%; background: white; border-radius: 8px; padding: 15px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong style="color: ${COLORS.primary};">📧 Email:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: monospace;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong style="color: ${COLORS.primary};">👤 Username:</strong></td>
            <td style="padding: 8px 0; font-family: monospace;">${username}</td>
          </tr>
        </table>
      `,
      '🔑',
      COLORS.primary
    )}
    
    ${buttonComponent('🚀 Fazer Login Agora', `${siteUrl}/login`)}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="margin-bottom: 10px;"><strong>📱 Próximos Passos:</strong></p>
      <ol style="margin: 0; padding-left: 20px; line-height: 28px;">
        <li>Faz login na plataforma</li>
        <li>Explora os portfolios MTM</li>
        <li>Configura o teu dashboard mobile</li>
        <li>Junta-te à comunidade Skool</li>
      </ol>
    `)}
    
    ${textComponent(`
      <p style="margin-top: 20px; color: #666; font-size: 14px;">
        Vais receber mais emails com tutoriais e dicas para aproveitares ao máximo a plataforma.
      </p>
    `)}
  `
  
  return baseTemplate(content, 'Bem-vindo à MoreThanMoney! A tua conta foi aprovada.')
}

// 2. ONBOARDING - Dia 1
export const onboarding1EmailTemplate = (userName: string, siteUrl: string) => {
  const content = `
    ${headerComponent('📚 Bem-vindo ao MTM - Guia de Início', 'Passo 1: Conhece a Plataforma', '🎯')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}! 👋</h2>
      <p style="margin-bottom: 15px;">
        Bem-vindo ao primeiro email do teu <strong>Guia de Onboarding</strong>!
      </p>
      <p style="margin-bottom: 15px;">
        Nos próximos dias, vamos enviar-te tudo o que precisas para dominares a plataforma MoreThanMoney.
      </p>
    `)}
    
    ${featuresListComponent([
      {
        icon: '📊',
        title: 'Portfolios Profissionais',
        description: 'Acede aos portfolios MTM de Crypto e ETFs com análise IA em tempo real.'
      },
      {
        icon: '🎯',
        title: 'DCA Smart',
        description: 'Sistema inteligente que identifica as melhores oportunidades de compra com descontos.'
      },
      {
        icon: '📱',
        title: 'App Mobile',
        description: 'Dashboard mobile premium para acompanhar tudo em qualquer lugar.'
      },
      {
        icon: '👥',
        title: 'Comunidade Skool',
        description: 'Junta-te à comunidade exclusiva MTM no Skool para networking e aprendizagem.'
      }
    ])}
    
    ${buttonComponent('🚀 Explorar a Plataforma', `${siteUrl}/new-landing`)}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="background: ${COLORS.gray}; padding: 15px; border-radius: 8px; margin: 0;">
        <strong style="color: ${COLORS.primary};">💡 Dica do Dia:</strong><br>
        Começa por explorar a aba <strong>"Portfolios"</strong> para veres como estruturamos os nossos investimentos.
      </p>
    `)}
    
    ${textComponent(`
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        <strong>Amanhã:</strong> Vais aprender a usar o App Mobile e configurar notificações push!
      </p>
    `)}
  `
  
  return baseTemplate(content, 'Guia de Onboarding MTM - Passo 1')
}

// 3. ONBOARDING - Dia 2 (App Mobile)
export const onboarding2EmailTemplate = (userName: string, siteUrl: string) => {
  const content = `
    ${headerComponent('📱 App Mobile MTM', 'Passo 2: Dashboard no Bolso', '🚀')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}!</h2>
      <p style="margin-bottom: 15px;">
        Hoje vais aprender a usar o <strong>App Mobile MTM</strong> - o teu dashboard premium sempre disponível!
      </p>
    `)}
    
    ${cardComponent(
      '⚡ Início Rápido - 3 Passos',
      `
        <ol style="margin: 0; padding-left: 20px; line-height: 28px;">
          <li><strong>Acede a /app-mobile</strong> no teu telemóvel</li>
          <li><strong>Ativa notificações push</strong> para alertas DCA</li>
          <li><strong>Adiciona ao ecrã inicial</strong> para acesso rápido</li>
        </ol>
      `,
      '📲',
      '#28a745'
    )}
    
    ${statsComponent([
      { value: '24/7', label: 'Disponível', icon: '⏰' },
      { value: '100%', label: 'Sincronizado', icon: '🔄' },
      { value: 'Real-Time', label: 'Preços', icon: '📊' }
    ])}
    
    ${buttonComponent('📱 Abrir App Mobile', `${siteUrl}/app-mobile`, 'secondary')}
    
    ${dividerComponent()}
    
    ${featuresListComponent([
      {
        icon: '🔔',
        title: 'Notificações Push',
        description: 'Recebe alertas instantâneos quando surgirem oportunidades DCA ou alertas de preço.'
      },
      {
        icon: '📊',
        title: 'Dashboard Premium',
        description: 'Visualiza portfolios, TP/SL, e performance em tempo real com design elegante.'
      },
      {
        icon: '⚡',
        title: 'Ultra Rápido',
        description: 'Carregamento instantâneo e experiência fluida, mesmo com conexão lenta.'
      }
    ])}
    
    ${textComponent(`
      <p style="background: ${COLORS.gray}; padding: 15px; border-radius: 8px; margin: 0;">
        <strong style="color: ${COLORS.primary};">💡 Dica Pro:</strong><br>
        No Safari (iPhone) ou Chrome (Android), clica em "Adicionar ao Ecrã Inicial" para usar como app nativa!
      </p>
    `)}
  `
  
  return baseTemplate(content, 'App Mobile MTM - Teu dashboard no bolso')
}

// 4. ONBOARDING - Dia 3 (Scanners & Portfolios)
export const onboarding3EmailTemplate = (userName: string, siteUrl: string) => {
  const content = `
    ${headerComponent('🔍 Scanners & Portfolios', 'Passo 3: Ferramentas Profissionais', '🎯')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}!</h2>
      <p style="margin-bottom: 15px;">
        Hoje vais conhecer as ferramentas que diferenciam o MTM de qualquer outra plataforma.
      </p>
    `)}
    
    ${cardComponent(
      '📊 Portfolio MTM Crypto',
      `
        <p style="margin-bottom: 10px;">Acesso aos <strong>20 melhores ativos crypto</strong> selecionados pela nossa equipa:</p>
        <ul style="margin: 0; padding-left: 20px; line-height: 26px;">
          <li>✅ TP/SL validados por IA</li>
          <li>✅ Análise técnica profissional</li>
          <li>✅ Alocação otimizada</li>
          <li>✅ Updates em tempo real</li>
        </ul>
      `,
      '💎',
      COLORS.primary
    )}
    
    ${cardComponent(
      '🔍 DCA Smart Scanner',
      `
        <p style="margin-bottom: 10px;">Sistema inteligente que <strong>identifica oportunidades</strong> automaticamente:</p>
        <ul style="margin: 0; padding-left: 20px; line-height: 26px;">
          <li>🚀 Forte Compra (desconto ≥15%)</li>
          <li>💰 Compra (desconto 10-15%)</li>
          <li>📈 Hold (mercado estável)</li>
          <li>🔔 Notificações diárias às 10h</li>
        </ul>
      `,
      '🎯',
      '#28a745'
    )}
    
    ${buttonComponent('📊 Ver Portfolios Agora', `${siteUrl}/portfolios`)}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="background: ${COLORS.grayDark}; color: white; padding: 20px; border-radius: 12px; margin: 0;">
        <strong style="color: ${COLORS.gold}; font-size: 18px;">💡 Como Usar o DCA Smart:</strong><br><br>
        1️⃣ Acede à aba <strong>"Portfolios"</strong><br>
        2️⃣ Clica em <strong>"DCA Opportunities"</strong><br>
        3️⃣ Vê as análises e descontos<br>
        4️⃣ Investe nos ativos com maior desconto<br>
        5️⃣ Recebe notificações diárias automáticas
      </p>
    `)}
  `
  
  return baseTemplate(content, 'Scanners & Portfolios MTM - Ferramentas profissionais')
}

// 5. ONBOARDING - Dia 5 (Skool Community)
export const onboarding4EmailTemplate = (userName: string, skoolUrl: string) => {
  const content = `
    ${headerComponent('👥 Comunidade Skool MTM', 'Passo 4: Junta-te à Família', '🌟')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}!</h2>
      <p style="margin-bottom: 15px;">
        É hora de conheceres a <strong>comunidade mais ativa</strong> de investidores em Portugal!
      </p>
      <p style="margin-bottom: 15px;">
        O Skool MTM é onde a magia acontece - networking, dicas exclusivas, e suporte 24/7.
      </p>
    `)}
    
    ${statsComponent([
      { value: '500+', label: 'Membros', icon: '👥' },
      { value: '24/7', label: 'Suporte', icon: '💬' },
      { value: '100%', label: 'Grátis', icon: '🎁' }
    ])}
    
    ${featuresListComponent([
      {
        icon: '📚',
        title: 'Conteúdo Exclusivo',
        description: 'Acesso a cursos, webinars, e materiais educativos disponíveis apenas para membros.'
      },
      {
        icon: '💬',
        title: 'Discussões Diárias',
        description: 'Participa em discussões sobre mercado, estratégias, e partilha as tuas vitórias.'
      },
      {
        icon: '🎯',
        title: 'Challenges & Eventos',
        description: 'Participa em challenges mensais e eventos ao vivo com a equipa MTM.'
      },
      {
        icon: '🏆',
        title: 'Networking',
        description: 'Conhece outros investidores, cria parcerias, e cresce em comunidade.'
      }
    ])}
    
    ${buttonComponent('🚀 Entrar no Skool MTM', skoolUrl || 'https://www.skool.com/morethanmoney-1132/about')}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="background: ${COLORS.gray}; padding: 15px; border-radius: 8px; margin: 0;">
        <strong style="color: ${COLORS.primary};">💎 Benefício VIP:</strong><br>
        Membros VIP têm acesso a canais privados, calls exclusivas, e suporte prioritário!
      </p>
    `)}
  `
  
  return baseTemplate(content, 'Junta-te à Comunidade Skool MTM')
}

// 6. AGENDAMENTO DE ONBOARDING (Calendly)
export const onboardingScheduleEmailTemplate = (userName: string, calendlyUrl: string, siteUrl: string) => {
  const content = `
    ${headerComponent('📅 Agende o Teu Onboarding', 'Sessão 1-on-1 com a Equipa MTM', '🎯')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}! 👋</h2>
      <p style="margin-bottom: 15px;">
        Para te ajudar a <strong>começar da melhor forma</strong>, oferecemos uma <strong>sessão de onboarding gratuita</strong>!
      </p>
      <p style="margin-bottom: 15px;">
        Numa chamada de <strong>30 minutos</strong>, vamos:
      </p>
    `)}
    
    ${featuresListComponent([
      {
        icon: '🎯',
        title: 'Conhecer os Teus Objetivos',
        description: 'Vamos entender onde estás e onde queres chegar nos investimentos.'
      },
      {
        icon: '🚀',
        title: 'Tour pela Plataforma',
        description: 'Mostramos-te como usar todas as ferramentas: portfolios, DCA, app mobile.'
      },
      {
        icon: '💡',
        title: 'Estratégia Personalizada',
        description: 'Damos-te dicas específicas para o teu perfil de investidor.'
      },
      {
        icon: '❓',
        title: 'Tira Todas as Dúvidas',
        description: 'Tempo exclusivo para perguntas e esclarecimentos.'
      }
    ])}
    
    ${cardComponent(
      '⏰ Duração: 30 Minutos',
      `
        <p style="margin-bottom: 10px;">✅ <strong>100% Gratuito</strong></p>
        <p style="margin-bottom: 10px;">✅ <strong>Sem Compromisso</strong></p>
        <p style="margin-bottom: 10px;">✅ <strong>Horários Flexíveis</strong></p>
        <p style="margin: 0;">✅ <strong>Online via Zoom/Meet</strong></p>
      `,
      '📞',
      '#28a745'
    )}
    
    ${buttonComponent('📅 Escolher Horário Agora', calendlyUrl)}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="background: ${COLORS.grayDark}; color: white; padding: 20px; border-radius: 12px; margin: 0;">
        <strong style="color: ${COLORS.gold}; font-size: 18px;">💡 Porque Agendar?</strong><br><br>
        Membros que fazem onboarding têm <strong>3x mais resultados</strong> nos primeiros 30 dias!<br><br>
        Aproveita esta oportunidade de ter suporte dedicado da nossa equipa.
      </p>
    `)}
    
    ${textComponent(`
      <p style="text-align: center; margin-top: 20px;">
        <a href="${calendlyUrl}" style="color: ${COLORS.primary}; text-decoration: underline;">
          Ver horários disponíveis
        </a>
      </p>
    `)}
  `
  
  return baseTemplate(content, 'Agende o seu onboarding gratuito com a equipa MTM')
}

// 7. VISÃO CONJUNTA MTM (Anúncio Especial)
export const visionAnnouncementEmailTemplate = (userName: string, siteUrl: string) => {
  const content = `
    ${headerComponent('🚀 A Nossa Jornada Juntos', 'MoreThanMoney - Mais do que Dinheiro, uma Comunidade', '✨')}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}! 👋</h2>
      <p style="margin-bottom: 15px; font-size: 16px;">
        Hoje queremos partilhar algo especial contigo. Não é apenas uma atualização - é uma <strong>celebração</strong>.
      </p>
      <p style="margin-bottom: 15px; font-size: 16px;">
        A <strong>MoreThanMoney</strong> não é apenas uma plataforma. É o resultado de uma <strong>visão conjunta</strong> construída por pessoas como tu.
      </p>
    `)}
    
    ${dividerComponent()}
    
    ${cardComponent(
      '🌟 A Nossa Missão',
      `
        <p style="margin-bottom: 15px; font-size: 15px; line-height: 28px;">
          Criámos a MTM com um propósito claro: <strong>democratizar o acesso a investimentos inteligentes</strong>.
        </p>
        <p style="margin-bottom: 15px; font-size: 15px; line-height: 28px;">
          Num mundo onde a informação financeira é complexa e inacessível, decidimos fazer diferente.
        </p>
        <p style="margin: 0; font-size: 15px; line-height: 28px;">
          Cada membro, cada discussão, cada partilha - tudo isso constrói algo <strong>maior do que nós</strong>.
        </p>
      `,
      '🎯',
      COLORS.primary
    )}
    
    ${statsComponent([
      { value: '500+', label: 'Membros Ativos', icon: '👥' },
      { value: '20+', label: 'Ativos Analisados', icon: '💎' },
      { value: '24/7', label: 'Suporte', icon: '🛡️' }
    ])}
    
    ${textComponent(`
      <div style="background: linear-gradient(135deg, ${COLORS.grayDark} 0%, #000000 100%); padding: 30px; border-radius: 16px; border-left: 4px solid ${COLORS.primary}; margin: 30px 0;">
        <h3 style="color: ${COLORS.gold}; font-size: 22px; margin: 0 0 20px 0; text-align: center;">
          ✨ O Que Conquistámos Juntos
        </h3>
        <div style="display: grid; gap: 15px;">
          <div style="display: flex; align-items: start; gap: 15px;">
            <div style="font-size: 28px;">📊</div>
            <div>
              <strong style="color: ${COLORS.primary}; display: block; margin-bottom: 5px;">Portfolios Profissionais</strong>
              <p style="color: #ccc; margin: 0; font-size: 14px;">
                Análise técnica completa de Crypto e ETFs, actualizada em tempo real com TP/SL validados por IA.
              </p>
            </div>
          </div>
          
          <div style="display: flex; align-items: start; gap: 15px;">
            <div style="font-size: 28px;">🤖</div>
            <div>
              <strong style="color: ${COLORS.primary}; display: block; margin-bottom: 5px;">DCA Smart Scanner</strong>
              <p style="color: #ccc; margin: 0; font-size: 14px;">
                Sistema inteligente que identifica oportunidades de compra automaticamente, enviando alertas diários.
              </p>
            </div>
          </div>
          
          <div style="display: flex; align-items: start; gap: 15px;">
            <div style="font-size: 28px;">📱</div>
            <div>
              <strong style="color: ${COLORS.primary}; display: block; margin-bottom: 5px;">App Mobile Premium</strong>
              <p style="color: #ccc; margin: 0; font-size: 14px;">
                Dashboard mobile com notificações push, sincronizado 24/7 com os teus investimentos.
              </p>
            </div>
          </div>
          
          <div style="display: flex; align-items: start; gap: 15px;">
            <div style="font-size: 28px;">👥</div>
            <div>
              <strong style="color: ${COLORS.primary}; display: block; margin-bottom: 5px;">Comunidade Skool</strong>
              <p style="color: #ccc; margin: 0; font-size: 14px;">
                Espaço exclusivo para networking, partilha de conhecimento e crescimento conjunto.
              </p>
            </div>
          </div>
          
          <div style="display: flex; align-items: start; gap: 15px;">
            <div style="font-size: 28px;">🎓</div>
            <div>
              <strong style="color: ${COLORS.primary}; display: block; margin-bottom: 5px;">Biblioteca de Documentos</strong>
              <p style="color: #ccc; margin: 0; font-size: 14px;">
                Recursos educativos exclusivos partilhados pelos educadores VIP e equipa MTM.
              </p>
            </div>
          </div>
        </div>
      </div>
    `)}
    
    ${dividerComponent()}
    
    ${cardComponent(
      '💡 A Visão que Nos Move',
      `
        <p style="margin-bottom: 15px; font-size: 15px; line-height: 28px;">
          Não queremos ser apenas <strong>"mais uma plataforma de trading"</strong>.
        </p>
        <p style="margin-bottom: 15px; font-size: 15px; line-height: 28px;">
          Queremos ser o <strong>ecossistema</strong> onde investidores de todos os níveis encontram:
        </p>
        <ul style="margin: 0; padding-left: 20px; line-height: 32px; font-size: 15px;">
          <li><strong>Ferramentas profissionais</strong> acessíveis</li>
          <li><strong>Educação de qualidade</strong> contínua</li>
          <li><strong>Comunidade</strong> que se apoia mutuamente</li>
          <li><strong>Transparência</strong> em cada decisão</li>
          <li><strong>Inovação</strong> constante</li>
        </ul>
      `,
      '🎯',
      '#28a745'
    )}
    
    ${textComponent(`
      <div style="text-align: center; padding: 40px 20px; background: linear-gradient(135deg, rgba(210, 166, 60, 0.1) 0%, rgba(187, 133, 37, 0.1) 100%); border-radius: 16px; margin: 30px 0;">
        <div style="font-size: 48px; margin-bottom: 20px;">🙏</div>
        <h3 style="color: ${COLORS.primary}; font-size: 28px; margin: 0 0 20px 0;">
          Obrigado por Fazeres Parte
        </h3>
        <p style="color: white; font-size: 18px; line-height: 32px; margin: 0; max-width: 600px; margin: 0 auto;">
          Cada membro, cada feedback, cada partilha na comunidade - tudo isso constrói a MTM.
          <br><br>
          <strong style="color: ${COLORS.gold};">És mais do que um utilizador. És parte da visão.</strong>
        </p>
      </div>
    `)}
    
    ${featuresListComponent([
      {
        icon: '🚀',
        title: 'O Que Vem a Seguir',
        description: 'Novos scanners, análises de IA ainda mais precisas, expansão para novos mercados e muito mais. Tudo construído com o teu feedback.'
      },
      {
        icon: '💬',
        title: 'A Tua Voz Importa',
        description: 'Queremos ouvir-te! Junta-te às discussões no Skool, partilha as tuas ideias e ajuda-nos a construir o futuro da MTM.'
      },
      {
        icon: '🎯',
        title: 'Compromisso com a Excelência',
        description: 'Não paramos. Cada dia trabalhamos para trazer mais valor, mais ferramentas e mais oportunidades para toda a comunidade.'
      }
    ])}
    
    ${buttonComponent('🚀 Explorar a Plataforma', `${siteUrl}/new-landing`)}
    ${buttonComponent('💬 Entrar na Comunidade', 'https://www.skool.com/morethanmoney-1132/about', 'secondary')}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <div style="background: ${COLORS.grayDark}; padding: 25px; border-radius: 12px; text-align: center; margin: 20px 0;">
        <p style="color: ${COLORS.primary}; font-size: 20px; font-weight: 700; margin: 0 0 15px 0;">
          "O sucesso não é medido apenas em lucros."
        </p>
        <p style="color: white; font-size: 16px; margin: 0 0 10px 0;">
          É medido na <strong>comunidade que construímos</strong>,<br>
          no <strong>conhecimento que partilhamos</strong>,<br>
          e no <strong>impacto que criamos juntos</strong>.
        </p>
        <p style="color: ${COLORS.gold}; font-size: 14px; margin: 15px 0 0 0; font-style: italic;">
          — Equipa MoreThanMoney
        </p>
      </div>
    `)}
    
    ${textComponent(`
      <p style="text-align: center; color: #999; font-size: 14px; margin-top: 30px;">
        Vemo-nos na plataforma! 💪<br>
        Continua a investir com inteligência. Continua a crescer connosco.
      </p>
    `)}
  `
  
  return baseTemplate(content, 'A Nossa Jornada Juntos - MoreThanMoney é mais do que uma plataforma')
}

// 8. DCA OPPORTUNITY ALERT (Notificação de Oportunidade)
export const dcaOpportunityEmailTemplate = (
  userName: string,
  opportunities: Array<{ name: string; discount: number; category: string }>,
  siteUrl: string
) => {
  const strongBuys = opportunities.filter(o => o.discount >= 15)
  const buys = opportunities.filter(o => o.discount >= 10 && o.discount < 15)
  
  const content = `
    ${headerComponent(
      `🚀 ${strongBuys.length} Oportunidades DCA Detectadas!`,
      'Análise diária do mercado',
      '💎'
    )}
    
    ${textComponent(`
      <h2 style="color: ${COLORS.primary}; margin-bottom: 15px;">Olá ${userName}!</h2>
      <p style="margin-bottom: 15px;">
        O scanner DCA Smart identificou <strong>${opportunities.length} oportunidades</strong> de compra hoje!
      </p>
    `)}
    
    ${strongBuys.length > 0 ? `
      <tr>
        <td style="padding: 0 30px 20px;">
          <h3 style="color: #28a745; font-size: 20px; margin: 0 0 15px 0;">🚀 Forte Compra (≥15%)</h3>
          ${strongBuys.map(opp => `
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(135deg, rgba(40, 167, 69, 0.1) 0%, rgba(32, 201, 151, 0.1) 100%); border: 2px solid #28a745; border-radius: 12px; margin-bottom: 10px; overflow: hidden;">
              <tr>
                <td style="padding: 15px 20px;">
                  <table width="100%">
                    <tr>
                      <td>
                        <strong style="color: #28a745; font-size: 18px;">${opp.name}</strong>
                        <div style="color: #666; font-size: 13px; margin-top: 5px;">${opp.category}</div>
                      </td>
                      <td align="right">
                        <div style="background: #28a745; color: white; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 18px;">
                          ${opp.discount.toFixed(1)}%
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          `).join('')}
        </td>
      </tr>
    ` : ''}
    
    ${buys.length > 0 ? `
      <tr>
        <td style="padding: 0 30px 20px;">
          <h3 style="color: ${COLORS.primary}; font-size: 20px; margin: 0 0 15px 0;">💰 Compra (10-15%)</h3>
          ${buys.map(opp => `
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(135deg, rgba(210, 166, 60, 0.1) 0%, rgba(244, 208, 63, 0.1) 100%); border: 2px solid ${COLORS.primary}; border-radius: 12px; margin-bottom: 10px; overflow: hidden;">
              <tr>
                <td style="padding: 15px 20px;">
                  <table width="100%">
                    <tr>
                      <td>
                        <strong style="color: ${COLORS.primary}; font-size: 18px;">${opp.name}</strong>
                        <div style="color: #666; font-size: 13px; margin-top: 5px;">${opp.category}</div>
                      </td>
                      <td align="right">
                        <div style="background: ${COLORS.primary}; color: ${COLORS.black}; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 18px;">
                          ${opp.discount.toFixed(1)}%
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          `).join('')}
        </td>
      </tr>
    ` : ''}
    
    ${buttonComponent('📊 Ver Análise Completa', `${siteUrl}/portfolios`)}
    
    ${dividerComponent()}
    
    ${textComponent(`
      <p style="background: ${COLORS.grayDark}; color: white; padding: 20px; border-radius: 12px; margin: 0;">
        <strong style="color: ${COLORS.gold};">💡 Como Aproveitar:</strong><br><br>
        1️⃣ Revê a análise completa no dashboard<br>
        2️⃣ Verifica os TP/SL sugeridos<br>
        3️⃣ Investe gradualmente (DCA)<br>
        4️⃣ Acompanha a evolução no app mobile
      </p>
    `)}
  `
  
  return baseTemplate(content, `${opportunities.length} oportunidades DCA detectadas!`)
}

// Export all components for custom templates
export const components = {
  header: headerComponent,
  card: cardComponent,
  button: buttonComponent,
  stats: statsComponent,
  features: featuresListComponent,
  divider: dividerComponent,
  text: textComponent,
  image: imageComponent,
}

export const createCustomTemplate = (content: string, preheader?: string) => {
  return baseTemplate(content, preheader)
}

