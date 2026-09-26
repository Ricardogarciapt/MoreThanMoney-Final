import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  ESTADO_RASCUNHO,
  SEGMENTOS,
  TIPO_CAMPANHA,
  prepararCampanhas,
  rascunhoUmAUm,
  type CampanhaPreparada,
  type ContagemSegmento,
} from '@/lib/captacao-campanhas'
import { emailUtilizavel, ehEmailDeMentira, normalizarEmail } from '@/lib/captacao-consentimento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * AS AUTO-TAREFAS DE CAMPANHA — uma passagem por semana, a preparar trabalho para o Ricardo rever.
 *
 * O QUE FAZ
 *   1. CONTA   — quantas pessoas há em cada segmento e, dessas, a quantas se consegue chegar.
 *   2. PREPARA — escreve os rascunhos e grava-os em `email_campaigns` no estado `draft`.
 *   3. AVISA   — cria UMA tarefa no backoffice a dizer que há campanhas em cima da mesa.
 *
 * O QUE NÃO FAZ, E NÃO VAI FAZER
 * Não manda um único email. Não agenda um envio. Não marca nada para sair. O estado gravado é
 * `draft`, que é o único que o caminho de envio (`app/api/email-marketing/campaigns`) NÃO dispara,
 * e o tipo é `marketing` e nunca `transactional` — porque esse salta a verificação de preferências
 * nesse mesmo caminho. As duas coisas estão presas por guardas em `captacao-campanhas.check.ts`.
 *
 * A razão é a mesma do motor do dia: um sistema que manda emails em massa sozinho acaba sempre da
 * mesma maneira. Alguém recebe a mensagem errada, chegam as queixas de spam, e o domínio fica
 * queimado durante meses — queimado também para os avisos de renovação dos clientes que pagam.
 *
 * E HÁ UMA COISA QUE ESTE CRON NÃO PODE RESOLVER
 * A 26/09 não existe nesta base uma única pessoa com consentimento de marketing registado
 * (`email_preferences`: zero linhas; o livro novo `captacao_consentimento`: nasce vazio). Por isso o
 * único segmento de envio em massa vai contar ZERO pessoas, e isso está certo. A lista constrói-se
 * pelos pontos de captura (`PONTOS_DE_CAPTURA`), não por uma query mais esperta.
 *
 * NASCE DESLIGADO — `site_settings.captacao_campanhas_ligado`. Não é timidez: isto escreve rascunhos
 * e tarefas com o nome de pessoas reais lá dentro, e ligar-se sozinho num deploy é a pior forma de
 * se apresentar. `?ensaio=1` mostra tudo sem escrever nada.
 */

const CHAVE_LIGADO = 'captacao_campanhas_ligado'

interface Contado extends ContagemSegmento {
  /** Uma amostra de nomes, para a tarefa dizer de quem se está a falar. Nunca a lista inteira. */
  exemplos: Array<{ nome: string; primeiroNome: string }>
}

/**
 * Conta cada segmento.
 *
 * A distinção entre `pessoas` e `contactaveis` é o ponto todo deste ficheiro: uma fonte com 569
 * linhas e zero formas de contacto não tem 569 leads, tem zero. Contar as duas coisas e mostrar as
 * duas é o que impede a lista de se mentir a si mesma.
 */
