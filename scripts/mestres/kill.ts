/**
 * MESTRES NOSSAS — kill-switch e estado do motor.
 *
 *   npx tsx scripts/mestres/kill.ts            # estado: interruptor, estratégias, contas live, pulso do serviço
 *   npx tsx scripts/mestres/kill.ts on         # PÁRA TUDO: o serviço deixa de enviar em ≤ 2 s (nem saídas)
 *   npx tsx scripts/mestres/kill.ts off        # levanta o kill (as aberturas atrasadas são recusadas;
 *                                              # as saídas que ficaram na fila seguem)
 *
 * Equivalente em SQL (Supabase):
 *   update site_settings set value = jsonb_set(value, '{kill}', 'true') where key = 'mestres_motor';
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

async function main() {
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const { lerConfigGlobal } = await import('../../lib/mestres/tipos')
  const db = getSupabaseAdmin()
  const accao = process.argv[2]
  const { data } = await db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()
  if (!data) throw new Error('site_settings.mestres_motor em falta (a 116 está aplicada?)')
  const atual = lerConfigGlobal(data.value)
  if (accao === 'on' || accao === 'off') {
    const kill = accao === 'on'
    const novo = { ligado: atual.ligado, kill, live_desbloqueado: atual.liveDesbloqueado }
    const t0 = Date.now()
    const { error } = await db.from('site_settings').update({ value: novo }).eq('key', 'mestres_motor')
    if (error) throw new Error(error.message)
    if (kill) await db.from('mestres_alertas').insert({ tipo: 'kill', mensagem: `kill-switch accionado por script (${process.env.USER ?? '?'})` })
    console.log(`kill=${kill} gravado em ${Date.now() - t0} ms — o serviço relê de 2 em 2 s.`)
  }
  const [{ data: ests }, { data: contas }, { data: pulso }, { data: alertas }] = await Promise.all([
    db.from('mestres_estrategias').select('slug, modo, t2t_modo, sinal_modo, copyfactory_ids, copyfactory_cortado_em, incluir_mtmauto, mtmauto_cortado_em'),
    db.from('mestres_contas').select('conta_chave, modo, falhas_seguidas, bloqueada_em').or('modo.eq.live,bloqueada_em.not.is.null'),
    db.from('servicos_pulso').select('em, estado').eq('servico', 'mtm-copia-contas').maybeSingle(),
    db.from('mestres_alertas').select('criado_em, tipo, mensagem').is('visto_em', null).order('criado_em', { ascending: false }).limit(5),
  ])
  const g = lerConfigGlobal((await db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()).data?.value)
  console.log(`\nmestres_motor: ligado=${g.ligado} kill=${g.kill} live_desbloqueado=${g.liveDesbloqueado}`)
  for (const e of ests ?? []) console.log(`  ${e.slug}: cópia=${e.modo} t2t=${e.t2t_modo} sinal=${e.sinal_modo} · CF ${(e.copyfactory_ids ?? []).join(',') || '—'} ${e.copyfactory_cortado_em ? 'cortada' : 'POR CORTAR'}${e.incluir_mtmauto ? ` · MTM Auto ${e.mtmauto_cortado_em ? 'cortado' : 'POR CORTAR'}` : ''}`)
  console.log(`contas live/bloqueadas: ${(contas ?? []).map((c) => `${c.conta_chave}:${c.modo}${c.bloqueada_em ? ':BLOQUEADA' : ''}`).join(' ') || '—'}`)
  const m = (pulso?.estado as Record<string, unknown> | undefined)?.mestres
  console.log(`pulso do serviço: ${pulso?.em ?? '—'} ${m ? JSON.stringify(m) : '(versão sem mestres)'}`)
  for (const a of alertas ?? []) console.log(`  ⚠ ${a.criado_em} ${a.tipo}: ${a.mensagem}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
