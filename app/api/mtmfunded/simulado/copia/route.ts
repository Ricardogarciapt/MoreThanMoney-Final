import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { ErroOrdem, autorizarConta, type Conta } from '@/lib/mtmfunded/simulado/execucao'
import { getExecSwitches } from '@/lib/mtmcopy/exec-switches'
import { elegibilidade, destinosDoUtilizador, destinoPermitido, type Destino, type DestinoTipo } from '@/lib/mtmfunded/copia/elegibilidade'
import { validarConfig } from '@/lib/mtmfunded/copia/config'

export const dynamic = 'force-dynamic'

/**
 * COPIAR ESTA CONTA SIMULADA PARA A MINHA CONTA (MTM Copy / MTM Auto).
 *
 * GET    ?accountId=            → elegibilidade, destinos possíveis, copiadores, últimos eventos e cópias
 * POST   { accountId, destinoTipo, destinoId, modoLote, valor, loteMax, maxPosicoes, perdaDiariaMax,
 *          simbolos, copiarSl, copiarTp, aceite }  → cria
 * PATCH  { accountId, id, ativo?, ...config }       → altera / pausa / retoma
 * DELETE ?accountId=&id=                            → apaga (só sem cópias abertas)
 *
 * Ler: master ou investor (o investor vê os copiadores, não as contas de destino).
 * Mudar: master E a sessão MTM do DONO. Quem só tem a password master da conta não é necessariamente
 * o dono — e um copiador abre ordens na conta real do dono.
 *
 * O trabalho a sério (ordens) é do serviço do VPS (services/funded-copier). Esta rota só configura.
 */

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/copia]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

async function dono(request: NextRequest, accountId: string): Promise<{ conta: Conta; userId: string }> {
  const { conta, modo } = await autorizarConta(request, accountId)
  if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')
  const userId = await userIdDoPedido(request)
  if (!userId || userId !== conta.user_id) throw new ErroOrdem(403, 'só o dono da conta (com sessão MTM) pode configurar a cópia')
  return { conta, userId }
}

function destinoPublico(d: Destino, admin: boolean, reais: boolean) {
  const p = destinoPermitido(d, admin, reais)
  return {
    tipo: d.tipo, id: d.id, rotulo: d.rotulo, login: d.login, servidor: d.servidor, demo: d.demo, ligado: d.ligado,
    outraCopiaAtiva: d.outraCopiaAtiva, permitido: p.ok, motivo: p.ok ? null : p.motivo,
  }
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { conta, modo } = await autorizarConta(request, accountId)
    const db = getSupabaseAdmin()
    const userId = String(conta.user_id)
    const [{ direitos, elegivel, reais }, switches, { data: copiadores }, { data: eventos }] = await Promise.all([
      elegibilidade(userId),
      getExecSwitches(),
      db.from('funded_copiers').select('*').eq('account_id', conta.id).order('created_at', { ascending: true }),
      db.from('funded_copy_events').select('id, tipo, position_id, payload, criado_em, processado_em, tentativas, erro')
        .eq('account_id', conta.id).order('id', { ascending: false }).limit(20),
    ])
    const ids = (copiadores ?? []).map((c) => String(c.id))
    const { data: copias } = ids.length
      ? await db.from('funded_copy_positions')
        .select('id, copier_id, funded_position_id, dest_position_id, dest_symbol, volume_origem, dest_volume_origem, fechado_pct, estado, erro, preco_origem, preco_destino, latencia_ms, created_at')
        .in('copier_id', ids).order('created_at', { ascending: false }).limit(20)
      : { data: [] as Record<string, unknown>[] }

    // Deslizamento em preço, com sinal: positivo = o destino entrou PIOR que a simulada.
    const posIds = [...new Set((copias ?? []).map((c) => String(c.funded_position_id)))]
    const { data: posicoes } = posIds.length
      ? await db.from('funded_positions').select('id, direcao, symbol').in('id', posIds)
      : { data: [] as Record<string, unknown>[] }
    const dir = new Map((posicoes ?? []).map((p) => [String(p.id), p]))

    const destinos = modo === 'master' ? await destinosDoUtilizador(userId) : []
    const porChave = new Map(destinos.map((d) => [`${d.tipo}:${d.id}`, d]))

    return NextResponse.json({
      modo,
      elegivel,
      motivoCopia: direitos.motivoCopia,
      admin: direitos.admin,
      reaisLigadas: reais,
      interruptorLigado: switches.funded_copier,
      destinos: destinos.map((d) => destinoPublico(d, direitos.admin, reais)),
      copiadores: (copiadores ?? []).map((c) => {
        const d = porChave.get(`${c.destino_tipo}:${c.destino_id}`)
        return {
          id: c.id, destinoTipo: c.destino_tipo, destinoId: c.destino_id, ativo: c.ativo, pausadoMotivo: c.pausado_motivo,
          modoLote: c.modo_lote, valor: c.valor, loteMax: c.lote_max, maxPosicoes: c.max_posicoes, perdaDiariaMax: c.perda_diaria_max,
          copiarSl: c.copiar_sl, copiarTp: c.copiar_tp, simbolos: c.simbolos ?? [], criadoEm: c.created_at,
          destino: d ? destinoPublico(d, direitos.admin, reais) : null,
        }
      }),
      eventos: eventos ?? [],
      copias: (copias ?? []).map((c) => {
        const p = dir.get(String(c.funded_position_id))
        const o = c.preco_origem == null ? null : Number(c.preco_origem)
        const d = c.preco_destino == null ? null : Number(c.preco_destino)
        const desliz = o != null && d != null ? (p?.direcao === 'sell' ? o - d : d - o) : null
        return { ...c, symbol: p?.symbol ?? null, direcao: p?.direcao ?? null, deslizamento: desliz }
      }),
    })
  } catch (e) {
    return falhou(e)
  }
}

