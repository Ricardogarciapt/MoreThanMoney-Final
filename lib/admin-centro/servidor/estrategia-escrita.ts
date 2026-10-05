/**
 * A CAMADA DE ESCRITA ÚNICA de uma estratégia.
 *
 * Decisão do dono (05/10): o Centro é o único sítio onde se DECIDE o que uma estratégia faz. Até
 * aqui seis rotas escreviam `mtmauto_providers` e o admin da MTM Auto escrevia a tabela e
 * `mestres_estrategias` por conta própria — a mesma decisão com três portas e três versões da regra
 * (docs/admin-controlo-unico.md). Agora TODAS as escritas passam por `escreverEstrategia`:
 *
 *   · a página da estratégia no Centro (`/api/admin/centro/estrategia`);
 *   · as rotas antigas, que ficaram fachadas finas para não partir clientes (app-mobile, painéis);
 *   · o admin da MTM Auto, pela mesma API, com o token do próprio admin e filtrado pela equipa.
 *
 * Cada acção: (1) guarda de quem decide (`podeDecidir` — o franchisado da equipa X nunca escreve na
 * Y; o motor da casa é só do admin do site / super admin), (2) o update construído pela regra pura
 * (`estrategia-escrita-plano.ts`), (3) releitura onde a acção já relia, (4) auditoria do Centro.
 *
 * O que NÃO está aqui de propósito: as leituras (estão em `estrategia-ficha.ts`) e os segredos das
 * equipas (chave MetaApi da equipa, password TradeLocker) — esses ficam na MTM Auto, que valida e
 * provisiona com eles e depois pede aqui a escrita da linha.
 */
import { esquecerCache } from '../cache'
import { db as dbReal } from './base'
import { registarAuditoria } from './outros'
import {
  alternarCanalExtra, configEspelho, linhaGravavel, patchConta, patchPausaCopia, patchTrailing, podeDecidir,
  rotasComInterruptor, saidasValidas, type QuemDecide,
} from '../estrategia-escrita-plano'

export interface RespostaEscrita {
  ok: boolean
  status: number
  mensagem: string
  dados?: Record<string, unknown>
}

type Db = ReturnType<typeof dbReal>

/** Dependências injectáveis — só o teste (estrategia-escrita.check.ts) as troca. */
export interface DepsEscrita {
  db: () => Db
  /** site_settings.mtmcopy_signal_sources (rotas provider + canais T2T extra) */
  config: {
    ler: () => Promise<Record<string, unknown>>
    gravar: (c: Record<string, unknown>) => Promise<void>
  }
  /** efeitos lentos/externos (CopyFactory, motor de registo) — best-effort */
  externos: {
    pausarCopyFactory: (rota: Record<string, unknown>, valor: boolean) => Promise<void>
    registar: (providerId: string) => Promise<{ ok: boolean } & Record<string, unknown>>
  }
  auditar: boolean
}

async function depsPorOmissao(): Promise<DepsEscrita> {
  const cfg = await import('@/lib/mtmcopy/signal-sources-config')
  return {
    db: dbReal,
    config: {
      ler: async () => { cfg.invalidateSignalSourcesCache(); return (await cfg.getSignalSourcesConfig()) as unknown as Record<string, unknown> },
      gravar: async (c) => { await cfg.saveSignalSourcesConfig(c as never) },
    },
    externos: {
      pausarCopyFactory: async (rota, valor) => {
        const strategyId = String(rota.strategy_id ?? '').trim()
        const accountId = String(rota.account_id ?? '').trim()
        if (!valor && strategyId) {
          const { removeProviderStrategy } = await import('@/lib/mtmcopy/copyfactory')
          await removeProviderStrategy(strategyId)
        }
        if (valor && strategyId && accountId) {
          const { ensureMtmProviderStrategyScaling } = await import('@/lib/mtmcopy/copyfactory')
          await ensureMtmProviderStrategyScaling({
            strategyId, accountId,
            name: String(rota.tag ?? rota.label ?? 'MTM Provider'),
            description: `MTM Auto · ${String(rota.sender_channel ?? 'provider')}`,
          })
        }
        const { runMtmcopySystemSync } = await import('@/lib/mtmcopy/system-sync')
        await runMtmcopySystemSync()
      },
      registar: async (providerId) => {
        const { depsReais, registarProvider } = await import('@/lib/mestres/servidor/registar-provider')
        return (await registarProvider(providerId, await depsReais())) as unknown as { ok: boolean } & Record<string, unknown>
      },
    },
    auditar: true,
  }
}

