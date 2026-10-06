/**
 * O INTERRUPTOR GERAL DO MOTOR AUTÓNOMO — `site_settings.agentes_motor_ligado`.
 *
 * ═══ PORQUE É QUE ISTO É UM SÍTIO SÓ (decisão do dono, 06/10) ══════════════════════════════
 *
 * O motor que acorda os agentes vive no Mac do dono (`aios/motor/orquestrador.py`), mas quem o
 * liga e desliga são TRÊS superfícies: o `/admin/agentes` do site, o painel do AIOS que abre pela
 * Dock, e o comando «para os agentes» no Telegram. Se cada uma guardasse o seu interruptor, mais
 * cedo ou mais tarde uma dizia «desligado» e outra «ligado» — e o motor obedecia à que lesse
 * primeiro. Por isso as três escrevem e lêem ESTA chave, e só esta.
 *
 * ═══ NA DÚVIDA, DESLIGADO ══════════════════════════════════════════════════════════════════
 *
 * {@link lerMotorLigado} devolve `false` para tudo o que não for um «ligado» inequívoco: chave em
 * falta, texto lixo, `"true"` com espaços estranhos num objecto partido. Um motor que acorda
 * agentes com acesso a ferramentas não arranca por um valor que ninguém percebe. O ficheiro
 * `aios/motor/PARAR` é o segundo travão, local, que não depende da base estar acessível.
 *
 * Puro em cima, base em baixo. A guarda está em `motor-autonomo.check.ts`.
 */

export const CHAVE_MOTOR = 'agentes_motor_ligado'

export interface EstadoInterruptor {
  ligado: boolean
  /** Quem mexeu por último: `painel` (/admin), `aios` (painel da Dock), `telegram`, `migracao`. */
  por: string | null
  em: string | null
  porque: string | null
}

/** Lê o valor como vem da base (objecto, texto JSON, ou booleano solto). Na dúvida: desligado. */
export function lerMotorLigado(valor: unknown): EstadoInterruptor {
  let v: unknown = valor
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return { ligado: false, por: null, em: null, porque: 'valor ilegível — conta como desligado' }
    }
  }
  if (v === true) return { ligado: true, por: null, em: null, porque: null }
  if (!v || typeof v !== 'object') {
    return { ligado: false, por: null, em: null, porque: v == null ? 'sem valor — desligado por omissão' : 'valor ilegível — conta como desligado' }
  }
  const o = v as Record<string, unknown>
  return {
    // `=== true`, e não «truthy»: `"sim"`, `1` ou `"false"` não ligam um motor.
    ligado: o.ligado === true,
    por: typeof o.por === 'string' ? o.por : null,
    em: typeof o.em === 'string' ? o.em : null,
    porque: typeof o.porque === 'string' ? o.porque : null,
  }
}

/** O valor a gravar. Puro, para a guarda poder provar que vai sempre um booleano verdadeiro. */
export function valorDoInterruptor(ligado: boolean, por: string, porque: string, agora: Date = new Date()) {
  return { ligado: ligado === true, por: por || 'desconhecido', em: agora.toISOString(), porque: porque.trim() || null }
}

type Db = { from: (tabela: string) => any }

export async function lerInterruptor(db: Db): Promise<EstadoInterruptor & { erro?: string }> {
  const { data, error } = await db.from('site_settings').select('value').eq('key', CHAVE_MOTOR).maybeSingle()
  if (error) return { ligado: false, por: null, em: null, porque: null, erro: error.message ?? 'erro' }
  return lerMotorLigado(data?.value)
}

/**
 * Grava o interruptor. `update` primeiro e só depois `insert`: a `site_settings` desta casa tem
 * linhas com `description` e `updated_by` que um `upsert` cego reescreveria a nulo.
 */
export async function gravarInterruptor(
  db: Db,
  ligado: boolean,
  por: string,
  porque: string,
): Promise<{ ok: boolean; erro?: string; valor: ReturnType<typeof valorDoInterruptor> }> {
  const valor = valorDoInterruptor(ligado, por, porque)
  const agora = new Date().toISOString()
  const { data: atual, error: erroLer } = await db.from('site_settings').select('key').eq('key', CHAVE_MOTOR).maybeSingle()
  if (erroLer) return { ok: false, erro: erroLer.message ?? 'erro', valor }
  const { error } = atual
    ? await db.from('site_settings').update({ value: valor, updated_at: agora }).eq('key', CHAVE_MOTOR)
    : await db.from('site_settings').insert({
        key: CHAVE_MOTOR,
        value: valor,
        description: 'Interruptor geral do motor autónomo dos agentes (aios/motor). Desligado por omissão.',
      })
  return error ? { ok: false, erro: error.message ?? 'erro', valor } : { ok: true, valor }
}
