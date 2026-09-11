import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O ANÚNCIO DA POLÍTICA: quem renovar recebe um desafio.
 *
 * Envio em massa, e por isso com três travões:
 *
 * · `?ensaio=1` é o comportamento POR OMISSÃO. Sem `confirmar=SIM-ENVIAR` não sai nada —
 *   devolve a lista de quem receberia e quantos são. Um endpoint de envio em massa que
 *   dispara à primeira chamada é um endpoint que um dia dispara por engano.
 * · Marca quem já recebeu, em `profile_data.anuncio_desafios`. Correr duas vezes não manda o
 *   mesmo email duas vezes à mesma pessoa.
 * · Pausa entre envios, para não queimar a reputação do domínio com uma rajada.
 */

const CHAVE_MARCA = 'anuncio_desafios_2026_09'

function corpo(nome: string, premium: boolean): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const desafio = premium ? 'Desafio 10K' : 'Desafio 3K'
  const conta = premium ? '10.000 USD' : '3.000 USD'

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="170" style="max-width:170px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:23px;line-height:1.3;color:#111;">
        A partir de agora, a tua renovação vale um desafio
      </h1>

      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Olá ${nome}, temos uma novidade que é mesmo para ti.
      </p>

      <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Abrimos o <strong>MTM Funded</strong> — avaliação de traders em contas simuladas, com um
        caminho até uma conta financiada pela MTM. E decidimos que quem já está connosco não
        devia começar do zero.
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#222;">
          <strong>Cada vez que a tua subscrição renovar</strong>, recebes um
          <strong>${desafio} de uma fase</strong> — conta de ${conta}, sem custo nenhum.
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
          E repete-se todos os meses, enquanto fores subscritor e ainda não fores trader
          financiado. Falhaste o do mês passado? Recebes outro. É esse o ponto.
        </p>
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#444;">
        Como funciona, sem letra pequena:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.75;color:#555;">
        <li>Um desafio de cada vez — o seguinte chega quando este terminar.</li>
        <li>Um por mês, automático. Não tens de pedir nada.</li>
        <li>As contas são <strong>simuladas</strong>, com dinheiro virtual.</li>
        <li>Passando, assinas o contrato e ficas a 75% dos resultados.</li>
      </ul>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444;">
        Se a tua subscrição está inactiva, reactiva-a e entras logo na próxima renovação.
      </p>

      <a href="${site}/mtmfunded" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
        Ver o MTM Funded
      </a>

      <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#999;">
        As regras de cada desafio estão publicadas antes de começares, em ${site}/mtmfunded.
        Nada disto é aconselhamento financeiro, e as contas não movimentam dinheiro real.
      </p>
    </div>
  </div>`
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const b = await request.json().catch(() => ({}))
  const confirmado = b?.confirmar === 'SIM-ENVIAR'
  const limite = Math.min(Number(b?.limite ?? 500), 2000)
  /** Enviar só para estes emails — para a prova antes do disparo a sério. */
  const so: string[] = Array.isArray(b?.so) ? b.so.map((e: unknown) => String(e).toLowerCase()) : []
  /** Só os que têm subscrição activa. Por omissão vão também os inactivos: para eles o email
   *  é um convite a reactivar, que é metade do objectivo da política. */
  const soAtivos = b?.soAtivos === true

  const db = getSupabaseAdmin()

  // Quem recebe: toda a gente com email e um plano que dá direito a desafio — incluindo quem
  // está inactivo, porque o email é justamente um convite a reactivar.
  const { data: pessoas } = await db
    .from('profiles')
    .select('id, full_name, email, subscription_plan, member_category, user_type, is_active, profile_data')
    .not('email', 'is', null)
    .limit(limite)

  const { regraDoPlano } = await import('@/lib/mtmfunded/ofertas')

  /**
   * Endereços de teste ficam de fora.
   *
   * Um bounce não é só um email perdido: bounces a mais fazem os fornecedores marcarem o
   * domínio, e depois nem os emails das contas chegam a quem espera por eles.
   */
  const ehTeste = (email: string) =>
    /@(test|example|exemplo|invalid|localhost)\.|@test$|^teste?@|\+test@/i.test(email)

  const alvos = (pessoas ?? []).filter((p) => {
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!email.includes('@') || ehTeste(email)) return false
    if (so.length && !so.includes(email)) return false
    if (soAtivos && !p.is_active) return false
    const dados = (p.profile_data ?? {}) as Record<string, unknown>
    // A prova para um endereço só não gasta a marca: senão a pessoa da prova ficava de fora
    // do envio a sério.
    if (!so.length && dados[CHAVE_MARCA]) return false
    return regraDoPlano(p.subscription_plan as string, p.member_category as string) !== null
  })

  if (!confirmado) {
    // ENSAIO: diz quem receberia, e não manda nada.
    return NextResponse.json({
      ensaio: true,
      aviso: 'Nada foi enviado. Repete com { "confirmar": "SIM-ENVIAR" } para enviar a sério.',
      total: alvos.length,
      exemplo: alvos.slice(0, 10).map((p) => ({
        email: p.email,
        nome: p.full_name,
        desafio: regraDoPlano(p.subscription_plan as string, p.member_category as string)?.nome,
      })),
    })
  }

  const transporter = createMailTransporter()
  let enviados = 0
  let falhados = 0

  for (const p of alvos) {
    const regra = regraDoPlano(p.subscription_plan as string, p.member_category as string)
    const premium = regra?.programas?.[0] === '10k-1f'
    const nome = String(p.full_name ?? '').trim().split(/\s+/)[0] || 'Trader'

    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: p.email as string,
        subject: 'A tua renovação passa a valer um desafio MTM Funded',
        html: prepareBrandedEmailHtml(corpo(nome, premium)),
        attachments: brandedMailAttachments(),
      })
      enviados++

      // Marca-se DEPOIS de enviar. Marcar antes e falhar o envio deixava a pessoa fora do
      // anúncio para sempre, sem forma de reparar sem mexer na base à mão.
      // Numa prova (`so`) não se marca: essa pessoa tem de receber o envio a sério também.
      if (!so.length) {
        await db
          .from('profiles')
          .update({
            profile_data: {
              ...((p.profile_data ?? {}) as Record<string, unknown>),
              [CHAVE_MARCA]: new Date().toISOString(),
            },
          })
          .eq('id', p.id)
      }
    } catch (e) {
      falhados++
      console.error('[MTMFUNDED anúncio]', p.email, String(e).slice(0, 120))
    }

    // Meio segundo entre emails: uma rajada de centenas queima a reputação do domínio, e
    // depois nem os emails das contas chegam.
    await new Promise((r) => setTimeout(r, 500))
  }

  return NextResponse.json({ ok: true, enviados, falhados, total: alvos.length })
}
