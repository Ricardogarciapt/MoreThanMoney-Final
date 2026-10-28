import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CHAVE_CONFIG, lerConfig } from '@/lib/cripto/ciclo'

/**
 * O DASHBOARD DO AGENTE CRIPTO (/admin/cripto) — ler tudo, e os poucos interruptores do dono.
 *
 * O que este ecrã pode mudar: ligar/desligar, papel/real, memecoins, capital base, pedir o fecho de
 * posições. O que NÃO pode: tectos do executor, destino dos lucros, chaves. Esses vivem só no env
 * da VPS. Passar a «real» aqui é a primeira de duas chaves; sem CRIPTO_REAL=1 na VPS não sai uma
 * ordem.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const [cfg, carteiras, saldo, abertas, fechadas, decisoes, sessoes, vantagem, pulso] = await Promise.all([
    db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle(),
    db.from('cripto_carteiras').select('*'),
    db.from('cripto_saldos').select('*').order('em', { ascending: false }).limit(1).maybeSingle(),
    db.from('cripto_posicoes').select('*').in('estado', ['pendente', 'aberta']).order('aberta_em', { ascending: false }),
    db.from('cripto_posicoes').select('*').in('estado', ['fechada', 'falhada']).order('fechada_em', { ascending: false }).limit(60),
    db.from('cripto_decisoes').select('id, em, modo, ativo, mercado, gatilho, pareceres, decisao_ia, fornecedor_ia, recusas, aprovada').order('em', { ascending: false }).limit(40),
    db.from('cripto_sessoes').select('*').order('inicio', { ascending: false }).limit(30),
    db.from('cripto_vantagem').select('*'),
    db.from('servicos_pulso').select('estado, em, versao').eq('servico', 'mtm-vigias').maybeSingle(),
  ])
  const erro = [carteiras, abertas, fechadas, decisoes, sessoes, vantagem].find((r) => r.error)?.error
  if (erro) return NextResponse.json({ ok: false, error: erro.message, dica: 'A migração 220 já foi aplicada?' }, { status: 500 })
  const tarefa = (pulso.data?.estado as { tarefas?: Record<string, unknown> } | null)?.tarefas?.['agente-cripto'] ?? null
  return NextResponse.json({
    ok: true,
    config: lerConfig(cfg.data?.value),
    carteiras: carteiras.data,
    saldoReal: saldo.data,
    abertas: abertas.data,
    fechadas: fechadas.data,
    decisoes: decisoes.data,
    sessoes: sessoes.data,
    vantagem: vantagem.data,
    vigia: { tarefa, pulsoEm: pulso.data?.em ?? null, versao: pulso.data?.versao ?? null },
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle()
  const actual = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
  const novo = { ...actual }

  switch (b.acao) {
    case 'ligado':
      novo.ligado = b.valor === true
      break
    case 'memecoins':
      novo.memecoins = b.valor === true
      break
    case 'modo':
      if (b.valor === 'real' && b.confirmo !== 'REAL') return NextResponse.json({ ok: false, error: 'Para passar a real escreve REAL na confirmação.' }, { status: 400 })
      novo.modo = b.valor === 'real' ? 'real' : 'papel'
      break
    case 'capitalBaseReal': {
      const v = Number(b.valor)
      if (!(Number.isFinite(v) && v >= 0 && v <= 1_000_000)) return NextResponse.json({ ok: false, error: 'Valor inválido.' }, { status: 400 })
      novo.capitalBaseRealUsd = v
      break
    }
    case 'fechar': {
      // Pede o fecho; quem fecha é o vigia (papel) ou o executor (real), ao preço do momento.
      const q = db.from('cripto_posicoes').update({ fechar_pedido: 'manual' }).eq('estado', 'aberta').is('fechar_pedido', null)
      const { error } = typeof b.id === 'string' ? await q.eq('id', b.id) : await q
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ ok: false, error: 'Acção desconhecida.' }, { status: 400 })
  }
  // update e não upsert: a linha nasce na migração 220, e um upsert cego reescrevia outras colunas.
  const { error } = data
    ? await db.from('site_settings').update({ value: novo }).eq('key', CHAVE_CONFIG)
    : await db.from('site_settings').insert({ key: CHAVE_CONFIG, value: novo })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config: lerConfig(novo) })
}
