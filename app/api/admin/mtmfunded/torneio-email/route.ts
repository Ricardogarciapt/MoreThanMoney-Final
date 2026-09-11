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
 * O CONVITE PARA O TORNEIO — inscrições abertas.
 *
 * Mesmos três travões do anúncio da política, e pelas mesmas razões:
 *
 * · `confirmar: "SIM-ENVIAR"` obrigatório. Sem ele devolve a lista de quem receberia e não sai
 *   nada. Um endpoint de envio em massa que dispara à primeira chamada dispara um dia por engano.
 * · Marca quem já recebeu, por TORNEIO. Correr duas vezes não manda o mesmo convite duas vezes
 *   — e o torneio seguinte volta a poder convidar toda a gente.
 * · Meio segundo entre emails. Uma rajada de centenas queima a reputação do domínio, e depois
 *   nem os emails das contas chegam a quem espera por eles.
 *
 * Só envia se as inscrições estiverem MESMO abertas. Convidar para uma porta fechada é a
 * forma mais rápida de ensinar as pessoas a ignorar os nossos emails.
 */

function corpo(nome: string, t: {
  nome: string
  saldo: number
  comeca: string
  fecham: string | null
}): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const d = (v: string) =>
    new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="170" style="max-width:170px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:23px;line-height:1.3;color:#111;">
        As inscrições do ${t.nome} estão abertas
      </h1>

      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Olá ${nome}, abriu a inscrição no nosso torneio trimestral de trading — e é
        <strong>gratuito</strong>.
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#222;">
          Conta avaliada de <strong>${Number(t.saldo).toLocaleString('pt-PT')} USD</strong>,
          emitida por nós. Começa a <strong>${d(t.comeca)}</strong>.
        </p>
        ${
          t.fecham
            ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
                 As inscrições fecham a ${d(t.fecham)} — depois disso não entra mais ninguém.
               </p>`
            : ''
        }
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#444;">
        Como funciona:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.75;color:#555;">
        <li>Inscreves-te e recebes a conta por email, com código QR.</li>
        <li>A conta é <strong>simulada</strong> — dinheiro virtual, não depositas nada.</li>
        <li>A classificação é pública e actualiza de hora a hora.</li>
        <li>Regras publicadas antes de começares. Prémios para o pódio.</li>
      </ul>

      <a href="${site}/mtmfunded/tradingtournament" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
        Inscrever-me
      </a>

      <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#999;">
        As contas não movimentam dinheiro real e nada disto é aconselhamento financeiro.
        As regras estão em ${site}/mtmfunded/tradingtournament.
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
  const so: string[] = Array.isArray(b?.so) ? b.so.map((e: unknown) => String(e).toLowerCase()) : []

  const db = getSupabaseAdmin()

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, nome, estado, comeca_em, saldo_inicial, inscricoes_fecham_em, publicado')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!torneio) {
    return NextResponse.json({ error: 'Não há torneio publicado' }, { status: 400 })
  }
  // Convidar para uma porta fechada ensina as pessoas a ignorar os nossos emails.
  if (torneio.estado !== 'inscricoes') {
    return NextResponse.json(
      { error: `As inscrições não estão abertas (estado: ${torneio.estado})` },
      { status: 400 },
    )
  }

  const CHAVE_MARCA = `convite_torneio_${torneio.id}`

  const { data: pessoas } = await db
    .from('profiles')
    .select('id, full_name, email, is_active, profile_data')
    .not('email', 'is', null)
    .limit(limite)

  /** Endereços de teste ficam de fora: bounces a mais fazem marcar o domínio. */
  const ehTeste = (email: string) =>
    /@(test|example|exemplo|invalid|localhost)\.|@test$|^teste?@|\+test@/i.test(email)

  // Quem já está inscrito não precisa de convite — e receber um convite para uma coisa em que
  // já se inscreveu faz duvidar de que a inscrição tenha ficado registada.
  const { data: inscritos } = await db
    .from('mtm_tournament_participants')
    .select('user_id')
    .eq('tournament_id', torneio.id)
  const jaDentro = new Set((inscritos ?? []).map((i) => String(i.user_id)))

  const alvos = (pessoas ?? []).filter((p) => {
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!email.includes('@') || ehTeste(email)) return false
    if (so.length && !so.includes(email)) return false
    if (jaDentro.has(String(p.id))) return false
    const dados = (p.profile_data ?? {}) as Record<string, unknown>
    // A prova para um endereço só não gasta a marca: senão a pessoa da prova ficava de fora
    // do envio a sério.
    if (!so.length && dados[CHAVE_MARCA]) return false
    return true
  })

  if (!confirmado) {
    return NextResponse.json({
      ensaio: true,
      aviso: 'Nada foi enviado. Repete com { "confirmar": "SIM-ENVIAR" } para enviar a sério.',
      torneio: torneio.nome,
      total: alvos.length,
      jaInscritos: jaDentro.size,
      exemplo: alvos.slice(0, 10).map((p) => ({ email: p.email, nome: p.full_name })),
    })
  }

  const transporter = createMailTransporter()
  const dados = {
    nome: String(torneio.nome),
    saldo: Number(torneio.saldo_inicial),
    comeca: String(torneio.comeca_em),
    fecham: (torneio.inscricoes_fecham_em as string) ?? null,
  }

  let enviados = 0
  let falhados = 0

  for (const p of alvos) {
    const nome = String(p.full_name ?? '').trim().split(/\s+/)[0] || 'Trader'
    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: p.email as string,
        subject: `Inscrições abertas — ${torneio.nome}`,
        html: prepareBrandedEmailHtml(corpo(nome, dados)),
        attachments: brandedMailAttachments(),
      })
      enviados++

      // Marca-se DEPOIS de enviar: marcar antes e falhar o envio deixava a pessoa de fora do
      // convite sem forma de reparar sem mexer na base à mão.
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
      console.error('[MTMFUNDED convite torneio]', p.email, String(e).slice(0, 120))
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  return NextResponse.json({ ok: true, torneio: torneio.nome, enviados, falhados, total: alvos.length })
}
