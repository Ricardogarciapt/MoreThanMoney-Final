/**
 * A CADEIA «QUEM COPIA O QUÊ» — leitura (vista simples + quadro) e as escritas do quadro.
 *
 * Leitura: uma passagem por `mtmauto_providers`, `mestres_estrategias`, `copia_rotas`,
 * `mestres_contas` e as tabelas de contas, e a árvore monta-se em `lib/copia-contas/cadeia.ts`
 * (puro). Cache de 10 s, como o resto do Centro.
 *
 * ═══ ESCRITAS: PELO DESEJO, NUNCA PELA ROTA ═════════════════════════════════════════════════
 *
 * Arrastar um subscritor de uma estratégia para outra NÃO se faz mexendo em `copia_rotas`. As
 * rotas das mestres são DERIVADAS: `lib/mestres/planear.ts` calcula-as a partir do que o cliente
 * escolheu (`mtmcopy_connections.strategy_lots` no site, `mtmauto_subscriptions.provider_id` no
 * MTM Auto) e `scripts/mestres/sincronizar-rotas.ts` reescreve-as. Uma rota mudada à mão volta
 * atrás na sincronização seguinte — é a mesma armadilha que já custou caro na pausa do MTM Copy,
 * onde o `repair` voltava a subscrever na CopyFactory o que se tinha acabado de parar.
 *
 * Por isso o quadro escreve na FONTE DO DESEJO e depois manda ressincronizar as estratégias
 * tocadas. O que se vê no quadro logo a seguir é o que a base tem, não o que o ecrã esperava.
 *
 * Criar contas para um utilizador reusa `lib/mtmfunded/contas-estrategia.ts` — o mesmo caminho
 * idempotente do admin (conta simulada + linha no MTM Auto + subscrição), sem segunda versão.
 *
 * O que o quadro NÃO propaga (e diz que não propaga): a disposição dos nós é decoração e vive em
 * `site_settings.copia_cadeia_layout`; mover um nó não muda nada no sistema.
 */
import { emCache, esquecerCache } from '@/lib/admin-centro/cache'
import { linhaDeAgua, provenienciaDoMotor } from '@/lib/admin-centro/linha-de-agua'
import { db, ler, num, txt, type Linha } from '@/lib/admin-centro/servidor/base'
import { registarAuditoria } from '@/lib/admin-centro/servidor/outros'
import { lerEtiquetas } from '@/lib/contas/etiquetas-servidor'
import { ESTRATEGIA_DO_CANAL } from '@/lib/mestres/t2t'
import { lerConfigGlobal, lerContaMestres, lerEstrategiaMestre } from '@/lib/mestres/tipos'
import { sincronizarRotasDaEstrategia } from '@/lib/mestres/servidor/sincronizar-rotas'
import {
  montarCadeia, normalizarDisposicao, type Cadeia, type EstrategiaEntrada, type NomeConta, type RotaEntrada,
} from '../cadeia'
import { escreverTravas, lerTravas, temTravas, type TravasMestre } from '../mestre-travas'
import { CHAVES_GESTAO, lerGestaoMestre, normalizarGestaoMestre, textoDaGestao } from '../mestre-gestao'
import { lerRef } from '../regras'
import { lerInterruptores } from './base'

export const CHAVE_CACHE_CADEIA = 'copia:cadeia'
export const CHAVE_DISPOSICAO = 'copia_cadeia_layout'

export type CadeiaLida = Cadeia & { lidaEm: string; pendente: boolean }

export async function carregarCadeia(): Promise<CadeiaLida> {
  return (await emCache(CHAVE_CACHE_CADEIA, 10_000, lerCadeia)).v
}

/** Canal do chat de cada estratégia — o inverso do mapa que o T2T já usa (uma só tabela). */
const CANAL_DA_ESTRATEGIA = new Map(Object.entries(ESTRATEGIA_DO_CANAL).map(([canal, slug]) => [slug.toLowerCase(), canal]))

