/**
 * LEITURA DO PAINEL DO MOTOR DAS MESTRES (admin) — só leituras à base, por índice e com limite; NUNCA
 * MetaApi nem CopyFactory. Cache de 10 s (vários separadores abertos custam o mesmo que um).
 *
 * Tabelas: site_settings.mestres_motor, mestres_estrategias, mestres_contas, mestres_ordens (24 h),
 * mestres_alertas (por ver + 24 h), mestres_sinais (24 h), copia_rotas (mestres=true), copia_posicoes
 * abertas das rotas do motor, servicos_pulso do mtm-copia-contas, contas-mestre (mtm_trading_accounts),
 * providers, e as contas de destino (etiqueta 113 + login/servidor) para as nomear.
 *
 * Sem a 116 aplicada → `pendente: true` (o painel diz isso, nunca 500).
 */
import { emCache } from '@/lib/admin-centro/cache'
import { db, ler, num, txt, type Linha } from '@/lib/admin-centro/servidor/base'
import { lerEtiquetas } from '@/lib/contas/etiquetas-servidor'
import { lerRef } from '@/lib/copia-contas/regras'
import { lerConfigGlobal, lerContaMestres, lerEstrategiaMestre } from '../tipos'
import {
  mestresPorConta, resumirPainel, type AlertaEntrada, type ContaEntrada, type EstrategiaEntrada, type OrdemEntrada, type PainelMestres,
  type RotaEntrada, type SinalEntrada,
} from '../painel'

export const CHAVE_CACHE_PAINEL = 'mestres:painel'

export type PainelMestresLido = PainelMestres & { pendente: boolean; avisos: string[]; lidaEm: string }

export async function carregarPainelMestres(): Promise<PainelMestresLido> {
  return (await emCache(CHAVE_CACHE_PAINEL, 10_000, lerPainel)).v
}

/**
 * Mapa conta-mestre → «Mestre · Sensei» (para MTM Funded, Centro › Contas e a pastilha do seletor do
 * WebTrader). Nunca lança.
 *
 * Em cache 60 s: isto passou a ser lido em /api/mtmfunded/simulado/contas, que é das rotas mais
 * pedidas da casa (o WebTrader relê o seletor), e são OITO linhas que mudam de mês a mês — duas
 * consultas por cada abertura do seletor não se justificam.
 */
export const CHAVE_CACHE_MESTRES_CONTA = 'mestres:por-conta'

export async function lerMestresPorConta() {
  return (await emCache(CHAVE_CACHE_MESTRES_CONTA, 60_000, async () => {
    const r = await ler(db().from('mestres_estrategias').select('slug, conta_mestre_id, modo, provider_id').limit(100))
    if (!r.linhas.length) return mestresPorConta([])
    const provs = await ler(db().from('mtmauto_providers').select('id, nome').in('id', r.linhas.map((l) => String(l.provider_id))))
    const nome = new Map(provs.linhas.map((p) => [String(p.id), txt(p.nome)]))
    return mestresPorConta(r.linhas.map((l) => ({ ...l, nome: nome.get(String(l.provider_id)) ?? null })))
  })).v
}

