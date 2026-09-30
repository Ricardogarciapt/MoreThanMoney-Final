import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  DOMINIO, normalizar, parteLocal, podeCriar, podeReencaminhar, quemFaltaCaixa,
  type Caixa, type TipoDeCaixa,
} from '@/lib/correio/caixas'
import {
  credenciaisZoho, criarCaixa, desligarReencaminhamento, ligarReencaminhamento, listarContas,
} from '@/lib/correio/zoho'

export const dynamic = 'force-dynamic'

/**
 * AS CAIXAS DE CORREIO, NO ADMIN.
 *
 * Junta três coisas que até aqui viviam separadas e sem se conhecerem: os endereços que existem no
 * Zoho, as pessoas desta casa (utilizadores e educadores) e o reencaminhamento de cada um.
 *
 * ═══ PORQUE É QUE O ZOHO NÃO É A ÚNICA FONTE ═══════════════════════════════════════════════
 *
 * Porque o Zoho sabe que `mindset@morethanmoney.pt` recebe correio, e não sabe que esse endereço é
 * o login de um educador do LMS. Essa ligação é nossa e vive em `correio_caixas`. Sem ela, o painel
 * seria uma lista de endereços sem dono — e foi exactamente assim que se descobriu, a 30/09, que
 * três educadores tinham endereços `@morethanmoney.pt` gravados na base que nunca existiram no
 * servidor de correio: tudo o que o LMS lhes enviou foi para o vazio.
 *
 * ═══ O QUE O ECRÃ NUNCA FAZ SOZINHO ════════════════════════════════════════════════════════
 *
 * Criar caixas a pessoas sem lhes dizer. As sugestões aparecem; a criação é sempre um clique de
 * quem decide. Uma caixa criada em silêncio é um sítio onde o correio de alguém vai morrer.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const [{ data: linhas }, { data: perfis }, { data: educadores }] = await Promise.all([
    db.from('correio_caixas').select('*').order('endereco'),
    db.from('profiles').select('id, full_name, email').eq('user_type', 'admin').limit(50),
    db.from('lms_educators').select('id, display_name, email, is_active').eq('is_active', true),
  ])

  const caixas = (linhas ?? []) as unknown as Array<Caixa & { id: string }>

  /**
   * O estado REAL do Zoho, quando há credenciais. Não se finge que não existe: se as credenciais
   * faltarem, diz-se qual variável falta em vez de mostrar uma lista vazia que parece «não há
   * caixas nenhumas».
   */
  const { creds, falta } = credenciaisZoho()
  let zoho: { ligado: boolean; porque: string; contas: number; enderecos: string[] } = {
    ligado: false,
    porque: creds ? '' : `Faltam variáveis na Vercel: ${falta}`,
    contas: 0,
    enderecos: [],
  }
  if (creds) {
    const r = await listarContas()
    zoho = r.ok
      ? {
          ligado: true,
          porque: '',
          contas: r.dados.length,
          enderecos: r.dados.map((c) => String(c.primaryEmailAddress ?? '')).filter(Boolean),
        }
      : { ligado: false, porque: `${r.porque} (${r.codigo})`, contas: 0, enderecos: [] }
  }

  const pessoas = [
    ...(educadores ?? []).map((e) => ({
      id: String(e.id), nome: String(e.display_name ?? ''), email: (e.email as string | null) ?? null, papel: 'educador' as const,
    })),
    ...(perfis ?? []).map((p) => ({
      id: String(p.id), nome: String(p.full_name ?? ''), email: (p.email as string | null) ?? null, papel: 'admin' as const,
    })),
  ].filter((p) => p.nome)

  return NextResponse.json({
    ok: true,
    dominio: DOMINIO,
    caixas,
    zoho,
    // Quem desta casa ainda não tem endereço ligado, com sugestão já feita.
    faltam: quemFaltaCaixa(pessoas, caixas),
  })
}

/**
 * As acções. Cada uma decide ANTES de tocar no Zoho — e a decisão é a mesma de
 * `lib/correio/caixas.ts`, coberta por `caixas.check.ts`. É lá que se trava o ciclo de
 * reencaminhamento, que é o erro caro deste sistema.
 */
