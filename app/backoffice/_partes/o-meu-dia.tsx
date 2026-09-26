import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { diaEmLisboa } from '@/lib/backoffice-dia-regras'
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
    .order('prazo', { ascending: true })
    .order('criado_em', { ascending: true })
    .limit(20)

  const tarefas = (data ?? []) as unknown as TarefaDoDia[]

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
          {tarefas.length} por fazer · {hoje}
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