async function lerCadeia(): Promise<CadeiaLida> {
  const [cfg, provs, ests, rotas, contasM, pulso, interruptores] = await Promise.all([
    ler(db().from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()),
    // `sinais_config` entra na leitura por causa das TRAVAS da mestre (sinais_config.travas): o nó do
    // quadro edita-as, e quem as aplica é lib/mestres/servidor/sinal-mestre.ts.
    ler(db().from('mtmauto_providers').select('id, slug, nome, ativo, fonte_sinais, fonte_filtro, funded_account_id, sinais_config').is('apagado_em', null).limit(200)),
    ler(db().from('mestres_estrategias').select('*').limit(200)),
    ler(db().from('copia_rotas').select('id, user_id, mestres, tipo_rota, estrategia_slug, origem_ref, origem_chave, destino_ref, destino_chave, rotulo, modo_lote, valor, ativa, estado, modo, pausada_motivo').neq('estado', 'recusada').limit(3000)),
    ler(db().from('mestres_contas').select('*').limit(2000)),
    ler(db().from('servicos_pulso').select('em, estado').eq('servico', 'mtm-copia-contas').maybeSingle()),
    lerInterruptores().catch(() => ({ globalLigado: false, liveDesbloqueado: false, escritaNoProcesso: false })),
  ])
  const pendente = ests.semTabela || rotas.semTabela

  const linhasEst = ests.linhas.map(lerEstrategiaMestre)
  const estPorProvider = new Map(linhasEst.map((e) => [e.providerId, e]))
  const contaIds = linhasEst.map((e) => e.contaMestreId).filter(Boolean)
  const rotaIds = rotas.linhas.map((r) => String(r.id))

  const [contasMestre, etiqFunded, abertas, disposicaoBruta] = await Promise.all([
    contaIds.length ? ler(db().from('mtm_trading_accounts').select('id, mt5_login, motor, saldo_inicial, sim_saldo, sim_equity').in('id', contaIds)) : Promise.resolve({ linhas: [] as Linha[] }),
    lerEtiquetas('mtm_trading_accounts'),
    rotaIds.length ? ler(db().from('copia_posicoes').select('rota_id').in('rota_id', rotaIds.slice(0, 1000)).in('estado', ['aberta', 'enviando', 'sombra']).limit(5000)) : Promise.resolve({ linhas: [] as Linha[] }),
    ler(db().from('site_settings').select('value').eq('key', CHAVE_DISPOSICAO).maybeSingle()),
  ])
  const contaMestrePorId = new Map(contasMestre.linhas.map((c) => [String(c.id), c]))
  const abertasPorRota: Record<string, number> = {}
  for (const p of abertas.linhas) abertasPorRota[String(p.rota_id)] = (abertasPorRota[String(p.rota_id)] ?? 0) + 1

  const estrategias: EstrategiaEntrada[] = provs.linhas.map((p) => {
    const mestre = estPorProvider.get(String(p.id)) ?? null
    const c = mestre ? contaMestrePorId.get(mestre.contaMestreId) ?? null : null
    const slug = String(p.slug)
    return {
      mestre,
      providerId: String(p.id),
      slug,
      nome: txt(p.nome) ?? slug,
      ativo: p.ativo !== false,
      fonteSinais: txt(p.fonte_sinais),
      fonteFiltro: txt(p.fonte_filtro),
      canalChat: CANAL_DA_ESTRATEGIA.get(slug.toLowerCase()) ?? null,
      // Ids CopyFactory ainda por cortar: com eles, quem copia é a CopyFactory e não o nosso motor.
      copyfactoryPorCortar: mestre && !mestre.copyfactoryCortadoEm ? mestre.copyfactoryIds : [],
      travas: lerTravas(p.sinais_config),
      gestao: lerGestaoMestre(p.sinais_config),
      contaMestre: c
        ? {
            id: String(c.id), login: txt(c.mt5_login), etiqueta: etiqFunded.get(String(c.id)) ?? null,
            saldo: num(c.sim_saldo), equity: num(c.sim_equity), saldoInicial: num(c.saldo_inicial),
            // A mesma conta do resto do Centro (lib/admin-centro/linha-de-agua) — as mestres são
            // `motor='sim'`, por isso saem marcadas como simuladas e nunca passam por prova.
            linhaDeAgua: linhaDeAgua(num(c.sim_saldo), num(c.saldo_inicial), provenienciaDoMotor(txt(c.motor))),
          }
        : null,
    }
  })

  const rotasEntrada: RotaEntrada[] = rotas.linhas.map((r) => ({
    id: String(r.id),
    userId: txt(r.user_id),
    mestres: r.mestres === true,
    tipoRota: txt(r.tipo_rota),
    estrategiaSlug: txt(r.estrategia_slug),
    origemRef: String(r.origem_ref),
    origemChave: String(r.origem_chave),
    destinoRef: String(r.destino_ref),
    destinoChave: String(r.destino_chave),
    rotulo: txt(r.rotulo),
    modoLote: String(r.modo_lote ?? 'multiplicador'),
    valor: Number(r.valor ?? 1),
    ativa: r.ativa !== false,
    estado: String(r.estado ?? ''),
    modoColuna: String(r.modo ?? 'shadow'),
    pausadaMotivo: txt(r.pausada_motivo),
    abertas: abertasPorRota[String(r.id)] ?? 0,
  }))

  const nomes = await nomesDasContas(rotasEntrada.map((r) => r.destinoRef))

  const global = lerConfigGlobal(cfg.linhas[0]?.value)
  const estadoPulso = (pulso.linhas[0]?.estado ?? null) as Record<string, unknown> | null
  const escritaNoProcesso = (estadoPulso?.mestres as Record<string, unknown> | null)?.escrita === true

  const chaves = [
    ...estrategias.map((e) => `estrategia:${e.slug}`),
    ...rotasEntrada.map((r) => r.destinoChave),
  ]
  const cadeia = montarCadeia({
    global,
    escritaNoProcesso,
    interruptores078: interruptores,
    estrategias,
    rotas: rotasEntrada,
    contasMestres: contasM.linhas.map(lerContaMestres),
    nomes,
    disposicao: normalizarDisposicao(disposicaoBruta.linhas[0]?.value, chaves),
  })
  if (rotas.erro) cadeia.avisos.push(`copia_rotas: ${rotas.erro}`)
  if (ests.erro) cadeia.avisos.push(`mestres_estrategias: ${ests.erro}`)
  if (!escritaNoProcesso && global.ligado) {
    cadeia.avisos.push('O VPS não está a reportar MESTRES_ESCRITA=1 — mesmo uma estratégia em live fica em sombra.')
  }
  return { ...cadeia, lidaEm: new Date().toISOString(), pendente }
}

