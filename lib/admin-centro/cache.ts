/**
 * Cache de servidor do Centro de Controlo — por instância, com TTL e deduplicação de pedidos em curso.
 *
 * Porquê (Supabase caiu a 15/09): o painel abre-se em vários separadores e cada secção relê a cada
 * 15–30 s. Sem isto, N separadores = N× as mesmas consultas. Com isto, a mesma instância serve a
 * mesma leitura a todos durante o TTL, e dois pedidos simultâneos partilham UMA ida à base.
 *
 * Uma falha não fica em cache (o próximo pedido tenta outra vez), mas o último valor bom é devolvido
 * como `velho` para o painel não ficar em branco durante uma degradação.
 */

interface Entrada<T> {
  v: T
  em: number
}

const valores = new Map<string, Entrada<unknown>>()
const emCurso = new Map<string, Promise<unknown>>()

export interface Lido<T> {
  v: T
  /** epoch ms em que o valor foi lido da base */
  lidoEm: number
  /** true = a leitura nova falhou e isto é o último valor bom */
  velho: boolean
}

export async function emCache<T>(chave: string, ttlMs: number, ler: () => Promise<T>, agora = Date.now()): Promise<Lido<T>> {
  const e = valores.get(chave) as Entrada<T> | undefined
  if (e && agora - e.em < ttlMs) return { v: e.v, lidoEm: e.em, velho: false }
  let p = emCurso.get(chave) as Promise<T> | undefined
  if (!p) {
    p = ler().finally(() => emCurso.delete(chave))
    emCurso.set(chave, p)
  }
  try {
    const v = await p
    const em = Date.now()
    valores.set(chave, { v, em })
    return { v, lidoEm: em, velho: false }
  } catch (err) {
    if (e) return { v: e.v, lidoEm: e.em, velho: true }
    throw err
  }
}

export function esquecerCache(prefixo = ''): void {
  for (const k of [...valores.keys()]) if (k.startsWith(prefixo)) valores.delete(k)
}

/** Só para testes. */
export function __tamanhoCache(): number {
  return valores.size
}
