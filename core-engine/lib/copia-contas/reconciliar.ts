/**
 * «SINCRONIZAR TUDO» — o diff entre o site, a MetaApi, a CopyFactory, o MTM Auto, a TradeLocker e o
 * MTM Funded. Puro: recebe fotografias já lidas e devolve a lista de correcções propostas. O servidor
 * (lib/copia-contas/servidor/sincronizacao.ts) lê as fotografias e aplica SÓ as seleccionadas.
 *
 * Princípios:
 *  · Pré-visualizar primeiro, sempre. Nada aqui escreve.
 *  · Uma listagem da MetaApi que falhou (null) NÃO quer dizer «não há contas»: sem ela saltam-se
 *    todas as verificações que dependem dela e fica um aviso. Senão, uma falha de rede propunha
 *    marcar todas as ligações como sem conta.
 *  · Apagar na MetaApi é irreversível → `segundaConfirmacao`. Undeploy é reversível (a conta volta
 *    com «Ligar conta»), por isso é proposto à parte.
 *  · Duplicados e quota acima do limite são ALERTAS sem correcção automática: a regra do dono é não
 *    tirar nada a ninguém que já tem (lib/contas/quota-metaapi.ts) e um duplicado pode ser decisão.
 *  · Contas MetaApi que não são de clientes (provider/mestre, contas de estratégia, streaming) nunca
 *    são órfãs: vêm em `idsDeSistema`.
 */

export interface ContaMetaApiFoto {
  id: string
  name?: string | null
  login?: string | null
  server?: string | null
  state?: string | null
  connectionStatus?: string | null
}

export interface EstrategiaCfFoto { id: string; accountId?: string | null; name?: string | null }
export interface SubscritorCfFoto { id: string; name?: string | null; subscriptions: { strategyId: string }[] }

export interface LinhaSiteFoto {
  id: string
  user_id: string
  metaapi_account_id?: string | null
  mt5_login?: string | null
  mt5_server?: string | null
  mt5_platform?: string | null
  mt5_status?: string | null
  is_active?: boolean | null
  purpose?: string | null
  copyfactory_strategy_pick?: string | null
  funded_account_id?: string | null
  tl_account_id?: string | null
}

export interface LinhaAutoFoto {
  id: string
  user_id: string
  metaapi_account_id?: string | null
  login?: string | null
  servidor?: string | null
  plataforma?: string | null
  estado?: string | null
  funded_account_id?: string | null
  /** conta de equipa MTM Auto: noutra chave MetaApi, fora da listagem da casa */
  outraChave?: boolean
}

export interface LinhaWtFoto { id: string; user_id: string; metaapi_account_id?: string | null; login?: string | null; servidor?: string | null; estado?: string | null }
export interface ProviderFoto { id: string; slug: string; ativo?: boolean | null; metaapi_account_id?: string | null }
export interface SubAutoFoto { id: string; user_id: string; conta_id?: string | null; provider_id: string; ativo?: boolean | null }
export interface RotaFoto { id: string; user_id: string; origem_ref: string; destino_ref: string; ativa: boolean; estado: string }

export interface FotografiasSync {
  /** null = a listagem falhou */
  metaapi: ContaMetaApiFoto[] | null
  estrategiasCf: EstrategiaCfFoto[] | null
  subscritoresCf: SubscritorCfFoto[] | null
  site: LinhaSiteFoto[]
  auto: LinhaAutoFoto[]
  webtrader: LinhaWtFoto[]
  providers: ProviderFoto[]
  subsAuto: SubAutoFoto[]
  /** ids de mtm_trading_accounts que existem */
  contasFunded: Set<string>
  /** mtmcopy_connection_id com credenciais TradeLocker gravadas */
  credenciaisTl: Set<string>
  rotas: RotaFoto[]
  /** contas MetaApi do sistema (provider, mestres de estratégia, mtm_trading_accounts, streaming) */
  idsDeSistema: Set<string>
  /** limite de contas MetaApi por utilizador (Infinity = admin); só para quem tem > 1 */
  limitePorUser: Map<string, number>
}

