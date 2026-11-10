import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { MARCAS_CASA } from '@/lib/conteudo-magnetico/acesso'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { blocoGanchos } from '@/lib/conteudo/ganchos'
import { regrasParaPrompt, verificarTexto } from '@/lib/conteudo-magnetico/regras'
import { corrigirPtPt } from '@/lib/pt-pt'
import { notaGancho } from '@/lib/estudio/nota'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ESTÚDIO · ganchos A/B (ideia do OpenCut-AI «A/B Hook Testing», MIT; fórmulas das skills de ganchos).
 *
 * POST  { peca_id }               → 5 ganchos novos para o reel, cada um com fala, texto no ecrã,
 *                                   gatilho e nota (0–100, sem IA), do melhor para o pior.
 * PATCH { peca_id, fala, ecra }   → põe o gancho escolhido no 1.º segmento do guião (para gravar).
 *
 * Só admins. IA grátis primeiro (`chamarIAGratis`).
 */
type Gancho = { fala: string; ecra: string; gatilho: string }

// Equipa do estúdio (backoffice → acessos): biblioteca partilhada, sem filtro por autor.
async function soAdmin(request: Request) {
  return exigirEstudio(request, 'gravar', 'criar')
}

async function lerPeca(id: unknown, userId: string) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await getSupabaseAdmin()
    .from('conteudo_magnetico_pecas')
    .select('id, marca, guiao')
    .eq('id', id)
    .in('marca', MARCAS_CASA)
    .maybeSingle()
  return data
}

export async function POST(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  const peca = await lerPeca(b.peca_id, quem!.userId)
  if (!peca) return NextResponse.json({ erro: 'Guião desconhecido.' }, { status: 404 })
  const g = (peca.guiao ?? {}) as Record<string, any>
  const falas = Array.isArray(g.reel?.segmentos) ? g.reel.segmentos.map((s: any) => s.fala).filter(Boolean) : []
  const sistema = [
    'És o especialista em ganchos de reels da MoreThanMoney. Escreves em português de Portugal, com «tu».',
    blocoFramework('conteudo'),
    regrasParaPrompt(),
    blocoGanchos(),
    'Responde APENAS com JSON válido.',
  ].join('\n\n')
  const utilizador = [
    `Marca: ${peca.marca}. Tema: ${g.nicho || '—'}. Palavra-chave: ${g.palavra_chave || '—'}.`,
    falas.length ? `Guião actual (o gancho é a 1.ª fala):\n${falas.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}` : '',
    'Escreve 5 ganchos alternativos para a 1.ª fala, cada um com um gatilho DIFERENTE (pelo menos 2 que param o dedo e 2 que seguram). Cada gancho: "fala" (até 12 palavras, dita em voz alta), "ecra" (3 a 6 palavras em CAIXA ALTA, diferente da fala), "gatilho".',
    'JSON: {"ganchos":[{"fala":"...","ecra":"...","gatilho":"..."}]}',
  ].filter(Boolean).join('\n\n')

  let lista: Gancho[] = []
  try {
    const r = await chamarIAGratis({ sistema, mensagens: [{ role: 'user', content: utilizador }], json: true, maxTokens: 900, temperatura: 0.9, tarefa: 'estudio-ganchos', preferencia: 'qualidade', timeoutMs: 30_000 })
    const txt = r.texto
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))
    lista = (Array.isArray(j.ganchos) ? j.ganchos : []).slice(0, 8).map((x: any) => ({
      fala: corrigirPtPt(String(x.fala || '').trim()).texto.slice(0, 140),
      ecra: corrigirPtPt(String(x.ecra || '').trim()).texto.toUpperCase().slice(0, 60),
      gatilho: String(x.gatilho || '').slice(0, 20),
    }))
  } catch (e) {
    return NextResponse.json({ erro: `A IA não respondeu: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }
  const ganchos = lista
    .filter((x) => x.fala && verificarTexto(`${x.fala} ${x.ecra}`).length === 0)
    .map((x) => ({ ...x, ...notaGancho(x.fala) }))
    .sort((a, b) => b.nota - a.nota)
  const actual = falas[0] ? { fala: falas[0], ecra: g.reel?.segmentos?.[0]?.texto_ecra ?? '', gatilho: 'actual', ...notaGancho(falas[0]) } : null
  return NextResponse.json({ ok: true, actual, ganchos })
}

export async function PATCH(request: NextRequest) {
  const { quem, erro } = await soAdmin(request)
  if (erro) return erro
  const b = await request.json().catch(() => ({}))
  const peca = await lerPeca(b.peca_id, quem!.userId)
  if (!peca) return NextResponse.json({ erro: 'Guião desconhecido.' }, { status: 404 })
  const fala = String(b.fala || '').trim().slice(0, 140)
  const ecra = String(b.ecra || '').trim().toUpperCase().slice(0, 60)
  if (!fala || verificarTexto(`${fala} ${ecra}`).length) return NextResponse.json({ erro: 'Gancho inválido.' }, { status: 400 })
  const g = structuredClone((peca.guiao ?? {}) as Record<string, any>)
  if (!Array.isArray(g.reel?.segmentos) || !g.reel.segmentos.length) {
    g.reel = { ...(g.reel ?? {}), segmentos: [{ fala, texto_ecra: ecra, visual: 'apresentador', sfx: 'boom', legenda_estilo: 'impacto' }] }
  } else {
    g.reel.segmentos[0] = { ...g.reel.segmentos[0], fala, texto_ecra: ecra }
  }
  const { error } = await getSupabaseAdmin().from('conteudo_magnetico_pecas').update({ guiao: g }).eq('id', peca.id)
  if (error) return NextResponse.json({ erro: 'Não consegui guardar.' }, { status: 500 })
  return NextResponse.json({ ok: true, guiao: g })
}
