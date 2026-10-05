/**
 * PAINEL DO MOTOR DAS MESTRES (admin) — resumo de estado, executor por estratégia, guardas de live
 * iguais às da base (116), palavras de confirmação, leitura dos pedidos, emblema «Mestre · X»,
 * métricas 90 d sem misturar simuladas, reconciliação CopyFactory com estratégias cortadas, e as
 * rotas novas só para administradores. Puro: sem base, sem MetaApi.
 *
 *   npx tsx lib/mestres/__tests__/painel.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  executorDe, lerPedido, mestresPorConta, motivoBloqueioLive, nomeCurtoEstrategia, palavraDeConfirmacao, resumirPainel, resumo90d,
  rotuloMestre, textoResumo90d, validarPedido, valorKill, type ContaEntrada, type EntradaPainel, type EstrategiaEntrada,
} from '../painel'
import { CONFIG_GLOBAL_FECHADA, type ConfigGlobalMestres } from '../tipos'
import { montarEstrategias } from '../../copia-contas/estrategias'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

const AGORA = Date.parse('2026-09-18T22:30:00Z')
const G_ABERTA: ConfigGlobalMestres = { ligado: true, kill: false, liveDesbloqueado: true }

const est = (o: Partial<EstrategiaEntrada> & { slug: string }): EstrategiaEntrada => ({
  providerId: `prov-${o.slug}`, contaMestreId: `conta-${o.slug}`, modo: 'desligado', sinalModo: 'desligado', t2tModo: 'desligado',
  incluirMtmauto: false, mtmautoCortadoEm: null, copyfactoryIds: [], copyfactoryCortadoEm: null, maxAtrasoAberturaS: 30,
  nome: `MTM Auto ${o.slug}`, providerAtivo: true, espelhoProviderAtivo: false, mtmautoEspelhar: false,
  contaMestre: { id: `conta-${o.slug}`, login: '77000000', etiqueta: null, estado: 'ativa', motor: 'sim', saldo: 10000, equity: 10000 },
  ...o,
})
const conta = (chave: string, modo: 'sombra' | 'live', extra: Partial<ContaEntrada> = {}): ContaEntrada => ({
  contaChave: chave, contaRef: `site:${'0'.repeat(8)}-0000-0000-0000-${chave.length.toString().padStart(12, '0')}`, modo, loteFixoForcado: null,
  maxPosicoes: 10, maxRiscoTotalPct: 6, maxLoteTotal: null, falhasSeguidas: 0, bloqueada: false, bloqueioMotivo: null,
  etiqueta: null, descricao: null, email: null, ultimaFalha: null, ultimaFalhaEm: null, ...extra,
})
const rota = (id: string, slug: string, chave: string, ref = 'site:x') => ({ id, estrategia_slug: slug, tipo_rota: 'estrategia', destino_ref: ref, destino_chave: chave, ativa: true, estado: 'aprovada' })

/** O estado de 18/09 à noite: Sensei e Edge em live, Premium em sombra, GoldKiller em sombra com CF por cortar. */
function hoje(o: Partial<EntradaPainel> = {}): EntradaPainel {
  return {
    agoraMs: AGORA,
    global: G_ABERTA,
    pulso: { em: new Date(AGORA - 5_000).toISOString(), mestres: { escrita: true } },
    estrategias: [
      est({ slug: 'sensei', modo: 'live', sinalModo: 'live', t2tModo: 'sombra', copyfactoryIds: ['hbKq', 'Oca7'], copyfactoryCortadoEm: '2026-09-18T20:12:40Z', incluirMtmauto: true, mtmautoCortadoEm: '2026-09-18T20:12:39Z' }),
      est({ slug: 'mtm-auto-edge', modo: 'live', t2tModo: 'sombra' }),
      est({ slug: 'premium-ouro', nome: 'MTM Auto Premium', modo: 'sombra', sinalModo: 'sombra', t2tModo: 'sombra', copyfactoryIds: ['Hvmg', 'MxsR', '9gsL'], incluirMtmauto: true, espelhoProviderAtivo: true, mtmautoEspelhar: true }),
      est({ slug: 'Goldkiller', nome: 'MTM Auto GoldKiller', modo: 'sombra', sinalModo: 'sombra', copyfactoryIds: ['Wl1B', 'SDNb'], incluirMtmauto: true, espelhoProviderAtivo: true }),
    ],
    rotas: [
      rota('r-s1', 'sensei', 'mt:911265705@vtmarkets-demo', 'auto:a1'),
      rota('r-s2', 'sensei', 'mt:1219775@vtmarkets-demo', 'auto:a2'),
      rota('r-e1', 'mtm-auto-edge', 'mt:8049310@fxify-server'),
      rota('r-e2', 'mtm-auto-edge', 'mt:8049315@fxify-server'),
      rota('r-p1', 'premium-ouro', 'mt:1219775@vtmarkets-demo'),
      rota('r-p2', 'premium-ouro', 'mt:26421512@puprime-live 6', 'auto:a3'),
    ],
    contas: [
      conta('mt:911265705@vtmarkets-demo', 'live'),
      conta('mt:1219775@vtmarkets-demo', 'live', { etiqueta: 'Demo VT' }),
      conta('mt:8049310@fxify-server', 'live', { maxPosicoes: 3, maxRiscoTotalPct: 2 }),
      conta('mt:8049315@fxify-server', 'live', { maxPosicoes: 3, maxRiscoTotalPct: 2 }),
    ],
    ordens: [
      { id: 1, estrategia: 'sensei', conta_chave: 'mt:911265705@vtmarkets-demo', tipo: 'abrir', modo: 'live', estado: 'ok', erro: null, latencia_total_ms: 900, latencia_corretora_ms: 400, criado_em: new Date(AGORA - 60_000).toISOString() },
      { id: 2, estrategia: 'sensei', conta_chave: 'mt:1219775@vtmarkets-demo', tipo: 'abrir', modo: 'live', estado: 'erro', erro: 'timeout', latencia_total_ms: 3100, latencia_corretora_ms: null, criado_em: new Date(AGORA - 60_000).toISOString() },
      { id: 3, estrategia: 'premium-ouro', conta_chave: 'mt:1219775@vtmarkets-demo', tipo: 'abrir', modo: 'sombra', estado: 'sombra', erro: null, latencia_total_ms: null, latencia_corretora_ms: null, criado_em: new Date(AGORA - 3_600_000).toISOString() },
      { id: 4, estrategia: 'sensei', conta_chave: 'x', tipo: 'abrir', modo: 'live', estado: 'erro', erro: 'velha', latencia_total_ms: 1, latencia_corretora_ms: null, criado_em: new Date(AGORA - 2 * 86_400_000).toISOString() },
    ],
    alertas: [{ id: 7, tipo: 'falhas', estrategia: 'sensei', conta_chave: 'mt:1219775@vtmarkets-demo', mensagem: '3 falhas', criado_em: new Date(AGORA - 600_000).toISOString(), visto_em: null }],
    sinais: [{ estrategia: 'Goldkiller', modo: 'sombra', criado_em: new Date(AGORA - 7_200_000).toISOString(), symbol: 'XAUUSD', direcao: 'buy' }],
    abertasLivePorRota: { 'r-s1': 1 },
    ...o,
  }
}

