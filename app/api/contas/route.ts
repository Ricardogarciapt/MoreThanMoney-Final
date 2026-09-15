import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos, direitoMtmAuto } from '@/lib/entitlements'
import { carregarQuotaMetaApi, mensagemQuota, QUOTA_METAAPI_GRATIS, QUOTA_METAAPI_PREMIUM } from '@/lib/contas/quota-metaapi'
import { lerChave, listarContasUnificadas } from '@/lib/contas/ligador'
import {
  apagarContaMetaApiConfirmado,
  atualizarCredenciaisMetaApi,
  lerContaMetaApi,
  tokenMetaApiDoUtilizador,
} from '@/lib/contas/metaapi-contas'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { isIosAppRequest } from '@/lib/is-native-request'
import {
  DELETE as apagarLigacaoSite,
  PATCH as estadoLigacaoSite,
} from '@/app/api/mtmcopy/connection/route'
import { DELETE as apagarTradeLocker } from '@/app/api/mtmcopy/tradelocker/route'
import { DELETE as apagarMtmFunded } from '@/app/api/mtmfunded/ligar-conta/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * LIGADOR DE CONTAS — a superfície única de «As minhas contas».
 *
 *   GET                         → { contas, quota } (lista dos dois produtos + uso da quota MetaApi)
 *   PATCH { chave, acao }       → acao: 'pausar' | 'retomar' | 'credenciais' {password?, servidor?} | 'rotulo' {rotulo}
 *   DELETE ?chave=site:<id>     → remove (MetaApi: undeploy + delete + RELEITURA)
 *
 * Ligar contas novas usa as rotas especializadas, todas com a quota MetaApi no servidor:
 *   MT4/MT5 → /api/mtmcopy/provision · TradeLocker → /api/mtmcopy/tradelocker ·
 *   MTM Funded → /api/mtmfunded/ligar-conta. O componente é um só
 *   (components/contas/ligador-contas.tsx).
 *
 * Passwords: aceites no PATCH de credenciais, enviadas à MetaApi e nunca gravadas nem devolvidas.
 */

const db = getSupabaseAdmin()

async function autenticar(request: NextRequest) {
  const h = request.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await db.auth.getUser(h.replace('Bearer ', ''))
  return error || !user ? null : user
}

