/**
 * AURUM FLOW · EDGE · GOLDKILLER — o pedido do dono de 07/10, aplicado pela ESCRITA ÚNICA do Centro
 * (lib/admin-centro/servidor/estrategia-escrita.ts) e verificado contra a base.
 *
 *   npx tsx scripts/mestres/tres-estrategias-07-10.ts            # VERIFICA o estado final (guarda; sai ≠0 se falhar)
 *   npx tsx scripts/mestres/tres-estrategias-07-10.ts --aplicar  # aplica (idempotente) e verifica
 *
 * O que aplica:
 *  · Aurum Flow (`aurum-flow`): provider activo (só o interruptor que o sinal-mestre exige — `espelhar`
 *    fica desligado, o caminho antigo da MTM Auto não executa) + `sinal_modo=live`: a mestre SIM passa a
 *    abrir os sinais do webhook `?strategy=aurum`. `modo` (propagação aos clientes) fica em SOMBRA.
 *    O RESET da mestre NÃO é feito aqui — fecha posições, é um clique do dono.
 *  · Edge (`mtm-auto-edge`): religa os subscritores com conta real pelo quadro da cadeia (acção
 *    `subscritor`, que volta a sincronizar as rotas e limpa a pausa «fonte desligada»). A mestre já
 *    está em live (modo/t2t). Nada flui enquanto a fonte (pv-relay) estiver desligada.
 *  · GoldKiller (`Goldkiller`): deixa de ser estratégia COPIÁVEL e continua FONTE DE SINAIS.
 *    1) regista quem a seguia em site_settings.goldkiller_retirada_07_10; 2) interruptor de execução
 *    `goldkiller` desligado (sem ordens MT5/CopyFactory pelo caminho antigo); 3) mestre desligada
 *    (modo/sinal/t2t = desligado) — o canal «sinais-goldkiller» volta a ser escrito pelo webhook;
 *    4) `apagar_parando`: subscrições desactivadas, contas simuladas deixam de a seguir, rotas
 *    desligadas, linha ESCONDIDA (`apagado_em`, nunca DELETE — restaurável no Centro).
 *
 * Nunca imprime credenciais. Nenhuma ordem manual.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const APLICAR = process.argv.includes('--aplicar')
/** morethanmoneypt@gmail.com (profiles.user_type='admin') — fica na auditoria do Centro */
const ADMIN_ID = 'e8d2d7e0-b30d-4465-8159-75e2d4afc534'
const AURUM = 'aurum-flow'
const EDGE = 'mtm-auto-edge'
const GK = 'Goldkiller'
/** Contas REAIS do Edge com direito confirmado a 07/10 (Pedro FXIFY 8049315, Sandra TradeMax 30087061). */
const EDGE_REAIS = ['site:115a61a5-37c0-4291-af7c-c6f704a3f89c', 'site:45ae96c8-8f75-45e3-ac54-965b49a87d9d']