/** Etiqueta do dono + login@servidor + email de cada conta de destino (as três tabelas). */
async function nomesDasContas(refs: string[]): Promise<NomeConta[]> {
  const porOrigem: Record<'site' | 'auto' | 'wt' | 'funded', string[]> = { site: [], auto: [], wt: [], funded: [] }
  for (const ref of new Set(refs)) {
    const x = lerRef(ref)
    if (x && x.origem !== 'prov') porOrigem[x.origem].push(x.id)
  }
  const [site, auto, wt, funded, etSite, etAuto, etWt, etFunded] = await Promise.all([
    porOrigem.site.length ? ler(db().from('mtmcopy_connections').select('id, user_id, account_label, mt5_login, mt5_server').in('id', porOrigem.site.slice(0, 1000))) : Promise.resolve({ linhas: [] as Linha[] }),
    porOrigem.auto.length ? ler(db().from('mtmauto_accounts').select('id, user_id, rotulo, login, servidor').in('id', porOrigem.auto.slice(0, 1000))) : Promise.resolve({ linhas: [] as Linha[] }),
    porOrigem.wt.length ? ler(db().from('webtrader_contas_mt5').select('id, user_id, rotulo, login, servidor').in('id', porOrigem.wt.slice(0, 1000))) : Promise.resolve({ linhas: [] as Linha[] }),
    porOrigem.funded.length ? ler(db().from('mtm_trading_accounts').select('id, user_id, mt5_login, tipo').in('id', porOrigem.funded.slice(0, 1000))) : Promise.resolve({ linhas: [] as Linha[] }),
    lerEtiquetas('mtmcopy_connections'), lerEtiquetas('mtmauto_accounts'), lerEtiquetas('webtrader_contas_mt5'), lerEtiquetas('mtm_trading_accounts'),
  ])
  const out: NomeConta[] = []
  for (const l of site.linhas) out.push({ ref: `site:${l.id}`, etiqueta: etSite.get(String(l.id)) ?? null, descricao: `${txt(l.account_label) ? `${l.account_label} · ` : ''}${l.mt5_login ?? '?'} @ ${l.mt5_server ?? '?'} (site/T2T)`, email: null, userId: txt(l.user_id) })
  for (const l of auto.linhas) out.push({ ref: `auto:${l.id}`, etiqueta: etAuto.get(String(l.id)) ?? null, descricao: `${txt(l.rotulo) ? `${l.rotulo} · ` : ''}${l.login ?? '?'} @ ${l.servidor ?? '?'} (MTM Auto)`, email: null, userId: txt(l.user_id) })
  for (const l of wt.linhas) out.push({ ref: `wt:${l.id}`, etiqueta: etWt.get(String(l.id)) ?? null, descricao: `${txt(l.rotulo) ? `${l.rotulo} · ` : ''}${l.login ?? '?'} @ ${l.servidor ?? '?'} (WebTrader)`, email: null, userId: txt(l.user_id) })
  for (const l of funded.linhas) out.push({ ref: `funded:${l.id}`, etiqueta: etFunded.get(String(l.id)) ?? null, descricao: `${l.mt5_login ?? '?'} (MTM Funded ${txt(l.tipo) ?? ''})`.trim(), email: null, userId: txt(l.user_id) })

  const userIds = [...new Set(out.map((o) => o.userId).filter((x): x is string => Boolean(x)))]
  if (userIds.length) {
    const perfis = await ler(db().from('profiles').select('id, email').in('id', userIds.slice(0, 1000)))
    const email = new Map(perfis.linhas.map((p) => [String(p.id), txt(p.email)]))
    for (const o of out) o.email = o.userId ? email.get(o.userId) ?? null : null
  }
  return out
}

