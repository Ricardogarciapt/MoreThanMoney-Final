/**
 * PIPELINE — os negócios em que esta pessoa participa, por estado, com o passo seguinte de cada um.
 *
 * QUEM VÊ O QUÊ
 * Um negócio tem cinco atribuições possíveis (prospector, setter, closer, team leader, afiliado) e
 * nenhuma é obrigatória. «Os meus negócios» é, literalmente, aqueles em que o meu id está em
 * qualquer uma delas — e é isso que `negociosDoAmbito` faz, filtrando pela LISTA de ids do âmbito.
 * Um responsável de equipa tem na lista os liderados directos; sem equipa montada a lista tem um id
 * só e a página diz-lhe isso com palavras, para ele não concluir que a equipa não tem trabalho.
 *
 * O PASSO SEGUINTE VEM DE UM GUIÃO, NÃO DE UM MODELO
 * Cada negócio traz o movimento seguinte escrito (`lib/backoffice-playbook.ts`), lido da memória de
 * vendas da casa. Não é uma IA a improvisar por linha: o passo seguinte de um negócio em «marcado»
 * é sempre o mesmo passo, e um modelo a improvisá-lo inventa números — foi assim que apareceram as
 * promessas de rendimento que tivemos de ir tirar de texto público. Quando o passo precisa de
 * preços, eles vêm por função de `lib/escada-precos.ts`, nunca escritos à mão.
 *
 * A LISTA É PAGINADA, e isso não é uma melhoria de conforto: o `.limit(500)` que aqui estava
 * mostrava 500 negócios com o mesmo aspecto de estar completo, e o 501.º não dava erro nenhum —
 * desaparecia. Agora pede-se sempre uma linha a mais do que se mostra e a página DIZ que há mais.
 * Os filtros (estado, nome) vivem no endereço para o servidor já receber a pergunta certa.
 *
 * MOVER UM NEGÓCIO FAZ-SE AQUI, desde 2026-09-25 — mas o dinheiro continua de fora: marcar «ganho»
 * muda três campos do negócio e não cria venda nem comissão. A venda nasce do pagamento confirmado.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
// O âmbito vem do modelo de equipas (`ambitoDaPagina`) e já não do stub que devolvia lista vazia:
// sem isto, um responsável podia MEXER num negócio do liderado e não o VIA na lista.
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { negociosDoAmbito, papeisNoNegocio, participaNoNegocio, type NegocioLinha } from '@/lib/backoffice-negocios'
import { COLUNA_DO_PAPEL } from '@/lib/backoffice-escrita'
import { PAPEIS, type Papel } from '@/lib/backoffice-papeis'
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, dataCurta, ehEstadoFechado, ehEstadoPipeline } from '@/lib/backoffice-vista'
import { avisoParado, diasParado, sugestaoPara } from '@/lib/backoffice-playbook'
import { lerDoCatalogo, lerPagina, lerProcura } from '@/lib/backoffice-paginacao'
import { Contactar } from '@/components/backoffice-contactar'
import { Objeccoes } from '@/components/backoffice-objeccoes'
import { proximoPasso } from '@/lib/vendas/abordagem'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou, Vazio } from '../_partes/blocos'
import { Campo, ESTILO_CAMPO, Filtros, Paginacao, type Params } from '../_partes/navegar'
import { NegocioNovo } from './novo'
import { Mover } from './mover'
import { Trabalhar } from './trabalhar'
import { Historico } from './historico'
import { lerFoco, situacaoDoFoco } from './foco'
import { estaSemDono } from '@/lib/backoffice-bolsa'
import { Pegar } from './pegar'
import { accoesDeHojePorAgente, accoesDosAgentes, agentesDoPipeline, NOME_DA_ACCAO } from '@/lib/backoffice-agentes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pipeline · Backoffice MTM' }

const BASE = '/backoffice/pipeline'

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const acesso = await abrirPagina('bo.pipeline_proprio')
  if (!acesso.ok) {
    return (
      <SemAcesso
        motivo={acesso.motivo}
        oQue="O pipeline é de quem trabalha os negócios: setters, closers e responsáveis de equipa. Um afiliado divulga e recebe — não vê os contactos que outra pessoa trabalhou."
      />
    )
  }
  const { ctx } = acesso

  const { ambito, aviso } = await ambitoDaPagina(ctx, 'pipeline')

  // Os filtros vêm do endereço e passam por catálogo e limpeza antes de chegarem à consulta: o
  // estado só pode ser um dos oito, e a procura perde os caracteres que têm significado nos
  // filtros do PostgREST.
  const estadoFiltro = lerDoCatalogo(params.estado, ESTADOS_PIPELINE)
  const procura = lerProcura(params.procura)
  const pagina = lerPagina(params)
  const filtrado = !!estadoFiltro || !!procura
  // O negócio que a pessoa veio ver, quando chegou aqui por um link de uma tarefa. Não entra na
  // consulta (ver `foco.ts`): destaca.
  const foco = lerFoco(params.negocio)

  let negocios: NegocioLinha[]
  let haMais = false
  try {
    /**
     * A BOLSA DE LEADS entra na mesma lista.
     *
     * Decisão do dono a 26/09, depois de se medir 97 negócios e ZERO com vendedor: quem não tem
     * dono fica à vista de quem trabalha o pipeline. Sem isto havia um impasse — um lead sem dono
     * não aparecia a ninguém, logo ninguém se podia atribuir a ele, e ficava invisível para
     * sempre. Um negócio que JÁ tem dono continua invisível a quem não participa nele.
     */
    const lista = await negociosDoAmbito(getSupabaseAdmin(), ambito, {
      estado: estadoFiltro,
      procura,
      pagina,
      incluirSemDono: true,
    })
    negocios = lista.linhas
    haMais = lista.haMais
  } catch (e) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Pipeline" sub="Os negócios em que participas, por estado." />
        <Falhou oQue="Não consegui ler o pipeline." detalhe={e instanceof Error ? e.message : undefined} />
      </div>
    )
  }

  // DE QUEM É O NEGÓCIO, quando não é meu. A etiqueta «Da equipa» diz que não é dela mas não diz
  // de quem — e um responsável com quinze negócios da equipa não consegue trabalhar assim.
  const outros = ambito.ids.filter((id) => id !== ctx.userId)
  const nomes = outros.length > 0 ? await nomesDe(outros) : {}

  // OS AGENTES IA, ao lado das pessoas (06/10). Quem são, o que fizeram nestes negócios e quanto
  // trabalharam hoje — lido do registo `vendas_agentes_accoes`. Um humano tem de ver o que uma
  // máquina fez no negócio antes de lhe pegar.
  const [agentes, accoes, hojePorAgente] = await Promise.all([
    agentesDoPipeline(),
    accoesDosAgentes(negocios.map((n) => n.id)),
    accoesDeHojePorAgente(),
  ])
  const agentesVivos = Object.values(agentes).filter((a) => a.estado !== 'morto')

  const ondeEstaOFoco = situacaoDoFoco(
    foco,
    negocios.map((n) => n.id),
  )

  // Agrupar pela ordem do funil, e não pela ordem em que as linhas vieram: a página desenha-se pela
  // lista de estados, por isso um estado sem negócios continua a existir como coluna vazia — é
  // informação saber que não há ninguém em «qualificado».
  const porEstado = new Map<string, NegocioLinha[]>()
  for (const e of ESTADOS_PIPELINE) porEstado.set(e, [])
  const foraDoCatalogo: NegocioLinha[] = []
  for (const n of negocios) {
    if (ehEstadoPipeline(n.estado)) porEstado.get(n.estado)!.push(n)
    else foraDoCatalogo.push(n)
  }

  const vivos = ESTADOS_PIPELINE.filter((e) => !ehEstadoFechado(e))
  const fechados = ESTADOS_PIPELINE.filter(ehEstadoFechado)
  const emAberto = vivos.reduce((t, e) => t + porEstado.get(e)!.length, 0)

  return (
    <div className="space-y-8">
      {/* O `sub` dizia «mover um negócio faz-se no admin» — e o botão «Mover» está a vinte pixels
          dele desde 25/09. Uma instrução desactualizada no cabeçalho não é um detalhe de texto: é a
          página a ensinar a pessoa a não usar o que tem à frente. */}
      <Cabecalho
        titulo="Pipeline"
        sub="Os negócios em que participas, por estado, com o passo seguinte de cada um. Mover, escrever a nota, ocupar um papel e ver o histórico faz-se aqui — o que não se faz aqui é dinheiro: «ganho» não cria venda nem comissão."
      />

      {aviso && <Aviso>{aviso}</Aviso>}

      {/* Vim por um link de uma tarefa e o negócio não está à vista. Calar isto era deixar a pessoa
          a concluir que perdeu o negócio, quando o que tem é um filtro velho no endereço. */}
      {ondeEstaOFoco === 'fora-da-pagina' && (
        <Aviso>
          O negócio que vinhas ver não está nesta página.{' '}
          {filtrado ? (
            <>
              Há um filtro aplicado —{' '}
              <a href={`${BASE}?negocio=${foco}`} className="text-[#D2A63C] underline">
                limpa-o
              </a>{' '}
              para o procurar em toda a lista.
            </>
          ) : (
            'Pode estar numa página seguinte, ou já não participas nele.'
          )}
        </Aviso>
      )}

      {agentesVivos.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agentes IA no pipeline</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Trabalham os leads da bolsa ao teu lado: criam, qualificam, movem, agendam follow-ups e passam-te o
            negócio quando é preciso uma pessoa. Num negócio que é teu só podem deixar notas. Não enviam mensagens
            por aqui, não marcam «ganho» e não mexem em dinheiro.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agentesVivos.map((a) => (
              <Etiqueta key={a.id} tom="aviso">
                Agente IA · {a.papel}
                {hojePorAgente[a.id] ? ` · ${hojePorAgente[a.id]} hoje` : ''}
              </Etiqueta>
            ))}
          </div>
        </div>
      )}

      <NegocioNovo papeis={ctx.papeis} ehDono={ctx.admin} />

      <Filtros base={BASE} activo={filtrado}>
        <Campo nome="Estado">
          <select name="estado" defaultValue={estadoFiltro ?? ''} className={ESTILO_CAMPO}>
            <option value="">Todos</option>
            {ESTADOS_PIPELINE.map((e) => (
              <option key={e} value={e}>
                {ESTADO_PIPELINE_NOME[e]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo nome="Nome do contacto">
          <input name="procura" defaultValue={procura ?? ''} placeholder="parte do nome" className={ESTILO_CAMPO} />
        </Campo>
      </Filtros>

      {negocios.length === 0 ? (
        <Vazio
          titulo={filtrado ? 'Nenhum negócio com este filtro.' : 'Não tens negócios atribuídos.'}
          seguinte={
            filtrado
              ? 'O filtro está apertado, não é a lista que está vazia. Limpa-o para voltares a ver tudo o que é teu.'
              : 'Um negócio aparece aqui quando o teu nome está numa das atribuições dele (prospector, setter, closer, responsável ou afiliado). Cria-o em cima — quem cria fica atribuído, senão ele nascia sem dono e desaparecia.'
          }
        />
      ) : (
        <>
          {/* A contagem por estado, em cima. É o que responde a «onde é que estou preso» sem se ter
              de percorrer a lista toda. */}
          <div className="flex flex-wrap gap-2">
            {ESTADOS_PIPELINE.map((e) => {
              const n = porEstado.get(e)!.length
              return (
                <span
                  key={e}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    n === 0 ? 'border-gray-800 text-gray-600' : 'border-[#D2A63C]/40 text-gray-200'
                  }`}
                >
                  {ESTADO_PIPELINE_NOME[e]} <strong className="ml-1">{n}</strong>
                </span>
              )
            })}
          </div>

          {/* A contagem é DESTA PÁGINA e diz-se que é: um total que na verdade conta 50 linhas de
              300 é o mesmo erro do limite silencioso, agora escrito por extenso. */}
          <p className="text-sm text-gray-400">
            {emAberto === 0
              ? 'Nada em aberto nesta página — o que aqui está está ganho ou perdido.'
              : `${emAberto} negócio${emAberto === 1 ? '' : 's'} em aberto ${haMais || pagina.pagina > 1 ? 'nesta página' : 'em total'}.`}
          </p>

          {[...vivos, ...fechados].map((estado) => {
            const lista = porEstado.get(estado)!
            if (lista.length === 0) return null
            const sugestao = sugestaoPara(estado)
            return (
              <section key={estado} className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                    {ESTADO_PIPELINE_NOME[estado]}
                  </h2>
                  <span className="text-xs text-gray-600">{lista.length}</span>
                </div>

                {/* O apoio: o movimento, a razão dele, e por onde abrir. A razão está lá porque uma
                    sugestão sem razão é uma ordem, e uma ordem sem razão ignora-se. */}
                <div className="rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4">
                  <div className="text-sm font-semibold text-[#D2A63C]">Passo seguinte: {sugestao.passo}</div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{sugestao.porque}</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-300">{sugestao.abrir}</p>
                </div>

                <div className="space-y-2">
                  {lista.map((n) => {
                    const dias = diasParado(n.atualizado_em)
                    const parado = ehEstadoFechado(estado) ? null : avisoParado(dias)
                    const meus = papeisNoNegocio(n, ctx.userId)
                    const emFoco = n.id === foco
                    return (
                      <div
                        key={n.id}
                        // A âncora e o `scroll-mt` são o que faz o link da tarefa aterrar no
                        // negócio em vez do topo da lista. O anel dourado fica porque, depois de
                        // rolar, a pessoa tem de saber QUAL das linhas é a dela.
                        id={`negocio-${n.id}`}
                        className={`scroll-mt-20 rounded-lg border bg-gray-900/40 p-4 ${
                          emFoco ? 'border-[#D2A63C] ring-1 ring-[#D2A63C]/40' : 'border-gray-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold text-white">{n.nome}</span>
                          <span className="text-xs text-gray-500">
                            mexeu {dataCurta(n.atualizado_em)}
                            {dias !== null && dias > 0 ? ` · há ${dias} dia${dias === 1 ? '' : 's'}` : ''}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {meus.length > 0 ? (
                            meus.map((p) => (
                              <Etiqueta key={p} tom="aviso">
                                {p}
                              </Etiqueta>
                            ))
                          ) : (
                            <Etiqueta>
                              {outros
                                .filter((id) => participaNoNegocio(n, id))
                                .map((id) => nomes[id])
                                .filter(Boolean)
                                .join(', ') || 'Da equipa'}
                            </Etiqueta>
                          )}
                          {n.agente_id && (
                            <Etiqueta tom="aviso">
                              Agente IA · {agentes[n.agente_id]?.papel ?? 'agente'}
                            </Etiqueta>
                          )}
                          {typeof n.agente_pontuacao === 'number' && (
                            <Etiqueta tom={n.agente_pontuacao >= 70 ? 'bom' : 'neutro'}>
                              pontuação {n.agente_pontuacao}
                            </Etiqueta>
                          )}
                          {n.pack_previsto && <Etiqueta>{n.pack_previsto}</Etiqueta>}
                          {n.origem && <Etiqueta>via {n.origem}</Etiqueta>}
                        </div>
                        {n.motivo_perda && (
                          <p className="mt-2 text-xs text-gray-400">
                            <span className="text-gray-500">Motivo: </span>
                            {n.motivo_perda}
                          </p>
                        )}
                        {n.nota && <p className="mt-2 text-xs leading-relaxed text-gray-400">{n.nota}</p>}
                        {n.agente_qualificacao && (
                          <p className="mt-2 text-xs leading-relaxed text-gray-400">
                            <span className="text-gray-500">Qualificação do agente: </span>
                            {n.agente_qualificacao}
                          </p>
                        )}
                        {(accoes[n.id] ?? []).length > 0 && (
                          <ul className="mt-2 space-y-1 border-l border-[#D2A63C]/30 pl-3">
                            {(accoes[n.id] ?? []).map((a, i) => (
                              <li key={i} className="text-[11.5px] leading-snug text-gray-400">
                                <span className="text-[#D2A63C]">Agente IA · {agentes[a.agente_id]?.papel ?? 'agente'}</span>{' '}
                                {NOME_DA_ACCAO[a.accao] ?? a.accao}
                                <span className="text-gray-600"> · {dataCurta(a.criado_em)}</span>
                                {a.texto && <span className="text-gray-500"> — {a.texto.slice(0, 220)}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {parado && <p className="mt-2 text-xs font-medium text-amber-400/90">{parado}</p>}

                        {/* POR ONDE SE FALA, e o que fazer a seguir.
                            O `sugestaoPara` que já existia diz o que se faz NAQUELE ESTADO — é o
                            guião. Isto diz por onde e QUANDO, que depende da pessoa e não do
                            estado: quem respondeu ontem trata-se de outra maneira de quem nunca
                            abriu a boca, mesmo estando os dois em «lead».
                            A decisão vem de lib/vendas/abordagem.ts, que tem guarda. */}
                        <div className="mt-3 space-y-1.5">
                          {(() => {
                            const passo = proximoPasso(n)
                            return (
                              <p className="text-[12.5px] leading-snug">
                                <span className="font-medium text-[#E9C46A]">{passo.accao}</span>
                                <span className="text-gray-500"> — {passo.porque}</span>
                              </p>
                            )
                          })()}
                          <Contactar pessoa={n} />
                          {/* O que ele respondeu, e o que isso quer mesmo dizer. Só aparece a
                              quem já pegou no negócio: perguntar «o que é que ele disse» sobre um
                              lead que não é de ninguém é perguntar ao vento. */}
                          {!estaSemDono(n) && <Objeccoes id={n.id} nota={n.nota} />}
                        </div>
                        {/* Um lead da bolsa não se move nem se trabalha antes de ter dono: primeiro
                            pega-se. Mostrar «Mover» num negócio que não é de ninguém convidava a
                            uma escrita que o servidor recusa, e a recusa parece avaria. */}
                        {estaSemDono(n) ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-gray-500">
                              Este lead não é de ninguém. Pega nele e passa a ser teu.
                            </p>
                            <Pegar id={n.id} nome={n.nome} />
                          </div>
                        ) : (
                          <>
                        {/* Mover é um acto com autor: o evento que fica na base diz quem o fez. */}
                        <Mover id={n.id} estado={estado} nome={n.nome} />
                        {/* Os lugares que esta pessoa pode ocupar sozinha: vagos E de um papel que
                            ela tem. Oferecer um papel que ela não tem era oferecer um botão que o
                            servidor recusa — e a recusa parece avaria. */}
                        <Trabalhar
                          id={n.id}
                          nota={n.nota}
                          vagos={papeisQuePodeOcupar(n, ctx.papeis, ctx.admin)}
                          meus={papeisQueOcupa(n, ctx.userId)}
                        />
                        {/* «Quem é que moveu isto», respondido pela base e não pela memória de duas
                            pessoas. Lê-se só quando se abre — ver `historico.tsx`. */}
                        <Historico id={n.id} />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}

          <Paginacao base={BASE} params={params} pagina={pagina} mostradas={negocios.length} haMais={haMais} />

          {/* Um estado que não está no catálogo não se esconde: significa que alguém escreveu na
              base um valor que o código não conhece, e esconder isso fazia desaparecer negócios. */}
          {foraDoCatalogo.length > 0 && (
            <Falhou
              oQue={`${foraDoCatalogo.length} negócio(s) com um estado que não reconheço.`}
              detalhe={[...new Set(foraDoCatalogo.map((n) => n.estado))].join(', ')}
            />
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-gray-600">
        Os contactos desta página são da empresa e estão aqui porque fazes parte do negócio deles.
        Não se copiam para fora, e «ganho» não quer dizer que entrou dinheiro — isso é a venda
        confirmada, e é ela que faz nascer a comissão no teu extracto.
      </p>
    </div>
  )
}

/**
 * Os papéis que esta pessoa pode ocupar NESTE negócio sozinha: os que estão vagos e que ela tem.
 *
 * O dono não tem papéis atribuídos (tem tudo por ser dono) e por isso pode ocupar qualquer um dos
 * cinco — é a mesma excepção que a criação de negócios faz, e pela mesma razão.
 */
function papeisQuePodeOcupar(negocio: NegocioLinha, papeis: Papel[], ehDono: boolean): Papel[] {
  const seus = ehDono ? [...PAPEIS] : papeis
  return seus.filter((p) => negocio[COLUNA_DO_PAPEL[p]] === null)
}

/** Os papéis que ela ocupa neste negócio — os que pode largar sem pedir a ninguém. */
function papeisQueOcupa(negocio: NegocioLinha, pessoaId: string): Papel[] {
  return PAPEIS.filter((p) => negocio[COLUNA_DO_PAPEL[p]] === pessoaId)
}