// ── executor e guardas ──────────────────────────────────────────────────────
caso('executor: live = motor; sombra com CF por cortar = CopyFactory; sem CF = legado', () => {
  assert.equal(executorDe({ modo: 'live', copyfactoryIds: ['hbKq'], copyfactoryCortadoEm: 'x' }).executor, 'motor')
  assert.equal(executorDe({ modo: 'sombra', copyfactoryIds: ['Hvmg'], copyfactoryCortadoEm: null }).executor, 'copyfactory')
  assert.match(executorDe({ modo: 'sombra', copyfactoryIds: ['Hvmg'], copyfactoryCortadoEm: null }).nota, /sombra/)
  assert.equal(executorDe({ modo: 'sombra', copyfactoryIds: [], copyfactoryCortadoEm: null }).executor, 'legado')
  assert.equal(executorDe({ modo: 'desligado', copyfactoryIds: ['Wl1B'], copyfactoryCortadoEm: 'x' }).executor, 'legado')
})
caso('guarda de live = trigger 116: desbloqueio, corte CF (só propagação), MTM Auto cortado', () => {
  const e = { copyfactoryIds: ['Hvmg'], copyfactoryCortadoEm: null, incluirMtmauto: true, mtmautoCortadoEm: null }
  assert.match(motivoBloqueioLive(e, 'modo', CONFIG_GLOBAL_FECHADA)!, /não desbloqueado/)
  assert.match(motivoBloqueioLive(e, 'modo', G_ABERTA)!, /CopyFactory por cortar/)
  assert.equal(motivoBloqueioLive(e, 'sinal_modo', G_ABERTA), null, 'o sinal não depende do corte (a base só o exige na propagação)')
  assert.match(motivoBloqueioLive({ ...e, copyfactoryCortadoEm: 'x' }, 'modo', G_ABERTA)!, /MTM Auto|mtm-auto/)
  assert.equal(motivoBloqueioLive({ ...e, copyfactoryCortadoEm: 'x', mtmautoCortadoEm: 'y' }, 'modo', G_ABERTA), null)
})

