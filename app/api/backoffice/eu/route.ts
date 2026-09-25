/**
 * QUEM SOU EU no backoffice — papéis, capacidades e âmbito de leitura.
 *
 * Serve o cliente (o menu, os ecrãs) e serve de EXEMPLO: é o padrão que todas as rotas do backoffice
 * seguem, incluindo as do pipeline e das comissões que nascem do outro lado da casa.
 *
 *   const ctx = await exigirCapacidade(request, 'bo.extracto_proprio')
 *   if (ctx instanceof NextResponse) return ctx
 *   const ambito = ambitoDeLeitura(ctx.capacidades, ctx.userId, 'extracto', liderados)
 *   ...query.in('dono_id', ambito.ids)   // ← o filtro vem do âmbito, nunca de um `if`
 *
 * A última linha é a que importa. Autorizar («pode ver extractos?») e filtrar («de quem?») são duas
 * perguntas, e uma rota que só faz a primeira devolve os extractos de todos a quem só podia ver o
 * seu — com 200, sem erro, e com o número certo no sítio errado.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { PAPEL_NOME, ambitoDeLeitura, capacidadesDoPapel } from '@/lib/backoffice-papeis'
import { areasPermitidas } from '@/lib/backoffice-acessos-site'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export async function GET(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  // As áreas do site são calculadas com o PERFIL, não só com a lista guardada: a lista aperta, e é o
  // `isRegisteredMember` que diz se havia direito. Devolver a lista crua dava a um afiliado
  // não-cliente um ecrã a dizer que tem Premium.
  const { data: perfil } = await getSupabaseAdmin()
    .from('profiles')
    .select('user_type, member_category, is_active, subscription_plan, subscription_expires_at, trial_expires_at, trial_expired, stripe_subscription_id, profile_data')
    .eq('id', ctx.userId)
    .maybeSingle()

  return NextResponse.json({
    user_id: ctx.userId,
    dono: ctx.admin,
    papeis: ctx.atribuicoes.map((a) => ({
      papel: a.papel,
      nome: PAPEL_NOME[a.papel],
      rank_key: a.rankKey,
      desde: a.atribuidoAt,
      capacidades: capacidadesDoPapel(a.papel),
    })),
    capacidades: [...ctx.capacidades],
    // Quem é que esta pessoa pode ler. Vai para o cliente para o ecrã saber se mostra um extracto só
    // ou um de equipa — mas o filtro real é sempre feito no servidor, em cada rota.
    ambito_extracto: ambitoDeLeitura(ctx.capacidades, ctx.userId, 'extracto'),
    areas_site: [...areasPermitidas(perfil ?? null, ctx.areasRestritas)],
    areas_restritas: ctx.areasRestritas,
  })
}