// ── escritas do quadro ──────────────────────────────────────────────────────

export interface Resposta { ok: boolean; status: number; mensagem: string; detalhe?: unknown }

/** A disposição dos nós. Decoração: não toca em rota nenhuma (e a resposta diz isso). */
export async function guardarDisposicao(adminId: string, bruta: unknown): Promise<Resposta> {
  const cadeia = await carregarCadeia()
  const chaves = [
    ...cadeia.estrategias.map((e) => e.chave),
    ...cadeia.estrategias.flatMap((e) => e.subscritores.map((s) => s.chave)),
    ...cadeia.contaAConta.map((s) => s.chave),
    ...cadeia.orfas.map((s) => s.chave),
  ]
  const limpa = normalizarDisposicao(bruta, chaves)
  const { error } = await db().from('site_settings').upsert({ key: CHAVE_DISPOSICAO, value: limpa }, { onConflict: 'key' })
  esquecerCache(CHAVE_CACHE_CADEIA)
  await registarAuditoria({ adminId, acao: 'cadeia:disposicao', alvo: CHAVE_DISPOSICAO, pedido: { nos: Object.keys(limpa).length }, resultado: { erro: error?.message ?? null }, ok: !error })
  return error
    ? { ok: false, status: 500, mensagem: error.message }
    : { ok: true, status: 200, mensagem: `Disposição guardada (${Object.keys(limpa).length} nós). Só o desenho — não mexe em rotas nem em subscrições.` }
}

/**
 * Ligar / desligar uma conta a uma estratégia — pela FONTE DO DESEJO.
 *
 *  · `site:<id>` → `mtmcopy_connections.strategy_lots[slug]`. A chave é o SLUG da estratégia do
 *    motor (`planear.ligacaoSegueEstrategia` aceita-a ao lado dos ids CopyFactory); `true` = o
 *    risco/lote que a ligação já tem, um número = lote fixo.
 *  · `auto:<id>` → `mtmauto_subscriptions` (uma linha por provider, com `conta_id` nesta conta).
 *
 * Depois ressincroniza a(s) estratégia(s) tocada(s) com a MESMA função do script, para as rotas
 * ficarem como a base as quer — e não como o ecrã as desenhou.
 */
export async function ligarSubscritor(
  adminId: string,
  p: { ref: string; slug: string; ligar: boolean; lote?: number | null },
): Promise<Resposta> {
  const alvo = `${p.ref}→${p.slug}`
  let r: Resposta
  try {
    const x = lerRef(p.ref)
    if (!x || (x.origem !== 'site' && x.origem !== 'auto')) {
      r = { ok: false, status: 400, mensagem: 'Só contas do site (site:) ou do MTM Auto (auto:) seguem estratégias por aqui.' }
    } else {
      const { data: prov } = await db().from('mtmauto_providers').select('id, slug, nome, ativo').ilike('slug', p.slug).is('apagado_em', null).maybeSingle()
      if (!prov) r = { ok: false, status: 404, mensagem: `Estratégia «${p.slug}» não existe (ou está apagada).` }
      else if (x.origem === 'site') r = await ligarLigacaoSite(x.id, String(prov.slug), p.ligar, p.lote ?? null)
      else r = await ligarContaAuto(x.id, String(prov.id), String(prov.slug), p.ligar)
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: e instanceof Error ? e.message : String(e) }
  }
  if (r.ok) {
    const sinc = await sincronizarRotasDaEstrategia(p.slug).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }))
    r = { ...r, detalhe: { sincronizacao: sinc } }
  }
  esquecerCache(CHAVE_CACHE_CADEIA)
  await registarAuditoria({ adminId, acao: `cadeia:${p.ligar ? 'ligar' : 'desligar'}`, alvo, pedido: p, resultado: r, ok: r.ok })
  return r
}