// ── resumo ──────────────────────────────────────────────────────────────────
caso('resumo de hoje: Sensei/Edge live, Premium e GoldKiller em sombra, contas partilhadas', () => {
  const p = resumirPainel(hoje())
  assert.equal(p.global.estado, 'live')
  const s = p.estrategias.find((e) => e.slug === 'sensei')!
  assert.equal(s.executor, 'motor')
  assert.equal(s.nRotasLive, 2)
  assert.equal(s.nContasLive, 2)
  assert.equal(s.abertasLive, 1)
  assert.equal(s.ordens24h.total, 2, 'a ordem de há 2 dias não conta nas 24 h')
  assert.equal(s.ordens24h.erro, 1)
  assert.equal(s.ordens24h.latP95Ms, 3100)
  assert.equal(s.bloqueioLive.modo, null)
  const pr = p.estrategias.find((e) => e.slug === 'premium-ouro')!
  assert.equal(pr.executor, 'copyfactory')
  assert.equal(pr.nRotasLive, 0, 'conta em live mas estratégia em sombra → sombra')
  assert.ok(pr.rotas.every((r) => r.efectivo === 'sombra'))
  assert.match(pr.bloqueioLive.modo!, /CopyFactory por cortar/)
  assert.equal(pr.rotuloMestre, 'Mestre · Premium')
  const gk = p.estrategias.find((e) => e.slug === 'Goldkiller')!
  assert.equal(gk.ultimoSinal?.symbol, 'XAUUSD', 'o sinal casa com o slug sem olhar às maiúsculas')
  // a conta partilhada (Sensei live + Premium sombra) aparece com as duas estratégias
  const vt = p.contas.find((c) => c.contaChave === 'mt:1219775@vtmarkets-demo')!
  assert.deepEqual(vt.estrategias.map((x) => `${x.slug}:${x.efectivo}`).sort(), ['premium-ouro:sombra', 'sensei:live'])
  assert.equal(vt.etiqueta, 'Demo VT')
  // conta só com rota (sem linha em mestres_contas) entra em sombra por omissão
  const pu = p.contas.find((c) => c.contaChave === 'mt:26421512@puprime-live 6')!
  assert.equal(pu.modo, 'sombra')
  assert.equal(p.totais.contasLive, 4)
  assert.equal(p.totais.rotasLive, 4)
  assert.equal(p.totais.estrategiasLive, 2)
  assert.equal(p.totais.falhas24h, 1)
  assert.equal(p.totais.alertasNovos, 1)
  assert.ok(p.alertas.some((a) => a.id === 'mestres-falhas'))
  assert.ok(p.alertas.some((a) => a.id === 'mestres-alertas'))
})
caso('kill-switch: tudo parado, alerta grave primeiro', () => {
  const p = resumirPainel(hoje({ global: { ...G_ABERTA, kill: true } }))
  assert.equal(p.global.estado, 'kill')
  assert.ok(p.estrategias.every((e) => e.rotas.every((r) => r.efectivo === 'parado')))
  assert.equal(p.totais.rotasLive, 0)
  assert.equal(p.alertas[0].id, 'mestres-kill')
  assert.equal(p.alertas[0].severidade, 'grave')
})
caso('serviço calado com estratégias em live → grave; escrita desligada no VPS → sombra com motivo', () => {
  const calado = resumirPainel(hoje({ pulso: { em: new Date(AGORA - 600_000).toISOString(), mestres: { escrita: true } } }))
  assert.equal(calado.global.estado, 'sem-pulso')
  assert.equal(calado.alertas.find((a) => a.id === 'mestres-pulso')?.severidade, 'grave')
  const semEscrita = resumirPainel(hoje({ pulso: { em: new Date(AGORA).toISOString(), mestres: { escrita: false } } }))
  assert.equal(semEscrita.global.estado, 'sombra')
  const r = semEscrita.estrategias.find((e) => e.slug === 'sensei')!.rotas[0]
  assert.equal(r.efectivo, 'sombra')
  assert.match(r.motivo, /MESTRES_ESCRITA/)
  assert.ok(semEscrita.alertas.some((a) => a.id === 'mestres-escrita'))
})
caso('avisos: sinal live com espelho provider ligado; CF cortada sem propagação live', () => {
  const p = resumirPainel(hoje({
    estrategias: [
      est({ slug: 'premium-ouro', modo: 'sombra', sinalModo: 'live', espelhoProviderAtivo: true }),
      est({ slug: 'gk', modo: 'sombra', copyfactoryIds: ['Wl1B'], copyfactoryCortadoEm: 'x' }),
    ],
  }))
  assert.ok(p.estrategias.find((e) => e.slug === 'premium-ouro')!.avisos.some((a) => /espelho provider/.test(a)))
  assert.ok(p.estrategias.find((e) => e.slug === 'gk')!.avisos.some((a) => /não recebem/.test(a)))
})

