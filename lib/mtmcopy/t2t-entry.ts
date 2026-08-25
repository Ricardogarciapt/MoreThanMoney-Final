import type { ParsedSignal } from './signal-parser'

/**
 * Entrada que o Tap to Trade usa — o PRIMEIRO nível da zona, não a ponta.
 *
 * «Gold Buy Zone 4643 - 4637»: o parser dá 4637 porque é a ponta, o preço mais vantajoso, e é
 * isso que a conta provedora quer (pode esperar pela reacção, e o monitor de preço acompanha-a).
 * O cliente que carrega no botão quer é ficar dentro da trade: à ponta a ordem fica muitas vezes
 * pendente enquanto o preço arranca do primeiro nível. Aqui manda o primeiro nível tal como o
 * trader o escreveu, e a ordem entra como limite nesse preço.
 *
 * Sinais sem zona (entrada única, «now»/mercado) ficam exactamente como estão.
 */
export function entradaT2T(signal: ParsedSignal): ParsedSignal {
  const primeiro = signal.zoneFirst ?? null
  if (primeiro == null || !(primeiro > 0)) return signal
  if (signal.entry === primeiro) return signal
  return { ...signal, entry: primeiro }
}
