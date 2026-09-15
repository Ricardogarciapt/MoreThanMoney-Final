/**
 * Caches de LEITURAS da MetaApi que custam créditos e mudam pouco.
 *
 * Porque existe: a MetaApi cobra por pedido, e havia leituras caras repetidas sem necessidade —
 * a lista de símbolos da conta (`getSymbols`, ~500 créditos) era pedida em CADA ordem, em cada
 * cálculo de lote e em cada leitura de especificação, e os ecrãs de saldo liam a informação da
 * conta de cada vez que alguém abria a página.
 *
 * A REGRA que manda neste ficheiro: só se guarda o que NÃO decide uma ordem com números velhos.
 *  - Lista de símbolos e especificação do símbolo (dígitos, ponto, lote mínimo…) → 1 hora. São
 *    configuração da corretora, não mercado. Se uma ordem falhar, quem chama invalida (ver
 *    `invalidarLeiturasDeSimbolos`) e a próxima vai buscar tudo fresco.
 *  - Informação da conta (saldo/equity) → 45 s, e SÓ para ecrãs. Nenhum caminho de execução
 *    (lote por risco, gestão, fecho) usa `lerInfoContaCache`.
 *  - Preços e posições NUNCA passam por aqui.
 *
 * Os mapas vivem na memória do módulo: numa função serverless «quente» sobrevivem entre pedidos;
 * num arranque a frio começam vazios — o pior caso é o comportamento antigo, nunca pior.
 */

type Entrada<V> = { valor: V; expiraEm: number }

export interface CacheTtl<V> {
  /**
   * Devolve o valor guardado se ainda for válido; senão chama `carregar` (uma só vez por chave,
   * mesmo com vários pedidos em simultâneo).
   *
   * `aceitavel` serve para o caso «não encontrei o símbolo na lista guardada»: se o valor em
   * cache não serve, é descartado e lê-se UMA vez de novo. O valor fresco é devolvido mesmo que
   * também não sirva — assim nunca há ciclos de releitura.
   */
  obter(chave: string, carregar: () => Promise<V | null | undefined>, aceitavel?: (v: V) => boolean): Promise<V | null>
  invalidar(chave: string): void
  /** Invalida todas as chaves que começam por `prefixo` (ex.: todas as specs de uma conta). */
  invalidarPrefixo(prefixo: string): void
  limpar(): void
  /** Só para testes/diagnóstico. */
  tamanho(): number
}

/**
 * Cache com prazo e deduplicação de pedidos em curso.
 *
 * Só guarda resultados BONS: `null`/`undefined` e erros não ficam guardados, para que uma falha
 * transitória da MetaApi não se prolongue por uma hora. O erro é relançado a quem chamou, tal
 * como acontecia sem cache.
 */
export function criarCacheTtl<V>(ttlMs: number, agora: () => number = Date.now): CacheTtl<V> {
  const entradas = new Map<string, Entrada<V>>()
  const emCurso = new Map<string, Promise<V | null>>()

  const carregarUmaVez = (chave: string, carregar: () => Promise<V | null | undefined>): Promise<V | null> => {
    const pendente = emCurso.get(chave)
    if (pendente) return pendente
    const p = (async () => {
      try {
        const v = await carregar()
        if (v === null || v === undefined) return null
        entradas.set(chave, { valor: v, expiraEm: agora() + ttlMs })
        return v
      } finally {
        emCurso.delete(chave)
      }
    })()
    emCurso.set(chave, p)
    return p
  }

  return {
    async obter(chave, carregar, aceitavel) {
      const e = entradas.get(chave)
      if (e && e.expiraEm > agora()) {
        if (!aceitavel || aceitavel(e.valor)) return e.valor
        // O guardado não serve (ex.: símbolo novo na corretora) → descarta e relê uma vez.
        entradas.delete(chave)
      } else if (e) {
        entradas.delete(chave)
      }
      return carregarUmaVez(chave, carregar)
    },
    invalidar(chave) {
      entradas.delete(chave)
    },
    invalidarPrefixo(prefixo) {
      for (const k of [...entradas.keys()]) if (k.startsWith(prefixo)) entradas.delete(k)
    },
    limpar() {
      entradas.clear()
    },
    tamanho() {
      return entradas.size
    },
  }
}