async function exigirElegivelEDestino(userId: string, tipo: DestinoTipo, id: string) {
  const { direitos, elegivel, reais } = await elegibilidade(userId)
  if (!elegivel) throw new ErroOrdem(403, 'A cópia para a tua conta está incluída no MTM Auto (e no Premium/VIP).')
  const destino = (await destinosDoUtilizador(userId)).find((d) => d.tipo === tipo && d.id === id)
  if (!destino) throw new ErroOrdem(404, 'essa conta de destino não é tua ou já não está ligada')
  const p = destinoPermitido(destino, direitos.admin, reais)
  if (!p.ok) throw new ErroOrdem(422, p.motivo)
  return destino
}

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { conta, userId } = await dono(request, String(b.accountId ?? ''))
    if (b.aceite !== true) throw new ErroOrdem(422, 'confirma que és tu a decidir as trades que são copiadas')
    const tipo = String(b.destinoTipo ?? '') as DestinoTipo
    if (tipo !== 'mtmcopy' && tipo !== 'mtmauto') throw new ErroOrdem(422, 'destino inválido')
    const destinoId = String(b.destinoId ?? '')
    await exigirElegivelEDestino(userId, tipo, destinoId)
    const v = validarConfig({ modoLote: 'proporcional_saldo', ...b })
    if (!v.ok) throw new ErroOrdem(422, v.erro)

    const { data, error } = await getSupabaseAdmin().from('funded_copiers').insert({
      user_id: userId, account_id: conta.id, destino_tipo: tipo, destino_id: destinoId, ativo: true,
      created_by: userId, ...v.config,
    }).select('id').single()
    if (error?.code === '23505') throw new ErroOrdem(409, 'esta conta já está a ser copiada para esse destino')
    if (error || !data) throw new ErroOrdem(500, 'não foi possível criar a cópia')
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e) {
    return falhou(e)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { conta, userId } = await dono(request, String(b.accountId ?? ''))
    const db = getSupabaseAdmin()
    const { data: atual } = await db.from('funded_copiers').select('*').eq('id', String(b.id ?? '')).eq('account_id', conta.id).maybeSingle()
    if (!atual) throw new ErroOrdem(404, 'cópia não encontrada')

    const v = validarConfig({ ...(b.valor !== undefined && b.modoLote === undefined ? { modoLote: atual.modo_lote } : {}), ...b })
    if (!v.ok) throw new ErroOrdem(422, v.erro)
    const patch: Record<string, unknown> = { ...v.config, updated_at: new Date().toISOString() }
    if (b.ativo === true && !atual.ativo) {
      // Retomar volta a exigir tudo o que criar exige: o direito pode ter acabado entretanto.
      await exigirElegivelEDestino(userId, atual.destino_tipo as DestinoTipo, String(atual.destino_id))
      patch.ativo = true
      patch.pausado_motivo = null
    } else if (b.ativo === false) {
      patch.ativo = false
      patch.pausado_motivo = 'pausada pelo utilizador'
    }
    const { error } = await db.from('funded_copiers').update(patch).eq('id', atual.id)
    if (error) throw new ErroOrdem(500, 'não foi possível guardar')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return falhou(e)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const { conta } = await dono(request, sp.get('accountId') ?? '')
    const db = getSupabaseAdmin()
    const id = sp.get('id') ?? ''
    const { data: atual } = await db.from('funded_copiers').select('id').eq('id', id).eq('account_id', conta.id).maybeSingle()
    if (!atual) throw new ErroOrdem(404, 'cópia não encontrada')
    // Apagar leva a ponte das posições consigo: as cópias abertas deixavam de receber o fecho.
    const { count } = await db.from('funded_copy_positions').select('id', { count: 'exact', head: true })
      .eq('copier_id', id).in('estado', ['enviando', 'aberta'])
    if ((count ?? 0) > 0) {
      throw new ErroOrdem(409, `há ${count} posição(ões) copiada(s) ainda abertas — pausa a cópia e apaga depois de fecharem`)
    }
    const { error } = await db.from('funded_copiers').delete().eq('id', id)
    if (error) throw new ErroOrdem(500, 'não foi possível apagar')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return falhou(e)
  }
}
