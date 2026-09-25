/**
 * A MINHA EQUIPA — quem responde a mim, o que cada um está a trabalhar, e o que cada um ganhou.
 *
 * Esta página era um texto a explicar o que ainda não existia. O modelo de equipas (migração 131)
 * aterrou e ela passa a mostrar o que prometia. O que mudou não foi só ela: mudou a função de onde
 * vem o âmbito (`lib/backoffice-equipa.ts`), e é por isso que o extracto, o pipeline e as tarefas
 * passaram a incluir os liderados sem se lhes ter tocado.
 *
 * O DONO DECIDIU QUE O LÍDER VÊ AS LINHAS, não só os totais. Um total fecha a conversa antes de
 * ela começar: «a Ana fez 800€» não diz se foram oito vendas pequenas ou uma grande, e é
 * exactamente isso que um responsável precisa de saber para a ajudar. Por isso o extracto dos
 * liderados aparece movimento a movimento, com o nome de quem ganhou cada um.
 *
 * TRÊS ÂMBITOS, TRÊS CAPACIDADES — e não um `if (é líder) mostra tudo`.
 * A composição da equipa abre com `bo.equipa_ver`; o pipeline dos liderados só aparece a quem tem
 * `bo.pipeline_equipa`; o extracto deles só a quem tem `bo.extracto_equipa`. Cada bloco pergunta ao
 * seu âmbito (`ambitoDaPagina`), e um âmbito que não inclua os liderados devolve uma lista sem eles
 * — não há caminho por onde um bloco mostre gente que outro bloco esconderia.
 *
 * UM NÍVEL, SEM CADEIA. Os membros são os DIRECTOS. Se um deles liderar a sua própria equipa, essa
 * equipa não sobe — decisão do dono, garantida em `lib/backoffice-equipas.ts` e com guarda própria.
 *
 * SÓ LEITURA. Montar equipas (criar, mover, retirar) é um acto do dono e faz-se no admin.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PAPEL_NOME, pode } from '@/lib/backoffice-papeis'
import { ambitoDaPagina } from '@/lib/backoffice-equipa'
import { equipasQueLidera, membrosDasEquipas, equipaDoMembro } from '@/lib/backoffice-equipas'
import { papeisActivosDeVarios, type ClienteLeitura } from '@/lib/backoffice-papeis-leitura'
import { negociosDoAmbito, tarefasDoAmbito, type NegocioLinha, type TarefaLinha } from '@/lib/backoffice-negocios'
import { extractoDoAmbito, somarExtracto, type LinhaExtracto } from '@/lib/vendas/extracto'
import { centimosEmEuros } from '@/lib/vendas/calculo'
import {
  ESTADO_COMISSAO_NOME,
  ESTADO_PIPELINE_NOME,
  ORIGEM_NOME,
  dataCurta,
  ehEstadoFechado,
  ehEstadoPipeline,
  estadoComissao,
  situacaoDoPrazo,
  valorComSinal,
} from '@/lib/backoffice-vista'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Numero, Vazio } from '../_partes/blocos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'A minha equipa · Backoffice MTM' }

const TOM_ESTADO: Record<string, 'neutro' | 'bom' | 'mau' | 'aviso'> = {
  pendente: 'neutro',
  aprovada: 'aviso',
  paga: 'bom',
  cancelada: 'neutro',
  estornada: 'mau',
  outro: 'neutro',
}

/** Uma pessoa da equipa, já com tudo o que o ecrã precisa de dizer sobre ela. */
interface MembroNoEcra {
  id: string
  nome: string
  equipaNome: string
  desde: string | null
  papeis: string[]
  emAberto: NegocioLinha[]
  tarefasAbertas: TarefaLinha[]
  atrasadas: number
  saldoCents: number
  porPagarCents: number
}

