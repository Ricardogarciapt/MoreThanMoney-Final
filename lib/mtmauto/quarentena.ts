import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chavesDaFonte } from './chaves-de-fonte'

/**
 * ESTRATÉGIAS EM QUARENTENA — medidas, mas ainda não mostradas ao cliente.
 *
 * Uma estratégia que se está a afinar não deve levar os números do que ela era à montra. Este
 * módulo é o sítio onde essa espera se declara — e onde ela se levanta sozinha.
 *
 * Ficar à espera de QUÊ, exactamente: de duas semanas de CONTA-ESPELHO. Não de duas semanas de
 * calendário. A diferença importa — o calendário passa sozinho, a medição não: se a conta-espelho
 * voltar a parar, a quarentena mantém-se em vez de se levantar por decurso do tempo sobre dados
 * que não existem.
 *
 * Levanta-se SOZINHA quando a condição se cumpre. Uma quarentena que precisa de alguém se lembrar
 * de a tirar fica lá para sempre; e o admin continua a ver tudo, porque quem decide precisa de
 * ver a estratégia como ela está.
 */

/** Quanto tempo de conta-espelho é preciso antes de abrir os números ao cliente. */
export const DIAS_DE_ESPELHO_EXIGIDOS = 14

/**
 * As que esperam, e porquê. Cada entrada é uma decisão com data, não uma configuração.
 *
 * ESTÁ VAZIA, e isso é uma decisão — não um esquecimento.
 *
 * A 2026-09-12 a Aurum Flow e o MTM Scanner entraram aqui, e saíram no mesmo dia: a Aurum passa
 * a correr em conta nova sobre pares de cripto (o histórico velho é de outra coisa, e segurá-lo
 * não protegia ninguém), e o MTM Scanner mostra o que mediu, −221 pips, porque é verdade.
 *
 * O mecanismo fica porque a pergunta volta sempre: uma estratégia que se vai afinar não deve
 * levar os números antigos à montra enquanto se afina. Para a pôr em espera basta uma linha —
 * slug e a razão em linguagem de gente, que é o que o cliente lê no lugar dos números.
 */
const EM_QUARENTENA: Record<string, string> = {}

export interface EstadoQuarentena {
  publicavel: boolean
  porque: string | null
  /** Dias de conta-espelho já acumulados. `null` quando a estratégia não está em quarentena. */
  diasDeEspelho: number | null
}

/**
 * Pode mostrar-se esta estratégia ao cliente?
 *
 * `admin` atravessa sempre: o painel de decisão não é montra.
 */
export async function estadoDaQuarentena(
  slug: string,
  fonteMtm: string | null,
  opts?: { admin?: boolean },
): Promise<EstadoQuarentena> {
  if (opts?.admin) return { publicavel: true, porque: null, diasDeEspelho: null }

  const motivo = EM_QUARENTENA[slug]
  if (!motivo) return { publicavel: true, porque: null, diasDeEspelho: null }

  const dias = await diasDeContaEspelho(slug, fonteMtm)
  if (dias >= DIAS_DE_ESPELHO_EXIGIDOS) {
    return { publicavel: true, porque: null, diasDeEspelho: dias }
  }
  return { publicavel: false, porque: motivo, diasDeEspelho: dias }
}

/**
 * Há quantos dias a conta-espelho mede esta estratégia.
 *
 * Conta desde a saída mais ANTIGA registada, não desde a mais recente: o que interessa é a
 * extensão da amostra. Zero saídas = zero dias, e a quarentena mantém-se.
 */
async function diasDeContaEspelho(slug: string, fonteMtm: string | null): Promise<number> {
  const chaves = chavesDaFonte(slug, fonteMtm)
  const { data } = await getSupabaseAdmin()
    .from('mtmcopy_trade_exits')
    .select('created_at')
    .in('source_key', chaves)
    .order('created_at', { ascending: true })
    .limit(1)

  const primeira = data?.[0]?.created_at as string | undefined
  if (!primeira) return 0
  return Math.floor((Date.now() - new Date(primeira).getTime()) / 86_400_000)
}

/**
 * A partir de QUANDO é que cada estratégia conta.
 *
 * Uma estratégia que muda de conta, de mercado ou de motor deixa de ser a mesma coisa, e o
 * histórico do que ela era não descreve o que ela é. Somar os dois dá um número que não
 * corresponde a nada — nem ao passado, nem ao presente.
 *
 * A Aurum Flow passa a correr em conta nova sobre perpétuos de cripto (decisão do Ricardo,
 * 2026-09-12). As trades anteriores eram de ouro, noutra conta, com outro motor: ficam fora.
 * Zero trades é a resposta certa enquanto ainda não houver nenhuma — melhor do que três de uma
 * estratégia que já não existe.
 *
 * Quem não está aqui conta desde sempre.
 */
export const MEDE_DESDE: Record<string, string> = {
  'aurum-flow': '2026-09-12',
  // Alias do slug antigo da Aurum Flow — remover depois de 2026-10-14 (30 dias após 2026-09-14).
  'golden-moves': '2026-09-12',
}

/** A data a partir da qual as trades desta fonte contam, ou `null` se contam todas. */
export function medeDesde(chave: string): string | null {
  for (const [slug, data] of Object.entries(MEDE_DESDE)) {
    if (chavesDaFonte(slug, null).includes(chave)) return data
  }
  return null
}
