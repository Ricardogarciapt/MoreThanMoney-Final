/**
 * OS IDS DE LIGAÇÃO QUE SE PODEM PEDIR À BASE DE DADOS.
 *
 * O `mtmcopy_signal_log` tem linhas com `connection_id` a NULL (sinais que ficaram sem ligação:
 * conta apagada, ordem sem cliente). Quem traduzia ligação → conta MetaApi juntava esses ids num
 * `.in('id', connIds)` sem os filtrar, e o PostgREST recebia `id=in.(null)` — que o Postgres recusa
 * com «invalid input syntax for type uuid: "null"». Foram ~980 erros em 2 h a 05/10, em todos os
 * ciclos do motor real (VPS) e do monitor T2T (Vercel), e o pedido inteiro falhava: nem as
 * ligações boas eram lidas nessa passagem.
 *
 * Puro: recebe o que vier das linhas e devolve só ids utilizáveis, sem repetidos.
 */
export function idsDeLigacao(rows: ReadonlyArray<{ connection_id?: unknown }>): string[] {
  const out = new Set<string>()
  for (const r of rows) {
    const id = r.connection_id
    if (typeof id !== 'string') continue
    const s = id.trim()
    // 'null'/'undefined' em texto aparecem quando alguém fez String(x) a um valor ausente
    if (!s || s === 'null' || s === 'undefined') continue
    out.add(s)
  }
  return [...out]
}