export type AcaoCorrecao =
  | { tipo: 'undeploy_metaapi'; accountId: string }
  | { tipo: 'apagar_metaapi'; accountId: string }
  | { tipo: 'remover_subscricoes_cf'; subscriberId: string; strategyIds: string[] | 'todas' }
  | { tipo: 'marcar_ligacao_erro'; tabela: 'mtmcopy_connections' | 'mtmauto_accounts' | 'webtrader_contas_mt5'; id: string; erro: string }
  | { tipo: 'desactivar_subscricao_auto'; id: string }
  | { tipo: 'desactivar_rota'; id: string; motivo: string }
  | { tipo: 'nenhuma' }

export type CategoriaCorrecao = 'orfa' | 'estrategia_morta' | 'sem_conta' | 'duplicado' | 'quota' | 'consistencia'

export interface Correcao {
  id: string
  categoria: CategoriaCorrecao
  gravidade: 'grave' | 'aviso' | 'info'
  titulo: string
  detalhe: string
  userId: string | null
  acao: AcaoCorrecao
  /** irreversível: pede uma segunda confirmação escrita */
  segundaConfirmacao: boolean
}

export interface DiffSync {
  correcoes: Correcao[]
  avisos: string[]
  resumo: Record<CategoriaCorrecao, number>
}

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const low = (v: unknown) => String(v ?? '').trim().toLowerCase()
const plataformaMetaApi = (p: unknown) => {
  const x = low(p || 'mt5')
  return x !== 'tradelocker' && x !== 'mtmfunded'
}

