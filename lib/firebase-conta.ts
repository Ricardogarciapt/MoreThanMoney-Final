/**
 * A conta de serviço do Firebase, lida de `FIREBASE_SERVICE_ACCOUNT_KEY`.
 *
 * A variável foi colada com um `\n` LITERAL (barra + n) depois do JSON. O `trim()` não o apanha e
 * o `JSON.parse` rebentava com «Unexpected non-whitespace character after JSON» — o firebase-admin
 * ficava por inicializar e o push para Android não saía, sem erro à vista (27/10). Aceita também a
 * chave privada com quebras de linha reais no meio, como antes.
 */
export function lerContaFirebase(bruto = process.env.FIREBASE_SERVICE_ACCOUNT_KEY): Record<string, unknown> | null {
  const limpo = (bruto ?? '').trim().replace(/(\\n|\s)+$/, '')
  if (!limpo) return null
  for (const t of [limpo, limpo.replace(/\n/g, '\\n')]) {
    try {
      return JSON.parse(t) as Record<string, unknown>
    } catch {
      /* tenta a forma seguinte */
    }
  }
  return null
}
