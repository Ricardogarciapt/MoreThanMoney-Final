import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import T from '@/components/mtmfunded/t'
import Acordeao, { type Entrada } from './acordeao'

// Cache de 60s em vez de render por pedido: as regras e as datas mudam raramente, e numa
// página que se lê antes de comprar cada espera é uma visita perdida.
export const revalidate = 60
export const metadata = { title: 'Perguntas Frequentes' }

/**
 * A FAQ do MTM Funded — só dele, com as respostas no DICIONÁRIO e os números da BASE DE DADOS.
 *
 * As regras e as datas do torneio saem da linha do torneio, não de texto escrito à mão: uma
 * FAQ que diz «perda diária de 5%» enquanto o admin já mudou a regra para 4% é pior do que
 * não ter FAQ nenhuma — parece informação e é desinformação.
 *
 * O texto vive no dicionário (`faq.*`) e entra por `TextoRico`, que percebe negrito, ligações
 * e listas. Os valores vivos viajam como variáveis — `{saldo}`, `{v}` — e nunca como frases
 * montadas aqui: uma frase partida em pedaços traduz-se mal em qualquer língua.
 */
export default async function FaqFunded() {
  const config = await getMtmFundedConfig()
  const { data: torneio } = await getSupabaseAdmin()
    .from('mtm_tournaments')
    .select('nome, estado, comeca_em, acaba_em, saldo_inicial, regras, inscricoes_fecham_em')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const r = (torneio?.regras ?? {}) as Record<string, number>
  // As datas viajam em ISO. Formatá-las aqui dava «14 de setembro de 2026» no meio de uma
  // frase em inglês — o servidor não sabe em que língua a página vai ser lida.

  /**
   * O estado das inscrições é uma frase dentro de outra.
   *
   * Passa como CHAVE, não como texto: a página é renderizada no servidor e não sabe em que
   * língua vai ser lida — resolver aqui devolvia sempre português.
   */
  const chaveInscricoes =
    torneio?.estado === 'inscricoes'
      ? 'faq.q3abertas'
      : torneio?.estado === 'a_decorrer'
        ? 'faq.q3decorrer'
        : 'faq.q3embreve'

  const entradas: Array<Entrada | null> = [
    { p: 'faq.q1p', r: 'faq.q1r' },
    { p: 'faq.q2p', r: 'faq.q2r' },
    torneio
      ? {
          p: 'faq.q3p',
          r: 'faq.q3r',
          vars: {
            nome: String(torneio.nome ?? ''),
            inicio: String(torneio.comeca_em ?? ''),
            fim: String(torneio.acaba_em ?? ''),
            saldo: Number(torneio.saldo_inicial).toLocaleString('pt-PT'),
          },
          datas: ['inicio', 'fim'],
          // A frase das inscrições é montada no cliente, onde a língua já se conhece.
          inscricoes: {
            chave: chaveInscricoes,
            ate: (torneio.inscricoes_fecham_em as string) ?? null,
          },
        }
      : { p: 'faq.q3semP', r: 'faq.q3semR' },
    { p: 'faq.q4p', r: 'faq.q4r' },
    { p: 'faq.q5p', r: 'faq.q5r' },
    torneio
      ? {
          p: 'faq.q6p',
          r: 'faq.q6r',
          // A lista de regras vem da base de dados: só entra o que estiver definido.
          lista: [
            r.perda_diaria_pct != null ? { k: 'faq.q6diaria', v: r.perda_diaria_pct } : null,
            r.perda_maxima_pct != null ? { k: 'faq.q6maxima', v: r.perda_maxima_pct } : null,
            r.dias_minimos != null ? { k: 'faq.q6dias', v: r.dias_minimos } : null,
            r.consistencia_pct != null ? { k: 'faq.q6consistencia', v: r.consistencia_pct } : null,
          ].filter(Boolean) as Array<{ k: string; v: number }>,
        }
      : null,
    { p: 'faq.q7p', r: 'faq.q7r' },
    { p: 'faq.q8p', r: 'faq.q8r' },
    { p: 'faq.q9p', r: 'faq.q9r' },
    { p: 'faq.q10p', r: 'faq.q10r' },
    { p: 'faq.q11p', r: 'faq.q11r' },
    { p: 'faq.q12p', r: 'faq.q12r' },
    config.ativo ? { p: 'faq.q13p', r: 'faq.q13r' } : null,
    { p: 'faq.q14p', r: 'faq.q14r' },
    { p: 'faq.q15p', r: 'faq.q15r' },
    { p: 'faq.q16p', r: 'faq.q16r' },
    { p: 'faq.q17p', r: 'faq.q17r' },
    { p: 'faq.q18p', r: 'faq.q18r' },
    { p: 'faq.q19p', r: 'faq.q19r' },
    { p: 'faq.q20p', r: 'faq.q20r' },
    { p: 'faq.q21p', r: 'faq.q21r' },
  ]

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-white">
      <h1 className="text-3xl font-bold sm:text-4xl">
        <T k="faq.titulo" />
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        <T k="faq.subA" />{' '}
        <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
          funded@morethanmoney.pt
        </a>
        .
      </p>

      <Acordeao entradas={entradas.filter(Boolean) as Entrada[]} />
    </main>
  )
}
