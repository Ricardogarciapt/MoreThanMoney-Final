import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSiteOrigin } from '@/lib/site-url'
import { normalizarChave, normalizarLogin } from '@/lib/licencas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * O que o EA pergunta para saber se está desactualizado.
 *
 * Também é como sabemos que builds andam por aí: o EA manda a versão que tem, a chave e a conta,
 * e nós guardamos isso na activação. Sem esse registo, "avisa os clientes na 3.0" era uma coisa
 * que não se conseguia fazer — não havia lista de quem estava em quê.
 *
 * As afinações (risco, trailing) saem daqui, mas o EA só as aplica se o cliente ligar
 * `InpOtaParams`. Poder mudar o risco de quem está a operar não é coisa para vir ligada de
 * origem, por muito conveniente que fosse do nosso lado.
 */

/** Estado publicado. Vive em `site_settings.sensei_ea_build` para se mudar sem deploy. */
interface Build {
  versao: string
  notas: string
  ficheiro?: string
  url?: string
  aviso?: string
  risco?: number
  trail?: 0 | 1 | 2
}

const PADRAO: Build = {
  versao: '3.1.0',
  notas: 'Licenciamento, avisos de versão e instaladores para Windows e macOS.',
  ficheiro: 'MTM_Sensei_AllInOne_3.1.0.ex5',
}

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin()
  const q = req.nextUrl.searchParams

  let build = PADRAO
  try {
    const { data } = await db
      .from('site_settings')
      .select('value')
      .eq('key', 'sensei_ea_build')
      .maybeSingle()
    if (data?.value) {
      const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      if (v?.versao) build = { ...PADRAO, ...v }
    }
  } catch {
    // Um erro a ler a configuração não pode parar o EA de arrancar: fica o valor em código.
  }

  // Registar a versão que esta conta está a correr. Best-effort — falhar aqui não é motivo
  // para negar a resposta.
  const chave = normalizarChave(q.get('chave') ?? '')
  const conta = normalizarLogin(q.get('conta'))
  const versaoCliente = (q.get('versao') ?? '').slice(0, 20)
  if (chave && conta && versaoCliente) {
    try {
      const { data: lic } = await db.from('licencas').select('id').eq('chave', chave).maybeSingle()
      if (lic) {
        await db
          .from('licenca_ativacoes')
          .update({ terminal: `EA ${versaoCliente}` })
          .eq('licenca_id', lic.id)
          .eq('mt5_login', conta)
      }
    } catch {
      /* ignorado de propósito */
    }
  }

  const origem = getSiteOrigin()
  return NextResponse.json(
    {
      versao: build.versao,
      notas: build.notas,
      ficheiro: build.ficheiro ?? '',
      url: build.url ?? `${origem}/downloads/MTM_Sensei_AllInOne.ex5`,
      aviso: build.aviso ?? '',
      ...(typeof build.risco === 'number' ? { risco: build.risco } : {}),
      ...(typeof build.trail === 'number' ? { trail: build.trail } : {}),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300' } },
  )
}