async function contar(db: ReturnType<typeof getSupabaseAdmin>): Promise<Contado[]> {
  const out: Contado[] = []

  for (const s of SEGMENTOS) {
    let pessoas = 0
    let contactaveis = 0
    let exemplos: Contado['exemplos'] = []

    try {
      if (s.fonte === 'consentidos') {
        // A vista resolve o histórico do livro: um «retirei» posterior ganha sempre a um «aceito»
        // anterior. Lê-se a vista e não a tabela justamente para não ter de repetir essa regra aqui.
        const { data } = await db
          .from('captacao_permissao_email')
          .select('email, pode_marketing')
          .eq('pode_marketing', true)
        const validos = (data ?? [])
          .map((r) => normalizarEmail((r as { email: string }).email))
          .filter((e) => emailUtilizavel(e) && !ehEmailDeMentira(e))
        pessoas = (data ?? []).length
        contactaveis = validos.length
        exemplos = validos.slice(0, 5).map((e) => ({ nome: e, primeiroNome: e.split('@')[0] }))
      } else {
        let q = db.from('vendas_negocios').select('nome, email, telefone, telegram_id, instagram_handle, contactavel')
        if (s.fonte === 'perfis_inactivos') q = q.eq('origem', 'base')
        else if (s.fonte === 'pipeline_corretora') q = q.eq('origem', 'corretora')
        else if (s.fonte === 'pipeline_instagram') q = q.eq('origem', 'instagram')
        else if (s.fonte === 'pipeline_telegram_sem_contacto') q = q.eq('origem', 'telegram')

        // Ganho e perdido não entram: mandar uma campanha de captação a quem já é cliente — ou a
        // quem disse não — é a forma mais rápida de perder a confiança de ambos.
        const { data } = await q.not('estado', 'in', '("ganho","perdido")').limit(1000)
        const linhas = (data ?? []) as Array<{ nome: string; email: string | null; contactavel: boolean | null }>
        pessoas = linhas.length
        contactaveis = linhas.filter((l) => l.contactavel === true).length
        exemplos = linhas
          .filter((l) => l.contactavel === true)
          .slice(0, 5)
          .map((l) => ({ nome: l.nome, primeiroNome: (l.nome || '').split(' ')[0] ?? '' }))
      }
    } catch (e) {
      // Uma fonte que rebente não pode levar as outras atrás. Fica a zero e o aviso sai no resultado.
      console.log('[captacao-campanhas] falha a contar', s.chave, e instanceof Error ? e.message : e)
    }

    out.push({ chave: s.chave, pessoas, contactaveis, exemplos })
  }

  return out
}

/** A chave da campanha na semana. Correr isto dez vezes não dá dez rascunhos do mesmo. */
function chaveCampanha(chave: string, semana: string): string {
  return `captacao:${chave}:${semana}`
}