export function gerarDiffSincronizacao(f: FotografiasSync): DiffSync {
  const correcoes: Correcao[] = []
  const avisos: string[] = []
  const add = (c: Correcao) => { if (!correcoes.some((x) => x.id === c.id)) correcoes.push(c) }

  const siteVivas = f.site.filter((l) => low(l.mt5_status) !== 'disconnected')
  const referenciados = new Set<string>([...f.idsDeSistema])
  for (const l of siteVivas) if (l.metaapi_account_id) referenciados.add(String(l.metaapi_account_id))
  for (const l of f.auto) if (l.metaapi_account_id) referenciados.add(String(l.metaapi_account_id))
  for (const l of f.webtrader) if (l.metaapi_account_id) referenciados.add(String(l.metaapi_account_id))
  for (const p of f.providers) if (p.metaapi_account_id) referenciados.add(String(p.metaapi_account_id))

  // ── MetaApi ↔ site ──
  if (f.metaapi == null) {
    avisos.push('A listagem de contas da MetaApi falhou — órfãs e ligações sem conta não foram verificadas.')
  } else {
    const existem = new Set(f.metaapi.map((a) => a.id))
    for (const a of f.metaapi) {
      if (referenciados.has(a.id)) continue
      const deployed = low(a.state) === 'deployed'
      const nome = `${a.name || '—'} · ${a.login || '?'} @ ${a.server || '?'}`
      if (deployed) {
        add({
          id: `orfa:undeploy:${a.id}`, categoria: 'orfa', gravidade: 'grave', userId: null,
          titulo: 'Conta MetaApi sem dono no site (ligada, a custar)',
          detalhe: `${nome} — nenhuma linha em mtmcopy_connections, mtmauto_accounts, webtrader_contas_mt5 ou contas de sistema. Undeploy é reversível.`,
          acao: { tipo: 'undeploy_metaapi', accountId: a.id }, segundaConfirmacao: false,
        })
      }
      add({
        id: `orfa:apagar:${a.id}`, categoria: 'orfa', gravidade: deployed ? 'grave' : 'aviso', userId: null,
        titulo: 'Apagar conta MetaApi sem dono',
        detalhe: `${nome} (${a.state || '?'}). Irreversível: confirma que não é conta de ninguém antes de apagar.`,
        acao: { tipo: 'apagar_metaapi', accountId: a.id }, segundaConfirmacao: true,
      })
    }
    const semConta = (tabela: 'mtmcopy_connections' | 'mtmauto_accounts' | 'webtrader_contas_mt5', id: string, userId: string, accId: string, desc: string) =>
      add({
        id: `sem_conta:${tabela}:${id}`, categoria: 'sem_conta', gravidade: 'grave', userId,
        titulo: 'Ligação aponta para uma conta MetaApi que já não existe',
        detalhe: `${desc} → ${accId}. O cliente pensa que está ligado e não está. Marca a ligação em erro (a linha fica; o cliente volta a ligar).`,
        acao: { tipo: 'marcar_ligacao_erro', tabela, id, erro: 'A conta MetaApi desta ligação já não existe — volta a ligar a conta.' },
        segundaConfirmacao: false,
      })
    for (const l of siteVivas) {
      if (l.metaapi_account_id && plataformaMetaApi(l.mt5_platform) && !existem.has(String(l.metaapi_account_id)) && low(l.mt5_status) !== 'error') {
        semConta('mtmcopy_connections', l.id, l.user_id, String(l.metaapi_account_id), `T2T/site · ${l.mt5_login ?? '?'} @ ${l.mt5_server ?? '?'}`)
      }
    }
    for (const l of f.auto) {
      if (!l.outraChave && l.metaapi_account_id && plataformaMetaApi(l.plataforma) && !existem.has(String(l.metaapi_account_id)) && low(l.estado) !== 'error') {
        semConta('mtmauto_accounts', l.id, l.user_id, String(l.metaapi_account_id), `MTM Auto · ${l.login ?? '?'} @ ${l.servidor ?? '?'}`)
      }
    }
    for (const l of f.webtrader) {
      if (l.metaapi_account_id && !existem.has(String(l.metaapi_account_id)) && low(l.estado) !== 'error') {
        semConta('webtrader_contas_mt5', l.id, l.user_id, String(l.metaapi_account_id), `WebTrader · ${l.login ?? '?'} @ ${l.servidor ?? '?'}`)
      }
    }
  }

  // ── CopyFactory ──
  if (f.estrategiasCf == null || f.subscritoresCf == null) {
    avisos.push('A listagem da CopyFactory falhou — subscrições a estratégias mortas não foram verificadas.')
  } else {
    const estrategias = new Set(f.estrategiasCf.map((s) => s.id))
    const donoDoSubscritor = new Map<string, LinhaSiteFoto>()
    for (const l of siteVivas) if (l.metaapi_account_id) donoDoSubscritor.set(String(l.metaapi_account_id), l)
    const idsAuto = new Set(f.auto.map((l) => String(l.metaapi_account_id ?? '')).filter(Boolean))
    for (const s of f.subscritoresCf) {
      const mortas = s.subscriptions.map((x) => x.strategyId).filter((id) => id && !estrategias.has(id))
      const dono = donoDoSubscritor.get(s.id)
      if (mortas.length) {
        add({
          id: `estrategia_morta:${s.id}`, categoria: 'estrategia_morta', gravidade: 'grave', userId: dono?.user_id ?? null,
          titulo: 'Subscritor a copiar uma estratégia que já não existe',
          detalhe: `${s.name || s.id} → ${mortas.join(', ')}. Copia o vazio: o cliente não recebe trades. Remove só essas subscrições (as vivas ficam) e relê.`,
          acao: { tipo: 'remover_subscricoes_cf', subscriberId: s.id, strategyIds: mortas }, segundaConfirmacao: false,
        })
      }
      const vivas = s.subscriptions.filter((x) => estrategias.has(x.strategyId))
      if (vivas.length && !dono && !idsAuto.has(s.id) && !f.idsDeSistema.has(s.id)) {
        add({
          id: `subscritor_sem_linha:${s.id}`, categoria: 'orfa', gravidade: 'grave', userId: null,
          titulo: 'Conta a copiar na CopyFactory sem linha no site',
          detalhe: `${s.name || s.id} copia ${vivas.map((x) => x.strategyId).join(', ')} fora do alcance do site (pausas e guardas não se aplicam). Pode ser deliberado — regista-a no site OU remove as subscrições.`,
          acao: { tipo: 'remover_subscricoes_cf', subscriberId: s.id, strategyIds: 'todas' }, segundaConfirmacao: true,
        })
      }
    }
    for (const l of siteVivas) {
      const pick = l.copyfactory_strategy_pick ? String(l.copyfactory_strategy_pick) : null
      if (pick && l.purpose !== 'tap_to_trade' && l.is_active !== false && !estrategias.has(pick)) {
        add({
          id: `pick_morto:${l.id}`, categoria: 'estrategia_morta', gravidade: 'aviso', userId: l.user_id,
          titulo: 'Ligação escolheu uma estratégia que já não existe',
          detalhe: `${l.mt5_login ?? '?'} @ ${l.mt5_server ?? '?'} → ${pick}. Reatribuir na tab Estratégias (re-sync).`,
          acao: { tipo: 'nenhuma' }, segundaConfirmacao: false,
        })
      }
    }
  }

  // ── MTM Auto ──
  const providers = new Map(f.providers.map((p) => [p.id, p]))
  for (const s of f.subsAuto) {
    if (s.ativo === false) continue
    const p = providers.get(s.provider_id)
    if (!p || p.ativo === false) {
      add({
        id: `sub_auto_morta:${s.id}`, categoria: 'estrategia_morta', gravidade: 'aviso', userId: s.user_id,
        titulo: 'Subscrição MTM Auto a uma estratégia apagada ou inactiva',
        detalhe: `provider ${p?.slug ?? s.provider_id} ${p ? 'inactivo' : 'não existe'}. Desactivar a subscrição.`,
        acao: { tipo: 'desactivar_subscricao_auto', id: s.id }, segundaConfirmacao: false,
      })
    }
  }

  // ── TradeLocker / MTM Funded ──
  for (const l of siteVivas) {
    const p = low(l.mt5_platform)
    if (p === 'tradelocker' && !f.credenciaisTl.has(l.id)) {
      add({
        id: `tl_sem_credenciais:${l.id}`, categoria: 'consistencia', gravidade: 'aviso', userId: l.user_id,
        titulo: 'Ligação TradeLocker sem credenciais gravadas',
        detalhe: `conta ${l.tl_account_id ?? '?'} — não consegue ler nem executar.`,
        acao: { tipo: 'marcar_ligacao_erro', tabela: 'mtmcopy_connections', id: l.id, erro: 'Credenciais TradeLocker em falta — volta a ligar a conta.' },
        segundaConfirmacao: false,
      })
    }
    if (p === 'mtmfunded' && l.funded_account_id && !f.contasFunded.has(String(l.funded_account_id))) {
      add({
        id: `funded_inexistente:site:${l.id}`, categoria: 'consistencia', gravidade: 'aviso', userId: l.user_id,
        titulo: 'Ligação MTM Funded para uma conta simulada que já não existe',
        detalhe: `funded ${l.funded_account_id}`, acao: { tipo: 'marcar_ligacao_erro', tabela: 'mtmcopy_connections', id: l.id, erro: 'A conta MTM Funded já não existe.' },
        segundaConfirmacao: false,
      })
    }
  }

  // ── duplicados (mesma conta física ligada duas vezes) ──
  const porConta = new Map<string, { onde: string; userId: string }[]>()
  const juntar = (login: unknown, servidor: unknown, onde: string, userId: string) => {
    const k = dig(login) && low(servidor) ? `${dig(login)}@${low(servidor)}` : null
    if (k) porConta.set(k, [...(porConta.get(k) ?? []), { onde, userId }])
  }
  for (const l of siteVivas) if (plataformaMetaApi(l.mt5_platform)) juntar(l.mt5_login, l.mt5_server, `site:${l.id}${l.purpose === 'tap_to_trade' ? ' (T2T)' : ''}`, l.user_id)
  for (const l of f.auto) if (plataformaMetaApi(l.plataforma)) juntar(l.login, l.servidor, `auto:${l.id}`, l.user_id)
  for (const l of f.webtrader) juntar(l.login, l.servidor, `wt:${l.id}`, l.user_id)
  for (const [k, lista] of porConta) {
    if (lista.length < 2) continue
    const donos = new Set(lista.map((x) => x.userId))
    add({
      id: `duplicado:${k}`, categoria: 'duplicado', gravidade: donos.size > 1 ? 'grave' : 'aviso', userId: lista[0].userId,
      titulo: donos.size > 1 ? 'A mesma conta de corretora ligada por utilizadores diferentes' : 'A mesma conta de corretora ligada duas vezes',
      detalhe: `${k} em ${lista.map((x) => x.onde).join(', ')}. Dois sistemas podem dimensionar risco na mesma conta sem se verem. Decide na tab Contas.`,
      acao: { tipo: 'nenhuma' }, segundaConfirmacao: false,
    })
  }

  // ── quota ──
  const contasPorUser = new Map<string, Set<string>>()
  const somar = (userId: string, id: unknown, login: unknown, servidor: unknown) => {
    const chave = id ? `id:${id}` : dig(login) ? `l:${dig(login)}@${low(servidor)}` : null
    if (!chave) return
    contasPorUser.set(userId, (contasPorUser.get(userId) ?? new Set()).add(chave))
  }
  for (const l of siteVivas) if (plataformaMetaApi(l.mt5_platform) && l.metaapi_account_id) somar(l.user_id, l.metaapi_account_id, l.mt5_login, l.mt5_server)
  for (const l of f.auto) if (plataformaMetaApi(l.plataforma) && l.metaapi_account_id && low(l.estado) !== 'disconnected') somar(l.user_id, l.metaapi_account_id, l.login, l.servidor)
  for (const l of f.webtrader) if (l.metaapi_account_id) somar(l.user_id, l.metaapi_account_id, l.login, l.servidor)
  for (const [userId, contas] of contasPorUser) {
    const limite = f.limitePorUser.get(userId)
    if (limite == null || !Number.isFinite(limite) || contas.size <= limite) continue
    add({
      id: `quota:${userId}`, categoria: 'quota', gravidade: 'aviso', userId,
      titulo: 'Acima da quota de contas MetaApi',
      detalhe: `${contas.size} contas MetaApi para um limite de ${limite}. Regra do dono: as existentes continuam; só a próxima ligação é recusada.`,
      acao: { tipo: 'nenhuma' }, segundaConfirmacao: false,
    })
  }

  // ── rotas de cópia a apontar para contas que já não existem ──
  const refsVivas = new Set<string>([
    ...siteVivas.map((l) => `site:${l.id}`), ...f.auto.map((l) => `auto:${l.id}`),
    ...f.webtrader.map((l) => `wt:${l.id}`), ...[...f.contasFunded].map((id) => `funded:${id}`),
  ])
  for (const r of f.rotas) {
    if (r.estado === 'recusada') continue
    const falta = [r.origem_ref, r.destino_ref].filter((x) => !refsVivas.has(x))
    if (falta.length && r.ativa) {
      add({
        id: `rota_orfa:${r.id}`, categoria: 'consistencia', gravidade: 'grave', userId: r.user_id,
        titulo: 'Rota de cópia activa com conta removida',
        detalhe: `${falta.join(' e ')} já não existe. Desactivar a rota.`,
        acao: { tipo: 'desactivar_rota', id: r.id, motivo: 'conta de origem ou destino removida' }, segundaConfirmacao: false,
      })
    }
  }

  const resumo: Record<CategoriaCorrecao, number> = { orfa: 0, estrategia_morta: 0, sem_conta: 0, duplicado: 0, quota: 0, consistencia: 0 }
  for (const c of correcoes) resumo[c.categoria]++
  const peso = { grave: 0, aviso: 1, info: 2 }
  correcoes.sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || a.categoria.localeCompare(b.categoria))
  return { correcoes, avisos, resumo }
}

/** Das correcções pedidas, as que se podem aplicar agora (existem, têm acção e, se precisam, a 2.ª confirmação). */
export function seleccionarAplicaveis(
  diff: DiffSync,
  ids: string[],
  segundaConfirmacao: string | null | undefined,
): { aplicar: Correcao[]; recusadas: { id: string; motivo: string }[] } {
  const aplicar: Correcao[] = []
  const recusadas: { id: string; motivo: string }[] = []
  for (const id of new Set(ids)) {
    const c = diff.correcoes.find((x) => x.id === id)
    if (!c) { recusadas.push({ id, motivo: 'já não está no diff (mudou desde a pré-visualização)' }); continue }
    if (c.acao.tipo === 'nenhuma') { recusadas.push({ id, motivo: 'alerta sem correcção automática' }); continue }
    if (c.segundaConfirmacao && String(segundaConfirmacao ?? '').trim() !== 'APAGAR') {
      recusadas.push({ id, motivo: 'precisa da segunda confirmação («APAGAR»)' })
      continue
    }
    aplicar.push(c)
  }
  return { aplicar, recusadas }
}
