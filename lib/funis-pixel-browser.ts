/**
 * Pixel da Meta nos funis de publicidade — SÓ com consentimento (17/11/2026).
 *
 * Regras (RGPD + Lei 41/2004, art. 5.º: cookies não essenciais precisam de consentimento prévio):
 *  · sem `NEXT_PUBLIC_META_PIXEL_ID` não se carrega nada e não se mostra aviso nenhum;
 *  · sem «Aceitar» explícito o script da Meta nunca é pedido ao browser (nem o `fbevents.js`);
 *  · a escolha fica no browser e pode ser mudada (`limparEscolha`).
 *
 * Só browser. O servidor não sabe de nada disto.
 */
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

export const CHAVE_ESCOLHA = 'mtm_cookies_medicao'
export type Escolha = 'sim' | 'nao'

export function pixelId(): string {
  return (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim()
}

export function escolhaGuardada(): Escolha | null {
  try {
    const v = window.localStorage.getItem(CHAVE_ESCOLHA)
    return v === 'sim' || v === 'nao' ? v : null
  } catch {
    return null
  }
}

export function guardarEscolha(e: Escolha) {
  try {
    window.localStorage.setItem(CHAVE_ESCOLHA, e)
  } catch {
    /* modo privado: vale só para esta página */
  }
}

export function limparEscolha() {
  try {
    window.localStorage.removeItem(CHAVE_ESCOLHA)
  } catch {
    /* nada */
  }
}

/** Carrega o pixel (uma vez) e envia o PageView. Só chamar depois de «Aceitar». */
export function carregarPixel(): boolean {
  const id = pixelId()
  if (!id || typeof window === 'undefined') return false
  if (window.fbq) return true
  // O snippet oficial da Meta, reescrito sem `eval` e sem variáveis globais soltas.
  const f: Fbq = function (...args: unknown[]) {
    if (f.callMethod) f.callMethod(...args)
    else f.queue!.push(args)
  } as Fbq
  f.push = f
  f.loaded = true
  f.version = '2.0'
  f.queue = []
  window.fbq = f
  window._fbq = f
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  f('init', id)
  f('track', 'PageView')
  return true
}

/** Envia um evento se, e só se, o pixel já foi carregado com consentimento. */
export function rastrear(evento: 'ViewContent' | 'Lead' | 'Contact', params: Record<string, string> = {}) {
  try {
    if (escolhaGuardada() === 'sim' && window.fbq) window.fbq('track', evento, params)
  } catch {
    /* a medição nunca estraga a página */
  }
}
