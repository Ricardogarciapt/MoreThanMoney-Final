import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { diaEmLisboa } from '@/lib/backoffice-dia-regras'
import { proximoPasso, type PessoaDoNegocio } from '@/lib/vendas/abordagem'
import { Contactar } from '@/components/backoffice-contactar'
import { Copiar } from './copiar'
import { Marcar } from '../tarefas/marcar'

/**
 * O MEU DIA — o que esta pessoa tem para fazer hoje, e nada mais.
 *
 * PORQUE É QUE ISTO NÃO É A LISTA DE TAREFAS
 * A lista de tarefas mostra tudo: o que é para hoje, o que já passou, o que está feito, com
 * filtros e paginação. Serve para procurar. Não serve para COMEÇAR — e começar é o problema.
 * Quem abre o backoffice de manhã e vê uma tabela com cento e tal linhas fecha o separador.
 *
 * Aqui estão as de hoje, por ordem, com a razão de serem hoje e o rascunho já escrito. O trabalho
 * passa a ser ler, corrigir e enviar.
 *
 * O rascunho é sempre editável e nunca é enviado por nós. Ver `backoffice-dia-mensagem.ts`: a IA
 * redige, a pessoa envia. Não existe caminho neste código para um destes textos sair sozinho.
 *
 * A ORDEM É POR URGÊNCIA, E NÃO POR PRAZO. Isto foi medido a 01/10/2026 e era o defeito mais caro
 * deste ecrã: a leitura era `order('prazo')` ascendente com `limit(20)`, e havia 225 tarefas
 * atrasadas de 26 a 30 de Setembro contra 53 de hoje. Resultado: as vinte vagas eram SEMPRE
 * ocupadas pelas mais velhas — as menos prováveis de fechar — e **as de hoje nunca chegavam ao
 * ecrã**. Quem abria o painel via o cemitério e não via o lead que entrou de manhã, que é o único
 * que ainda responde.
 *
 * Agora lê-se mais do que cabe, pergunta-se a `lib/vendas/abordagem.ts` quanto vale cada negócio
 * agora, e mostram-se os primeiros. Uma tarefa ligada a quem respondeu ontem passa à frente de uma
 * de há cinco dias que nunca teve resposta — que é como qualquer vendedor trabalharia se tivesse a
 * informação à frente.
 *
 * RISCAR FAZ-SE AQUI, e isso é o remendo de um buraco medido: no dia em que se contaram as tarefas
 * marcadas como feitas, o número era zero. Este bloco dizia «Feito? Marca em Tarefas» — ou seja,
 * para fechar a primeira das doze tarefas a pessoa saía desta página, procurava a linha noutra lista
 * paginada, riscava, e voltava. Ninguém faz isso doze vezes. O botão passa a estar na linha, e é o
 * mesmo `Marcar` da página de tarefas: dois botões diferentes para a mesma escrita acabavam a
 * discordar um do outro sobre o que é «feita».
 */

interface Props {
  /** Os ids do âmbito desta pessoa — o seu, e os de quem lidera. */
  ids: readonly string[]
  /**
   * Quem está a olhar. Serve para uma coisa só: um responsável de equipa vê aqui tarefas dos
   * liderados, e riscar o trabalho de outra pessoa não é começar o dia dele — é dizer que ela fez
   * uma coisa que ele não sabe se ela fez.
   */
  pessoaId: string
}

interface TarefaDoDia {
  id: string
  titulo: string
  descricao: string | null
  rascunho: string | null
  papel: string | null
  negocio_id: string | null
  responsavel_id: string
  prazo: string | null
}

/** O que se mostra por linha, depois de a urgência decidir a ordem. */
interface LinhaDoDia extends TarefaDoDia {
  urgencia: number
  accao: string | null
  porque: string | null
  canal: string | null
  destino: string | null
  atrasada: boolean
  /** O negócio, para os botões de contacto. `null` nas tarefas de prospeção. */
  pessoa: PessoaDoNegocio | null
}

