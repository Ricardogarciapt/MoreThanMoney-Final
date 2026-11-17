/**
 * AUDITOR IA DO MOTOR DE CÓPIA — lê `copia_resultados` (7 dias), resume em factos e pede à IA
 * (lib/ia/chamar.ts, grátis primeiro) no máximo três observações com o número que as sustenta.
 *
 * Fica FORA do caminho das ordens: corre no cron diário, depois do relatório, e só escreve texto
 * para o Telegram do admin. Uma falha da IA não impede o relatório — devolve-se null.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIA } from '@/lib/ia/chamar'
import { frameworkEngenharia, frameworkIdentidade, frameworkTom } from '@/lib/framework-mtm'
import { factosParaAuditor, type LinhaAuditor } from '../resultados'

const SISTEMA = `És o auditor do motor de cópia da MoreThanMoney. As contas MTM Funded são a mestre; as cópias
correm em contas MT5 reais de clientes. Recebes factos já calculados, em pips (convenção da casa: ouro 0,1;
forex 0,0001; JPY 0,01; índices e cripto em pontos).

Responde em PT-PT, no máximo 3 linhas começadas por «·», cada uma com o número que a sustenta e uma
afinação concreta para testar PRIMEIRO EM SOMBRA (nunca directamente em contas reais). Exemplos de
alavancas: sair com a mestre em vez do stop da corretora, folga de spread no SL, evitar horas com
divergência alta, tolerância de entrada. Não inventes números nem prometas resultados. Se uma conta
tiver menos de 10 trades, diz que a amostra é curta e não tires conclusões dela.

${[frameworkIdentidade(), frameworkTom(), frameworkEngenharia()].join('\n\n')}`

export async function auditarCopiasComIA(db: SupabaseClient, dias = 7): Promise<string | null> {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString()
  const { data, error } = await db.from('copia_resultados')
    .select('destino_chave, simbolo, pips_copia, pips_mestre, pips_sombra_b, custo_entrada_pips, saiu_antes, motivo, fechada_em')
    .gte('fechada_em', desde).limit(5000)
  if (error || !data?.length) return null
  const factos = factosParaAuditor(data as LinhaAuditor[])
  if (!factos.contas.length) return null
  try {
    const r = await chamarIA({
      tarefa: 'copia-auditor',
      sistema: SISTEMA,
      mensagens: [{ role: 'user', content: `Factos dos últimos ${dias} dias:\n${JSON.stringify(factos)}` }],
      maxTokens: 500,
      temperatura: 0.2,
      preferencia: 'qualidade',
    })
    const t = r.texto.trim()
    return t ? `🤖 Auditor IA (${dias} dias):\n${t.slice(0, 1500)}` : null
  } catch {
    return null
  }
}
