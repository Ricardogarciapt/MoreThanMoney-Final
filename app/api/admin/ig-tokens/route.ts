import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, tokenForAccount, esquecerTokensIG } from "@/lib/instagram/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Tokens do Instagram — ver o estado e colar um novo, sem passar pela Vercel.
 *
 * Os tokens duram 60 dias. Enquanto renová-los era mexer nas variáveis de ambiente e voltar a
 * publicar o site, adiava-se — e as variáveis acabaram criadas mas VAZIAS, com todo o Instagram
 * parado sem que nada o dissesse. Aqui vê-se qual é a conta, se o token funciona e quando expira.
 *
 * O token NUNCA é devolvido. Sai daqui o que a Graph API diz sobre ele; o valor fica na base.
 */

const GRAPH = "https://graph.facebook.com/v21.0"
const CHAVE = "instagram_tokens"

interface Estado {
  conta: string
  username: string
  variavel: string
  temToken: boolean
  ok: boolean
  motivo?: string
  /** Quando o token deixa de servir, segundo a própria Meta. */
  expiraEm?: string | null
  diasQueFaltam?: number | null
  permissoes?: string[]
}

/** O que a Meta sabe sobre este token: se é válido, quando expira e o que autoriza. */
async function inspecionar(token: string): Promise<Partial<Estado>> {
  try {
    // debug_token com o próprio token como inspetor: chega para ler validade e âmbitos.
    const r = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
    const j = await r.json().catch(() => ({}))
    const d = j?.data
    if (!d) return {}
    // expires_at = 0 significa que não expira (token de utilizador-sistema).
    const exp = Number(d.expires_at ?? 0)
    return {
      expiraEm: exp > 0 ? new Date(exp * 1000).toISOString() : null,
      diasQueFaltam: exp > 0 ? Math.round((exp * 1000 - Date.now()) / 86_400_000) : null,
      permissoes: Array.isArray(d.scopes) ? (d.scopes as string[]) : [],
    }
  } catch {
    return {}
  }
}

async function estadoDa(acc: (typeof IG_ACCOUNTS)[number]): Promise<Estado> {
  const base: Estado = {
    conta: acc.id,
    username: acc.username,
    variavel: acc.tokenEnv,
    temToken: false,
    ok: false,
  }
  const token = await tokenForAccount(acc.id)
  if (!token) return { ...base, motivo: "sem token — a variável existe mas está vazia" }

  try {
    const r = await fetch(`${GRAPH}/${acc.id}?fields=username&access_token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    const j = await r.json().catch(() => ({}))
    const extra = await inspecionar(token)
    if (!r.ok || j?.error) {
      return { ...base, temToken: true, motivo: j?.error?.message ?? `HTTP ${r.status}`, ...extra }
    }
    // Um token válido para OUTRA conta é pior do que nenhum: publica no sítio errado.
    if (j?.username !== acc.username) {
      return { ...base, temToken: true, motivo: `o token é da conta @${j?.username}`, ...extra }
    }
    return { ...base, temToken: true, ok: true, ...extra }
  } catch (e) {
    return { ...base, temToken: true, motivo: e instanceof Error ? e.message : "erro" }
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  esquecerTokensIG()
  return NextResponse.json({ ok: true, contas: await Promise.all(IG_ACCOUNTS.map(estadoDa)) })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const { variavel, token } = (await req.json().catch(() => ({}))) as { variavel?: string; token?: string }
  const acc = IG_ACCOUNTS.find((a) => a.tokenEnv === variavel)
  if (!acc) return NextResponse.json({ ok: false, erro: "Conta desconhecida" }, { status: 400 })

  const valor = (token ?? "").trim()
  const db = getSupabaseAdmin()
  const { data } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  const atuais = ((typeof data?.value === "string" ? JSON.parse(data.value) : data?.value) ?? {}) as Record<string, string>

  if (!valor) {
    // Apagar é uma escolha legítima: volta a valer o que estiver no ambiente.
    delete atuais[acc.tokenEnv]
  } else {
    // Verifica ANTES de guardar. Guardar um token errado troca um problema visível (nada publica)
    // por um invisível (publica na conta errada).
    const r = await fetch(`${GRAPH}/${acc.id}?fields=username&access_token=${encodeURIComponent(valor)}`, {
      cache: "no-store",
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.error) {
      return NextResponse.json({ ok: false, erro: j?.error?.message ?? `HTTP ${r.status}` }, { status: 400 })
    }
    if (j?.username !== acc.username) {
      return NextResponse.json(
        { ok: false, erro: `Esse token é da conta @${j?.username}, não da @${acc.username}` },
        { status: 400 },
      )
    }
    atuais[acc.tokenEnv] = valor
  }

  await db.from("site_settings").upsert(
    {
      key: CHAVE,
      value: atuais,
      description: "Tokens do Instagram por conta. Substituem as variáveis de ambiente.",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  )
  esquecerTokensIG()

  return NextResponse.json({ ok: true, contas: await Promise.all(IG_ACCOUNTS.map(estadoDa)) })
}