async function ligarLigacaoSite(id: string, slug: string, ligar: boolean, lote: number | null): Promise<Resposta> {
  const { data: l, error } = await db().from('mtmcopy_connections').select('id, strategy_lots, is_active, mt5_status').eq('id', id).maybeSingle()
  if (error || !l) return { ok: false, status: 404, mensagem: error?.message ?? 'ligação não encontrada' }
  const atuais = l.strategy_lots && typeof l.strategy_lots === 'object' ? { ...(l.strategy_lots as Record<string, unknown>) } : {}
  // A comparação é insensível a maiúsculas porque os slugs da casa não o são («Goldkiller»).
  const jaLa = Object.keys(atuais).find((k) => k.toLowerCase() === slug.toLowerCase())
  if (ligar) {
    // Uma conta pode seguir VÁRIAS estratégias: `strategy_lots` é um mapa, não uma escolha única.
    atuais[jaLa ?? slug] = lote != null && lote > 0 ? lote : true
  } else {
    if (!jaLa) return { ok: true, status: 200, mensagem: 'Esta ligação já não seguia a estratégia.' }
    delete atuais[jaLa]
  }
  const { error: eUp } = await db().from('mtmcopy_connections').update({ strategy_lots: atuais, updated_at: new Date().toISOString() }).eq('id', id)
  if (eUp) return { ok: false, status: 409, mensagem: `A base recusou: ${eUp.message}` }
  const { data: relida } = await db().from('mtmcopy_connections').select('strategy_lots').eq('id', id).maybeSingle()
  const agora = Object.keys((relida?.strategy_lots ?? {}) as Record<string, unknown>)
  const bate = ligar ? agora.some((k) => k.toLowerCase() === slug.toLowerCase()) : !agora.some((k) => k.toLowerCase() === slug.toLowerCase())
  return bate
    ? { ok: true, status: 200, mensagem: `${ligar ? 'Passa' : 'Deixa'} a seguir «${slug}». A ligação segue agora: ${agora.join(', ') || '—'}.` }
    : { ok: false, status: 500, mensagem: `Gravado mas a releitura dá «${agora.join(', ')}» — confirmar na base.` }
}

async function ligarContaAuto(contaId: string, providerId: string, slug: string, ligar: boolean): Promise<Resposta> {
  const { data: conta } = await db().from('mtmauto_accounts').select('id, user_id').eq('id', contaId).maybeSingle()
  if (!conta) return { ok: false, status: 404, mensagem: 'conta MTM Auto não encontrada' }
  const userId = String(conta.user_id)
  const { data: sub } = await db().from('mtmauto_subscriptions').select('id, ativo, conta_id').eq('user_id', userId).eq('provider_id', providerId).maybeSingle()
  if (!ligar) {
    if (!sub) return { ok: true, status: 200, mensagem: 'Esta pessoa já não tinha subscrição a esta estratégia.' }
    // NÃO se apaga: desactiva-se. Apagar perde o histórico e o motor trata «inactivo» como pausa,
    // o que deixa fechar o que está aberto em vez de o abandonar.
    const { error } = await db().from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('id', sub.id)
    return error ? { ok: false, status: 409, mensagem: error.message } : { ok: true, status: 200, mensagem: `Subscrição a «${slug}» desactivada (não apagada — o que está aberto continua a ser gerido até fechar).` }
  }
  const escrita = sub
    ? await db().from('mtmauto_subscriptions').update({ ativo: true, conta_id: contaId }).eq('id', sub.id)
    : await db().from('mtmauto_subscriptions').insert({ user_id: userId, provider_id: providerId, ativo: true, auto_aceitar: true, modo_risco: 'conta', conta_id: contaId })
  if (escrita.error) return { ok: false, status: 409, mensagem: `A base recusou: ${escrita.error.message}` }
  const { data: relida } = await db().from('mtmauto_subscriptions').select('ativo, auto_aceitar, conta_id').eq('user_id', userId).eq('provider_id', providerId).maybeSingle()
  if (relida?.ativo !== true) return { ok: false, status: 500, mensagem: 'Gravado mas a releitura não mostra a subscrição activa — confirmar na base.' }
  return {
    ok: true,
    status: 200,
    mensagem: relida.auto_aceitar === true
      ? `Subscrito a «${slug}» nesta conta, com aceitação automática.`
      : `Subscrito a «${slug}» nesta conta. SEM aceitação automática (auto_aceitar=false) — a rota do motor só nasce com ela ligada.`,
  }
}

