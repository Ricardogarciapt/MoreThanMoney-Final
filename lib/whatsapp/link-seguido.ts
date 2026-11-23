/**
 * LINKS COM RASTO NO FUNIL DE WHATSAPP (23/11/2026).
 *
 * Pedido do Ricardo: «não deves perder o lead no tempo quando ele vai para fases dentro do site».
 * Até aqui o funil mandava `morethanmoney.pt/f/educacao` cru: a pessoa abria, saía do WhatsApp e
 * ficávamos sem saber nada. Agora cada link do funil passa por `/w/<código>`, que:
 *   1. grava o clique (quem, que rota, quando) — é o sinal para o seguimento «vi que espreitaste»;
 *   2. deixa um cookie `mtm_wa` para a agenda e o resto do site saberem de que lead se trata;
 *   3. redireciona para o destino com utm_source=whatsapp e utm_content=<código>.
 *
 * O código leva o número (base 36), o destino (uma letra, de uma tabela FIXA: não há redirecionamento
 * aberto) e uma assinatura HMAC curta, para ninguém fabricar cliques de outro número.
 *
 * PURO (só node:crypto): a guarda está em `link-seguido.check.ts`.
 */
import { createHmac } from 'node:crypto'

export const SITE = 'https://www.morethanmoney.pt'

/** Destinos possíveis. A letra vai no código; o caminho nunca vem do pedido. */
export const DESTINOS = {
  e: '/f/educacao',
  c: '/abrir-conta',
  f: '/mtmfunded',
  s: '/solucoes',
  h: '/',
  a: '/agendar?t=apresentacao',
} as const
export type LetraDestino = keyof typeof DESTINOS

export const COOKIE_WA = 'mtm_wa'

function segredo(): string {
  return process.env.WA_LINK_SECRET || process.env.CRON_SECRET || process.env.WHATSAPP_VERIFY_TOKEN || 'mtm-wa-link'
}

function assinatura(corpo: string, s = segredo()): string {
  return createHmac('sha256', s).update(corpo).digest('base64url').slice(0, 7)
}

/**
 * Código curto para um contacto + destino. `alvo` = número (com ou sem «+») ou `tg:<chat_id>` para o
 * Telegram (23/11): no Telegram a letra do destino vai em MAIÚSCULA, e é isso que distingue os canais.
 */
export function codigoDoLink(alvo: string, destino: LetraDestino, s?: string): string {
  const tg = String(alvo).startsWith('tg:')
  const d = String(alvo).replace(/\D/g, '')
  const corpo = `${BigInt(d || '0').toString(36)}${tg ? destino.toUpperCase() : destino}`
  return `${corpo}${assinatura(corpo, s)}`
}

/**
 * Lê e confirma um código. Devolve `null` se a assinatura não bater ou o destino não existir.
 * `e164` é o número com «+» no WhatsApp, ou `tg:<chat_id>` no Telegram.
 */
export function lerCodigo(codigo: string | null | undefined, s?: string): { e164: string; destino: LetraDestino; canal: 'whatsapp' | 'telegram' } | null {
  const c = String(codigo ?? '').trim()
  const m = /^([0-9a-z]+)([a-zA-Z])([A-Za-z0-9_-]{7})$/.exec(c)
  if (!m) return null
  const [, num36, letraBruta, sig] = m
  const tg = letraBruta !== letraBruta.toLowerCase()
  const letra = letraBruta.toLowerCase()
  if (!(letra in DESTINOS)) return null
  if (assinatura(`${num36}${letraBruta}`, s) !== sig) return null
  let digitos: string
  try {
    digitos = [...num36].reduce((acc, ch) => acc * BigInt(36) + BigInt(parseInt(ch, 36)), BigInt(0)).toString()
  } catch {
    return null
  }
  if (tg) {
    if (digitos.length < 4 || digitos.length > 16) return null
    return { e164: `tg:${digitos}`, destino: letra as LetraDestino, canal: 'telegram' }
  }
  if (digitos.length < 8 || digitos.length > 15) return null
  return { e164: `+${digitos}`, destino: letra as LetraDestino, canal: 'whatsapp' }
}

export function linkSeguido(e164: string, destino: LetraDestino, s?: string): string {
  return `${SITE}/w/${codigoDoLink(e164, destino, s)}`
}

/**
 * Troca os links do site num texto do funil pelos links com rasto. Só os destinos conhecidos:
 * qualquer outro endereço fica como está. `agenda` = o link da agenda que o guião usa (com ?ag=).
 */
export function seguirLinks(texto: string, e164: string, agenda?: string, s?: string): string {
  let t = texto
  if (agenda) t = t.split(agenda).join(linkSeguido(e164, 'a', s))
  const pares: Array<[string, LetraDestino]> = [
    [`${SITE}/f/educacao`, 'e'],
    [`${SITE}/abrir-conta`, 'c'],
    [`${SITE}/mtmfunded`, 'f'],
    [`${SITE}/solucoes`, 's'],
  ]
  for (const [url, letra] of pares) t = t.replace(new RegExp(`${url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w/-])`, 'g'), linkSeguido(e164, letra, s))
  // A página principal: o domínio sozinho, seguido de espaço, fim ou pontuação.
  t = t.replace(/https:\/\/www\.morethanmoney\.pt\/?(?=$|\s|[),.!?])/g, linkSeguido(e164, 'h', s))
  return t
}

/** Rota do funil → letra do destino (para o seguimento voltar a mandar o link certo). */
export function destinoDaRota(rota: string | null | undefined): LetraDestino {
  switch (rota) {
    case 'educacao':
      return 'e'
    case 'corretora':
      return 'c'
    case 'funded':
      return 'f'
    case 'solucoes':
      return 's'
    default:
      return 'h'
  }
}

/** URL final do redirecionamento, com as utm para a página e a agenda saberem a origem. */
export function urlDeDestino(destino: LetraDestino, codigo: string, rota?: string, canal: 'whatsapp' | 'telegram' = 'whatsapp'): string {
  const u = new URL(DESTINOS[destino], SITE)
  u.searchParams.set('utm_source', canal)
  u.searchParams.set('utm_medium', 'funil')
  u.searchParams.set('utm_campaign', rota || ({ e: 'educacao', c: 'corretora', f: 'funded', s: 'solucoes', h: 'curioso', a: 'agenda' } as const)[destino])
  u.searchParams.set('utm_content', codigo)
  return u.toString()
}
