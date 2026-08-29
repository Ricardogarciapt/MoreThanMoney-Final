import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { correrRadar } from '@/lib/instagram/radar'

/**
 * O que se pode resolver a partir do comando, com um clique.
 *
 * ── A regra, e é curta ───────────────────────────────────────────────────────────────────────
 * Só entra aqui o que é reversível com o MESMO gesto, e o que não fala com um cliente nem mexe
 * em dinheiro.
 *
 * A razão é simples: um painel de alarmes é lido depressa, muitas vezes no telemóvel, e às vezes
 * pela pessoa errada. Um botão que manda uma mensagem a trezentas pessoas ou que executa uma
 * ordem não pertence a um sítio onde se carrega depressa — pertence ao ecrã onde se vai
 * deliberadamente, com o contexto à frente.
 *
 * Por isso APROVAR um post não está aqui, apesar de parecer inofensivo: aprovar é publicar com
 * hora marcada, e desfazer depois de ter saído não desfaz nada. Cancelar uma subscrição também
 * não: é dinheiro e é do cliente.
 *
 * ── Silenciar ────────────────────────────────────────────────────────────────────────────────
 * A acção mais útil não é arranjar — é dizer "eu sei, é assim de propósito". Um painel que grita
 * por uma coisa que já se decidiu aceitar deixa de ser lido por inteiro, e a seguir perde-se o
 * alarme que interessava. Silenciar tem prazo: volta sozinho, porque uma decisão de hoje não é
 * uma decisão para sempre.
 */

const CHAVE_SILENCIO = 'comando_silenciados'

export interface Acao {
  id: string
  rotulo: string
  /** O que vai acontecer, dito antes de acontecer. */
  confirmacao: string
  correr: (args: Record<string, unknown>) => Promise<{ ok: boolean; nota: string }>
}

export const ACOES: Acao[] = [
  {
    id: 'procurar_conversas',
    rotulo: 'Procurar conversas agora',
    confirmacao: 'Procura hashtags do nicho e enche a lista do radar. Não fala com ninguém.',
    correr: async () => {
      const r = await correrRadar(3)
      return {
        ok: true,
        nota: r.guardados
          ? `${r.guardados} conversas novas de #${r.hashtags.join(', #')}`
          : `Nada novo em #${r.hashtags.join(', #')}`,
      }
    },
  },

  {
    id: 'desligar_automacao',
    rotulo: 'Desligar',
    confirmacao: 'A regra deixa de responder. Volta a ligar-se no /admin/social.',
    correr: async (a) => {
      const id = String(a.id ?? '')
      if (!id) return { ok: false, nota: 'Falta a regra' }
      // Só DESLIGAR. Ligar põe uma regra a falar com pessoas reais, e isso quer-se do lado onde
      // se vê o texto que ela vai dizer.
      const { error } = await getSupabaseAdmin()
        .from('mtm_automacoes')
        .update({ ativa: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      return error ? { ok: false, nota: error.message } : { ok: true, nota: 'Regra desligada' }
    },
  },

  {
    id: 'recalcular_prova',
    rotulo: 'Recalcular a prova',
    confirmacao: 'Volta a ler o histórico da conta-espelho e refaz os números de pips. Só lê.',
    correr: async () => {
      const { savePipsProof, publicavel } = await import('@/lib/pips-proof')
      const r = await savePipsProof()
      const n = r.executado?.trades ?? 0
      return {
        ok: true,
        // Dizer se dá para publicar é metade da informação: o número sozinho não diz se hoje se
        // pode ou não pôr prova num cartão.
        nota: publicavel(r)
          ? `${n} trades · ${r.executado.pips.toFixed(0)} pips — dá para publicar`
          : `${n} trades — ainda não chega para publicar`,
      }
    },
  },

  {
    id: 'silenciar',
    rotulo: 'Silenciar 7 dias',
    confirmacao: 'O alerta desaparece daqui durante uma semana e volta sozinho.',
    correr: async (a) => {
      const chave = String(a.alerta ?? '')
      if (!chave) return { ok: false, nota: 'Falta o alerta' }
      const db = getSupabaseAdmin()
      const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_SILENCIO).maybeSingle()
      const atuais = ((typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value) ?? {}) as Record<string, string>
      atuais[chave] = new Date(Date.now() + 7 * 86400_000).toISOString()
      await db.from('site_settings').upsert(
        { key: CHAVE_SILENCIO, value: atuais, description: 'Alertas silenciados no centro de comando, com prazo.', updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      return { ok: true, nota: 'Silenciado até daqui a uma semana' }
    },
  },
]

/** Os alertas que estão silenciados e ainda dentro do prazo. */
export async function silenciados(): Promise<Set<string>> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE_SILENCIO).maybeSingle()
    const m = ((typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value) ?? {}) as Record<string, string>
    const agora = new Date().toISOString()
    // Os que já passaram do prazo saem sozinhos — não é preciso limpar nada à mão.
    return new Set(Object.entries(m).filter(([, ate]) => ate > agora).map(([k]) => k))
  } catch {
    return new Set()
  }
}

export function acaoPorId(id: string): Acao | undefined {
  return ACOES.find((a) => a.id === id)
}