/**
 * AS TRAVAS DA MESTRE, gravadas no nó do quadro.
 *
 * Escreve-se em `mtmauto_providers.sinais_config.travas` e em mais nada. A chave `travas` é NOVA e
 * vive ao lado da gestão que já lá está (`beFracaoDoRisco`, `trailingInicioPips`, `perfil`…): por
 * isso faz-se merge do jsonb inteiro, nunca um `update` do objecto todo. Substituir `sinais_config`
 * por `{ travas }` apagava a gestão das oito estratégias de uma vez — e a gestão é o que move o SL.
 *
 * Grava-se e RELÊ-SE. É o padrão da casa desde o `/messages` em branco (POST escrevia, GET não lia):
 * «gravado» sem releitura é uma promessa, não um facto — e numa trava de segurança a diferença entre
 * as duas é o prejuízo que ela devia ter travado.
 */
export async function guardarTravas(
  adminId: string,
  p: { slug: string; travas: TravasMestre; gestao?: Record<string, unknown> },
): Promise<Resposta> {
  let r: Resposta
  try {
    const { data: prov, error } = await db().from('mtmauto_providers')
      .select('id, slug, sinais_config').ilike('slug', p.slug).is('apagado_em', null).maybeSingle()
    if (error || !prov) {
      r = { ok: false, status: 404, mensagem: error?.message ?? `Estratégia «${p.slug}» não existe (ou está apagada).` }
    } else {
      const antes = (prov.sinais_config && typeof prov.sinais_config === 'object' ? prov.sinais_config : {}) as Record<string, unknown>
      const escritas = escreverTravas(p.travas)
      // Sem travas nenhumas, a chave SAI do jsonb em vez de ficar `{}` — um objecto vazio lia-se como
      // «configurado a zero» e é outra coisa.
      const depois = { ...antes }
      if (Object.keys(escritas).length) depois.travas = escritas
      else delete depois.travas

      /**
       * As automações de saída. `normalizarGestaoMestre` devolve as cinco chaves JÁ resolvidas contra
       * o que estava, por isso apagam-se as cinco antigas antes de as pôr — senão desligar uma regra
       * (enviar vazio) deixava a chave velha no jsonb e o motor continuava a honrá-la.
       */
      const gestao = p.gestao ? normalizarGestaoMestre(p.gestao, antes) : null
      if (gestao && !gestao.ok) {
        const erros = gestao.erros.map((e) => e.erro).join(' · ')
        await registarAuditoria({ adminId, acao: 'cadeia:travas', alvo: p.slug, pedido: p, resultado: { erros }, ok: false })
        return { ok: false, status: 400, mensagem: erros }
      }
      if (gestao?.ok) {
        for (const k of [...CHAVES_GESTAO, 'semTrailing']) delete depois[k]
        Object.assign(depois, gestao.chaves)
      }

      const { error: eUp } = await db().from('mtmauto_providers')
        .update({ sinais_config: depois, updated_at: new Date().toISOString() }).eq('id', prov.id)
      if (eUp) {
        r = { ok: false, status: 409, mensagem: `A base recusou: ${eUp.message}` }
      } else {
        const { data: relida } = await db().from('mtmauto_providers').select('sinais_config').eq('id', prov.id).maybeSingle()
        const agora = lerTravas(relida?.sinais_config)
        /**
         * A releitura confirma que o resto do `sinais_config` sobreviveu. As chaves que ESTE pedido
         * podia mexer saem da comparação — senão desligar uma regra de propósito dava um falso alarme.
         */
        const tocaveis = new Set<string>([...CHAVES_GESTAO, 'semTrailing', 'travas'])
        const relidoObj = (relida?.sinais_config ?? {}) as Record<string, unknown>
        const restoIntacto = Object.keys(antes).filter((k) => !tocaveis.has(k)).every((k) => k in relidoObj)
        r = !restoIntacto
          ? { ok: false, status: 500, mensagem: 'Gravou, mas a releitura mostra que outra configuração da estratégia desapareceu do sinais_config — CONFIRMAR NA BASE antes de deixar esta mestre emitir.' }
          : {
              ok: true,
              status: 200,
              // A mensagem DIZ o que ficou, nos dois grupos. «Gravado» sem o valor não se confirma.
              mensagem: [
                temTravas(agora)
                  ? `Travas de «${prov.slug}» gravadas — aplicadas por lib/mestres/servidor/sinal-mestre.ts no sinal seguinte, e só em ABERTURAS (o BE, o trailing e os fechos do que já está aberto passam sempre).`
                  : `«${prov.slug}» fica SEM travas de raiz: nada impede a mestre de emitir fora de horas, em cima de uma notícia ou já a perder o dia.`,
                `Saídas: ${textoDaGestao(lerGestaoMestre(relidoObj))}.`,
              ].join(' '),
              detalhe: { travas: agora, gestao: lerGestaoMestre(relidoObj) },
            }
      }
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: e instanceof Error ? e.message : String(e) }
  }
  esquecerCache(CHAVE_CACHE_CADEIA)
  await registarAuditoria({ adminId, acao: 'cadeia:travas', alvo: p.slug, pedido: p, resultado: r, ok: r.ok })
  return r
}

