import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { carregarJanela, detalheSinal, filtrarSinais } from '@/lib/admin-centro/servidor/sinais'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 *   GET ?fonte=&estado=&simbolo=&estrategia=&q=&limite=  → feed unificado 24 h (só leitura)
 *   GET ?id=<sinal>                                      → fan-out completo + mensagem bruta
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const p = new URL(req.url).searchParams
  const id = p.get('id')
  if (id) return NextResponse.json(await detalheSinal(id.slice(0, 120)))
  const j = await carregarJanela()
  const sinais = filtrarSinais(j.sinais, {
    fonte: p.get('fonte'), estado: p.get('estado'), simbolo: p.get('simbolo'), estrategia: p.get('estrategia'), q: p.get('q'),
    limite: Number(p.get('limite') ?? 300),
  })
  return NextResponse.json({ sinais, total: j.sinais.length, avisos: j.avisos, lidaEm: j.lidaEm })
})