// ── pedidos, palavras e permissões ──────────────────────────────────────────
caso('palavras de confirmação', () => {
  assert.equal(palavraDeConfirmacao({ tipo: 'estrategia', slug: 'sensei', campo: 'modo', valor: 'live' }), 'LIVE sensei')
  assert.equal(palavraDeConfirmacao({ tipo: 'estrategia', slug: 'sensei', campo: 'modo', valor: 'sombra' }), 'CONFIRMAR')
  assert.equal(palavraDeConfirmacao({ tipo: 'conta', contaChave: 'mt:1@x', valor: 'live' }), 'LIVE')
  assert.equal(palavraDeConfirmacao({ tipo: 'kill', valor: true }), 'KILL')
  assert.equal(palavraDeConfirmacao({ tipo: 'kill', valor: false }), 'RETOMAR')
  assert.equal(palavraDeConfirmacao({ tipo: 'alertas_vistos', ids: [1] }), null)
})
caso('lerPedido recusa formas inválidas (o corpo vem do browser)', () => {
  assert.ok('erro' in lerPedido(null))
  assert.ok('erro' in lerPedido({ tipo: 'estrategia', slug: 'sensei', campo: 'ativo', valor: 'live' }))
  assert.ok('erro' in lerPedido({ tipo: 'estrategia', slug: 'sensei', campo: 'modo', valor: 'ligado' }))
  assert.ok('erro' in lerPedido({ tipo: 'conta', contaChave: 'site:abc', valor: 'live' }), 'contaChave é a física (mt:/tl:)')
  assert.ok('erro' in lerPedido({ tipo: 'kill', valor: 'true' }))
  assert.ok('erro' in lerPedido({ tipo: 'alertas_vistos', ids: ['1; drop table'] }))
  assert.ok('erro' in lerPedido({ tipo: 'live_desbloqueado', valor: true }), 'o desbloqueio do live não se faz pelo painel')
  const ok = lerPedido({ tipo: 'estrategia', slug: 'sensei', campo: 'sinal_modo', valor: 'sombra', confirmacao: ' CONFIRMAR ' })
  assert.ok(!('erro' in ok) && ok.tipo === 'estrategia' && ok.confirmacao === 'CONFIRMAR')
})
caso('validarPedido: sem palavra não passa; live recusado como a base; parar passa sempre', () => {
  const e = est({ slug: 'premium-ouro', copyfactoryIds: ['Hvmg'] })
  assert.equal(validarPedido({ tipo: 'estrategia', slug: 'premium-ouro', campo: 'modo', valor: 'live' }, { global: G_ABERTA, estrategia: e }).ok, false)
  const semCorte = validarPedido({ tipo: 'estrategia', slug: 'premium-ouro', campo: 'modo', valor: 'live', confirmacao: 'LIVE premium-ouro' }, { global: G_ABERTA, estrategia: e })
  assert.ok(!semCorte.ok && semCorte.status === 409 && /CopyFactory/.test(semCorte.erro))
  assert.equal(validarPedido({ tipo: 'estrategia', slug: 'premium-ouro', campo: 'sinal_modo', valor: 'live', confirmacao: 'LIVE premium-ouro' }, { global: G_ABERTA, estrategia: e }).ok, true)
  const fechado = validarPedido({ tipo: 'estrategia', slug: 'premium-ouro', campo: 'sinal_modo', valor: 'live', confirmacao: 'LIVE premium-ouro' }, { global: CONFIG_GLOBAL_FECHADA, estrategia: e })
  assert.ok(!fechado.ok && /desbloqueado/.test(fechado.erro))
  assert.equal(validarPedido({ tipo: 'estrategia', slug: 'x', campo: 'modo', valor: 'sombra', confirmacao: 'CONFIRMAR' }, { global: G_ABERTA, estrategia: null }).ok, false, 'estratégia fora do motor')
  assert.equal(validarPedido({ tipo: 'estrategia', slug: 'premium-ouro', campo: 'modo', valor: 'desligado', confirmacao: 'CONFIRMAR' }, { global: CONFIG_GLOBAL_FECHADA, estrategia: e }).ok, true)
  assert.equal(validarPedido({ tipo: 'conta', contaChave: 'mt:1@x', valor: 'live', confirmacao: 'LIVE' }, { global: CONFIG_GLOBAL_FECHADA, contaExiste: true }).ok, false)
  assert.equal(validarPedido({ tipo: 'conta', contaChave: 'mt:1@x', valor: 'live', confirmacao: 'LIVE' }, { global: G_ABERTA, contaExiste: false }).ok, false)
  assert.equal(validarPedido({ tipo: 'conta', contaChave: 'mt:1@x', valor: 'sombra', confirmacao: 'CONFIRMAR' }, { global: CONFIG_GLOBAL_FECHADA, contaExiste: true }).ok, true)
  assert.equal(validarPedido({ tipo: 'kill', valor: true, confirmacao: 'KILL' }, { global: CONFIG_GLOBAL_FECHADA }).ok, true)
  assert.equal(validarPedido({ tipo: 'kill', valor: true, confirmacao: 'kill' }, { global: G_ABERTA }).ok, false)
})
caso('kill só mexe no kill (nunca liga o motor nem desbloqueia o live)', () => {
  assert.deepEqual(valorKill({ ligado: false, kill: false, liveDesbloqueado: false }, true), { ligado: false, kill: true, live_desbloqueado: false })
  assert.deepEqual(valorKill(G_ABERTA, false), { ligado: true, kill: false, live_desbloqueado: true })
})
caso('rotas novas: só administradores, verificado no servidor; a escrita só é chamada por elas', () => {
  const raiz = process.cwd()
  for (const f of ['app/api/admin/mtmauto-copia/mestres/route.ts', 'app/api/admin/centro/mestres/route.ts', 'app/api/admin/centro/metricas-90d/route.ts']) {
    const src = readFileSync(join(raiz, f), 'utf8')
    const metodos = [...src.matchAll(/export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
    const guardados = [...src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*soAdmin\(/g)].map((m) => m[1])
    assert.ok(metodos.length > 0, f)
    assert.deepEqual(guardados.sort(), metodos.sort(), `${f}: handler sem soAdmin`)
  }
  assert.doesNotMatch(readFileSync(join(raiz, 'app/api/admin/centro/mestres/route.ts'), 'utf8'), /aplicarPedidoMestres|export const POST/, 'o centro só lê')
  const importadores: string[] = []
  const andar = (d: string) => {
    for (const x of readdirSync(d)) {
      if (x === 'node_modules' || x.startsWith('.')) continue
      const p = join(d, x)
      if (statSync(p).isDirectory()) andar(p)
      else if (/\.(ts|tsx)$/.test(x) && readFileSync(p, 'utf8').includes('mestres/servidor/painel-escrita')) importadores.push(p.slice(raiz.length + 1))
    }
  }
  for (const d of ['app', 'components', 'lib']) andar(join(raiz, d))
  // Desde 05/10 a escrita das mestres só entra pela camada única (lib/admin-centro/servidor/
  // estrategia-escrita.ts, acção `mestres`), que tem a guarda de equipa; a rota antiga é fachada dela.
  assert.deepEqual(importadores.filter((f) => !f.includes('__tests__')), ['lib/admin-centro/servidor/estrategia-escrita.ts'])
  assert.match(readFileSync(join(raiz, 'app/api/admin/mtmauto-copia/mestres/route.ts'), 'utf8'), /escreverEstrategia/, 'a rota antiga passa pela camada única')
})

// ── emblema das mestres ─────────────────────────────────────────────────────
caso('«Mestre · <estratégia>» por conta SIM', () => {
  assert.equal(nomeCurtoEstrategia('MTM Auto Sensei', 'sensei'), 'Sensei')
  assert.equal(nomeCurtoEstrategia(null, 'premium-ouro'), 'Premium')
  assert.equal(nomeCurtoEstrategia('', 'mtm-auto-edge'), 'Edge')
  assert.equal(rotuloMestre('MTM Auto GoldKiller', 'Goldkiller'), 'Mestre · GoldKiller')
  const m = mestresPorConta([
    { conta_mestre_id: 'c1', slug: 'sensei', nome: 'MTM Auto Sensei', modo: 'live' },
    { conta_mestre_id: 'c2', slug: 'premium-ouro', nome: 'MTM Auto Premium', modo: 'nada' },
    { conta_mestre_id: null, slug: 'x' },
  ])
  assert.equal(m.size, 2)
  assert.deepEqual(m.get('c1'), { slug: 'sensei', nome: 'Sensei', rotulo: 'Mestre · Sensei', modo: 'live' })
  assert.equal(m.get('c2')?.modo, 'desligado')
})

// ── métricas 90 d ───────────────────────────────────────────────────────────
caso('90 d: reais publicadas; simuladas só sem reais e nunca somadas', () => {
  const real = resumo90d({ winrate: 71.4, fechados: 7, pips: 123.4, fatorLucro: 2.1, simuladas: { trades: 50, winrate: 40, pips: -10 } })
  assert.equal(real.temHistorico, true)
  assert.equal(real.simuladas, null, 'com reais, as simuladas nem aparecem')
  assert.equal(textoResumo90d(real), '71,4% · 7 trades · +123,4 pips')
  const so = resumo90d({ winrate: null, fechados: 0, pips: null, fatorLucro: null, simuladas: { trades: 20, winrate: 55, pips: 30 } })
  assert.equal(so.temHistorico, false)
  assert.equal(so.winrate, null)
  assert.equal(so.fechados, 0)
  assert.equal(textoResumo90d(so), 'sem histórico real (simuladas: 55% · 20)')
  assert.equal(textoResumo90d(resumo90d({ winrate: 50, fechados: 0, pips: 0, fatorLucro: null })), 'sem histórico real', 'percentagem sem trades não é histórico')
  assert.equal(textoResumo90d(null), '—')
})

// ── reconciliação CopyFactory com o motor ───────────────────────────────────
caso('reconciliação: CF cortada não é «devia copiar»; ainda subscrita = em dobro; slug do motor não é «estratégia morta»', () => {
  const linhas = montarEstrategias({
    estrategiasCf: [{ id: 'Oca7', accountId: 'acc-sensei', name: 'Sensei' }, { id: 'Hvmg', accountId: 'acc-premium', name: 'Premium' }],
    subscritoresCf: [{ id: 'acc-a', subscriptions: [{ strategyId: 'Oca7' }] }, { id: 'acc-b', subscriptions: [] }, { id: 'acc-c', subscriptions: [] }],
    providers: [
      { id: 'p-s', slug: 'sensei', ativo: true, metaapi_account_id: 'acc-sensei' },
      { id: 'p-e', slug: 'mtm-auto-edge', ativo: true, metaapi_account_id: null },
      { id: 'p-gd', slug: 'gold-did-premium', ativo: false, metaapi_account_id: 'acc-morta' },
    ],
    site: [
      { id: 's-a', user_id: 'u1', metaapi_account_id: 'acc-a', mt5_status: 'connected', copyfactory_strategy_pick: 'Oca7', is_active: true },
      { id: 's-b', user_id: 'u2', metaapi_account_id: 'acc-b', mt5_status: 'connected', copyfactory_strategy_pick: 'Oca7', is_active: true },
      { id: 's-c', user_id: 'u3', metaapi_account_id: 'acc-c', mt5_status: 'connected', strategy_lots: { 'mtm-auto-edge': 1 }, is_active: true },
      { id: 's-d', user_id: 'u4', metaapi_account_id: 'acc-b', mt5_status: 'connected', copyfactory_strategy_pick: 'Hvmg', is_active: true },
    ],
    auto: [], subsAuto: [], funded: [],
    motor: { idsCortados: new Set(['Oca7', 'hbKq']), slugs: new Set(['sensei', 'mtm-auto-edge', 'premium-ouro']), slugsLive: new Set(['sensei', 'mtm-auto-edge']) },
  })
  const sensei = linhas.find((l) => l.strategyId === 'Oca7')!
  assert.equal(sensei.servidaPeloMotor, true)
  const a = sensei.seguidores.find((s) => s.ref === 'site:s-a')!
  assert.deepEqual(a.flags, ['copia_cortada'])
  assert.equal(a.reparavelSiteId, 's-a', 'o re-sync tira a subscrição (a sincronização exclui os ids servidos pelo motor)')
  assert.deepEqual(sensei.seguidores.find((s) => s.ref === 'site:s-b')!.flags, [], 'cortada e não subscrita: é o esperado')
  const edge = linhas.find((l) => l.strategyId === 'mtm-auto-edge')!
  assert.equal(edge.flags.includes('copia_estrategia_morta'), false)
  assert.equal(edge.servidaPeloMotor, true)
  const prov = linhas.find((l) => l.slug === 'mtm-auto-edge' && !l.strategyId)
  assert.ok(!prov || !prov.flags.includes('sem_estrategia_cf'), 'Edge não tem CopyFactory por desenho')
  assert.ok(!linhas.some((l) => l.slug === 'gold-did-premium'), 'Gold Did inactivo e sem ninguém: escondido')
  const premium = linhas.find((l) => l.strategyId === 'Hvmg')!
  assert.ok(premium.flags.includes('devia_copiar_nao_copia'), 'Premium ainda na CopyFactory: a divergência continua a contar')
  assert.ok(!premium.servidaPeloMotor)
})

let falhas = 0
for (const c of casos) {
  try {
    c.f()
    console.log(`✓ ${c.nome}`)
  } catch (e) {
    falhas++
    console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`\npainel das mestres: ${casos.length - falhas}/${casos.length}`)
if (falhas) process.exit(1)