/** Arrastar = ligar à nova ANTES de desligar da antiga (nunca há um instante sem quem feche). */
export async function moverSubscritor(adminId: string, p: { ref: string; de: string; para: string }): Promise<Resposta> {
  const ligou = await ligarSubscritor(adminId, { ref: p.ref, slug: p.para, ligar: true })
  if (!ligou.ok) return ligou
  const desligou = await ligarSubscritor(adminId, { ref: p.ref, slug: p.de, ligar: false })
  return {
    ok: desligou.ok,
    status: desligou.status,
    mensagem: desligou.ok
      ? `${ligou.mensagem} ${desligou.mensagem}`
      : `LIGOU a «${p.para}» mas NÃO desligou de «${p.de}»: ${desligou.mensagem} — a conta está nas duas.`,
    detalhe: { ligar: ligou.detalhe, desligar: desligou.detalhe },
  }
}

/**
 * Criar as contas de um utilizador para estratégias, a partir do quadro. Reusa o caminho de sempre
 * (`lib/mtmfunded/contas-estrategia.ts`): conta simulada + linha no MTM Auto + subscrição, tudo
 * idempotente. Se a conta já existir, não se cria uma segunda.
 */
export async function criarContasDoQuadro(adminId: string, p: { userId: string; slugs: string[]; saldo?: number }): Promise<Resposta> {
  let r: Resposta
  try {
    const { criarContasDeEstrategia } = await import('@/lib/mtmfunded/contas-estrategia')
    const res = await criarContasDeEstrategia({ userIds: [p.userId], estrategias: p.slugs, saldo: p.saldo, criadoPor: adminId })
    const contas = res.flatMap((u) => u.contas)
    const criadas = contas.filter((c) => c.nova).length
    const erros = contas.filter((c) => c.erro)
    const erroUtilizador = res.find((u) => u.erro)?.erro ?? null
    r = {
      ok: erros.length === 0 && !erroUtilizador,
      status: erros.length || erroUtilizador ? 409 : 200,
      mensagem: erroUtilizador
        ? `Não deu: ${erroUtilizador}`
        : erros.length
          ? `${criadas} conta(s) criada(s); falhou: ${erros.map((e) => `${e.estrategia} (${e.erro})`).join(', ')}`
          : `${criadas} conta(s) criada(s), ${contas.length - criadas} já existiam.`,
      detalhe: res,
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: e instanceof Error ? e.message : String(e) }
  }
  if (r.ok) for (const slug of p.slugs) await sincronizarRotasDaEstrategia(slug).catch(() => null)
  esquecerCache(CHAVE_CACHE_CADEIA)
  await registarAuditoria({ adminId, acao: 'cadeia:criar-contas', alvo: p.userId, pedido: p, resultado: r, ok: r.ok })
  return r
}
