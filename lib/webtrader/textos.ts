/**
 * TEXTOS DO WEBTRADER QUE VÊM DE CÓDIGOS — puro.
 *
 * O estado curto da conta (lib/mtmfunded/etiquetas.ts) é inglês de propósito: é a ETIQUETA que se
 * vê nas plataformas (Active, Breached…) e a cor pinta-se por ele. Dentro de uma FRASE em português
 * ficava «Conta Breached — só leitura»; aqui está a palavra portuguesa para essas frases.
 */
const EM_FRASE: Record<string, string> = {
  Active: 'activa', Breached: 'quebrada', Pause: 'em pausa', Closed: 'fechada', Pending: 'pendente',
}

export function estadoEmFrase(estadoCurto: string | null | undefined): string {
  const e = String(estadoCurto ?? '').trim()
  return EM_FRASE[e] ?? (e ? e.toLowerCase() : 'indisponível')
}
