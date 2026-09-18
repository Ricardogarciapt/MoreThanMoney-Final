/**
 * MESTRES NOSSAS — teste de INTEGRAÇÃO em SOMBRA contra a base REAL, só leitura.
 *
 *   npx tsx lib/mestres/__tests__/integracao-sombra.check.ts
 *
 * O que faz (nada é escrito — o cliente da base rebenta a qualquer insert/update/upsert/delete/rpc):
 *  1. lê as estratégias (mestres_estrategias; sem a 116, reconstrói-as como a semente da migração);
 *  2. planeia as rotas de cada estratégia a partir das escolhas REAIS dos clientes (site + MTM Auto);
 *  3. pega nas posições REAIS das mestres SIM dos últimos 7 dias (funded_positions, com parciais) e
 *     reproduz os factos (open → partial → modify → close) pelo motor da cópia com os ganchos das
 *     mestres, contra uma corretora falsa que rebenta se alguém lhe tentar escrever;
 *  4. confirma: com a configuração que está na base, NENHUMA decisão sai em live; zero escritas;
 *     cada facto tem uma decisão (sombra/recusado/saltado) e os lotes/SL em pips fazem sentido.
 *
 * Requer .env.local (SUPABASE_SERVICE_ROLE_KEY). Não chama a MetaApi.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

try { process.loadEnvFile(join(__dirname, '..', '..', '..', '.env.local')) } catch { /* usa o ambiente */ }