/** A semana em curso, em Lisboa. Serve de selo aos rascunhos para não se repetirem. */
function semanaEmLisboa(agora: Date): string {
  const d = new Date(agora.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const semana = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-S${String(semana).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const agora = new Date()
  const semana = semanaEmLisboa(agora)

  const contagens = await contar(db)
  const preparadas = prepararCampanhas(contagens)

  // O interruptor não trava o ensaio: quem está a decidir se liga isto precisa de ver o que sairia,
  // e ver não escreve nada.
  if (!ensaio) {
    const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_LIGADO).maybeSingle()
    if ((data as { value?: unknown } | null)?.value !== true) {
      return NextResponse.json({
        ok: true,
        ligado: false,
        nota: `desligado — site_settings.${CHAVE_LIGADO}`,
        // Dizer quantas ESTARIAM preparadas evita a armadilha de um cron desligado parecer um cron
        // sem trabalho. Se este número for alto e ninguém souber, o silêncio é caro.
        estariamPreparadas: preparadas.filter((c) => c.prontaParaRever).length,
        resumo: resumir(preparadas, contagens),
      })
    }
  }

  const gravadas: string[] = []
  const avisos: string[] = []

  if (!ensaio) {
    for (const c of preparadas) {
      if (!c.prontaParaRever || c.segmento.via !== 'email_massa') continue

      for (const email of c.emails) {
        const nome = chaveCampanha(`${c.segmento.chave}-${email.ordem}`, semana)
        // Já existe? Não se reescreve: o Ricardo pode já ter mexido no texto, e um cron a apagar
        // edições humanas é um cron que alguém desliga à primeira vez que acontece.
        const { data: ja } = await db.from('email_campaigns').select('id').eq('name', nome).maybeSingle()
        if (ja) continue

        const { error } = await db.from('email_campaigns').insert({
          name: nome,
          subject: email.assunto,
          content: email.corpo,
          // `draft` e `marketing`: os dois valores que garantem que isto não sai sozinho. Ver o
          // comentário no topo e as guardas.
          status: ESTADO_RASCUNHO,
          type: TIPO_CAMPANHA,
          segment: c.segmento.chave,
          // Sem `send_at`: uma data preenchida é meio caminho andado para um agendamento.
          send_at: null,
          total_recipients: c.contactaveis,
          metadata: {
            preparada_por: 'cron/captacao-campanhas',
            semana,
            base_legal: c.segmento.baseLegal,
            quem: c.segmento.quem,
            ordem_na_sequencia: email.ordem,
            dias_depois_do_anterior: email.diasDepois,
            // Fica escrito no próprio rascunho: quem o disparar não pode dizer que não sabia.
            aviso: 'Rascunho. Revê o texto e a lista antes de enviar. Só vai a quem deu consentimento.',
          },
        })
        if (error) avisos.push(`${nome}: ${error.message}`)
        else gravadas.push(nome)
      }
    }

    // UMA tarefa, e não uma por campanha. Doze tarefas de revisão numa manhã é uma lista que se
    // fecha sem se ler.
    const chaveTarefa = `captacao-revisao:${semana}`
    const { data: jaTarefa } = await db.from('vendas_tarefas').select('id').eq('chave', chaveTarefa).maybeSingle()
    if (!jaTarefa && (gravadas.length || preparadas.some((c) => c.segmento.bloqueio))) {
      const { error } = await db.from('vendas_tarefas').insert({
        chave: chaveTarefa,
        titulo: `Rever campanhas de captação (${semana})`,
        descricao: resumir(preparadas, contagens),
        papel: 'team_leader',
        estado: 'aberta',
        rascunho: rascunhosUmAUmPara(preparadas, contagens),
      })
      if (error) avisos.push(`tarefa: ${error.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    ligado: !ensaio,
    ensaio,
    semana,
    gravadas,
    avisos,
    resumo: resumir(preparadas, contagens),
    campanhas: preparadas.map((c) => ({
      chave: c.segmento.chave,
      via: c.segmento.via,
      baseLegal: c.segmento.baseLegal,
      pessoas: c.pessoas,
      contactaveis: c.contactaveis,
      prontaParaRever: c.prontaParaRever,
      porque: c.porque,
      assuntos: c.emails.map((e) => e.assunto),
    })),
  })
}

/** O resumo que uma pessoa lê. Números primeiro, e o bloqueio dito por extenso. */
function resumir(preparadas: CampanhaPreparada[], contagens: Contado[]): string {
  const porChave = new Map(contagens.map((c) => [c.chave, c]))
  const linhas = preparadas.map((c) => {
    const ex = porChave.get(c.segmento.chave)?.exemplos ?? []
    const amostra = ex.length ? ` Ex.: ${ex.map((e) => e.nome).join(', ')}.` : ''
    const marca = c.prontaParaRever ? 'PRONTA' : 'BLOQUEADA'
    return `[${marca}] ${c.segmento.nome} — ${c.contactaveis}/${c.pessoas} contactáveis (${c.segmento.via}). ${c.porque}.${amostra}`
  })
  return (
    linhas.join('\n') +
    '\n\nNada disto foi enviado. Os rascunhos estão em Email Marketing, no estado «draft».' +
    '\nO segmento de envio em massa só conta quem deu consentimento — e hoje esse número é o que é.'
  )
}

/** Os rascunhos de um a um, juntos, para caberem no campo `rascunho` da tarefa. */
function rascunhosUmAUmPara(preparadas: CampanhaPreparada[], contagens: Contado[]): string {
  const porChave = new Map(contagens.map((c) => [c.chave, c]))
  const blocos: string[] = []
  for (const c of preparadas) {
    if (c.segmento.via !== 'um_a_um') continue
    const ex = porChave.get(c.segmento.chave)?.exemplos ?? []
    if (!ex.length) continue
    blocos.push(
      `— ${c.segmento.nome} (${c.contactaveis} pessoas) —\n` +
        rascunhoUmAUm(c.segmento, ex[0].primeiroNome) +
        `\n(adapta o nome: ${ex.map((e) => e.primeiroNome).filter(Boolean).join(', ')})`,
    )
  }
  return blocos.join('\n\n') || '(sem pessoas contactáveis para abordagem individual esta semana)'
}
