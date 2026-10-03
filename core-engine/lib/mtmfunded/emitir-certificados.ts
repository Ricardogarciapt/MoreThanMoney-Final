import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { gerarCertificadoPdf, gerarCodigo, type TipoCertificado } from './certificado'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/**
 * Emissão dos certificados de um torneio.
 *
 * Toda a gente que participou leva certificado de PARTICIPAÇÃO — incluindo quem quebrou a
 * conta. Quem entrou e negociou fez o percurso, e um torneio que só reconhece o pódio ensina
 * a não voltar. O pódio leva, além disso, o de CLASSIFICAÇÃO.
 *
 * A emissão é IDEMPOTENTE: correr duas vezes não emite dois certificados à mesma pessoa. Um
 * segundo certificado com outro código faria dois documentos válidos para o mesmo facto, e
 * ninguém saberia qual mostrar.
 */

export interface ResultadoEmissao {
  emitidos: number
  jaExistiam: number
  falhados: number
  notas: string[]
}

export async function emitirCertificadosDoTorneio(
  tournamentId: string,
  opts?: { enviarEmail?: boolean; posicoesPremiadas?: number },
): Promise<ResultadoEmissao> {
  const db = getSupabaseAdmin()
  const out: ResultadoEmissao = { emitidos: 0, jaExistiam: 0, falhados: 0, notas: [] }
  const premiadas = opts?.posicoesPremiadas ?? 3

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, nome, estado')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!torneio) {
    out.notas.push('torneio não encontrado')
    return out
  }

  const { data: participantes } = await db
    .from('mtm_tournament_participants')
    .select('id, user_id, nome_publico, email, posicao, resultado_pct, estado, account_id')
    .eq('tournament_id', tournamentId)
    .order('posicao', { ascending: true, nullsFirst: false })

  for (const p of participantes ?? []) {
    // Quem se inscreveu e nunca negociou não recebe: um certificado de participação para
    // quem não participou esvazia o de quem participou.
    if (p.estado === 'inscrito') {
      out.notas.push(`${p.nome_publico}: sem negociação, sem certificado`)
      continue
    }

    const tipos: TipoCertificado[] = ['participacao']
    if (p.posicao != null && p.posicao <= premiadas && p.estado !== 'quebrado') {
      tipos.push('classificacao')
    }

    for (const tipo of tipos) {
      const { data: existente } = await db
        .from('mtm_certificates')
        .select('id, codigo')
        .eq('tournament_id', tournamentId)
        .eq('user_id', p.user_id)
        .eq('tipo', tipo)
        .maybeSingle()
      if (existente) {
        out.jaExistiam++
        continue
      }

      const codigo = gerarCodigo(tipo)
      try {
        const pdf = await gerarCertificadoPdf({
          tipo,
          nome: p.nome_publico as string,
          prova: torneio.nome as string,
          posicao: tipo === 'classificacao' ? (p.posicao as number) : null,
          // O resultado só entra no de classificação. No de participação, mostrar um
          // resultado negativo transforma um reconhecimento numa nota de rodapé má.
          resultadoPct: tipo === 'classificacao' ? Number(p.resultado_pct ?? 0) : null,
          codigo,
        })

        // Grava-se ANTES de enviar: um certificado que existe e não foi enviado reenvia-se;
        // um que foi enviado e não existe não se valida, e é o pior dos dois mundos.
        const { error } = await db.from('mtm_certificates').insert({
          user_id: p.user_id,
          tournament_id: tournamentId,
          account_id: p.account_id,
          tipo,
          codigo,
          nome: p.nome_publico,
          posicao: tipo === 'classificacao' ? p.posicao : null,
          detalhe: { resultadoPct: p.resultado_pct, estado: p.estado },
        })
        if (error) {
          out.falhados++
          out.notas.push(`${p.nome_publico} (${tipo}): ${error.message}`)
          continue
        }
        out.emitidos++

        if (opts?.enviarEmail !== false && p.email) {
          await enviarCertificado({
            para: p.email as string,
            nome: p.nome_publico as string,
            tipo,
            prova: torneio.nome as string,
            posicao: tipo === 'classificacao' ? (p.posicao as number) : null,
            codigo,
            pdf,
          }).catch((e) => {
            out.notas.push(`${p.nome_publico}: emitido mas o email falhou — ${String(e).slice(0, 80)}`)
          })
        }
      } catch (e) {
        out.falhados++
        out.notas.push(`${p.nome_publico} (${tipo}): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return out
}

export async function enviarCertificado(input: {
  para: string
  nome: string
  tipo: TipoCertificado
  prova: string
  posicao: number | null
  codigo: string
  pdf: Buffer
}): Promise<void> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const ePodio = input.posicao != null

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;">
    <div style="text-align:center;background:linear-gradient(135deg,#D2A63C,#BB8525);padding:24px;border-radius:12px 12px 0 0;">
      <img src="${logo}" alt="MoreThanMoney" width="140" />
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="color:#BB8525;margin:0 0 12px;">
        ${ePodio ? `Parabéns, ${input.nome}! 🏆` : `Obrigado por competires, ${input.nome}`}
      </h2>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
        ${ePodio
          ? `Terminaste o <strong>${input.prova}</strong> em <strong>${input.posicao}.º lugar</strong>. O teu certificado segue em anexo.`
          : `O teu certificado de participação no <strong>${input.prova}</strong> segue em anexo. Competir já é a parte difícil.`}
      </p>
      <div style="margin:20px 0;padding:14px 16px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#666;">Código de validação</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;letter-spacing:1px;color:#BB8525;">${input.codigo}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#888;">
          Qualquer pessoa pode confirmá-lo em
          <a href="${site}/mtmfunded/certificado/${input.codigo}" style="color:#BB8525;">${site.replace(/^https?:\/\//, '')}/mtmfunded/certificado/${input.codigo}</a>
        </p>
      </div>
      <p style="font-size:13px;color:#999;margin-top:24px;">— Equipa MoreThanMoney</p>
    </div>
  </div>`

  const transporter = createMailTransporter()
  await transporter.sendMail({
    from: mailFrom(),
    to: input.para,
    subject: ePodio
      ? `🏆 ${input.posicao}.º lugar — ${input.prova}`
      : `O teu certificado — ${input.prova}`,
    html: prepareBrandedEmailHtml(html),
    attachments: [
      ...brandedMailAttachments(),
      { filename: `certificado-${input.codigo}.pdf`, content: input.pdf },
    ],
  })
}