/** Reencaminha para o handler já existente, com a mesma sessão — é o caminho de sempre. */
function pedidoInterno(request: NextRequest, caminho: string, metodo: string, corpo?: unknown) {
  return new NextRequest(new URL(caminho, request.url), {
    method: metodo,
    headers: { Authorization: request.headers.get('Authorization') ?? '', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
}

export async function GET(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const direitos = await carregarDireitos(user.id)
  const [contas, quota] = await Promise.all([listarContasUnificadas(user.id), carregarQuotaMetaApi(user.id, direitos)])
  const finito = (n: number) => (Number.isFinite(n) ? n : null)
  return NextResponse.json({
    contas,
    quota: {
      plano: quota.plano,
      base: finito(quota.base),
      extras: quota.extras,
      limite: finito(quota.limite),
      emUso: quota.emUso,
      livres: finito(quota.livres),
      acimaDoLimite: quota.acimaDoLimite,
      semLimite: quota.plano === 'admin',
      mensagem: quota.plano === 'admin' ? null : quota.livres === 0 || quota.acimaDoLimite ? mensagemQuota(quota) : null,
      gratis: QUOTA_METAAPI_GRATIS,
      premium: QUOTA_METAAPI_PREMIUM,
    },
    // No iOS nativo não se mostra compra (Apple 3.1.1): o ecrã esconde o botão de upgrade.
    compraPermitida: !isIosAppRequest(request),
  })
}

export async function PATCH(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const alvo = lerChave(corpo.chave)
  if (!alvo) return NextResponse.json({ error: 'Conta inválida' }, { status: 400 })
  const acao = String(corpo.acao ?? '')
  if (alvo.origem === 'wt') return NextResponse.json({ error: 'Contas abertas no WebTrader só se removem.' }, { status: 400 })

  if (alvo.origem === 'site') {
    const { data: lig } = await db.from('mtmcopy_connections').select('*').eq('id', alvo.id).eq('user_id', user.id).maybeSingle()
    if (!lig) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

    if (acao === 'pausar' || acao === 'retomar') {
      // O PATCH de sempre: aplica a pausa também na CopyFactory (e exige direito para retomar cópia).
      return estadoLigacaoSite(pedidoInterno(request, '/api/mtmcopy/connection', 'PATCH', { connection_id: alvo.id, is_active: acao === 'retomar' }))
    }
    if (acao === 'rotulo') {
      const rotulo = String(corpo.rotulo ?? '').trim().slice(0, 60) || null
      await db.from('mtmcopy_connections').update({ account_label: rotulo, updated_at: new Date().toISOString() }).eq('id', alvo.id).eq('user_id', user.id)
      return NextResponse.json({ ok: true })
    }
    if (acao === 'credenciais') {
      const plataforma = String(lig.mt5_platform ?? 'mt5').toLowerCase()
      if (plataforma !== 'mt5' && plataforma !== 'mt4') {
        return NextResponse.json({ error: 'Esta conta não usa password MetaTrader — remove-a e liga-a de novo.' }, { status: 400 })
      }
      const password = typeof corpo.password === 'string' ? corpo.password : ''
      const servidor = String(corpo.servidor ?? '').trim()
      if (!password && !servidor) return NextResponse.json({ error: 'Indica a password nova e/ou o servidor.' }, { status: 400 })
      if (servidor && lig.purpose === 'tap_to_trade') {
        const { isAllowedT2TServer, T2T_BROKERS } = await import('@/lib/mtmcopy/t2t-brokers')
        if (!isAllowedT2TServer(servidor)) {
          return NextResponse.json({ error: `No Tap to Trade só podes usar servidores destas corretoras: ${T2T_BROKERS.map((b) => b.label).join(', ')}.` }, { status: 400 })
        }
      }
      if (!lig.metaapi_account_id) {
        // Nunca chegou à MetaApi: o religar de sempre (só password; o servidor fica o gravado).
        if (!password) return NextResponse.json({ error: 'Esta conta ainda não ligou — indica a password para tentar outra vez.' }, { status: 400 })
        const { PUT: religar } = await import('@/app/api/mtmcopy/provision/route')
        return religar(pedidoInterno(request, '/api/mtmcopy/provision', 'PUT', { connection_id: alvo.id, mt5_password: password }))
      }
      const token = await tokenMetaApiDoUtilizador(user.id, 'site')
      if (!token) return NextResponse.json({ error: 'MetaApi indisponível no servidor.' }, { status: 503 })
      const r = await atualizarCredenciaisMetaApi(String(lig.metaapi_account_id), token, { password: password || undefined, server: servidor || undefined })
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })
      await db
        .from('mtmcopy_connections')
        .update({ ...(servidor ? { mt5_server: servidor } : {}), mt5_status: 'connected', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', alvo.id)
        .eq('user_id', user.id)
      invalidateCopyConnectionsCache()
      return NextResponse.json({ ok: true, message: 'Credenciais actualizadas. A conta está a voltar a ligar.' })
    }
    return NextResponse.json({ error: 'Acção desconhecida' }, { status: 400 })
  }

  // ── MTM Auto ────────────────────────────────────────────────────────────────────────────────
  const { data: conta } = await db.from('mtmauto_accounts').select('*').eq('id', alvo.id).eq('user_id', user.id).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  const metaTrader = ['mt5', 'mt4'].includes(String(conta.plataforma ?? 'mt5').toLowerCase())
  if (!metaTrader) return NextResponse.json({ error: 'Esta conta gere-se na app MTM Auto.' }, { status: 400 })

  if (acao === 'pausar' || acao === 'retomar') {
    if (acao === 'retomar') {
      const d = await direitoMtmAuto(user.id)
      if (!d.tem) {
        return NextResponse.json({ error: 'A cópia automática precisa do MTM Auto (ou de seres Premium/VIP).', code: 'sem_copia_automatica' }, { status: 402 })
      }
    }
    await db.from('mtmauto_accounts').update({ copia_ativa: acao === 'retomar', updated_at: new Date().toISOString() }).eq('id', alvo.id).eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }
  if (acao === 'rotulo') {
    await db.from('mtmauto_accounts').update({ rotulo: String(corpo.rotulo ?? '').trim().slice(0, 40) || null }).eq('id', alvo.id).eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }
  if (acao === 'credenciais') {
    if (!conta.metaapi_account_id) return NextResponse.json({ error: 'Esta conta não está na MetaApi — liga-a de novo.' }, { status: 400 })
    const password = typeof corpo.password === 'string' ? corpo.password : ''
    const servidor = String(corpo.servidor ?? '').trim()
    if (!password && !servidor) return NextResponse.json({ error: 'Indica a password nova e/ou o servidor.' }, { status: 400 })
    const token = await tokenMetaApiDoUtilizador(user.id, 'auto')
    if (!token) return NextResponse.json({ error: 'MetaApi indisponível no servidor.' }, { status: 503 })
    const r = await atualizarCredenciaisMetaApi(String(conta.metaapi_account_id), token, { password: password || undefined, server: servidor || undefined })
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })
    await db
      .from('mtmauto_accounts')
      .update({ ...(servidor ? { servidor } : {}), estado: 'connected', erro: null, updated_at: new Date().toISOString() })
      .eq('id', alvo.id)
      .eq('user_id', user.id)
    return NextResponse.json({ ok: true, message: 'Credenciais actualizadas. A conta está a voltar a ligar.' })
  }
  return NextResponse.json({ error: 'Acção desconhecida' }, { status: 400 })
}

export async function DELETE(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const alvo = lerChave(new URL(request.url).searchParams.get('chave'))
  if (!alvo) return NextResponse.json({ error: 'Conta inválida' }, { status: 400 })

  if (alvo.origem === 'wt') {
    // Conta MT5 aberta só no WebTrader: apaga a conta MetaApi (se nenhuma outra ligação a usa) e a linha.
    const { removerContaWebtraderMt5 } = await import('@/lib/webtrader/entrar')
    try {
      const r = await removerContaWebtraderMt5(user.id, alvo.id)
      return NextResponse.json({ success: true, metaapi: r.metaapi })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao remover conta' }, { status: (e as { status?: number }).status ?? 500 })
    }
  }

  if (alvo.origem === 'site') {
    const { data: lig } = await db.from('mtmcopy_connections').select('*').eq('id', alvo.id).eq('user_id', user.id).maybeSingle()
    if (!lig) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    const plataforma = String(lig.mt5_platform ?? 'mt5').toLowerCase()
    if (plataforma === 'tradelocker') {
      return apagarTradeLocker(pedidoInterno(request, `/api/mtmcopy/tradelocker?id=${alvo.id}`, 'DELETE'))
    }
    if (plataforma === 'mtmfunded') {
      return apagarMtmFunded(pedidoInterno(request, `/api/mtmfunded/ligar-conta?id=${alvo.id}`, 'DELETE'))
    }
    // A mesma conta MetaApi também serve o MTM Auto? Então NÃO se apaga na MetaApi (desligava-a lá):
    // tira-se só a cópia desta ligação e a linha.
    if (lig.metaapi_account_id) {
      const { data: noAuto } = await db.from('mtmauto_accounts').select('id').eq('metaapi_account_id', lig.metaapi_account_id).limit(1)
      if ((noAuto ?? []).length) {
        if (lig.copyfactory_subscribed) {
          const { removeConnectionCopyFactory } = await import('@/lib/mtmcopy/connection-sync')
          const r = await removeConnectionCopyFactory(String(lig.metaapi_account_id))
          if (r && (r as { ok?: boolean }).ok === false) {
            return NextResponse.json({ error: 'Não foi possível parar a cópia desta conta. Tenta outra vez.' }, { status: 502 })
          }
        }
        await db.from('mtmcopy_connections').delete().eq('id', alvo.id).eq('user_id', user.id)
        invalidateCopyConnectionsCache()
        return NextResponse.json({ success: true, metaapi: 'partilhada' })
      }
    }
    // MetaTrader: o DELETE de sempre (desubscreve CopyFactory, apaga a conta MetaApi, apaga a linha)…
    const res = await apagarLigacaoSite(pedidoInterno(request, `/api/mtmcopy/connection?id=${alvo.id}`, 'DELETE'))
    if (!res.ok || !lig.metaapi_account_id) return res
    invalidateCopyConnectionsCache()
    // …e RELÊ-SE a MetaApi: a resposta dela não é prova.
    const token = await tokenMetaApiDoUtilizador(user.id, 'site')
    const lida = token ? await lerContaMetaApi(String(lig.metaapi_account_id), token) : undefined
    const apagada = lida === null || lida?.state === 'DELETING'
    if (!apagada && token) {
      const segunda = await apagarContaMetaApiConfirmado(String(lig.metaapi_account_id), token)
      return NextResponse.json({ success: true, metaapi: segunda.ok ? 'apagada' : 'pendente', aviso: segunda.ok ? undefined : segunda.erro })
    }
    return NextResponse.json({ success: true, metaapi: apagada ? 'apagada' : 'desconhecido' })
  }

  const { data: conta } = await db.from('mtmauto_accounts').select('*').eq('id', alvo.id).eq('user_id', user.id).maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  if (!['mt5', 'mt4'].includes(String(conta.plataforma ?? 'mt5').toLowerCase())) {
    return NextResponse.json({ error: 'Esta conta remove-se na app MTM Auto.' }, { status: 400 })
  }
  let metaapi: 'apagada' | 'pendente' | 'partilhada' | 'sem_conta' = 'sem_conta'
  let aviso: string | undefined
  if (conta.metaapi_account_id) {
    const { data: noSite } = await db.from('mtmcopy_connections').select('id').eq('metaapi_account_id', conta.metaapi_account_id).neq('mt5_status', 'disconnected').limit(1)
    if ((noSite ?? []).length) {
      // A mesma conta MetaApi serve o Tap to Trade no site: apagá-la desligava-a lá também.
      metaapi = 'partilhada'
    } else {
      const token = await tokenMetaApiDoUtilizador(user.id, 'auto')
      if (token) {
        const r = await apagarContaMetaApiConfirmado(String(conta.metaapi_account_id), token)
        metaapi = r.ok ? 'apagada' : 'pendente'
        aviso = r.erro
      }
    }
  }
  // As estratégias que usavam esta conta ficam sem conta (como faz a app MTM Auto com as MTM Funded).
  await db.from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false, conta_id: null }).eq('user_id', user.id).eq('conta_id', alvo.id)
  const { error } = await db.from('mtmauto_accounts').delete().eq('id', alvo.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Erro ao remover conta' }, { status: 500 })
  return NextResponse.json({ success: true, metaapi, aviso })
}
