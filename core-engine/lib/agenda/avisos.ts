/**
 * OS AVISOS DE UMA CHAMADA — email e WhatsApp, num sítio só.
 *
 * ═══ PORQUE É QUE ISTO EXISTE SEPARADO ═════════════════════════════════════════════════════
 *
 * Porque a mesma mensagem sai de três sítios diferentes (marcar, remarcar por dentro, cancelar) e
 * cada um deles escrevia o seu texto. Três textos para a mesma coisa acabam sempre iguais no dia em
 * que se escrevem e diferentes seis meses depois — e o que diverge primeiro é a hora, que é
 * exactamente a parte que não pode divergir.
 *
 * ═══ O WHATSAPP NÃO SE FORÇA ═══════════════════════════════════════════════════════════════
 *
 * Quem decide se uma mensagem pode sair é `lib/whatsapp-envio.ts`, que conhece as duas paredes da
 * Meta: a janela de 24 horas e a prova de que a pessoa nos deu o número. Aqui não se tenta
 * contornar nenhuma das duas. Uma confirmação a mais não vale perder o número da casa — e um
 * número de WhatsApp Business não se recupera com um deploy.
 *
 * Quando o WhatsApp não pode sair, o email sai à mesma e o motivo fica escrito na marcação
 * (`avisos`). É isso que permite a quem liga saber se a pessoa foi avisada ou não, em vez de
 * assumir que sim.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ics } from './servidor'

export type MotivoAviso = 'marcada' | 'remarcada' | 'cancelada' | 'confirmada'

export interface DadosDoAviso {
  id: string
  token: string
  tipoNome: string
  anfitriao: string
  nome: string
  email: string
  telefone: string | null
  inicio: Date
  fim: Date
  local: string
  joinUrl: string | null
  /** Só em `remarcada`: a hora que a chamada tinha antes. */
  inicioAnterior?: Date | null
}

const base = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')

/** A hora escrita como a pessoa a lê. Sempre com o fuso à vista — ver o cabeçalho de `horas.ts`. */
function quando(d: Date): string {
  return `${d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'full', timeStyle: 'short' })} (hora de Lisboa)`
}

function ondeSeFala(p: DadosDoAviso): string {
  if (p.joinUrl) return `Sala: ${p.joinUrl}`
  if (p.local === 'whatsapp') return `Ligamos-te pelo WhatsApp${p.telefone ? ` para ${p.telefone}` : ''}.`
  return 'O link segue por email antes da chamada.'
}

const TEXTOS: Record<MotivoAviso, (p: DadosDoAviso) => { assunto: string; corpo: string; curto: string }> = {
  marcada: (p) => ({
    assunto: `Chamada marcada: ${p.tipoNome} — ${quando(p.inicio)}`,
    corpo: `Está marcado: <strong>${p.tipoNome}</strong> com ${p.anfitriao}.<br><br><strong>${quando(p.inicio)}</strong><br>${ondeSeFala(p)}`,
    curto: `Chamada marcada: ${p.tipoNome} com ${p.anfitriao}, ${quando(p.inicio)}.`,
  }),
  /**
   * A REMARCAÇÃO PEDE RESPOSTA, e é por isso que tem texto próprio. Um email que diz «mudámos a tua
   * chamada» sem pedir nada é um email que a pessoa arquiva sem ler — e depois não aparece. Aqui
   * diz-se a hora VELHA e a NOVA (sem a velha, quem tem duas chamadas connosco não sabe qual é que
   * mudou) e pede-se um clique.
   */
  remarcada: (p) => ({
    assunto: `Precisamos de mudar a hora: ${p.tipoNome}`,
    corpo:
      `Tivemos de mudar a hora da tua chamada <strong>${p.tipoNome}</strong> com ${p.anfitriao}.` +
      (p.inicioAnterior ? `<br><br>Era: <s>${quando(p.inicioAnterior)}</s>` : '') +
      `<br><strong>Passa a ser: ${quando(p.inicio)}</strong>` +
      `<br><br>Podes confirmar aqui: <a href="${base()}/agendar/gerir?t=${p.token}">confirmo a hora nova</a>.` +
      `<br>Se não te servir, pela mesma página cancelas e escolhes outra — leva trinta segundos.`,
    curto: `Tivemos de mudar a tua chamada «${p.tipoNome}» para ${quando(p.inicio)}. Confirmas? ${base()}/agendar/gerir?t=${p.token}`,
  }),
  cancelada: (p) => ({
    assunto: `Chamada cancelada: ${p.tipoNome}`,
    corpo: `A chamada <strong>${p.tipoNome}</strong> de ${quando(p.inicio)} foi cancelada.<br><br>Quando quiseres, <a href="${base()}/agendar">marcas outra</a>.`,
    curto: `A tua chamada «${p.tipoNome}» de ${quando(p.inicio)} foi cancelada. Marca outra em ${base()}/agendar`,
  }),
  confirmada: (p) => ({
    assunto: `Confirmado: ${p.tipoNome} — ${quando(p.inicio)}`,
    corpo: `Obrigado por confirmares. Fica <strong>${quando(p.inicio)}</strong>, com ${p.anfitriao}.<br>${ondeSeFala(p)}`,
    curto: `Confirmado: ${p.tipoNome} com ${p.anfitriao}, ${quando(p.inicio)}.`,
  }),
}