export async function OMeuDia({ ids, pessoaId }: Props) {
  if (!ids.length) return null

  const hoje = diaEmLisboa()
  const db = getSupabaseAdmin()

  /**
   * «até hoje» e não «igual a hoje»: uma tarefa de ontem que ficou por fazer continua a ser
   * trabalho de hoje. Escondê-la porque a data passou era a forma mais silenciosa de a perder.
   */
  const { data } = await db
    .from('vendas_tarefas')
    .select('id, titulo, descricao, rascunho, papel, negocio_id, responsavel_id, prazo')
    .in('responsavel_id', ids as string[])
    .eq('estado', 'aberta')
    .lte('prazo', hoje)
    .order('prazo', { ascending: false })
    .limit(120)

  const brutas = (data ?? []) as unknown as TarefaDoDia[]

  /**
   * Os negócios por trás das tarefas, numa só ida à base. Sem eles não há urgência nenhuma para
   * calcular: uma tarefa sozinha não sabe se a pessoa respondeu ontem ou nunca abriu a boca.
   */
  const idsNegocio = [...new Set(brutas.map((t) => t.negocio_id).filter(Boolean) as string[])]
  const negocios = new Map<string, PessoaDoNegocio>()
  if (idsNegocio.length) {
    const { data: ns } = await db
      .from('vendas_negocios')
      .select('id, nome, email, telefone, telegram_id, telegram_username, instagram_handle, estado, criado_em, origem')
      .in('id', idsNegocio)
    for (const n of (ns ?? []) as unknown as Array<PessoaDoNegocio & { id: string }>) {
      negocios.set(n.id, n)
    }
  }

  /**
   * QUANTAS VEZES JÁ SE TENTOU, contado pelas tarefas que existiram para aquele negócio.
   *
   * `vendas_negocios` não guarda a data do último toque nem um contador de tentativas, e sem isto a
   * sugestão dizia «primeiro contacto» por baixo de uma tarefa chamada «Segunda tentativa de
   * contacto» — duas frases a contradizerem-se no mesmo cartão. Contar as tarefas anteriores não
   * dá a data, mas dá o número, e o número já chega para não mentir.
   */
  const tentativasPorNegocio = new Map<string, number>()
  if (idsNegocio.length) {
    const { data: antigas } = await db
      .from('vendas_tarefas')
      .select('negocio_id')
      .in('negocio_id', idsNegocio)
      // Canceladas NÃO são tentativas: ninguém falou com ninguém. Contá-las dizia «4 tentativas»
      // por baixo de uma tarefa chamada «Segunda tentativa» — outra vez duas frases a discordar.
      .neq('estado', 'cancelada')
    for (const r of (antigas ?? []) as Array<{ negocio_id: string | null }>) {
      if (!r.negocio_id) continue
      tentativasPorNegocio.set(r.negocio_id, (tentativasPorNegocio.get(r.negocio_id) ?? 0) + 1)
    }
  }

  const agora = new Date()
  const tarefas: LinhaDoDia[] = brutas
    .map((t) => {
      const n = t.negocio_id ? negocios.get(t.negocio_id) : undefined
      const atrasada = Boolean(t.prazo && t.prazo < hoje)
      if (!n) {
        /**
         * Tarefas sem negócio — as de prospeção («Interagir: #hashtag»), que são 269 das 301.
         * Valem, mas valem menos do que falar com alguém que já está no pipeline: interagir num
         * post é semear, responder a quem respondeu é colher. E uma semeadura de há cinco dias
         * vale menos do que a de hoje, porque o post já passou.
         */
        return { ...t, urgencia: atrasada ? 60 : 300, accao: null, porque: null, canal: null, destino: null, atrasada, pessoa: null }
      }
      // Menos um: a tarefa que está a ser mostrada não é uma tentativa já feita.
      const feitas = Math.max(0, (tentativasPorNegocio.get(t.negocio_id as string) ?? 1) - 1)
      const passo = proximoPasso({ ...n, tentativas: feitas }, agora)
      return {
        ...t,
        // Um atraso tira peso mas não manda a tarefa para o fim: o que manda é o estado da pessoa.
        urgencia: Math.round(passo.urgencia * (atrasada ? 0.85 : 1)),
        accao: passo.accao,
        porque: passo.porque,
        canal: passo.canal,
        destino: passo.destino,
        atrasada,
        pessoa: n,
      }
    })
    .sort((a, b) => b.urgencia - a.urgencia || String(a.prazo).localeCompare(String(b.prazo)))
    .slice(0, 20)

  const atrasadas = brutas.filter((t) => t.prazo && t.prazo < hoje).length

  if (!tarefas.length) {
    return (
      <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">O teu dia</h2>
        <p className="mt-3 text-sm text-gray-400">
          Nada por fazer hoje. Se isto te parecer estranho, é porque é — fala com o Ricardo para
          confirmar que o motor do dia está ligado.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">O teu dia</h2>
        <span className="text-xs text-gray-600">
          {/* O número total aparece SEMPRE, e não só o das 20 mostradas: esconder a dívida não a
              paga, e quem só vê vinte não sabe que precisa de ajuda. */}
          {brutas.length} por fazer{atrasadas ? ` · ${atrasadas} de dias anteriores` : ''} · {hoje}
        </span>
      </div>

      <ol className="space-y-3">
        {tarefas.map((t, i) => (
          <li key={t.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D2A63C]/15 text-xs font-semibold text-[#D2A63C]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium leading-snug text-white">{t.titulo}</p>
                {t.responsavel_id !== pessoaId && (
                  <p className="text-xs text-[#D2A63C]">de alguém da tua equipa</p>
                )}
                {t.descricao && (
                  <p className="text-sm leading-relaxed text-gray-400">{t.descricao}</p>
                )}

                {/* O QUE FAZER E PORQUÊ. O motivo aparece sempre: um painel que manda fazer sem
                    dizer porquê ensina quem o lê a obedecer sem pensar — e depois a ignorá-lo. */}
                {t.accao && (
                  <div className="rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/[0.06] px-3 py-2">
                    <p className="text-[13px] font-medium text-[#E9C46A]">{t.accao}</p>
                    {t.porque && <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-400">{t.porque}</p>}
                  </div>
                )}

                {t.pessoa && <Contactar pessoa={t.pessoa} />}

                {t.atrasada && (
                  <p className="text-[11px] text-gray-600">Ficou de {t.prazo}</p>
                )}

                {t.rascunho && (
                  <div className="space-y-2 rounded-lg border border-gray-800 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Rascunho — lê, corrige, envia
                      </span>
                      <Copiar texto={t.rascunho} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {t.rascunho}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* O `#negocio-…` a seguir ao `?negocio=…` é o que faz o browser ATERRAR no
                      cartão. Sem ele, este link abria o pipeline no topo e a pessoa procurava o
                      negócio à mão numa lista de cinquenta — um link que não dá erro e não leva a
                      nenhum sítio. O `?negocio=` é o que o destaca lá (ver `pipeline/foco.ts`). */}
                  {t.negocio_id ? (
                    <a
                      href={`/backoffice/pipeline?negocio=${t.negocio_id}#negocio-${t.negocio_id}`}
                      className="text-xs text-[#D2A63C] hover:underline"
                    >
                      abrir no pipeline →
                    </a>
                  ) : (
                    <span />
                  )}

                  {/* Riscar na própria linha, sem sair da página. Só nas suas: ver o topo. */}
                  {t.responsavel_id === pessoaId && (
                    <Marcar id={t.id} feita={false} estado="aberta" prazo={t.prazo} />
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-gray-600">
        Isto é o que tem prazo até hoje. O resto — sem prazo, feitas, canceladas — está em{' '}
        <a href="/backoffice/tarefas" className="text-gray-400 hover:underline">
          Tarefas
        </a>
        .
      </p>
    </section>
  )
}
