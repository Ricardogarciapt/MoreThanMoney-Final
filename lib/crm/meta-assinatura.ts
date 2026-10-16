import { createHmac, timingSafeEqual } from 'node:crypto'

/** Meta assina os bytes originais, não o JSON reserializado. Sem segredo, recusa. */
export function assinaturaMetaValida(corpo: string, assinatura: string | null, segredo: string | undefined): boolean {
  if (!segredo || !assinatura || !/^sha256=[a-f0-9]{64}$/.test(assinatura)) return false
  const recebido = Buffer.from(assinatura.slice(7), 'hex')
  const esperado = createHmac('sha256', segredo).update(corpo).digest()
  return timingSafeEqual(recebido, esperado)
}
