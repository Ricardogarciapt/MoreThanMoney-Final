import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerPosicoesMotor } from './metaapi-snapshot'
import { fimDeSemanaFx, saltarLeiturasLigado } from './market-hours'
import { contasDoMotorTempoReal, carregarContasDeEstrategia } from './contas-provider-estrategia'
import { symbolMatchesCanonical } from './symbol-resolver'

/**
 * Trades abertas À MÃO na conta provider, entregues ao motor — mas só as marcadas.
 *
 * ── O que estava a falhar ────────────────────────────────────────────────────────────────────
 * O motor arranca das linhas de `mtmcopy_premium_active`, criadas quando um SINAL é processado.
 * Depois lê as posições da conta apenas para as emparelhar com as linhas que já conhece.
 *
 * Uma trade aberta à mão não tem linha. Para o motor não existe: sem break-even, sem parciais,
 * sem trailing. Fica sozinha até alguém se lembrar dela.
 *
 * ── Porque é POR MARCA e não por omissão ─────────────────────────────────────────────────────
 * Adoptar tudo o que aparece seria pôr o motor a mandar em decisões que não são dele. Quem abre
 * uma trade à mão costuma ter uma gestão na cabeça — outro alvo, sem parciais, segurar mais — e
 * o motor faria break-even e parciais por cima disso. Numa conta que serve de espelho a clientes,
 * isso não é um incómodo: é dinheiro deles a sair mais cedo.
 *
 * Por isso a regra é explícita e está nas mãos de quem abre: escreve-se a marca no COMENTÁRIO da
 * ordem no MT5. Com marca, o motor gere. Sem marca, a trade é de quem a abriu.
 *
 * Só nas contas provider (`CONTAS_MOTOR_TEMPO_REAL`) — numa conta de cliente ninguém abre à mão
 * em nome da casa.
 */

/**
 * A marca. Escreve-se no comentário da ordem, em qualquer sítio dele.
 *
 * Curta e sem acentos de propósito: o campo do MT5 tem 31 caracteres e algumas corretoras
 * reescrevem o que lá vai.
 */
export const MARCA_GERIR = 'MTM'

/** Esta posição pede para ser gerida? */
export function pedeGestao(comentario: string | null | undefined): boolean {
  return String(comentario ?? '').toUpperCase().includes(MARCA_GERIR)
}

export interface Adotada {
  conta: string
  symbol: string
  direction: 'buy' | 'sell'
  entrada: number
}

/**
 * Procura posições marcadas sem linha e cria-lhes uma.
 *
 * Corre antes de cada passagem do monitor. É barato: já se leem as posições destas contas de
 * qualquer maneira, e são três.
 */
/** Fim de semana: adopção por conta no máximo 1× por minuto (memória da instância). */
const ADOPCAO_FIM_DE_SEMANA_MS = 60_000
const ultimaAdopcaoFimDeSemana = new Map<string, number>()

export async function adotarManuais(): Promise<{ adotadas: Adotada[]; notas: string[] }> {
  const db = getSupabaseAdmin()
  const adotadas: Adotada[] = []
  const notas: string[] = []

  const agora = Date.now()
  const fimDeSemana = saltarLeiturasLigado() && fimDeSemanaFx(new Date(agora))
  // As contas mestre vivas (base de dados) entram na adopção como as fixas.
  await carregarContasDeEstrategia().catch(() => undefined)
  // As contas são independentes (cada uma tem as suas posições e as suas linhas), por isso lêem-se
  // EM PARALELO. Em série, com quatro contas lidas por RPC à MetaApi, só esta fase levava ~4-5 s
  // e o loop «de 1 em 1 s» do monitor Premium corria, na prática, de 6 em 6 s (medido 17/09).
  await Promise.all(contasDoMotorTempoReal().map(async (conta) => {
    // Fim de semana: uma trade à mão só pode ser cripto (o resto não negoceia), e para a apanhar
    // chega olhar de minuto a minuto em vez de segundo a segundo. Ver market-hours.ts.
    if (fimDeSemana) {
      const ultima = ultimaAdopcaoFimDeSemana.get(conta)
      if (ultima != null && agora - ultima < ADOPCAO_FIM_DE_SEMANA_MS) return
      ultimaAdopcaoFimDeSemana.set(conta, agora)
    }
    // Fotografia do streaming quando a conta está em PREMIUM_STREAMING_CONTAS e é de confiança;
    // senão o mesmo readOpenPositions de sempre.
    const posicoes = (await lerPosicoesMotor(conta)).posicoes
    // Leitura estrita: uma falha de leitura não pode parecer "não há nada aberto".
    if (posicoes == null) {
      notas.push(`${conta.slice(0, 8)}: ilegível`)
      return
    }

    const marcadas = posicoes.filter((p) => pedeGestao(p.comment))
    if (!marcadas.length) return

    const { data: linhas } = await db
      .from('mtmcopy_premium_active')
      .select('symbol, direction')
      .eq('account_id', conta)
      .eq('status', 'open')

    for (const p of marcadas) {
      const dir: 'buy' | 'sell' = String(p.type).toUpperCase().includes('SELL') ? 'sell' : 'buy'

      // Já há linha para este par e lado? Então já é gerida — e criar outra faria o motor
      // trabalhar duas vezes sobre a mesma posição.
      const jaTem = (linhas ?? []).some(
        (l) => symbolMatchesCanonical(p.symbol, String(l.symbol)) && String(l.direction) === dir,
      )
      if (jaTem) continue

      /**
       * O stop da própria ordem é o risco. Sem stop não se adopta: o motor mede tudo em unidades
       * de risco (o break-even, o arranque do trailing, a distância) e sem stop não há régua —
       * inventá-la seria gerir a trade por um número que ninguém escolheu.
       */
      const sl = Number(p.stopLoss)
      if (!(sl > 0)) {
        notas.push(`${p.symbol} ${dir} sem stop — não adoptada`)
        continue
      }

      const { error } = await db.from('mtmcopy_premium_active').insert({
        account_id: conta,
        symbol: String(p.symbol).replace(/[.\-][A-Za-z0-9]+$/, ''),
        direction: dir,
        entry: Number(p.openPrice),
        sl,
        // Sem alvos: quem abriu à mão não os declarou. O motor faz break-even e trailing, que é
        // o que protege; as parciais precisam de alvos e não se inventam.
        tp1: p.takeProfit ? Number(p.takeProfit) : null,
        original_lot: Number(p.volume) || 0,
        status: 'open',
        // Sem 'comment': a coluna não existe em mtmcopy_premium_active e o insert falhava sempre,
        // por isso NENHUMA ordem manual chegava a ser adoptada. O comentário do MetaTrader
        // continua a ser lido da posição (ehGerida), que é onde a marca vive.
      })
      if (error) {
        notas.push(`${p.symbol}: ${error.message.slice(0, 60)}`)
        continue
      }
      adotadas.push({ conta, symbol: p.symbol, direction: dir, entrada: Number(p.openPrice) })
    }
  }))

  return { adotadas, notas }
}