/**
 * Avisar o convidado. NUNCA rebenta: a marcação já está escrita, e um aviso que não saiu resolve-se
 * com um telefonema; uma excepção aqui desfazia a acção de quem estava a remarcar.
 *
 * Devolve o que conseguiu fazer, e isso fica guardado na marcação — quem vai ligar precisa de saber
 * se a pessoa foi avisada, não de assumir.
 */
export async function avisarConvidado(motivo: MotivoAviso, p: DadosDoAviso): Promise<{ email: boolean; whatsapp: boolean; nota: string }> {
  const t = TEXTOS[motivo](p)
  let email = false
  let whatsapp = false
  const notas: string[] = []

  try {
    const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } =
      await import('@/lib/mail-transport')

    // O .ics vai em todos menos no cancelamento: um convite anexado a um cancelamento volta a pôr
    // a chamada na agenda da pessoa, que é o contrário do que a mensagem diz.
    const anexos = [...brandedMailAttachments()]
    if (motivo !== 'cancelada') {
      anexos.push({
        filename: 'chamada-mtm.ics',
        content: ics({
          id: p.id,
          titulo: `${p.tipoNome} · MoreThanMoney`,
          descricao: `${ondeSeFala(p)}\n\nGerir: ${base()}/agendar/gerir?t=${p.token}`,
          inicio: p.inicio,
          fim: p.fim,
          organizador: p.anfitriao,
          local: p.joinUrl ?? (p.local === 'whatsapp' ? 'Chamada de WhatsApp' : 'MoreThanMoney'),
        }),
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      })
    }

    await createMailTransporter().sendMail({
      from: mailFrom(),
      to: p.email,
      subject: t.assunto,
      attachments: anexos,
      html: prepareBrandedEmailHtml(`<p>Olá ${p.nome},</p><p>${t.corpo}</p><p>Até já,<br>MoreThanMoney</p>`),
    })
    email = true
  } catch (e) {
    notas.push(`email falhou: ${e instanceof Error ? e.message.slice(0, 120) : 'erro'}`)
  }

  if (p.telefone) {
    try {
      const { enviarWhatsApp } = await import('@/lib/whatsapp-mensageiro')
      /**
       * `finalidade: 'servico'` e não `'campanha'`: isto é o aviso de uma chamada que a PRÓPRIA
       * pessoa marcou. É a diferença entre falar com alguém sobre o que ele pediu e escrever-lhe
       * sem ele ter pedido nada — e é essa distinção que `whatsapp-envio` usa para decidir.
       */
      const r = await enviarWhatsApp({ para: p.telefone, texto: t.curto, finalidade: 'servico' })
      whatsapp = r.enviado
      if (!whatsapp) notas.push(`whatsapp não saiu: ${r.porque}`)
    } catch (e) {
      notas.push(`whatsapp falhou: ${e instanceof Error ? e.message.slice(0, 120) : 'erro'}`)
    }
  } else {
    notas.push('sem número — só email')
  }

  const nota = notas.join(' · ') || 'email e whatsapp enviados'

  try {
    const db = getSupabaseAdmin()
    const { data } = await db.from('agenda_marcacoes').select('avisos').eq('id', p.id).maybeSingle()
    const antes = Array.isArray(data?.avisos) ? (data!.avisos as unknown[]) : []
    await db.from('agenda_marcacoes').update({
      avisos: [...antes.slice(-19), { motivo, em: new Date().toISOString(), email, whatsapp, nota }],
    }).eq('id', p.id)
  } catch {
    // O registo do aviso é conforto. Não vale falhar a operação por causa dele.
  }

  return { email, whatsapp, nota }
}
