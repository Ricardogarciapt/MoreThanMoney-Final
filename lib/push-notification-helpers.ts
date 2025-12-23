// Helper functions para enviar notificações push em diferentes eventos

interface SendPushPayload {
  userId?: string
  userIds?: string[]
  all?: boolean
  title: string
  body: string
  data?: Record<string, string>
  url?: string
  icon?: string
  tag?: string
}

export const sendPushNotification = async (payload: SendPushPayload) => {
  try {
    console.log('📤 [PUSH HELPER] Enviando notificação:', payload.title)
    
    const response = await fetch('/api/notifications/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      console.error('❌ [PUSH HELPER] Erro ao enviar:', await response.text())
      return false
    }
    
    const result = await response.json()
    console.log('✅ [PUSH HELPER] Enviado:', result)
    return true
  } catch (error) {
    console.error('❌ [PUSH HELPER] Erro:', error)
    return false
  }
}

// 1. Notificação quando alguém dá like no post
export const notifyPostLiked = async (postAuthorId: string, likerName: string) => {
  return sendPushNotification({
    userId: postAuthorId,
    title: '❤️ Novo Like!',
    body: `${likerName} gostou do teu post`,
    url: '/app-mobile',
    tag: 'post-like'
  })
}

// 2. Notificação quando alguém comenta no post
export const notifyPostCommented = async (
  postAuthorId: string,
  commenterName: string,
  commentPreview: string
) => {
  return sendPushNotification({
    userId: postAuthorId,
    title: '💬 Novo Comentário!',
    body: `${commenterName}: ${commentPreview.substring(0, 50)}${commentPreview.length > 50 ? '...' : ''}`,
    url: '/app-mobile',
    tag: 'post-comment'
  })
}

// 3. Notificação de oportunidade DCA (Forte Compra)
export const notifyDCAOpportunity = async (
  userIds: string[],
  symbol: string,
  discount: number
) => {
  return sendPushNotification({
    userIds,
    title: '🚀 Forte Compra Detectada!',
    body: `${symbol} está com ${discount.toFixed(1)}% de desconto. Oportunidade DCA!`,
    url: '/portfolios',
    tag: 'dca-opportunity',
    data: {
      symbol,
      discount: discount.toString()
    }
  })
}

// 4. Notificação de alerta de preço (Take Profit)
export const notifyTakeProfitHit = async (
  userId: string,
  symbol: string,
  currentPrice: number,
  targetPrice: number
) => {
  return sendPushNotification({
    userId,
    title: '🎯 Take Profit Atingido!',
    body: `${symbol} atingiu $${currentPrice.toLocaleString()} (alvo: $${targetPrice.toLocaleString()})`,
    url: '/app-mobile',
    tag: 'take-profit',
    data: {
      symbol,
      price: currentPrice.toString()
    }
  })
}

// 5. Notificação de alerta de preço (Stop Loss)
export const notifyStopLossHit = async (
  userId: string,
  symbol: string,
  currentPrice: number,
  stopPrice: number
) => {
  return sendPushNotification({
    userId,
    title: '⚠️ Stop Loss Atingido!',
    body: `${symbol} caiu para $${currentPrice.toLocaleString()} (stop: $${stopPrice.toLocaleString()})`,
    url: '/app-mobile',
    tag: 'stop-loss',
    data: {
      symbol,
      price: currentPrice.toString()
    }
  })
}

// 6. Notificação de novo conteúdo/trading idea
export const notifyNewTradingIdea = async (
  symbol: string,
  direction: 'BUY' | 'SELL',
  reason: string
) => {
  return sendPushNotification({
    all: true,
    title: `📈 Nova Ideia: ${symbol}`,
    body: `${direction === 'BUY' ? '🟢 Compra' : '🔴 Venda'} - ${reason}`,
    url: '/trading-ideas',
    tag: 'trading-idea',
    data: {
      symbol,
      direction
    }
  })
}

// 7. Notificação de novo post de VIP/Admin
export const notifyNewVIPPost = async (
  authorName: string,
  postPreview: string
) => {
  return sendPushNotification({
    all: true,
    title: `💎 ${authorName} publicou`,
    body: postPreview.substring(0, 100),
    url: '/app-mobile',
    tag: 'vip-post'
  })
}

// 8. Notificação de sistema (Admin)
export const notifySystemMessage = async (
  userId: string,
  title: string,
  message: string,
  url?: string
) => {
  return sendPushNotification({
    userId,
    title: `🔔 ${title}`,
    body: message,
    url: url || '/member-area',
    tag: 'system-message'
  })
}

// 9. Notificação de boas-vindas (novo usuário)
export const notifyWelcome = async (userId: string, userName: string) => {
  return sendPushNotification({
    userId,
    title: '👋 Bem-vindo ao MTM!',
    body: `Olá ${userName}! Explora a plataforma e ativa as notificações para não perderes nada.`,
    url: '/app-mobile',
    tag: 'welcome'
  })
}

// 10. Notificação de sincronização de portfolio
export const notifyPortfolioSync = async (
  userId: string,
  totalAssets: number,
  performance: number
) => {
  const emoji = performance >= 0 ? '📈' : '📉'
  const perfText = performance >= 0 ? `+${performance.toFixed(2)}%` : `${performance.toFixed(2)}%`
  
  return sendPushNotification({
    userId,
    title: `${emoji} Portfolio Atualizado`,
    body: `${totalAssets} ativos sincronizados. Performance: ${perfText}`,
    url: '/portfolios',
    tag: 'portfolio-sync'
  })
}