async function lerPainel(): Promise<PainelMestresLido> {
  const agora = Date.now()
  const desde24 = new Date(agora - 86_400_000).toISOString()
  const avisos: string[] = []
  const [cfg, ests, contas, rotas, ordens, alertas, sinais, pulso] = await Promise.all([
    ler(db().from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()),
    ler(db().from('mestres_estrategias').select('*').limit(100)),
    ler(db().from('mestres_contas').select('*').limit(1000)),
    ler(db().from('copia_rotas').select('id, estrategia_slug, tipo_rota, destino_ref, destino_chave, ativa, estado, pausada_motivo, user_id').eq('mestres', true).neq('estado', 'recusada').limit(2000)),
    ler(db().from('mestres_ordens').select('id, estrategia, conta_chave, tipo, modo, estado, erro, latencia_total_ms, latencia_corretora_ms, criado_em').gte('criado_em', desde24).order('criado_em', { ascending: false }).limit(1000)),
    ler(db().from('mestres_alertas').select('id, tipo, estrategia, conta_chave, mensagem, criado_em, visto_em').or(`visto_em.is.null,criado_em.gte.${desde24}`).order('criado_em', { ascending: false }).limit(200)),
    ler(db().from('mestres_sinais').select('estrategia, modo, criado_em, symbol, direcao').gte('criado_em', desde24).order('criado_em', { ascending: false }).limit(300)),
    ler(db().from('servicos_pulso').select('em, estado').eq('servico', 'mtm-copia-contas').maybeSingle()),
  ])
  const pendente = ests.semTabela || contas.semTabela
  for (const [n, r] of [['estratégias', ests], ['contas', contas], ['rotas', rotas], ['ordens', ordens], ['alertas', alertas]] as const) if (r.erro) avisos.push(`${n}: ${r.erro}`)

  const linhasEst = ests.linhas.map((l) => ({ bruta: l, e: lerEstrategiaMestre(l) }))
  const provIds = linhasEst.map((x) => x.e.providerId)
  const contaIds = linhasEst.map((x) => x.e.contaMestreId).filter(Boolean)
  const rotaIds = rotas.linhas.map((r) => String(r.id))
  const [provs, mestresConta, etiqFunded, abertas] = await Promise.all([
    provIds.length ? ler(db().from('mtmauto_providers').select('id, nome, ativo, espelho_provider_ativo, espelhar').in('id', provIds)) : Promise.resolve({ linhas: [] as Linha[] }),
    contaIds.length ? ler(db().from('mtm_trading_accounts').select('id, mt5_login, estado, motor, sim_saldo, sim_equity').in('id', contaIds)) : Promise.resolve({ linhas: [] as Linha[] }),
    lerEtiquetas('mtm_trading_accounts'),
    rotaIds.length ? ler(db().from('copia_posicoes').select('rota_id, estado').in('rota_id', rotaIds).in('estado', ['aberta', 'enviando']).limit(2000)) : Promise.resolve({ linhas: [] as Linha[] }),
  ])
  const prov = new Map(provs.linhas.map((p) => [String(p.id), p]))
  const contaM = new Map(mestresConta.linhas.map((c) => [String(c.id), c]))
  const abertasLivePorRota: Record<string, number> = {}
  for (const p of abertas.linhas) abertasLivePorRota[String(p.rota_id)] = (abertasLivePorRota[String(p.rota_id)] ?? 0) + 1

  const estrategias: EstrategiaEntrada[] = linhasEst.map(({ e }) => {
    const p = prov.get(e.providerId)
    const c = contaM.get(e.contaMestreId)
    return {
      ...e,
      nome: txt(p?.nome) ?? e.slug,
      providerAtivo: p ? p.ativo !== false : null,
      espelhoProviderAtivo: p?.espelho_provider_ativo === true,
      mtmautoEspelhar: p ? p.espelhar === true : null,
      contaMestre: c ? {
        id: String(c.id), login: txt(c.mt5_login), etiqueta: etiqFunded.get(String(c.id)) ?? null, estado: txt(c.estado), motor: txt(c.motor),
        saldo: num(c.sim_saldo), equity: num(c.sim_equity),
      } : null,
    }
  })

  // nomes das contas de destino: etiqueta do dono (113) + login@servidor + email
  const refs = new Map<string, string>()
  for (const r of rotas.linhas) refs.set(String(r.destino_chave), String(r.destino_ref))
  for (const c of contas.linhas) refs.set(String(c.conta_chave), String(c.conta_ref))
  const porOrigem = { site: [] as string[], auto: [] as string[], wt: [] as string[] }
  for (const ref of refs.values()) {
    const x = lerRef(ref)
    if (x && (x.origem === 'site' || x.origem === 'auto' || x.origem === 'wt')) porOrigem[x.origem].push(x.id)
  }
  const [site, auto, wt, etSite, etAuto, etWt] = await Promise.all([
    porOrigem.site.length ? ler(db().from('mtmcopy_connections').select('id, user_id, account_label, mt5_login, mt5_server').in('id', porOrigem.site)) : Promise.resolve({ linhas: [] as Linha[] }),
    porOrigem.auto.length ? ler(db().from('mtmauto_accounts').select('id, user_id, login, servidor, rotulo').in('id', porOrigem.auto)) : Promise.resolve({ linhas: [] as Linha[] }),
    porOrigem.wt.length ? ler(db().from('webtrader_contas_mt5').select('id, user_id, login, servidor, rotulo').in('id', porOrigem.wt)) : Promise.resolve({ linhas: [] as Linha[] }),
    lerEtiquetas('mtmcopy_connections'), lerEtiquetas('mtmauto_accounts'), lerEtiquetas('webtrader_contas_mt5'),
  ])
  const info = new Map<string, { etiqueta: string | null; descricao: string; userId: string | null }>()
  for (const l of site.linhas) info.set(`site:${l.id}`, { etiqueta: etSite.get(String(l.id)) ?? null, descricao: `${txt(l.account_label) ? `${l.account_label} · ` : ''}${l.mt5_login ?? '?'} @ ${l.mt5_server ?? '?'} (T2T/site)`, userId: txt(l.user_id) })
  for (const l of auto.linhas) info.set(`auto:${l.id}`, { etiqueta: etAuto.get(String(l.id)) ?? null, descricao: `${txt(l.rotulo) ? `${l.rotulo} · ` : ''}${l.login ?? '?'} @ ${l.servidor ?? '?'} (MTM Auto)`, userId: txt(l.user_id) })
  for (const l of wt.linhas) info.set(`wt:${l.id}`, { etiqueta: etWt.get(String(l.id)) ?? null, descricao: `${txt(l.rotulo) ? `${l.rotulo} · ` : ''}${l.login ?? '?'} @ ${l.servidor ?? '?'} (WebTrader)`, userId: txt(l.user_id) })
  const userIds = [...new Set([...info.values()].map((i) => i.userId).filter((x): x is string => Boolean(x)))]
  const perfis = userIds.length ? await ler(db().from('profiles').select('id, email').in('id', userIds)) : { linhas: [] as Linha[] }
  const email = new Map(perfis.linhas.map((p) => [String(p.id), txt(p.email)]))

  const contaLinhas = new Map(contas.linhas.map((c) => [String(c.conta_chave), c]))
  const chaves = new Set([...contaLinhas.keys()])
  const contasEntrada: ContaEntrada[] = [...chaves].map((chave) => {
    const bruta = contaLinhas.get(chave)!
    const base = lerContaMestres(bruta)
    const i = info.get(base.contaRef) ?? info.get(refs.get(chave) ?? '')
    return {
      ...base, etiqueta: i?.etiqueta ?? null, descricao: i?.descricao ?? null, email: i?.userId ? email.get(i.userId) ?? null : null,
      ultimaFalha: txt(bruta.ultima_falha), ultimaFalhaEm: txt(bruta.ultima_falha_em),
    }
  })
  // contas só com rota (sem linha em mestres_contas) também ganham nome
  for (const r of rotas.linhas) {
    const chave = String(r.destino_chave)
    if (chaves.has(chave)) continue
    chaves.add(chave)
    const i = info.get(String(r.destino_ref))
    contasEntrada.push({
      contaChave: chave, contaRef: String(r.destino_ref), modo: 'sombra', loteFixoForcado: null, maxPosicoes: 10, maxRiscoTotalPct: 6, maxLoteTotal: null,
      falhasSeguidas: 0, bloqueada: false, bloqueioMotivo: null,
      etiqueta: i?.etiqueta ?? null, descricao: i?.descricao ?? null, email: i?.userId ? email.get(i.userId) ?? null : null, ultimaFalha: null, ultimaFalhaEm: null,
    })
  }

  const pulsoEstado = (pulso.linhas[0]?.estado ?? null) as Record<string, unknown> | null
  const painel = resumirPainel({
    agoraMs: agora,
    global: lerConfigGlobal(cfg.linhas[0]?.value),
    pulso: { em: txt(pulso.linhas[0]?.em), mestres: (pulsoEstado?.mestres ?? null) as Record<string, unknown> | null },
    estrategias,
    rotas: rotas.linhas.map((r) => ({
      id: String(r.id), estrategia_slug: txt(r.estrategia_slug), tipo_rota: txt(r.tipo_rota), destino_ref: String(r.destino_ref), destino_chave: String(r.destino_chave),
      ativa: r.ativa !== false, estado: String(r.estado ?? ''), pausada_motivo: txt(r.pausada_motivo), user_id: txt(r.user_id),
    }) satisfies RotaEntrada),
    contas: contasEntrada,
    ordens: ordens.linhas as unknown as OrdemEntrada[],
    alertas: alertas.linhas as unknown as AlertaEntrada[],
    sinais: sinais.linhas as unknown as SinalEntrada[],
    abertasLivePorRota,
  })
  return { ...painel, pendente, avisos, lidaEm: new Date(agora).toISOString() }
}