async function main() {
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const db = getSupabaseAdmin()

  if (APLICAR) {
    const { escreverEstrategia } = await import('../../lib/admin-centro/servidor/estrategia-escrita')
    const quem = { adminId: ADMIN_ID, tudo: true, tenantId: null, origem: 'site' as const }
    const passo = async (nome: string, p: { accao: string } & Record<string, unknown>) => {
      const r = await escreverEstrategia(quem, p)
      console.log(`${r.ok ? '✓' : '✗'} ${nome}: ${r.mensagem}`)
      return r
    }
    const lerMestre = async (slug: string) => (await db.from('mestres_estrategias').select('modo, sinal_modo, t2t_modo').ilike('slug', slug).maybeSingle()).data as Record<string, string> | null
    const modo = async (slug: string, campo: 'modo' | 'sinal_modo' | 't2t_modo', valor: 'desligado' | 'sombra' | 'live') => {
      const m = await lerMestre(slug)
      if (m?.[campo] === valor) { console.log(`· ${slug}.${campo} já está em ${valor}`); return }
      await passo(`${slug}.${campo} → ${valor}`, { accao: 'mestres', slug, pedido: { tipo: 'estrategia', slug, campo, valor, confirmacao: valor === 'live' ? `LIVE ${slug}` : 'CONFIRMAR' } })
    }

    // ── 3) AURUM FLOW ──
    console.log('\n── Aurum Flow')
    await passo('aurum-flow activa (sem espelhar)', { accao: 'opcoes', slug: AURUM, ativo: true, espelhar: false, confirmacao: 'CONFIRMAR' })
    await modo(AURUM, 'sinal_modo', 'live')

    // ── 4) EDGE ──
    console.log('\n── Edge')
    for (const ref of EDGE_REAIS) await passo(`Edge segue ${ref}`, { accao: 'subscritor', slug: EDGE, ref, ligar: true })

    // ── 5) GOLDKILLER ──
    console.log('\n── GoldKiller')
    const { data: prov } = await db.from('mtmauto_providers').select('id, apagado_em').ilike('slug', GK).maybeSingle()
    if (prov && !prov.apagado_em) {
      const [subs, segue, rotas, mestre] = await Promise.all([
        db.from('mtmauto_subscriptions').select('id, user_id, conta_id, ativo, auto_aceitar, created_at').eq('provider_id', prov.id),
        db.from('mtm_trading_accounts').select('id, user_id, mt5_login, estado').ilike('segue_estrategia', GK),
        db.from('copia_rotas').select('id, user_id, destino_ref, ativa, estado').ilike('estrategia_slug', GK),
        lerMestre(GK),
      ])
      const registo = { em: new Date().toISOString(), por: ADMIN_ID, motivo: 'GoldKiller deixa de ser estratégia copiável (pedido do dono 07/10); continua fonte de sinais', subscricoes: subs.data ?? [], contasQueSeguiam: segue.data ?? [], rotas: rotas.data ?? [], mestre }
      const { error } = await db.from('site_settings').upsert({ key: 'goldkiller_retirada_07_10', value: registo, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      console.log(`${error ? '✗' : '✓'} registo dos subscritores (${registo.subscricoes.length} subs, ${registo.contasQueSeguiam.length} contas SIM, ${registo.rotas.length} rotas)${error ? `: ${error.message}` : ''}`)
      if (error) throw new Error('sem registo dos subscritores não se desliga nada')
    }
    // ORDEM: o interruptor de execução fecha ANTES de a mestre sair do live — com a mestre desligada o
    // webhook voltaria a mandar o GoldKiller para o caminho antigo (ordem MT5), se o interruptor deixasse.
    // Só a chave `goldkiller` — as outras (Sensei, Premium…) são de outras decisões e não se reescrevem.
    const { data: swLinha } = await db.from('site_settings').select('value').eq('key', 'mtmcopy_exec_switches').maybeSingle()
    const swAntes = (swLinha?.value ?? {}) as Record<string, unknown>
    if (swAntes.goldkiller !== false) {
      const { error: eSw } = await db.from('site_settings').update({ value: { ...swAntes, goldkiller: false }, updated_at: new Date().toISOString() }).eq('key', 'mtmcopy_exec_switches')
      if (eSw) throw new Error(`interruptor goldkiller: ${eSw.message}`)
    }
    const { data: swDepois } = await db.from('site_settings').select('value').eq('key', 'mtmcopy_exec_switches').maybeSingle()
    const swOk = (swDepois?.value as Record<string, unknown> | undefined)?.goldkiller === false
    console.log(`${swOk ? '✓' : '✗'} interruptor de execução goldkiller → desligado`)
    if (!swOk) throw new Error('o interruptor goldkiller não ficou desligado — a mestre não sai do live sem ele')
    await modo(GK, 'sinal_modo', 'desligado')
    await modo(GK, 'modo', 'desligado')
    await modo(GK, 't2t_modo', 'desligado')
    if (prov && !prov.apagado_em) await passo('GoldKiller escondida a parar os seguidores', { accao: 'apagar_parando', slug: GK })
    else console.log('· GoldKiller já estava escondida')
  }

  // ── VERIFICAÇÃO (a guarda do estado final) ──
  const falhas: string[] = []
  const exige = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) falhas.push(msg) }
  const { ESTRATEGIA_DO_WEBHOOK } = await import('../../lib/mestres/servidor/sinal-mestre')
  const [ests, provs, rotas, subsGk, segueGk, sw, mm] = await Promise.all([
    db.from('mestres_estrategias').select('slug, modo, sinal_modo, t2t_modo, conta_mestre_id, provider_id').in('slug', [AURUM, EDGE, GK]),
    db.from('mtmauto_providers').select('id, slug, ativo, espelhar, apagado_em, funded_account_id').in('slug', [AURUM, EDGE, GK]),
    db.from('copia_rotas').select('id, estrategia_slug, ativa, estado, pausada_motivo, destino_chave').in('estrategia_slug', [AURUM, EDGE, GK]).eq('mestres', true),
    db.from('mtmauto_subscriptions').select('id', { count: 'exact', head: true }).eq('ativo', true).in('provider_id', ['3ba9d6f5-a325-4a14-ac20-f39842820c4f']),
    db.from('mtm_trading_accounts').select('id', { count: 'exact', head: true }).ilike('segue_estrategia', GK),
    db.from('site_settings').select('value').eq('key', 'mtmcopy_exec_switches').maybeSingle(),
    db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle(),
  ])
  const est = (s: string) => (ests.data ?? []).find((e) => e.slug === s) as Record<string, string> | undefined
  const prov = (s: string) => (provs.data ?? []).find((p) => p.slug === s) as Record<string, unknown> | undefined
  const rotasDe = (s: string) => (rotas.data ?? []).filter((r) => r.estrategia_slug === s)
  const global = (mm.data?.value ?? {}) as Record<string, unknown>

  console.log('\n── Aurum Flow: mestre ligada ao webhook')
  exige(ESTRATEGIA_DO_WEBHOOK.aurum?.slug === AURUM, 'webhook ?strategy=aurum → estratégia aurum-flow (fonte `aurum`)')
  exige(est(AURUM)?.sinal_modo === 'live', `mestres_estrategias.aurum-flow.sinal_modo = live (está ${est(AURUM)?.sinal_modo})`)
  exige(prov(AURUM)?.ativo === true && !prov(AURUM)?.apagado_em, 'provider aurum-flow activo e não escondido')
  exige(prov(AURUM)?.espelhar !== true, 'aurum-flow sem o caminho antigo da MTM Auto (espelhar=false)')
  const contaAurum = est(AURUM)?.conta_mestre_id
  const { data: mestreAurum } = contaAurum ? await db.from('mtm_trading_accounts').select('mt5_login, motor, estado, sim_saldo, saldo_inicial').eq('id', contaAurum).maybeSingle() : { data: null }
  exige(mestreAurum?.motor === 'sim' && mestreAurum?.estado === 'ativa', `mestre SIM ${mestreAurum?.mt5_login ?? '?'} activa (saldo ${mestreAurum?.sim_saldo ?? '?'} / inicial ${mestreAurum?.saldo_inicial ?? '?'})`)
  exige(global.ligado === true && global.kill !== true, 'motor das mestres ligado e sem kill-switch')

  console.log('\n── Edge: rotas activas, mestre em live')
  exige(est(EDGE)?.modo === 'live', `mtm-auto-edge.modo = live (está ${est(EDGE)?.modo})`)
  exige(prov(EDGE)?.ativo === true && !prov(EDGE)?.apagado_em, 'provider mtm-auto-edge activo')
  const edgeVivas = rotasDe(EDGE).filter((r) => r.ativa && r.estado === 'aprovada' && !r.pausada_motivo)
  exige(edgeVivas.length >= 1, `rotas Edge activas sem pausa: ${edgeVivas.map((r) => r.destino_chave).join(', ') || 'nenhuma'}`)

  console.log('\n── GoldKiller: sem rotas copiáveis, a publicar nos chats')
  exige(Boolean(prov(GK)?.apagado_em) && prov(GK)?.ativo !== true, 'provider Goldkiller escondido (apagado_em) e inactivo — fora das listas')
  exige(rotasDe(GK).every((r) => !r.ativa), `0 rotas GoldKiller activas (${rotasDe(GK).filter((r) => r.ativa).length})`)
  exige((subsGk.count ?? 0) === 0, `0 subscrições GoldKiller activas (${subsGk.count})`)
  exige((segueGk.count ?? 0) === 0, `0 contas simuladas a seguir o GoldKiller (${segueGk.count})`)
  exige(['modo', 'sinal_modo', 't2t_modo'].every((c) => est(GK)?.[c] === 'desligado'), `mestre GoldKiller desligada (${est(GK)?.modo}/${est(GK)?.sinal_modo}/${est(GK)?.t2t_modo})`)
  exige((sw.data?.value as Record<string, unknown> | undefined)?.goldkiller === false, 'interruptor de execução goldkiller desligado (sem ordens pelo caminho antigo)')
  // Com sinal_modo fora de live o canal deixa de ser «publicado pela mestre» e o webhook volta a escrever.
  const { estrategiasPublicadasPelaMestre } = await import('../../lib/mestres/servidor/canais-publicados')
  const pubs = await estrategiasPublicadasPelaMestre()
  exige(!pubs.some((p) => p.canal === 'sinais-goldkiller'), 'canal sinais-goldkiller escrito pelo webhook (não pela mestre)')
  const { data: ultimo } = await db.from('tradingview_signals').select('received_at, chat_status, telegram_status').or('alert_name.ilike.%goldkiller%,alert_name.ilike.%gold killer%').order('received_at', { ascending: false }).limit(1).maybeSingle()
  console.log(`· último alerta GoldKiller: ${ultimo?.received_at ?? '—'} · chat ${ultimo?.chat_status ?? '—'} · telegram ${ultimo?.telegram_status ?? '—'} (os seguintes já vão ao chat pelo webhook)`)

  if (falhas.length) { console.error(`\n${falhas.length} guarda(s) falharam.`); process.exit(1) }
  console.log('\nEstado final confirmado.')
}

main().catch((e) => { console.error(e); process.exit(1) })
