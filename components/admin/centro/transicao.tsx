import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { CHAVE_FLAG_PADRAO, lerFlagPadrao } from "@/lib/admin-centro/regras"

/**
 * Transição /admin/mtmcopy (e o alias /admin/mtmauto-copia) → /admin/centro.
 *
 *  · flag site_settings.admin_centro_padrao (ou env ADMIN_CENTRO_PADRAO=1) a true → redirecciona;
 *  · senão mostra a faixa «Novo Centro de Controlo» por cima da página antiga.
 *
 * A flag é lida no servidor com cache de 30 s por instância (1 linha por chave). Uma falha a ler
 * NUNCA redirecciona: a página antiga continua a abrir.
 */
let cache: { v: boolean; em: number } | null = null

async function centroEPadrao(): Promise<boolean> {
  if (String(process.env.ADMIN_CENTRO_PADRAO ?? "").trim() === "1") return true
  if (cache && Date.now() - cache.em < 30_000) return cache.v
  try {
    const { data, error } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", CHAVE_FLAG_PADRAO).maybeSingle()
    const v = error ? false : lerFlagPadrao(data?.value, undefined)
    cache = { v, em: Date.now() }
    return v
  } catch {
    return false
  }
}

export async function TransicaoCentro({ children }: { children: ReactNode }) {
  if (await centroEPadrao()) redirect("/admin/centro")
  return (
    <>
      <div className="relative z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[#D2A63C]/30 bg-gradient-to-r from-black via-[#D2A63C]/10 to-black px-4 py-2 text-center text-xs text-zinc-200">
        <span className="rounded-full border border-[#D2A63C]/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#E9C46A]">Novo</span>
        <span>Novo Centro de Controlo MTM Auto: cockpit em tempo real, sinais com fan-out, contas, estratégias e cópia num só sítio.</span>
        <Link href="/admin/centro" className="font-semibold text-[#E9C46A] underline-offset-2 hover:underline">Abrir o Centro de Controlo →</Link>
      </div>
      {children}
    </>
  )
}