export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const body = (await request.json().catch(() => ({}))) as {
    acao?: 'criar' | 'ligar_pessoa' | 'reencaminhar' | 'apagar_registo'
    local?: string
    tipo?: TipoDeCaixa
    password?: string
    nome?: string
    endereco?: string
    para?: string
    ativo?: boolean
    user_id?: string | null
    educador_id?: string | null
  }

  const db = getSupabaseAdmin()
  const { data: linhas } = await db.from('correio_caixas').select('*')
  const caixas = (linhas ?? []) as unknown as Array<Caixa & { id: string }>

  // ── Criar ────────────────────────────────────────────────────────────────
  if (body.acao === 'criar') {
    const tipo: TipoDeCaixa = body.tipo === 'caixa' ? 'caixa' : 'alias'
    const licencas = await contarLicencas()
    const v = podeCriar({
      local: String(body.local ?? ''),
      tipo,
      existentes: caixas.map((c) => c.endereco),
      ...(licencas ? { licencas } : {}),
    })
    if (!v.pode) return NextResponse.json({ ok: false, erro: 'recusado', porque: v.porque }, { status: 422 })

    const endereco = normalizar(String(body.local))

    /**
     * ALIAS NÃO SE CRIA POR API. A documentação do Zoho não publica endpoint de aliases — só de
     * contas e de reencaminhamento. Fingir que se criou, gravando só na nossa base, dava uma linha
     * no painel para um endereço que não existe no servidor: exactamente o defeito que este painel
     * veio expor nos educadores. Regista-se como `por_criar` e diz-se onde se acaba à mão.
     */
    if (tipo === 'alias') {
      await db.from('correio_caixas').insert({
        endereco, tipo: 'alias', estado: 'por_criar',
        user_id: body.user_id ?? null, educador_id: body.educador_id ?? null,
        notas: 'Alias por criar no painel do Zoho (a API não publica endpoint de aliases).',
      })
      return NextResponse.json({
        ok: true,
        porCriarNoPainel: true,
        porque: `Ficou registado. O alias «${endereco}» tem de ser criado no painel do Zoho — ` +
          'Utilizadores → geral@ → Alias de e-mail — porque a API do Zoho não expõe aliases.',
      })
    }

    if (!body.password || String(body.password).length < 12) {
      return NextResponse.json({
        ok: false, erro: 'password_fraca',
        porque: 'A password da caixa tem de ter pelo menos 12 caracteres. Não fica guardada aqui — entrega-a à pessoa.',
      }, { status: 422 })
    }

    const r = await criarCaixa({
      endereco,
      password: String(body.password),
      mostrarComo: body.nome ? String(body.nome) : undefined,
    })
    if (!r.ok) {
      await db.from('correio_caixas').insert({
        endereco, tipo: 'caixa', estado: 'erro', ultimo_erro: `${r.codigo}: ${r.porque}`,
        user_id: body.user_id ?? null, educador_id: body.educador_id ?? null,
      })
      return NextResponse.json({ ok: false, erro: r.codigo, porque: r.porque, bruto: r.bruto }, { status: 502 })
    }

    await db.from('correio_caixas').insert({
      endereco, tipo: 'caixa', estado: 'ativa',
      zoho_account_id: r.dados.accountId ? String(r.dados.accountId) : null,
      zoho_zuid: r.dados.zuid ? String(r.dados.zuid) : null,
      user_id: body.user_id ?? null, educador_id: body.educador_id ?? null,
    })
    return NextResponse.json({ ok: true, porque: `Caixa «${endereco}» criada.` })
  }

  // ── Ligar a uma pessoa ───────────────────────────────────────────────────
  if (body.acao === 'ligar_pessoa') {
    const endereco = normalizar(String(body.endereco ?? ''))
    const { error } = await db.from('correio_caixas').update({
      user_id: body.user_id ?? null,
      educador_id: body.educador_id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('endereco', endereco)
    if (error) return NextResponse.json({ ok: false, erro: 'nao_gravou', porque: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Reencaminhamento ─────────────────────────────────────────────────────
  if (body.acao === 'reencaminhar') {
    const endereco = normalizar(String(body.endereco ?? ''))
    const caixa = caixas.find((c) => c.endereco === endereco)
    if (!caixa) return NextResponse.json({ ok: false, erro: 'nao_existe' }, { status: 404 })

    const ligar = body.ativo !== false
    const para = String(body.para ?? '').trim().toLowerCase()

    if (ligar) {
      const v = podeReencaminhar({ de: endereco, para })
      if (!v.pode) return NextResponse.json({ ok: false, erro: 'recusado', porque: v.porque }, { status: 422 })
    }

    const accountId = (caixa as { zoho_account_id?: string }).zoho_account_id
    if (!accountId) {
      return NextResponse.json({
        ok: false, erro: 'sem_conta_no_zoho',
        porque: 'Este endereço não tem conta do Zoho associada — ou é um alias (os aliases não têm reencaminhamento próprio: reencaminha-se a caixa onde eles caem), ou foi criado à mão e falta ligá-lo.',
      }, { status: 422 })
    }

    const zuid = (caixa as { zoho_zuid?: string }).zoho_zuid
    const r = ligar
      ? await ligarReencaminhamento({ accountId, zuid, para })
      : await desligarReencaminhamento({ accountId, zuid, para: String(caixa.reencaminhar_para ?? '') })
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.codigo, porque: r.porque, bruto: r.bruto }, { status: 502 })

    await db.from('correio_caixas').update({
      reencaminhar_para: ligar ? para : null,
      // NUNCA `true` já: o Zoho manda um código para o destino e só entrega depois de alguém o
      // introduzir. Dizer «ligado» antes disso é mentir a quem confia no ecrã.
      reencaminhar_ativo: false,
      updated_at: new Date().toISOString(),
    }).eq('endereco', endereco)

    return NextResponse.json({
      ok: true,
      porConfirmar: ligar,
      porque: ligar
        ? `Pedido feito. O Zoho mandou um código de confirmação para ${para} — o reencaminhamento só começa depois de alguém o introduzir no painel do Zoho.`
        : 'Reencaminhamento removido.',
    })
  }

  if (body.acao === 'apagar_registo') {
    const endereco = normalizar(String(body.endereco ?? ''))
    // Apaga só a NOSSA linha. A caixa no Zoho não se toca daqui: apagar correio de alguém por
    // engano num painel é irreversível, e essa decisão fica no painel do Zoho, com os avisos dele.
    await db.from('correio_caixas').delete().eq('endereco', endereco)
    return NextResponse.json({ ok: true, porque: 'Registo removido daqui. A caixa no Zoho não foi tocada.' })
  }

  return NextResponse.json({ ok: false, erro: 'acao_desconhecida' }, { status: 400 })
}

/** Quantas licenças o Zoho tem e quantas estão usadas — para o ecrã contar antes de pedir. */
async function contarLicencas(): Promise<{ total: number; usadas: number } | null> {
  const r = await listarContas()
  if (!r.ok) return null
  // A API não devolve o total de licenças compradas; devolve as contas que existem. O total vem da
  // variável, porque só o painel de subscrição o sabe — e uma conta a mais é recusada pelo Zoho.
  const total = Number(process.env.ZOHO_MAIL_LICENCAS ?? 0)
  if (!total) return null
  return { total, usadas: r.dados.length }
}
