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
/** A app do Meta que emite os tokens. */
const APP_ID = "1468588267606256"
/**
 * O segredo da app fica à parte dos tokens porque tem outro tempo de vida: os tokens trocam-se de
 * dois em dois meses, o segredo é o mesmo desde que a app existe. Guardado, NUNCA devolvido.
 */
const CHAVE_SEGREDO = "instagram_app_secret"

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

/**
 * O token da Página dona desta conta de Instagram — o que não expira.
 *
 * A cadeia da Meta é esta, e é a única forma de não voltar aqui de dois em dois meses:
 *   token curto (Explorer, ~2h) → token de utilizador longo (60 dias) → token de PÁGINA (sem fim)
 *
 * O último degrau é o que interessa: um token de Página derivado de um token de utilizador longo
 * não tem validade. A Meta invalida-o se a password mudar ou se a permissão for retirada — que é
 * o comportamento certo, e não uma data marcada no calendário.
 *
 * Devolve nulo quando não encontra a Página. Não é erro: um token de 60 dias publica na mesma, e
 * o painel mostra a validade para se ver a diferença.
 */
async function tokenDaPagina(tokenUtilizador: string, igAccountId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${GRAPH}/me/accounts?fields=access_token,instagram_business_account&limit=50` +
        `&access_token=${encodeURIComponent(tokenUtilizador)}`,
      { cache: "no-store" },
    )
    const j = await r.json().catch(() => ({}))
    const paginas = (j?.data ?? []) as Array<{ access_token?: string; instagram_business_account?: { id?: string } }>
    // A Página certa é a que TEM esta conta de Instagram ligada. Escolher pelo nome partia-se
    // no dia em que a Página fosse renomeada.
    const dona = paginas.find((p) => p.instagram_business_account?.id === igAccountId)
    return dona?.access_token ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard
  esquecerTokensIG()
  return NextResponse.json({ ok: true, contas: await Promise.all(IG_ACCOUNTS.map(estadoDa)) })
}

/**
 * Troca um token de curta duração por um de 60 dias.
 *
 * O que o Graph API Explorer dá dura uma ou duas horas — serve para experimentar, não para pôr a
 * publicar. A troca é uma chamada só, mas precisa do segredo da app, e por isso acontece aqui e
 * nunca no browser: um segredo que passa pelo cliente deixa de ser segredo.
 *
 * Sem segredo guardado devolve o token como veio. É melhor um token curto a funcionar do que
 * recusar tudo e ficar sem Instagram nenhum — a validade aparece no painel de qualquer maneira.
 */
async function trocarPor60Dias(token: string): Promise<string> {
  const { data } = await getSupabaseAdmin().from("site_settings").select("value").eq("key", CHAVE_SEGREDO).maybeSingle()
  const segredo = typeof data?.value === "string" ? data.value : (data?.value as { segredo?: string } | null)?.segredo
  if (!segredo) return token
  try {
    const r = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}` +
        `&client_secret=${encodeURIComponent(segredo)}&fb_exchange_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
    const j = await r.json().catch(() => ({}))
    return typeof j?.access_token === "string" && j.access_token ? j.access_token : token
  } catch {
    return token
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const corpo = (await req.json().catch(() => ({}))) as {
    variavel?: string
    token?: string
    segredo?: string
    renovar?: boolean
  }

  // Guardar o segredo é um pedido à parte: não traz token nenhum e não devolve o que guardou.
  if (corpo.segredo !== undefined) {
    const limpo = corpo.segredo.trim()
    const db2 = getSupabaseAdmin()
    if (!limpo) {
      await db2.from("site_settings").delete().eq("key", CHAVE_SEGREDO)
    } else {
      await db2.from("site_settings").upsert(
        {
          key: CHAVE_SEGREDO,
          value: limpo,
          description: "Segredo da app Meta. Serve para trocar tokens curtos por tokens de 60 dias.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      )
    }
    return NextResponse.json({ ok: true, contas: await Promise.all(IG_ACCOUNTS.map(estadoDa)) })
  }

  /**
   * Renovar: refaz a cadeia sobre o token que JÁ está guardado.
   *
   * Serve o caso normal — colou-se o token antes de guardar o segredo, e o que ficou lá dentro é
   * o de duas horas. Sem isto era preciso voltar ao Explorer só para gerar outro igual, quando o
   * que está guardado ainda serve perfeitamente para a troca.
   */
  if (corpo.renovar) {
    const db3 = getSupabaseAdmin()
    const { data: g } = await db3.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
    const guardados = ((typeof g?.value === "string" ? JSON.parse(g.value) : g?.value) ?? {}) as Record<string, string>
    let mexeu = false
    for (const acc of IG_ACCOUNTS) {
      const atual = guardados[acc.tokenEnv]?.trim()
      if (!atual) continue
      const longo = await trocarPor60Dias(atual)
      const daPagina = await tokenDaPagina(longo, acc.id)
      const novo = daPagina ?? longo
      if (novo && novo !== atual) { guardados[acc.tokenEnv] = novo; mexeu = true }
    }
    if (mexeu) {
      await db3.from("site_settings").upsert(
        { key: CHAVE, value: guardados, description: "Tokens do Instagram por conta.", updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
    }
    esquecerTokensIG()
    return NextResponse.json({ ok: true, mexeu, contas: await Promise.all(IG_ACCOUNTS.map(estadoDa)) })
  }

  const { variavel, token } = corpo
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
    // Só depois de saber que o token é bom se pede o de 60 dias: trocar um token errado devolve
    // um erro que não diz nada sobre o que estava mal.
    const longo = await trocarPor60Dias(valor)
    // E do de 60 dias tira-se o da Página, que não expira. Se não der, fica o de 60 dias.
    atuais[acc.tokenEnv] = (await tokenDaPagina(longo, acc.id)) ?? longo
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