export default async function EquipaPage() {
  // A composição da equipa abre com `bo.equipa_ver` — a mesma capacidade com que o menu mostra o
  // link. Abrir com outra deixava um link no menu para uma página que recusa.
  const acesso = await abrirPagina('bo.equipa_ver')
  if (!acesso.ok) {
    return (
      <SemAcesso
        motivo={acesso.motivo}
        oQue="Esta página é de quem responde por uma equipa. Quem vende sozinho vê o seu percurso no pipeline e o seu dinheiro no extracto."
      />
    )
  }
  const { ctx } = acesso
  const supabase = getSupabaseAdmin()

  // Os âmbitos são pedidos em paralelo e cada um traz a sua capacidade já aplicada. Um bloco que
  // lesse a lista de membros e consultasse a base por ela passava ao lado da capacidade da família.
  const [equipas, aPipeline, aExtracto, aTarefas, respondeA] = await Promise.all([
    equipasQueLidera(supabase, ctx.userId),
    ambitoDaPagina(ctx, 'pipeline'),
    ambitoDaPagina(ctx, 'extracto'),
    ambitoDaPagina(ctx, 'tarefas'),
    equipaDoMembro(supabase, ctx.userId),
  ])

  const pertencas = await membrosDasEquipas(supabase, equipas.map((e) => e.id))
  const nomeDaEquipa = new Map(equipas.map((e) => [e.id, e.nome]))
  // Sem o próprio: o líder não é membro da sua equipa (a migração impede-o), e um líder que
  // aparecesse na sua própria lista lia-se como estando a responder a si mesmo.
  const membros = pertencas.filter((p) => p.membroId !== ctx.userId)
  const idsMembros = [...new Set(membros.map((m) => m.membroId))]

  const [perfis, papeis] = await Promise.all([
    idsMembros.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', idsMembros)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    papeisActivosDeVarios(supabase as unknown as ClienteLeitura, idsMembros),
  ])
  const nomes = new Map(
    ((perfis.data ?? []) as Array<Record<string, unknown>>).map((p) => [
      String(p.id),
      (p.full_name as string) || (p.email as string) || '—',
    ]),
  )

  // As três leituras. Falharem não pode rebentar a página inteira: uma equipa que não se consegue
  // desenhar porque o extracto está em baixo deixa o líder sem saber sequer quem ela é. Cada bloco
  // diz por si se não conseguiu ler.
  const [negocios, extracto, tarefas] = await Promise.all([
    negociosDoAmbito(supabase, aPipeline.ambito).catch(() => null),
    extractoDoAmbito(supabase, aExtracto.ambito).catch(() => null),
    tarefasDoAmbito(supabase, aTarefas.ambito).catch(() => null),
  ])

  // O extracto do LÍDER não é o da equipa: mostrar as linhas dele no meio das dos liderados fazia
  // com que a soma da equipa incluísse o próprio, e um responsável a ver-se dentro do seu próprio
  // ranking de equipa é uma conta que ninguém consegue fechar.
  const extractoEquipa = (extracto ?? []).filter((l) => l.pessoa_id && l.pessoa_id !== ctx.userId)

  const doEcra: MembroNoEcra[] = membros.map((m) => {
    const id = m.membroId
    const seus = (negocios ?? []).filter((n) => ehDele(n, id))
    const suasTarefas = (tarefas ?? []).filter((t) => t.responsavel_id === id && t.estado === 'aberta')
    const linhas = extractoEquipa.filter((l) => l.pessoa_id === id)
    const { totais } = somarExtracto(linhas)
    return {
      id,
      nome: nomes.get(id) ?? '—',
      equipaNome: nomeDaEquipa.get(m.equipaId) ?? '—',
      desde: m.desde,
      papeis: (papeis[id] ?? []).map((p) => PAPEL_NOME[p]),
      emAberto: seus.filter((n) => !ehEstadoPipeline(n.estado) || !ehEstadoFechado(n.estado)),
      tarefasAbertas: suasTarefas,
      atrasadas: suasTarefas.filter((t) => situacaoDoPrazo(t.prazo) === 'atrasada').length,
      saldoCents: totais.saldo_cents,
      porPagarCents: totais.por_pagar_cents,
    }
  })

  const somaEquipa = somarExtracto(extractoEquipa)
  const veExtractoEquipa = pode(ctx.capacidades, 'bo.extracto_equipa')
  const vePipelineEquipa = pode(ctx.capacidades, 'bo.pipeline_equipa')

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo="A minha equipa"
        sub="Quem responde a ti, o que cada um está a trabalhar, e o que cada um ganhou. Montar equipas faz-se no admin — aqui vês a tua e o trabalho dela."
      />

      {respondeA && (
        <p className="text-sm text-gray-400">
          Tu respondes a <strong className="text-gray-200">{respondeA.equipa.nome}</strong>. O que
          vês nesta página é a equipa que responde a ti, não a de cima.
        </p>
      )}

      {membros.length === 0 ? (
        <Aviso>
          <strong className="text-[#D2A63C]">Ainda não tens equipa montada.</strong> O sistema não
          tem ninguém registado como teu liderado. Não quer dizer que a tua equipa não tenha
          resultados — quer dizer que ela ainda não foi montada no admin. Fala com o Ricardo para
          ele ligar as pessoas à tua equipa; assim que o fizer, elas aparecem aqui e também no teu
          extracto, no teu pipeline e nas tuas tarefas.
        </Aviso>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero nome="Pessoas na equipa" valor={String(membros.length)} nota="Membros directos. Se um deles liderar a sua própria equipa, essa não entra aqui." />
            <Numero
              nome="Negócios em aberto"
              valor={String(doEcra.reduce((t, m) => t + m.emAberto.length, 0))}
              nota="Dos teus liderados, sem contar ganhos nem perdidos."
            />
            <Numero
              nome="Tarefas atrasadas"
              valor={String(doEcra.reduce((t, m) => t + m.atrasadas, 0))}
              tom={doEcra.some((m) => m.atrasadas > 0) ? 'negativo' : 'normal'}
              nota="O que já passou do prazo na equipa. É a conta feita agora, não um estado guardado."
            />
            <Numero
              nome="A receber pela equipa"
              valor={veExtractoEquipa ? centimosEmEuros(somaEquipa.totais.saldo_cents) : '—'}
              tom="destaque"
              nota={veExtractoEquipa ? 'O que está por pagar aos teus liderados, menos devoluções. Não inclui o teu.' : 'O teu papel não abre o extracto da equipa.'}
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Quem responde a ti ({membros.length})
            </h2>
            <div className="space-y-3">
              {doEcra.map((m) => (
                <div key={m.id} className="rounded-lg border border-gray-800 bg-gray-900/40 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-white">{m.nome}</span>
                    <span className="text-xs text-gray-500">
                      {m.equipaNome}
                      {m.desde ? ` · desde ${dataCurta(m.desde)}` : ''}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.papeis.length > 0 ? (
                      m.papeis.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)
                    ) : (
                      <Etiqueta>Sem papel atribuído</Etiqueta>
                    )}
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-600">Em aberto</dt>
                      <dd className="text-gray-200">
                        {vePipelineEquipa ? `${m.emAberto.length} negócio${m.emAberto.length === 1 ? '' : 's'}` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-600">Tarefas</dt>
                      <dd className={m.atrasadas > 0 ? 'text-red-400' : 'text-gray-200'}>
                        {m.tarefasAbertas.length} por fazer
                        {m.atrasadas > 0 ? ` · ${m.atrasadas} atrasada${m.atrasadas === 1 ? '' : 's'}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-600">A receber</dt>
                      <dd className="text-gray-200">
                        {veExtractoEquipa ? centimosEmEuros(m.saldoCents) : '—'}
                      </dd>
                    </div>
                  </dl>

                  {/* O que ele está a trabalhar, pelos mesmos estados do pipeline do líder. Sem
                      isto, «3 negócios em aberto» não diz onde é que a pessoa está presa. */}
                  {vePipelineEquipa && m.emAberto.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {m.emAberto.slice(0, 6).map((n) => (
                        <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-800/70 bg-gray-900/30 px-3 py-2">
                          <span className="text-sm text-gray-300">{n.nome}</span>
                          <span className="flex items-center gap-2">
                            {n.pack_previsto && <Etiqueta>{n.pack_previsto}</Etiqueta>}
                            <Etiqueta tom="aviso">
                              {ehEstadoPipeline(n.estado) ? ESTADO_PIPELINE_NOME[n.estado] : n.estado}
                            </Etiqueta>
                            <span className="text-xs text-gray-600">mexeu {dataCurta(n.atualizado_em)}</span>
                          </span>
                        </li>
                      ))}
                      {m.emAberto.length > 6 && (
                        <li className="px-3 text-xs text-gray-600">
                          e mais {m.emAberto.length - 6} — a lista toda está no teu pipeline.
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* O EXTRACTO DOS LIDERADOS, linha a linha. Decisão do dono: um total fecha a conversa
              antes de ela começar — o líder precisa de ver de onde veio cada euro para ajudar. */}
          {veExtractoEquipa && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                O que a equipa ganhou {extractoEquipa.length > 0 && <span className="text-gray-600">({extractoEquipa.length} movimentos)</span>}
              </h2>
              {extracto === null ? (
                <Aviso>
                  Não consegui ler o extracto da equipa agora. Isto é uma falha de leitura, não um
                  zero: recarrega e, se continuar, diz ao Ricardo.
                </Aviso>
              ) : extractoEquipa.length === 0 ? (
                <Vazio
                  titulo="A tua equipa ainda não tem movimentos."
                  seguinte="As comissões aparecem aqui quando uma venda de um liderado é confirmada — o pagamento tem de entrar primeiro. O teu próprio extracto não conta para esta lista: está em «O meu extracto»."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-gray-900/60 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Data</th>
                        <th className="px-3 py-2 font-medium">Pessoa</th>
                        <th className="px-3 py-2 font-medium">Origem</th>
                        <th className="px-3 py-2 font-medium">Detalhe</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/70">
                      {extractoEquipa.map((l: LinhaExtracto) => {
                        const valor = valorComSinal(l)
                        const estado = estadoComissao(String(l.estado))
                        return (
                          <tr key={`${l.origem}-${l.id}`} className="text-gray-300">
                            <td className="whitespace-nowrap px-3 py-2 text-gray-400">{dataCurta(l.em)}</td>
                            <td className="px-3 py-2 text-gray-400">{(l.pessoa_id && nomes.get(l.pessoa_id)) || '—'}</td>
                            <td className="px-3 py-2">
                              <Etiqueta tom={l.origem === 'mlm' ? 'neutro' : 'aviso'}>{ORIGEM_NOME[l.origem]}</Etiqueta>
                            </td>
                            <td className="px-3 py-2">{l.detalhe || '—'}</td>
                            <td className="px-3 py-2">
                              <Etiqueta tom={TOM_ESTADO[estado]}>{ESTADO_COMISSAO_NOME[estado]}</Etiqueta>
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${valor < 0 ? 'text-red-400' : 'text-gray-100'}`}>
                              {centimosEmEuros(valor)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs leading-relaxed text-gray-600">
                Esta lista é a dos teus liderados. O teu próprio dinheiro está em «O meu extracto» —
                separados de propósito, para a conta da equipa não te incluir a ti.
              </p>
            </section>
          )}

          {!veExtractoEquipa && (
            <Aviso>
              Vês a composição da tua equipa, mas o teu papel não abre o extracto dela. Se devias ver
              o que cada um ganhou, fala com o Ricardo.
            </Aviso>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-gray-600">
        Só vês os membros DIRECTOS das equipas que lideras. Se um deles liderar a sua própria
        equipa, essa equipa não aparece aqui — foi uma decisão explícita, para ninguém ver linhas de
        gente que nunca conheceu. Esta página mostra; montar equipas faz-se no admin.
      </p>
    </div>
  )
}

/** O negócio é desta pessoa se o id dela estiver em qualquer uma das cinco atribuições. */
function ehDele(n: NegocioLinha, id: string): boolean {
  return (
    n.prospector_id === id ||
    n.setter_id === id ||
    n.closer_id === id ||
    n.team_leader_id === id ||
    n.afiliado_id === id
  )
}