function soLeitura(db: SupabaseClient): SupabaseClient {
  const proibido = (o: string) => () => { throw new Error(`ESCRITA NA BASE num teste só de leitura: ${o}`) }
  return new Proxy(db, {
    get(alvo, prop, rec) {
      if (prop === 'rpc') return proibido('rpc')
      if (prop !== 'from') return Reflect.get(alvo, prop, rec)
      return (tabela: string) => {
        const q = alvo.from(tabela)
        return new Proxy(q, {
          get(a, p, r) {
            if (p === 'insert' || p === 'update' || p === 'upsert' || p === 'delete') return proibido(`${String(p)} em ${tabela}`)
            return Reflect.get(a, p, r)
          },
        })
      }
    },
  }) as SupabaseClient
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.log('integração-sombra: sem SUPABASE_SERVICE_ROLE_KEY — saltado'); return }
  const { getSupabaseAdmin } = await import('../../supabase-admin-client')
  const { decidirModo } = await import('../decisao')
  const { planearRotasDaEstrategia } = await import('../planear')
  const { lerConfigGlobal, lerEstrategiaMestre, contaPorOmissao } = await import('../tipos')
  const { processarEventoCopia } = await import('../../copia-contas/motor')
  const { chaveEvento } = await import('../../copia-contas/calculo')
  const { niveisEmPips } = await import('../pips')
  const db = soLeitura(getSupabaseAdmin())

  // 1. estratégias
  const { data: cfg } = await db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()
  const global = lerConfigGlobal(cfg?.value)
  const { data: linhas, error: eEst } = await db.from('mestres_estrategias').select('*')
  let estrategias
  if (eEst) {
    console.log(`(116 por aplicar: ${eEst.message} — estratégias reconstruídas como a semente)`)
    const { data: provs } = await db.from('mtmauto_providers').select('*').is('apagado_em', null).eq('ativo', true)
      .in('slug', ['Goldkiller', 'sensei', 'mtm-auto-edge', 'mtm-auto-king', 'mtm-auto-wolf'])
    estrategias = (provs ?? []).filter((p) => p.funded_account_id || p.espelho_funded_account_id).map((p) => lerEstrategiaMestre({
      provider_id: p.id, slug: p.slug, conta_mestre_id: p.funded_account_id ?? p.espelho_funded_account_id, modo: 'sombra',
      copyfactory_ids: p.slug === 'Goldkiller' ? ['Wl1B', 'SDNb'] : p.slug === 'sensei' ? ['hbKq', 'Oca7'] : [],
    }))
  } else {
    // o teste corre-as em SOMBRA para exercitar o motor, mesmo que na base estejam desligadas
    estrategias = (linhas ?? []).map((l) => ({ ...lerEstrategiaMestre(l), modoNaBase: String(l.modo) }))
  }
  assert.ok(estrategias.length > 0, 'nenhuma estratégia activa com mestre SIM')

  const [site, subs, contasAuto, provs] = await Promise.all([
    db.from('mtmcopy_connections').select('*').neq('mt5_status', 'disconnected'),
    db.from('mtmauto_subscriptions').select('*'),
    db.from('mtmauto_accounts').select('*'),
    db.from('mtmauto_providers').select('id, nome'),
  ])
  const nomes = new Map((provs.data ?? []).map((p) => [String(p.id), String(p.nome)]))

  let factos = 0
  let escritas = 0
  let live = 0
  const resultados: Record<string, number> = {}
  for (const e of estrategias) {
    // 2. rotas planeadas (MTM Auto incluído para exercitar os dois lados)
    const plano = planearRotasDaEstrategia({
      estrategia: { providerId: e.providerId, slug: e.slug, nome: nomes.get(e.providerId) ?? e.slug, contaMestreId: e.contaMestreId, copyfactoryIds: e.copyfactoryIds, incluirMtmauto: true },
      site: (site.data ?? []) as never, subsAuto: (subs.data ?? []) as never, contasAuto: (contasAuto.data ?? []) as never,
    })
    // decisão REAL com a configuração da base: nada pode sair em live hoje
    for (const r of plano.rotas) {
      const dReal = decidirModo({ global, escritaNoProcesso: false, estrategia: e, conta: contaPorOmissao(r.destino_chave, r.destino_ref), rota: { ativa: true, estado: 'aprovada', tipo_rota: 'estrategia', destino_ref: r.destino_ref } })
      if (dReal.modo === 'live') live++
    }

    // 3. posições reais da mestre SIM (7 dias) → factos
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: pos } = await db.from('funded_positions').select('id, symbol, direcao, volume, volume_inicial, preco_entrada, sl, tp, estado, mae_id, aberta_em, preco_fecho, be_feito, risco_inicial')
      .eq('account_id', e.contaMestreId).gte('aberta_em', desde).order('aberta_em', { ascending: true }).limit(200)
    const maes = (pos ?? []).filter((p) => !p.mae_id)
    const filhas = (pos ?? []).filter((p) => p.mae_id)
    const rotasTeste = plano.rotas.length ? plano.rotas.slice(0, 3) : [{ destino_ref: 'site:00000000-0000-0000-0000-000000000000', destino_chave: 'mt:0@teste', destino_tipo: 'mt5' as const, modo_lote: 'risco_pct' as const, valor: 1, copiar_sl: true, copiar_tp: true, filtro_simbolos: [], max_abertas: null, lote_max: null }]
    console.log(`\n══ ${e.slug}: mestre SIM ${e.contaMestreId.slice(0, 8)} · ${plano.rotas.length} seguidores reais (${plano.ignorados.length} ignorados) · ${maes.length} posições em 7 dias · na base: ${(e as { modoNaBase?: string }).modoNaBase ?? 'sem 116'}`)

    for (const r of rotasTeste) {
      const rota = {
        id: '00000000-0000-4000-8000-000000000001', user_id: 'u', origem_tipo: 'mtmfunded', origem_ref: `prov:${e.providerId}`, origem_chave: `mtmfunded:${e.contaMestreId}`,
        destino_tipo: r.destino_tipo, destino_ref: r.destino_ref, destino_chave: r.destino_chave, rotulo: null, modo_lote: r.modo_lote, valor: r.valor,
        mapa_simbolos: {}, filtro_simbolos: r.filtro_simbolos, filtro_direcao: 'ambas', lote_max: r.lote_max, max_abertas: r.max_abertas,
        copiar_sl: r.copiar_sl, copiar_tp: r.copiar_tp, copiar_parciais: true, copiar_modificacoes: true, fechar_com_origem: true,
        ativa: true, modo: 'shadow', estado: 'aprovada', pedido_pelo_cliente: false, notas: null, aprovada_em: null, created_at: new Date().toISOString(),
      } as never
      const copias = new Map<string, Record<string, unknown>>()
      let seq = 0
      const loja = {
        async copia(_r: string, p: string) { return (copias.get(p) as never) ?? null },
        async inserirCopia(c: Record<string, unknown>) { const k = String(c.origem_posicao_id); if (copias.has(k)) return false; copias.set(k, { id: `c${++seq}`, fechado_pct: 0, destino_posicao_id: null, preco_destino: null, ...c }); return true },
        async atualizarCopia(id: string, patch: Record<string, unknown>) { for (const [k, v] of copias) if (v.id === id) copias.set(k, { ...v, ...patch }) },
        async abertasNaRota() { return [...copias.values()].filter((c) => c.estado === 'sombra').length },
        async saldoOrigem() { return 10_000 },
      }
      const escritor = {
        async contexto(simbolo: string, _d: string) { return { simbolo, regra: { min: 0.01, max: 100, step: 0.01 }, equity: 10_000, saldo: 10_000, valorPorPrecoPorLote: /XAU/.test(simbolo) ? 100 : /JPY/.test(simbolo) ? 666.7 : /^(US30|NAS|SPX|GER)/.test(simbolo) ? 1 : 100_000, bid: null, ask: null, digits: null } },
        async simbolos() { return null },
        async posicoes() { return [] },
        async abrir() { escritas++; throw new Error('ESCREVEU') },
        async modificar() { escritas++; throw new Error('ESCREVEU') },
        async fechar() { escritas++; throw new Error('ESCREVEU') },
      }
      const ganchos = { modo: () => 'sombra' as const, podeEscrever: () => false }
      let id = 0
      for (const m of maes) {
        // O facto de ABERTURA leva o SL de então. A linha da base já tem o SL final (BE/trailing): o
        // inicial reconstrói-se do risco inicial (dinheiro) quando existe; um SL já do lado do lucro
        // sem risco inicial não é reconstruível — conta como «SL inicial desconhecido» na réplica.
        const entrada = Number(m.preco_entrada)
        const compra = m.direcao === 'buy'
        const slFinal = m.sl == null ? null : Number(m.sl)
        const volIni = Number(m.volume_inicial ?? m.volume)
        const contrato = /XAU|GOLD/.test(String(m.symbol)) ? 100 : null
        const riscoIni = (m as { risco_inicial?: unknown }).risco_inicial
        const slDoRisco = riscoIni != null && contrato && volIni > 0 ? Number((entrada + (compra ? -1 : 1) * Number(riscoIni) / (volIni * contrato)).toFixed(2)) : null
        const slNoRisco = slFinal != null && (compra ? slFinal < entrada : slFinal > entrada) ? slFinal : null
        const slInicial = slDoRisco ?? slNoRisco
        if (slInicial == null) { resultados['open:sl_inicial_desconhecido'] = (resultados['open:sl_inicial_desconhecido'] ?? 0) + 1; continue }
        const eventos = [
          { tipo: 'open', payload: { symbol: m.symbol, direcao: m.direcao, volume: volIni, preco: entrada, sl: slInicial, tp: m.tp == null ? null : Number(m.tp) } },
          ...filhas.filter((f) => f.mae_id === m.id).map((f) => ({ tipo: 'partial', payload: { symbol: m.symbol, direcao: m.direcao, volume_fechado: Number(f.volume), volume: Math.max(0, Number(m.volume_inicial ?? m.volume) - Number(f.volume)) } })),
          ...(m.be_feito ? [{ tipo: 'modify', payload: { symbol: m.symbol, direcao: m.direcao, preco: Number(m.preco_entrada), sl: Number(m.preco_entrada), tp: m.tp == null ? null : Number(m.tp) } }] : []),
          ...(m.estado === 'fechada' ? [{ tipo: 'close', payload: { symbol: m.symbol, direcao: m.direcao, preco: m.preco_fecho } }] : []),
        ]
        for (const x of eventos) {
          const ev = { id: ++id, rota_id: 'r', origem_posicao_id: String(m.id), tipo: x.tipo, payload: x.payload, chave: chaveEvento('r', String(m.id), x.tipo as never, id), origem_em: new Date().toISOString(), criado_em: new Date().toISOString(), tentativas: 0 } as never
          const d = await processarEventoCopia(ev, rota, loja as never, escritor as never, { interruptores: { globalLigado: true, liveDesbloqueado: true, escritaNoProcesso: true }, ganchos })
          factos++
          resultados[`${x.tipo}:${d.resultado}`] = (resultados[`${x.tipo}:${d.resultado}`] ?? 0) + 1
          if (d.resultado === 'recusado' && process.env.DEBUG_MESTRES) console.log('     recusado:', m.symbol, JSON.stringify(d.acaoPretendida))
          assert.notEqual(d.modo, 'live')
          assert.ok(['sombra', 'recusado', 'saltado'].includes(d.resultado), `${x.tipo} → ${d.resultado} ${d.erro ?? ''}`)
          if (x.tipo === 'open' && d.resultado === 'sombra' && d.acaoPretendida.tipo === 'abrir') {
            const a = d.acaoPretendida
            assert.ok(a.volume >= 0.01 && a.volume <= 50, `lote ${a.volume}`)
            const p = niveisEmPips({ direcao: m.direcao, entrada: Number(m.preco_entrada), sl: m.sl == null ? null : Number(m.sl), tp: null, symbol: m.symbol })
            if (p.slPips != null && r.copiar_sl) assert.ok(a.sl != null, 'SL em falta numa posição com SL na mestre')
          }
        }
      }
      console.log(`   → ${r.destino_ref.slice(0, 13)} ${r.modo_lote} ${r.valor}: ${copias.size} cópias simuladas`)
    }
  }
  assert.equal(escritas, 0, 'a sombra tentou escrever numa corretora')
  assert.equal(live, 0, 'com a configuração da base, alguma rota sairia em LIVE')
  console.log(`\nresultados: ${JSON.stringify(resultados)}`)
  console.log(`integração-sombra: ${factos} factos reais reproduzidos, 0 escritas, 0 decisões live — certo (interruptor: ligado=${global.ligado} kill=${global.kill} live_desbloqueado=${global.liveDesbloqueado})`)
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exitCode = 1 })
