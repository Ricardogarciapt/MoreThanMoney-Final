import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { soAdmin } from "@/lib/copia-contas/servidor/guarda"
import { escreverEstrategia } from "@/lib/admin-centro/servidor/estrategia-escrita"
import { quemAdminDoSite } from "@/lib/admin-centro/servidor/quem-decide"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Trailing por ESTRATÉGIA — MTM Auto, Tap to Trade e providers, no mesmo sítio.
 *
 * As estratégias vivem todas em `mtmauto_providers`, partilhada entre o site e a app MTM Auto:
 * as de `tipo = 'mtm_t2t'` são as fontes do Tap to Trade, as de `tipo = 'metaapi'` são contas
 * provider espelhadas. Editar aqui é editar exactamente a mesma linha que o admin da app edita —
 * não há segunda cópia para ficar dessincronizada.
 *
 * Quem consome estes campos é o motor (`lib/motor.ts` no MTM Auto), a cada passagem do cron.
 *
 * ── Porque é que o trailing ao vivo é uma escolha e não o comportamento ───────────────────────
 * O `currentPrice` que vem com a posição é o estado da conta, não um tick: pode ter segundos. Num
 * movimento rápido esses segundos são a diferença entre travar o lucro e devolvê-lo no recuo. Mas
 * ler o preço ao vivo custa uma chamada por posição e por passagem — quem opera swing não ganha
 * nada com ela. Por isso liga-se por estratégia: o ouro do Premium e um scanner de forex não
 * querem a mesma coisa.
 */

interface Estrategia {
  id: string
  slug: string
  nome: string
  tipo: string
  ativo: boolean
  trailing_tempo_real: boolean
  /** Lucro a que o trailing arranca. Vazio = uma fração do risco da própria trade. */
  trailing_arranca_pips: number | null
  /** Distância a que o stop segue o preço. Vazio = fração do risco. */
  trailing_distancia_pips: number | null
  /** Movimento mínimo para mexer o stop — trava dezenas de modificações por minuto. */
  trailing_passo_pips: number | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const { data, error } = await getSupabaseAdmin()
    .from("mtmauto_providers")
    .select("id, slug, nome, tipo, ativo, trailing_tempo_real, trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips")
    .order("ativo", { ascending: false })
    .order("nome")

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  const estrategias: Estrategia[] = (data ?? []).map((r) => ({
    id: String(r.id),
    slug: String(r.slug ?? ""),
    nome: String(r.nome ?? ""),
    tipo: String(r.tipo ?? ""),
    ativo: r.ativo === true,
    trailing_tempo_real: r.trailing_tempo_real === true,
    trailing_arranca_pips: num(r.trailing_arranca_pips),
    trailing_distancia_pips: num(r.trailing_distancia_pips),
    trailing_passo_pips: num(r.trailing_passo_pips),
  }))

  return NextResponse.json({ ok: true, estrategias })
}

/**
 * FACHADA (05/10): a escrita do trailing vive na camada única (`lib/admin-centro/servidor/
 * estrategia-escrita.ts`, acção `trailing`). Esta rota fica viva para os painéis antigos não partirem.
 */
export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!corpo.id) return NextResponse.json({ ok: false, erro: "Falta a estratégia" }, { status: 400 })
  const r = await escreverEstrategia(quemAdminDoSite(adminId), { ...corpo, accao: "trailing", providerId: corpo.id })
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.mensagem }, { status: r.status })
})
