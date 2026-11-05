/**
 *   npx tsx lib/rota-corretora-skool.check.ts
 *
 * O cron corre todos os dias: a guarda prova que pede o acesso UMA vez, e que uma revogação da
 * corretora nunca tira a comunidade a quem a pagou por Stripe.
 */
import { decidirSkoolRotaCorretora as d } from './rota-corretora-skool'

const falhas: string[] = []
const t = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }

t('renovado sem nada → pede acesso', d({}, 'renovado') === 'pedir_acesso')
t('renovado já pendente → nada (não repete todos os dias)', d({ skool_access_pending: true }, 'renovado') === 'nada')
t('renovado já dado → nada', d({ skool_access_granted_at: '2026-11-01T00:00:00Z' }, 'renovado') === 'nada')
t('perfil sem profile_data → pede acesso', d(null, 'renovado') === 'pedir_acesso')
t('revogado, dado pela corretora → pede remoção', d({ skool_pending_source: 'puprime', skool_access_granted_at: 'x' }, 'revogado') === 'pedir_remocao')
t('revogado, pendente pela corretora → pede remoção', d({ skool_pending_source: 'puprime', skool_access_pending: true }, 'revogado') === 'pedir_remocao')
t('revogado, acesso veio do Stripe → nada', d({ skool_pending_source: 'stripe', skool_access_granted_at: 'x' }, 'revogado') === 'nada')
t('revogado sem acesso → nada', d({ skool_pending_source: 'puprime' }, 'revogado') === 'nada')

if (falhas.length) {
  console.error(`rota-corretora-skool: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('rota-corretora-skool: pede uma vez, remove só o que a corretora deu ✓')
