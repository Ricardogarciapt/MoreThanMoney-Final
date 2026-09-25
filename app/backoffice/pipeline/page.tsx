/**
 * PIPELINE — os negócios em que esta pessoa participa, por estado, com o passo seguinte de cada um.
 *
 * QUEM VÊ O QUÊ
 * Um negócio tem cinco atribuições possíveis (prospector, setter, closer, team leader, afiliado) e
 * nenhuma é obrigatória. «Os meus negócios» é, literalmente, aqueles em que o meu id está em
 * qualquer uma delas — e é isso que `negociosDoAmbito` faz, filtrando pela LISTA de ids do âmbito.
 * Sem modelo de equipa, essa lista tem um id só e um responsável vê os dele; a página diz-lhe isso
 * com palavras, para ele não concluir que a equipa não tem trabalho.
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
import { ambitoDeLeitura, pode } from '@/lib/backoffice-papeis'
import { lideradosDe, AVISO_EQUIPA_POR_CONFIGURAR } from '@/lib/backoffice-equipa'
import { negociosDoAmbito, papeisNoNegocio, type NegocioLinha } from '@/lib/backoffice-negocios'
import { ESTADOS_PIPELINE, ESTADO_PIPELINE_NOME, dataCurta, ehEstadoFechado, ehEstadoPipeline } from '@/lib/backoffice-vista'
import { avisoParado, diasParado, sugestaoPara } from '@/lib/backoffice-playbook'
import { lerDoCatalogo, lerPagina, lerProcura } from '@/lib/backoffice-paginacao'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou, Vazio } from '../_partes/blocos'
import { Campo, ESTILO_CAMPO, Filtros, Paginacao, type Params } from '../_partes/navegar'
import { NegocioNovo } from './novo'
import { Mover } from './mover'

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

  const liderados = await lideradosDe(ctx)
  const ambito = ambitoDeLeitura(ctx.capacidades, ctx.userId, 'pipeline', liderados)
  const veEquipa = pode(ctx.capacidades, 'bo.pipeline_equipa')

  // Os filtros vêm do endereço e passam por catálogo e limpeza antes de chegarem à consulta: o
  // estado só pode ser um dos oito, e a procura perde os caracteres que têm significado nos
  // filtros do PostgREST.
  const estadoFiltro = lerDoCatalogo(params.estado, ESTADOS_PIPELINE)
  const procura = lerProcura(params.procura)
  const pagina = lerPagina(params)
  const filtrado = !!estadoFiltro || !!procura

  let negocios: NegocioLinha[]
  let haMais = false
  try {
    const lista = await negociosDoAmbito(getSupabaseAdmin(), ambito, { estado: estadoFiltro, procura, pagina })
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
      <Cabecalho
        titulo="Pipeline"
        sub="Os negócios em que participas, por estado, com o passo seguinte de cada um. Mover um negócio faz-se no admin — aqui vês onde ele está e o que falta fazer."
      />

      {veEquipa && <Aviso>Tens o papel que dá acesso ao pipeline da tua equipa. {AVISO_EQUIPA_POR_CONFIGURAR}</Aviso>}

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
                    return (
                      <div key={n.id} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
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
                            <Etiqueta>Da equipa</Etiqueta>
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
                        {parado && <p className="mt-2 text-xs font-medium text-amber-400/90">{parado}</p>}
                        {/* Mover é um acto com autor: o evento que fica na base diz quem o fez. */}
                        <Mover id={n.id} estado={estado} nome={n.nome} />
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
