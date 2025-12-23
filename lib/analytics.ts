// Serviço de Google Analytics e tracking
declare global {
  interface Window {
    gtag: (...args: any[]) => void
    dataLayer: any[]
  }
}

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID

// Verificar se o Analytics está habilitado
export const isAnalyticsEnabled = !!GA_TRACKING_ID

// Inicializar Google Analytics
export function initGA() {
  if (!isAnalyticsEnabled) return

  // Carregar script do Google Analytics
  const script1 = document.createElement("script")
  script1.async = true
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`
  document.head.appendChild(script1)

  // Configurar dataLayer
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }

  window.gtag("js", new Date())
  window.gtag("config", GA_TRACKING_ID, {
    page_title: document.title,
    page_location: window.location.href,
  })
}

// Rastrear visualização de página
export function trackPageView(url: string, title?: string) {
  if (!isAnalyticsEnabled) return

  window.gtag("config", GA_TRACKING_ID, {
    page_title: title || document.title,
    page_location: url,
  })
}

// Rastrear eventos personalizados
export function trackEvent(action: string, category: string, label?: string, value?: number) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", action, {
    event_category: category,
    event_label: label,
    value: value,
  })
}

// Eventos específicos para e-commerce
export function trackPurchase(transactionId: string, items: any[], value: number) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    value: value,
    currency: "EUR",
    items: items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      category: item.type || "produto",
      quantity: item.quantity,
      price: item.price,
    })),
  })
}

// Rastrear início do checkout
export function trackBeginCheckout(items: any[], value: number) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "begin_checkout", {
    currency: "EUR",
    value: value,
    items: items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      category: item.type || "produto",
      quantity: item.quantity,
      price: item.price,
    })),
  })
}

// Rastrear adição ao carrinho
export function trackAddToCart(item: any) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "add_to_cart", {
    currency: "EUR",
    value: item.price * item.quantity,
    items: [
      {
        item_id: item.id,
        item_name: item.name,
        category: item.type || "produto",
        quantity: item.quantity,
        price: item.price,
      },
    ],
  })
}

// Rastrear visualização de produto
export function trackViewItem(item: any) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "view_item", {
    currency: "EUR",
    value: item.price,
    items: [
      {
        item_id: item.id,
        item_name: item.name,
        category: item.type || "produto",
        price: item.price,
      },
    ],
  })
}

// Rastrear login
export function trackLogin(method = "email") {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "login", {
    method: method,
  })
}

// Rastrear registro
export function trackSignUp(method = "email") {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "sign_up", {
    method: method,
  })
}

// Rastrear conversões personalizadas
export function trackConversion(conversionName: string, value?: number) {
  if (!isAnalyticsEnabled) return

  window.gtag("event", "conversion", {
    send_to: `${GA_TRACKING_ID}/${conversionName}`,
    value: value,
    currency: "EUR",
  })
}

// Hook para usar analytics em componentes React
export function useAnalytics() {
  return {
    trackPageView,
    trackEvent,
    trackPurchase,
    trackBeginCheckout,
    trackAddToCart,
    trackViewItem,
    trackLogin,
    trackSignUp,
    trackConversion,
  }
}
