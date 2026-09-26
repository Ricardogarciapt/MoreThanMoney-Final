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
 * AS ESCRITAS: criar, riscar, reabrir, cancelar e mudar o prazo. Quem é o dono verifica-se no
 * servidor, na consulta, pela LISTA do âmbito (`.in('responsavel_id', ids)`) — nunca por um `if`
 * depois de ler, e nunca por um `.eq(userId)`, que fechava o responsável fora da equipa dele.
 *
 * A LISTA É PAGINADA e filtrável pelo endereço. O `.limit(500)` que aqui estava mostrava 500
 * tarefas com o mesmo aspecto de estar completo — a 501.ª desaparecia sem dar erro.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { tarefasDoAmbito, type TarefaLinha } from '@/lib/backoffice-negocios'
import { PESO_PRAZO, SITUACAO_PRAZO_NOME, dataCurta, situacaoDoPrazo } from '@/lib/backoffice-vista'
import { lerDoCatalogo, lerPagina } from '@/lib/backoffice-paginacao'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou, Vazio } from '../_partes/blocos'
import { Campo, ESTILO_CAMPO, Filtros, Paginacao, type Params } from '../_partes/navegar'
import { Marcar } from './marcar'
import { TarefaNova } from './nova'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarefas · Backoffice MTM' }

const BASE = '/backoffice/tarefas'

/**
 * As vistas da lista. «Canceladas» é uma vista à parte de propósito: uma lista de trabalho com
 * histórico dentro deixa de se conseguir usar como lista de trabalho, mas o histórico não se apaga.
 */
const VISTAS = ['trabalho', 'canceladas', 'tudo'] as const
const ESTADOS_DA_VISTA: Record<(typeof VISTAS)[number], readonly string[]> = {
  trabalho: ['aberta', 'feita'],
  canceladas: ['cancelada'],
  tudo: ['aberta', 'feita', 'cancelada'],
}
const VISTA_NOME: Record<(typeof VISTAS)[number], string> = {
  trabalho: 'Por fazer e feitas',
  canceladas: 'Canceladas',
  tudo: 'Tudo',
}

export default async function TarefasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
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

  const vista = lerDoCatalogo(params.vista, VISTAS) ?? 'trabalho'
  const pagina = lerPagina(params)

  let tarefas: TarefaLinha[]
  let haMais = false
  try {
    const lista = await tarefasDoAmbito(getSupabaseAdmin(), ambito, { estados: ESTADOS_DA_VISTA[vista], pagina })
    tarefas = lista.linhas
    haMais = lista.haMais
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
  const canceladas = tarefas.filter((t) => t.estado === 'cancelada')

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

      <TarefaNova />

      <Filtros base={BASE} activo={vista !== 'trabalho'}>
        <Campo nome="A mostrar">
          <select name="vista" defaultValue={vista} className={ESTILO_CAMPO}>
            {VISTAS.map((v) => (
              <option key={v} value={v}>
                {VISTA_NOME[v]}
              </option>
            ))}
          </select>
        </Campo>
      </Filtros>

      {abertas.length > 0 && (
        <p className="text-sm text-gray-400">
          {abertas.length} por fazer
          {atrasadas > 0 && <span className="text-red-400"> · {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}</span>}
          {paraHoje > 0 && <span className="text-[#D2A63C]"> · {paraHoje} para hoje</span>}
        </p>
      )}

      {abertas.length === 0 ? (
        <Vazio
          titulo={vista === 'canceladas' ? 'Nenhuma tarefa cancelada nesta página.' : 'Não tens nada por fazer.'}
          seguinte="Cria em cima o que combinaste fazer. Se ficou só na cabeça de alguém, não está no sistema — e o que não está no sistema não aparece a ninguém."
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
                {/* Riscar, cancelar ou mudar o prazo — mas só nas SUAS. Num responsável a ver as
                    dos liderados o botão não aparece nas que não são dele, e o servidor recusa na
                    mesma: é lá que a regra vive, aqui é só não mostrar o que não se pode fazer. */}
                {t.responsavel_id === ctx.userId && (
                  <Marcar id={t.id} feita={false} estado={t.estado} prazo={t.prazo} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Paginacao base={BASE} params={params} pagina={pagina} mostradas={tarefas.length} haMais={haMais} />

      {canceladas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Canceladas ({canceladas.length})</h2>
          <ul className="space-y-1.5">
            {canceladas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-800/60 bg-gray-900/20 px-4 py-2.5">
                <span className="text-sm text-gray-500">{t.titulo}</span>
                {/* Uma cancelada não se reabre daqui: se voltou a ser precisa, cria-se outra, e
                    assim fica rasto de que houve uma decisão. */}
                <span className="text-xs text-gray-600">cancelada</span>
              </li>
            ))}
          </ul>
        </section>
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
                  {/* A mesma regra da lista de cima, que aqui faltava: o botão só aparece nas dela.
                      O servidor aceita um responsável a reabrir a tarefa de um liderado — mas
                      desmarcar o trabalho de outra pessoa a partir de uma lista onde ela não tem
                      botão para o marcar é uma assimetria que só se descobre a discutir. */}
                  {t.responsavel_id === ctx.userId && (
                    <Marcar id={t.id} feita={true} estado={t.estado} prazo={t.prazo} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