/** O pedido, tal como chega das rotas. `accao` decide o resto. */
export type PedidoEscrita = { accao: string } & Record<string, unknown>

const ehUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''))

export async function escreverEstrategia(quem: QuemDecide | null, pedido: PedidoEscrita, depsDados?: Partial<DepsEscrita>): Promise<RespostaEscrita> {
  const deps = { ...(await depsPorOmissao()), ...(depsDados ?? {}) } as DepsEscrita
  const accao = String(pedido.accao ?? '')
  let alvoTexto: string | null = null
  let r: RespostaEscrita
  try {
    // A estratégia alvo — por id ou por slug — lida UMA vez, para a guarda e para a acção.
    const alvo = await lerAlvo(deps, pedido)
    alvoTexto = alvo ? `mtmauto_providers:${alvo.id}` : null
    const g = podeDecidir(quem, accao, alvo)
    if (!g.ok) r = { ok: false, status: g.status, mensagem: g.erro }
    else r = await aplicar(deps, quem!, accao, pedido, alvo)
  } catch (e) {
    r = { ok: false, status: 500, mensagem: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
  // As listas do Centro e a cadeia guardam 10–30 s: sem isto o admin gravava e via o valor antigo.
  for (const k of ['centro:estrategias', 'centro:cockpit', 'centro:contas', 'copia:cadeia', 'centro:ficha']) esquecerCache(k)
  if (deps.auditar && quem) {
    const { confirmacao: _c, mt5_password_cifrada: _p, ...semSegredos } = pedido
    void _c; void _p
    await registarAuditoria({ adminId: quem.adminId, acao: `estrategia:${accao}`, alvo: alvoTexto, pedido: { ...semSegredos, origem: quem.origem }, resultado: { mensagem: r.mensagem, status: r.status }, ok: r.ok })
  }
  return r
}

type Alvo = Record<string, unknown> & { id: string; slug: string; tenant_id: string | null }

async function lerAlvo(deps: DepsEscrita, p: PedidoEscrita): Promise<Alvo | null> {
  const id = p.providerId ?? p.id
  const slug = p.slug
  let q = deps.db().from('mtmauto_providers').select('*')
  if (ehUuid(id)) q = q.eq('id', String(id))
  else if (typeof slug === 'string' && slug.trim()) q = q.ilike('slug', slug.trim())
  else return null
  const { data } = await q.limit(1)
  const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return l ? ({ ...l, id: String(l.id), slug: String(l.slug ?? ''), tenant_id: l.tenant_id == null ? null : String(l.tenant_id) } as Alvo) : null
}

async function aplicar(deps: DepsEscrita, quem: QuemDecide, accao: string, p: PedidoEscrita, alvo: Alvo | null): Promise<RespostaEscrita> {
  const precisa = (): RespostaEscrita | null => (alvo ? null : { ok: false, status: 404, mensagem: 'Estratégia não encontrada.' })
  const agora = new Date().toISOString()

  switch (accao) {
    // ── opções / apagar / restaurar: a regra que já existia (opcoes-estrategia.ts) ──
    case 'opcoes': {
      const f = precisa(); if (f) return f
      const { gravarOpcoesEstrategia } = await import('./opcoes-estrategia')
      const { accao: _a, providerId: _i, id: _id, slug: _s, confirmacao, ...opcoes } = p
      void _a; void _i; void _id; void _s
      const x = await gravarOpcoesEstrategia(quem.adminId, alvo!.id, opcoes, String(confirmacao ?? ''))
      return { ok: x.ok, status: x.status, mensagem: x.mensagem, dados: { opcoes: x.opcoes ?? null } }
    }
    case 'apagar': {
      const f = precisa(); if (f) return f
      const { apagarEstrategia } = await import('./opcoes-estrategia')
      const x = await apagarEstrategia(quem.adminId, alvo!.id, String(p.confirmacao ?? ''))
      return { ok: x.ok, status: x.status, mensagem: x.mensagem }
    }
    case 'restaurar': {
      const f = precisa(); if (f) return f
      const { restaurarEstrategia } = await import('./opcoes-estrategia')
      const x = await restaurarEstrategia(quem.adminId, alvo!.id)
      return { ok: x.ok, status: x.status, mensagem: x.mensagem }
    }

    // ── trailing (era /api/admin/mtmcopy/trailing-estrategias) ──
    case 'trailing': {
      const f = precisa(); if (f) return f
      const patch = patchTrailing(p, agora)
      const { error } = await deps.db().from('mtmauto_providers').update(patch).eq('id', alvo!.id)
      return error ? { ok: false, status: 500, mensagem: error.message } : { ok: true, status: 200, mensagem: 'Trailing gravado.', dados: { patch } }
    }

    // ── saídas parciais (só a MTM Auto as escrevia) ──
    case 'saidas': {
      const f = precisa(); if (f) return f
      const v = saidasValidas(p.saidas_pct)
      if (!v.ok) return { ok: false, status: 400, mensagem: v.erro }
      const { error } = await deps.db().from('mtmauto_providers').update({ saidas_pct: v.valor, updated_at: agora }).eq('id', alvo!.id)
      return error ? { ok: false, status: 500, mensagem: error.message } : { ok: true, status: 200, mensagem: v.valor ? `Saídas: ${v.valor.join(' / ')} %.` : 'Sem saídas parciais.' }
    }

    // ── espelho provider (era /api/admin/mtmfunded/espelho-provider POST) ──
    case 'espelho': {
      const f = precisa(); if (f) return f
      const sub = String(p.sub ?? p.accaoEspelho ?? '')
      if (sub === 'ligar') {
        if (p.ativo === true && !alvo!.espelho_funded_account_id) return { ok: false, status: 409, mensagem: 'cria primeiro a conta espelho' }
        const { error } = await deps.db().from('mtmauto_providers').update({ espelho_provider_ativo: p.ativo === true }).eq('id', alvo!.id)
        return error ? { ok: false, status: 500, mensagem: error.message } : { ok: true, status: 200, mensagem: p.ativo === true ? 'Espelho ligado.' : 'Espelho desligado.' }
      }
      if (sub === 'config') {
        const config = configEspelho(p.config as Record<string, unknown>)
        const { error } = await deps.db().from('mtmauto_providers').update({ espelho_config: config }).eq('id', alvo!.id)
        return error ? { ok: false, status: 500, mensagem: error.message } : { ok: true, status: 200, mensagem: 'Configuração do espelho gravada.', dados: { config } }
      }
      if (sub === 'criar_conta') {
        if (alvo!.espelho_funded_account_id) return { ok: false, status: 409, mensagem: 'esta estratégia já tem conta espelho', dados: { contaId: alvo!.espelho_funded_account_id } }
        const saldo = Number(p.saldo ?? 100_000)
        if (!(saldo >= 1000 && saldo <= 10_000_000)) return { ok: false, status: 400, mensagem: 'saldo inválido' }
        const { camposDeContaSimulada } = await import('@/lib/mtmfunded/simulado/motor')
        // Conta da CASA: nunca de cliente, sem segue_estrategia, sem mtmauto_accounts, analise=true.
        const { data: conta, error } = await deps.db().from('mtm_trading_accounts').insert({
          user_id: quem.adminId, tipo: 'financiada', program_id: null, saldo_inicial: saldo, alavancagem: 100,
          ...(await camposDeContaSimulada(saldo)),
          conta_casa: true,
          metricas: { analise: true, casa: true, espelhoProvider: alvo!.slug, estrategia: alvo!.nome ?? alvo!.slug, criadaEm: agora },
        }).select('id, mt5_login').single()
        if (error || !conta) return { ok: false, status: 500, mensagem: error?.message ?? 'insert sem linha' }
        const { error: e2 } = await deps.db().from('mtmauto_providers').update({ espelho_funded_account_id: conta.id }).eq('id', alvo!.id)
        if (e2) return { ok: false, status: 500, mensagem: e2.message, dados: { contaId: conta.id } }
        return { ok: true, status: 200, mensagem: `Conta espelho ${conta.mt5_login ?? conta.id} criada.`, dados: { contaId: conta.id, login: conta.mt5_login } }
      }
      return { ok: false, status: 400, mensagem: 'acção do espelho desconhecida (criar_conta | ligar | config)' }
    }

    // ── interruptores da rota provider (era /api/admin/mtmcopy/t2t-controls POST) ──
    case 'canal_extra': {
      const cfg = await deps.config.ler()
      const lista = alternarCanalExtra(cfg.t2t_extra_channels as string[] | undefined, String(p.channel ?? p.canal ?? '').trim(), p.value === true || p.valor === true)
      if (!lista) return { ok: false, status: 400, mensagem: 'canal inválido' }
      await deps.config.gravar({ ...cfg, t2t_extra_channels: lista })
      return { ok: true, status: 200, mensagem: 'Canal T2T gravado.' }
    }
    case 'rota_provider': {
      const { normalizeProviderRoutes, syncChannelProvidersFromRoutes } = await import('@/lib/mtmcopy/provider-routes')
      const { ROTA_PARA_SLUGS_MTMAUTO } = await import('@/lib/mtmauto/espelho-interruptores')
      const campo = p.campo === 't2t' ? 't2t' : p.campo === 'copia' ? 'copia' : null
      if (!campo) return { ok: false, status: 400, mensagem: 'campo inválido (copia | t2t)' }
      const valor = p.value === true || p.valor === true
      const routeId = String(p.routeId ?? '').trim()
      const cfg = await deps.config.ler()
      // Normalizadas (inclui canónicas reconstruídas) — é sobre estas que o resto do sistema opera.
      const rotas = normalizeProviderRoutes(cfg as never) as unknown as Array<Record<string, unknown> & { id: string }>
      const alvoRota = rotas.find((x) => x.id === routeId)
      if (!alvoRota) return { ok: false, status: 404, mensagem: 'rota não encontrada' }
      const novas = rotasComInterruptor(rotas, routeId, campo, valor)
      // `channel_providers` reescreve-se AQUI: enquanto lá ficar a conta mestre de uma rota pausada,
      // a resolução do sinal encontra-a por esse caminho e executa na mesma.
      await deps.config.gravar({ ...cfg, provider_routes: novas, channel_providers: syncChannelProvidersFromRoutes(novas as never) })
      if (campo === 'copia') {
        /**
         * ORDEM IMPORTA (incidente 04/09): o travão agarra primeiro — config (feita acima) e o
         * espelho em `ativo`, que é o que a MTM Auto lê para executar. Só depois a CopyFactory, que
         * é lenta e pode bater no maxDuration. Se o espelho falha, a pausa NÃO está aplicada onde
         * conta e diz-se isso, em vez de «ok».
         */
        const slugs = ROTA_PARA_SLUGS_MTMAUTO[routeId]
        if (slugs?.length) {
          const { error } = await deps.db().from('mtmauto_providers').update(patchPausaCopia(valor)).in('slug', slugs)
          if (error) return { ok: false, status: 500, mensagem: `A pausa não chegou à app MTM Auto (${error.message}). A estratégia PODE continuar a executar — repete.` }
        }
        try { await deps.externos.pausarCopyFactory(alvoRota, valor) } catch (e) { console.warn('[estrategia-escrita] CopyFactory falhou:', e) }
      }
      return { ok: true, status: 200, mensagem: `${campo === 'copia' ? 'Cópia' : 'Tap to Trade'} ${valor ? 'ligado' : 'pausado'} em ${routeId}.` }
    }

    // ── motor das mestres (era /api/admin/mtmauto-copia/mestres e, na MTM Auto, /api/admin/mestres) ──
    case 'mestres': {
      const { lerPedido } = await import('@/lib/mestres/painel')
      const pm = lerPedido(p.pedido ?? p)
      if ('erro' in pm) return { ok: false, status: 400, mensagem: pm.erro }
      const { aplicarPedidoMestres } = await import('@/lib/mestres/servidor/painel-escrita')
      const x = await aplicarPedidoMestres(quem.adminId, pm)
      return { ok: x.ok, status: x.status, mensagem: x.mensagem, dados: { detalhe: x.detalhe ?? null } }
    }

    // ── registar na cadeia / criar provider externo (era /api/admin/mtmauto-copia/providers) ──
    case 'registar': {
      const f = precisa(); if (f) return f
      const x = await deps.externos.registar(alvo!.id)
      return { ok: x.ok !== false, status: x.ok !== false ? 200 : 409, mensagem: x.ok !== false ? 'Registada na cadeia (sombra).' : String((x as { erro?: unknown }).erro ?? 'não registou'), dados: x }
    }
    case 'criar': return criarProviderExterno(deps, quem, p)

    // ── fonte de execução mestre ↔ espelho (084) ──
    case 'fonte': {
      const f = precisa(); if (f) return f
      const fonte = String(p.fonte ?? '')
      if (!['mestre', 'espelho'].includes(fonte)) return { ok: false, status: 400, mensagem: 'fonte inválida (mestre | espelho)' }
      const { data, error } = await deps.db().rpc('mtmauto_trocar_fonte_execucao', { p_provider: alvo!.id, p_fonte: fonte, p_por: quem.adminId })
      if (error) {
        const pendente = /does not exist|could not find/i.test(error.message)
        return { ok: false, status: pendente ? 424 : 409, mensagem: pendente ? 'Migração 084 por aplicar.' : error.message.replace(/^.*fonte_execucao: /, '') }
      }
      return { ok: true, status: 200, mensagem: `Fonte de execução: ${fonte}.`, dados: (data ?? {}) as Record<string, unknown> }
    }

    // ── a linha inteira, vinda da MTM Auto (criar/editar) ──
    case 'gravar': {
      const linha = (p.linha ?? {}) as Record<string, unknown>
      if (!linha.slug || !linha.nome) return { ok: false, status: 400, mensagem: 'Slug e nome são obrigatórios.' }
      if (alvo?.apagado_em) return { ok: false, status: 410, mensagem: 'Esta estratégia foi apagada.' }
      // Editar exige que o id do pedido seja o do alvo (lido acima pela guarda); criar não leva id.
      if (linha.id && (!alvo || alvo.id !== String(linha.id))) return { ok: false, status: 404, mensagem: 'Estratégia não encontrada.' }
      const l = linhaGravavel(linha, quem, alvo)
      const { data, error } = await deps.db().from('mtmauto_providers').upsert(l, { onConflict: 'id' }).select('*').single()
      if (error) return { ok: false, status: /column|schema cache/i.test(error.message) ? 409 : 500, mensagem: error.message }
      return { ok: true, status: 200, mensagem: 'Gravada.', dados: { provider: data as Record<string, unknown> } }
    }

    // ── colunas da conta (ligar MetaApi / MTM Funded / TradeLocker / canal Telegram, na MTM Auto) ──
    case 'conta': {
      const f = precisa(); if (f) return f
      const patch = patchConta(String(p.tipo ?? ''), (p.campos ?? {}) as Record<string, unknown>)
      if (!patch) return { ok: false, status: 400, mensagem: 'tipo de conta inválido' }
      const { error } = await deps.db().from('mtmauto_providers').update(patch).eq('id', alvo!.id)
      return error ? { ok: false, status: /column/.test(error.message) ? 409 : 500, mensagem: error.message } : { ok: true, status: 200, mensagem: 'Conta da estratégia gravada.' }
    }

    // ── conta mestre MTM Funded (provisionamento das contas do dono) ──
    case 'conta_mestre': {
      const f = precisa(); if (f) return f
      if (!ehUuid(p.contaId)) return { ok: false, status: 400, mensagem: 'contaId inválido' }
      const { error } = await deps.db().from('mtmauto_providers').update({ funded_account_id: String(p.contaId), updated_at: agora }).eq('id', alvo!.id).is('funded_account_id', null)
      return error ? { ok: false, status: 500, mensagem: `mtmauto_providers: ${error.message}` } : { ok: true, status: 200, mensagem: 'Conta mestre ligada.' }
    }

    // ── em que equipas aparece (era /api/admin/providers {equipas} na MTM Auto) ──
    case 'equipas': {
      const f = precisa(); if (f) return f
      const equipas = Array.isArray(p.equipas) ? (p.equipas as unknown[]).map(String).filter(Boolean) : []
      await deps.db().from('mtmauto_provider_tenants').delete().eq('provider_id', alvo!.id)
      if (equipas.length) {
        const { error } = await deps.db().from('mtmauto_provider_tenants').insert(equipas.map((tenant_id) => ({ provider_id: alvo!.id, tenant_id })))
        if (error) return { ok: false, status: 500, mensagem: error.message }
      }
      return { ok: true, status: 200, mensagem: 'Equipas gravadas.', dados: { equipas } }
    }

    // ── apagar PARANDO os seguidores (a semântica da MTM Auto) ──
    case 'apagar_parando': return apagarParando(deps, quem, alvo)

    // ── um subscritor passa (ou deixa) de seguir (quadro da cadeia) ──
    case 'subscritor': {
      const f = precisa(); if (f) return f
      const ref = String(p.ref ?? '')
      if (!/^(site|auto|wt|funded|prov):[0-9a-f-]{36}$/i.test(ref)) return { ok: false, status: 400, mensagem: 'referência de conta inválida' }
      const { ligarSubscritor } = await import('@/lib/copia-contas/servidor/cadeia')
      const x = await ligarSubscritor(quem.adminId, { ref, slug: alvo!.slug, ligar: p.ligar === true, lote: p.lote == null || p.lote === '' ? null : Number(p.lote) })
      return { ok: x.ok, status: x.status, mensagem: x.mensagem }
    }
  }
  return { ok: false, status: 400, mensagem: `Acção desconhecida: ${accao}.` }
}

/** Provider externo novo pela chave MetaApi da CASA (o caminho das equipas fica na MTM Auto). */
async function criarProviderExterno(deps: DepsEscrita, quem: QuemDecide, b: PedidoEscrita): Promise<RespostaEscrita> {
  const { validarProviderExterno } = await import('@/lib/mestres/provider-externo')
  const slug = String(b.slug ?? '').trim()
  const nome = String(b.nome ?? '').trim()
  if (!slug || !nome) return { ok: false, status: 400, mensagem: 'slug e nome são obrigatórios' }
  const ext = validarProviderExterno(b)
  if (!ext.ok) return { ok: false, status: 400, mensagem: ext.erro }
  const extra: Record<string, unknown> = { ...ext.linha }
  if (ext.tipo === 'metaapi') {
    // Só leitura, com a chave da casa: confirma que a conta existe antes de gravar.
    const token = process.env.METAAPI_TOKEN
    if (!token) return { ok: false, status: 503, mensagem: 'METAAPI_TOKEN em falta no servidor' }
    const r = await fetch(`https://mt-client-api-v1.new-york.agiliumtrade.ai/users/current/accounts/${encodeURIComponent(String(ext.linha.metaapi_account_id))}/accountInformation`, { headers: { 'auth-token': token }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    const info = r?.ok ? ((await r.json().catch(() => null)) as { balance?: number } | null) : null
    if (!info || typeof info.balance !== 'number') return { ok: false, status: 400, mensagem: 'Essa conta MetaApi não respondeu. Confirma o id.' }
  }
  if (ext.tipo === 'mt5' && ext.passwordMt5) {
    const { cifrar, cifraDisponivel } = await import('@/lib/mtmfunded/credenciais')
    if (!cifraDisponivel()) return { ok: false, status: 503, mensagem: 'MTMFUNDED_CRED_KEY em falta — não se guarda a password MT5' }
    extra.mt5_password_cifrada = cifrar(ext.passwordMt5)
  }
  const { data, error } = await deps.db().from('mtmauto_providers').insert({
    slug, nome, descricao: (b.descricao as string) ?? null, tipo: ext.tipo, tenant_id: null, criado_por: quem.adminId,
    ativo: false, espelhar: false, fonte_execucao: 'mestre',
    canal_chat: typeof b.canal_chat === 'string' && b.canal_chat.trim() ? b.canal_chat.trim().toLowerCase() : null,
    ...extra,
  }).select('id').single()
  if (error || !data) return { ok: false, status: 500, mensagem: error?.message ?? 'não gravou' }
  const reg = await deps.externos.registar(String(data.id))
  return { ok: true, status: 200, mensagem: reg.ok !== false ? 'Criada e registada na cadeia (sombra).' : 'Criada; o registo na cadeia falhou — repete «registar».', dados: { ...reg, providerId: data.id, aviso: ext.aviso } }
}

/**
 * Apagar PARANDO os seguidores — a regra da MTM Auto (084: nunca DELETE, as FKs em cascata levavam o
 * histórico). A MTM Auto valida as palavras e conta os seguidores antes (planoApagar); aqui repete-se o
 * travão da CopyFactory do site, pára, RELÊ e só então marca. Apagar a conta MetaApi fica na MTM Auto
 * (é a chave da equipa).
 */
async function apagarParando(deps: DepsEscrita, quem: QuemDecide, p: Alvo | null): Promise<RespostaEscrita> {
  if (!p || p.apagado_em) return { ok: false, status: 404, mensagem: 'Strategy not found.' }
  const d = deps.db()
  const id = p.id
  const slug = p.slug
  const { count: cf } = await d.from('mtmcopy_connections').select('id', { count: 'exact', head: true })
    .in('copyfactory_strategy_pick', [slug, ...(p.fonte_mtm ? [String(p.fonte_mtm)] : [])]).eq('is_active', true).eq('copyfactory_subscribed', true)
  if ((cf ?? 0) > 0) return { ok: false, status: 409, mensagem: `${cf} MTM site connection(s) copy this strategy through CopyFactory. Stop them in the MTM admin first.` }
  const agora = new Date().toISOString()
  const { error: e1 } = await d.from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('provider_id', id)
  if (e1) return { ok: false, status: 500, mensagem: `Could not stop followers: ${e1.message}` }
  await d.from('mtm_trading_accounts').update({ segue_estrategia: null }).eq('segue_estrategia', slug)
  await d.from('copia_rotas').update({ ativa: false, pausada_motivo: 'estratégia apagada' }).eq('origem_ref', `prov:${id}`).eq('ativa', true)
  await d.from('mtmauto_signals').update({ estado: 'closed', updated_at: agora }).eq('provider_id', id).in('estado', ['pending', 'active'])
  // Reler: a resposta de uma escrita não é prova (copyfactory-desubscricao-partida).
  const [{ count: s2 }, { count: f2 }, { count: r2 }] = await Promise.all([
    d.from('mtmauto_subscriptions').select('user_id', { count: 'exact', head: true }).eq('provider_id', id).eq('ativo', true),
    d.from('mtm_trading_accounts').select('id', { count: 'exact', head: true }).eq('segue_estrategia', slug),
    d.from('copia_rotas').select('id', { count: 'exact', head: true }).eq('origem_ref', `prov:${id}`).eq('ativa', true),
  ])
  if ((s2 ?? 0) + (f2 ?? 0) + (r2 ?? 0) > 0) return { ok: false, status: 409, mensagem: 'Some followers are still active after stopping them — nothing was removed. Try again.', dados: { seguidores: { mtmauto: s2, mtmfunded: f2, rotas: r2 } } }
  const { error: e3 } = await d.from('mtmauto_providers').update({ apagado_em: agora, apagado_por: quem.adminId, ativo: false, espelhar: false, updated_at: agora }).eq('id', id)
  if (e3) return { ok: false, status: 500, mensagem: e3.message }
  return { ok: true, status: 200, mensagem: 'Removida · seguidores parados · histórico mantido.', dados: { provider: p } }
}
