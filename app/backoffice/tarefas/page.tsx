/**
 * TAREFAS — a lista desta pessoa, com prazo.
 *
 * «ATRASADA» CALCULA-SE AO LER, e nunca se guarda. Um estado `atrasada` na base precisava de alguém
 * (um cron, uma escrita ao abrir a página) a pô-lo de pé todas as noites, e no dia em que esse
 * alguém falhasse a lista dizia «em prazo» a tarefas de há duas semanas — uma mentira que envelhece
 * sem avisar. A conta está em `lib/backoffice-vista.ts`, e faz-se em hora local: com UTC, no verão,
 * entre a meia-noite e a uma da manhã as tarefas de hoje apareciam atrasadas.
 *
 * QUEM VÊ O QUÊ: o responsável da tarefa é um campo só, e o filtro é a lista de ids do âmbito. Uma
 * pessoa vê as suas; um responsável de equipa vê também as dos liderados directos (migração 131).
 * Um líder de líderes NÃO vê os netos — a cadeia não se atravessa, por decisão do dono.
 *
 * A ÚNICA ESCRITA DO BACKOFFICE está aqui: marcar a própria tarefa como feita. Quem é o dono
 * verifica-se no servidor, na consulta (`.eq('responsavel_id', …)` com o id da sessão).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { tarefasDoAmbito, type TarefaLinha } from '@/lib/backoffice-negocios'
import { PESO_PRAZO, SITUACAO_PRAZO_NOME, dataCurta, situacaoDoPrazo } from '@/lib/backoffice-vista'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou, Vazio } from '../_partes/blocos'
import { Marcar } from './marcar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas · Backoffice MTM' }

export default async function TarefasPage() {
  const acesso = await abrirPagina('bo.tarefas_proprias')
  if (!acesso.ok) {
    return (
      <SemAcesso
        motivo={acesso.motivo}
        oQue="As tarefas são de quem trabalha os negócios. Um afiliado divulga e recebe — não tem lista de trabalho atribuída."
      />
    )
  }
  const { ctx } = acesso

  const { ambito, aviso } = await ambitoDaPagina(ctx, 'tarefas')

  let tarefas: TarefaLinha[]
  try {
    tarefas = await tarefasDoAmbito(getSupabaseAdmin(), ambito)
  } catch (e) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Tarefas" sub="O que tens para fazer." />
        <Falhou oQue="Não consegui ler as tarefas." detalhe={e instanceof Error ? e.message : undefined} />
      </div>
    )
  }

  // DE QUEM É CADA TAREFA. Só se pergunta quando o âmbito tem mais do que uma pessoa: numa lista
  // só dela, o nome dela não acrescenta nada — e num responsável a ver a equipa, uma lista sem
  // nomes é uma lista que ele não consegue usar (não sabe a quem ir falar).
  const outros = [...new Set(tarefas.map((t) => t.responsavel_id).filter((id) => id && id !== ctx.userId))]
  const nomes = outros.length > 0 ? await nomesDe(outros) : {}

  const abertas = tarefas.filter((t) => t.estado === 'aberta')
  const feitas = tarefas.filter((t) => t.estado === 'feita')

  // A ordem de leitura: o que já falhou primeiro, o que não tem prazo no fim. Ordenar por data
  // pura punha as sem-prazo num extremo arbitrário e o atraso perdia-se no meio.
  const porUrgencia = [...abertas].sort((a, b) => {
    const pa = PESO_PRAZO[situacaoDoPrazo(a.prazo)]
    const pb = PESO_PRAZO[situacaoDoPrazo(b.prazo)]
    if (pa !== pb) return pa - pb
    return String(a.prazo ?? '9999').localeCompare(String(b.prazo ?? '9999'))
  })

  const atrasadas = porUrgencia.filter((t) => situacaoDoPrazo(t.prazo) === 'atrasada').length
  const paraHoje = porUrgencia.filter((t) => situacaoDoPrazo(t.prazo) === 'hoje').length

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo="Tarefas"
        sub="O que tens para fazer, o mais urgente primeiro. «Atrasada» é uma conta feita agora contra a data de hoje — não é um estado que alguém tenha de vir pôr."
      />

      {aviso && <Aviso>{aviso}</Aviso>}

      {abertas.length > 0 && (
        <p className="text-sm text-gray-400">
          {abertas.length} por fazer
          {atrasadas > 0 && <span className="text-red-400"> · {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}</span>}
          {paraHoje > 0 && <span className="text-[#D2A63C]"> · {paraHoje} para hoje</span>}
        </p>
      )}

      {abertas.length === 0 ? (
        <Vazio
          titulo="Não tens nada por fazer."
          seguinte="As tuas tarefas aparecem aqui quando alguém as criar — normalmente ligadas a um negócio que estás a trabalhar. Se combinaste fazer alguma coisa e ela não está aqui, não está no sistema."
        />
      ) : (
        <ul className="space-y-2">
          {porUrgencia.map((t) => {
            const situacao = situacaoDoPrazo(t.prazo)
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
                <div className="min-w-[200px] flex-1">
                  <div className="font-medium text-white">{t.titulo}</div>
                  {t.descricao && <p className="mt-1 text-xs leading-relaxed text-gray-400">{t.descricao}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Etiqueta tom={situacao === 'atrasada' ? 'mau' : situacao === 'hoje' ? 'aviso' : 'neutro'}>
                      {SITUACAO_PRAZO_NOME[situacao]}
                      {t.prazo ? ` · ${dataCurta(t.prazo)}` : ''}
                    </Etiqueta>
                    {t.responsavel_id !== ctx.userId && (
                      <Etiqueta tom="aviso">{nomes[t.responsavel_id] ?? 'Da equipa'}</Etiqueta>
                    )}
                    {t.papel && <Etiqueta>como {t.papel}</Etiqueta>}
                    {t.negocio_id && <Etiqueta>de um negócio</Etiqueta>}
                  </div>
                </div>
                {/* Só o próprio risca a sua tarefa: num responsável a ver as dos liderados, o
                    botão não aparece nas que não são dele — e o servidor recusa na mesma, porque é
                    lá que a regra vive. */}
                {t.responsavel_id === ctx.userId && <Marcar id={t.id} feita={false} />}
              </li>
            )
          })}
        </ul>
      )}

      {feitas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Já feitas ({feitas.length})</h2>
          <ul className="space-y-1.5">
            {feitas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800/60 bg-gray-900/20 px-4 py-2.5">
                <span className="text-sm text-gray-500 line-through">
                  {t.titulo}
                  {t.responsavel_id !== ctx.userId && (
                    <span className="ml-2 no-underline">— {nomes[t.responsavel_id] ?? 'da equipa'}</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600">{dataCurta(t.feita_em)}</span>
                  {t.responsavel_id === ctx.userId && <Marcar id={t.id} feita={true} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
