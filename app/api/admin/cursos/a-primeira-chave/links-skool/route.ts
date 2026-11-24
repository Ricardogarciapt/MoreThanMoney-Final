/**
 * GET /api/admin/cursos/a-primeira-chave/links-skool?l=pt — só admin.
 * Devolve os links assinados do material (guia, slides e caderno dos 15 módulos) para pôr nas aulas
 * do Skool, onde quem compra paga no Skool e não tem compra no site. Ver lib/cursos/primeira-chave.ts.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { LINGUAS, NUM_MODULOS, assinaturaDaPeca } from '@/lib/cursos/primeira-chave'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE = 'https://www.morethanmoney.pt/api/cursos/a-primeira-chave/material'

export const GET = soAdmin(async (_adminId: string, req: NextRequest) => {
  const pedidas = req.nextUrl.searchParams.get('l')
  const linguas = pedidas ? LINGUAS.filter((l) => pedidas.split(',').includes(l)) : [...LINGUAS]
  const pecas = ['guia', ...Array.from({ length: NUM_MODULOS }, (_, i) => [`slides-${i + 1}`, `caderno-${i + 1}`]).flat()]
  const links: Record<string, Record<string, string>> = {}
  for (const l of linguas) {
    links[l] = {}
    for (const p of pecas) links[l][p] = `${BASE}?l=${l}&p=${p}&k=${await assinaturaDaPeca(l, p)}`
  }
  return NextResponse.json({ links })
})
