/**
 * O CÓDIGO DO AGENTE, DO LADO DO BROWSER — ler o que ficou guardado.
 *
 * Separado de `atribuicao.ts` porque aquele é puro e corre nos dois lados; isto toca em
 * `localStorage` e só existe no browser. Quem compra chama `codigoDeAgenteGuardado()` e manda o
 * que vier no corpo do checkout.
 */
import { CHAVE_GUARDADA, codigoQueVale, type Guardado } from './atribuicao'

/** O código que vale agora, ou nada. Nunca rebenta: sem atribuição compra-se na mesma. */
export function codigoDeAgenteGuardado(): string | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_GUARDADA)
    if (!bruto) return null
    return codigoQueVale(JSON.parse(bruto) as Guardado, Date.now())
  } catch {
    return null
  }
}
