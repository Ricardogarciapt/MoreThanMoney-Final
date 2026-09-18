/**
 * MESTRES NOSSAS — cria/actualiza as rotas do motor (copia_rotas `mestres=true`, tipo 'estrategia')
 * a partir do que os clientes escolheram (lib/mestres/planear.ts). Rotas nascem SEMPRE em sombra
 * (copia_rotas.modo='shadow'; o live é decidido por mestres_estrategias/mestres_contas).
 *
 *   npx tsx scripts/mestres/sincronizar-rotas.ts                      # SECO: mostra o plano, não escreve
 *   npx tsx scripts/mestres/sincronizar-rotas.ts --estrategia sensei  # só uma estratégia
 *   npx tsx scripts/mestres/sincronizar-rotas.ts --aplicar            # escreve (repetível: idempotente)
 *
 * PRÉ-REQUISITO: migrações 078/083/116 aplicadas. Nunca imprime credenciais.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const SO = (() => { const i = args.indexOf('--estrategia'); return i >= 0 ? args[i + 1] : null })()

async function main() {
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const { planearRotasDaEstrategia, planoDeEscrita } = await import('../../lib/mestres/planear')
  const { lerEstrategiaMestre } = await import('../../lib/mestres/tipos')
  const db = getSupabaseAdmin()

  const { data: ests, error } = await db.from('mestres_estrategias').select('*')
  if (error) throw new Error(`mestres_estrategias: ${error.message} (a 116 está aplicada?)`)
  const [site, subs, contasAuto, provs, forcados] = await Promise.all([
    db.from('mtmcopy_connections').select('*').neq('mt5_status', 'disconnected'),
    db.from('mtmauto_subscriptions').select('*'),
    db.from('mtmauto_accounts').select('*'),
    db.from('mtmauto_providers').select('id, nome, slug'),
    db.from('mestres_contas').select('conta_chave, lote_fixo_forcado').not('lote_fixo_forcado', 'is', null),
  ])
  const nomes = new Map((provs.data ?? []).map((p) => [String(p.id), String(p.nome)]))
  const lotesForcados = Object.fromEntries((forcados.data ?? []).map((f) => [String(f.conta_chave), Number(f.lote_fixo_forcado)]))

  for (const linha of ests ?? []) {
    const e = lerEstrategiaMestre(linha)
    if (SO && e.slug.toLowerCase() !== SO.toLowerCase()) continue
    const plano = planearRotasDaEstrategia({
      estrategia: { providerId: e.providerId, slug: e.slug, nome: nomes.get(e.providerId) ?? e.slug, contaMestreId: e.contaMestreId, copyfactoryIds: e.copyfactoryIds, incluirMtmauto: e.incluirMtmauto },
      site: (site.data ?? []) as never, subsAuto: (subs.data ?? []) as never, contasAuto: (contasAuto.data ?? []) as never, lotesForcados,
    })
    const { data: existentes } = await db.from('copia_rotas').select('*').eq('mestres', true).eq('tipo_rota', 'estrategia').ilike('estrategia_slug', e.slug).neq('estado', 'recusada')
    const abertas = new Map<string, number>()
    for (const r of existentes ?? []) {
      const { count } = await db.from('copia_posicoes').select('id', { count: 'exact', head: true }).eq('rota_id', r.id).in('estado', ['sombra', 'enviando', 'aberta'])
      abertas.set(String(r.id), count ?? 0)
    }
    const escrita = planoDeEscrita(plano.rotas, (existentes ?? []).map((r) => ({ ...r, abertas: abertas.get(String(r.id)) ?? 0 })) as never)

    console.log(`\n══ ${e.slug} (mestre SIM ${e.contaMestreId.slice(0, 8)} · modo ${e.modo} · t2t ${e.t2tModo} · sinal ${e.sinalModo})`)
    console.log(`   seguidores: ${plano.rotas.length} · ignorados: ${plano.ignorados.length}`)
    for (const r of plano.rotas) console.log(`   + ${r.destino_ref} ${r.destino_chave} · ${r.modo_lote} ${r.valor}${r.copiar_sl ? '' : ' · SEM SL'}${r.copiar_tp ? '' : ' · SEM TP'}${r.pausada_motivo ? ` · PAUSADA (${r.pausada_motivo})` : ''} · ${r.notas}`)
    for (const i of plano.ignorados) console.log(`   · ignorado ${i.ref}: ${i.motivo}`)
    console.log(`   escrita: criar ${escrita.criar.length} · actualizar ${escrita.actualizar.length} · retirar ${escrita.retirar.length}`)
    if (!APLICAR) continue

    const agora = new Date().toISOString()
    for (const r of escrita.criar) {
      const { error: eIns } = await db.from('copia_rotas').insert({ ...r, ativa: true, estado: 'aprovada', modo: 'shadow', aprovada_em: agora, pedido_pelo_cliente: false })
      console.log(eIns ? `   ✗ criar ${r.destino_ref}: ${eIns.message}` : `   ✓ criada ${r.destino_ref}`)
    }
    for (const u of [...escrita.actualizar, ...escrita.retirar]) {
      const { error: eUp } = await db.from('copia_rotas').update(u.patch).eq('id', u.id)
      console.log(eUp ? `   ✗ ${u.id.slice(0, 8)}: ${eUp.message}` : `   ✓ ${u.id.slice(0, 8)} ${JSON.stringify(u.patch)}`)
    }
  }
  if (!APLICAR) console.log('\n(SECO — nada escrito. --aplicar para gravar.)')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