// ── símbolos e especificações (configuração da corretora) ─────────────────────────────────────

export const TTL_SIMBOLOS_MS = 60 * 60 * 1000
export const TTL_INFO_CONTA_MS = 45 * 1000

const cacheSimbolos = criarCacheTtl<string[]>(TTL_SIMBOLOS_MS)
const cacheSpecs = criarCacheTtl<unknown>(TTL_SIMBOLOS_MS)

/**
 * Lista de símbolos da conta, guardada 1 hora.
 *
 * `serve` diz se a lista resolve o que se procura (normalmente: o símbolo pedido tem candidato na
 * corretora). Quando a lista guardada não serve, relê-se uma vez — cobre a corretora que acrescentou
 * um símbolo depois de o termos guardado.
 */
export async function simbolosDaContaCache(
  accountId: string,
  lerSimbolos: () => Promise<string[]>,
  serve?: (simbolos: string[]) => boolean,
): Promise<string[]> {
  const v = await cacheSimbolos.obter(
    accountId,
    async () => {
      const s = await lerSimbolos()
      // Uma lista vazia é quase sempre uma leitura falhada a meio — não se guarda.
      return Array.isArray(s) && s.length > 0 ? s : null
    },
    serve,
  )
  return v ?? []
}

/**
 * Especificação do símbolo na corretora, guardada 1 hora por conta+símbolo.
 * Guarda o objeto CRU da MetaApi (quem chama escolhe os campos). Specs sem `point` não se guardam.
 */
export async function specDoSimboloCache<T>(
  accountId: string,
  brokerSymbol: string,
  lerSpec: () => Promise<T>,
): Promise<T | null> {
  const v = await cacheSpecs.obter(`${accountId}|${brokerSymbol}`, async () => {
    const raw = (await lerSpec()) as unknown as { point?: number } | null | undefined
    return raw && raw.point ? raw : null
  })
  return (v as T | null) ?? null
}

/**
 * Esquece símbolos e specs de uma conta. Chama-se quando uma ordem falha: se a causa foi uma
 * configuração da corretora que mudou (lote mínimo, stops level, símbolo desativado), a próxima
 * tentativa já lê tudo fresco.
 */
export function invalidarLeiturasDeSimbolos(accountId: string): void {
  cacheSimbolos.invalidar(accountId)
  cacheSpecs.invalidarPrefixo(`${accountId}|`)
}

// ── informação da conta, SÓ para ecrãs ────────────────────────────────────────────────────────

const cacheInfoConta = criarCacheTtl<Record<string, unknown>>(TTL_INFO_CONTA_MS)

/**
 * Saldo/equity/margem de uma conta, guardados 45 s — para páginas e painéis que se abrem e
 * refrescam muitas vezes.
 *
 * NUNCA usar em execução (lote por risco, gestão de posições, fecho): esses caminhos leem ao vivo
 * pela ligação RPC em `metaapi.ts`.
 *
 * Contrato igual ao do `fetch` que substitui: devolve `null` quando a MetaApi responde com erro
 * HTTP (não fica guardado) e LANÇA quando o pedido falha (timeout/rede), para quem chama manter o
 * seu `catch` e as suas mensagens de aviso.
 */
export async function lerInfoContaCache(
  accountId: string,
  opts: { regiao?: 'london' | 'new-york'; timeoutMs?: number } = {},
): Promise<Record<string, unknown> | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token || !accountId) return null
  const regiao = opts.regiao ?? 'london'
  // Os dois caminhos já existiam no código (um por região); mantêm-se tal como estavam.
  const caminho = regiao === 'new-york' ? 'accountInformation' : 'account-information'
  return cacheInfoConta.obter(accountId, async () => {
    const r = await fetch(`https://mt-client-api-v1.${regiao}.agiliumtrade.ai/users/current/accounts/${accountId}/${caminho}`, {
      headers: { 'auth-token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    })
    if (!r.ok) return null
    return (await r.json()) as Record<string, unknown>
  })
}

/** Só para testes. */
export function __limparCachesMetaApi(): void {
  cacheSimbolos.limpar()
  cacheSpecs.limpar()
  cacheInfoConta.limpar()
}
