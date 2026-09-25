/**
 * O MEU EXTRACTO — o que ganhei, de onde veio, e o que me falta receber.
 *
 * É a página com que a equipa discute dinheiro, e por isso tem duas obrigações que as outras não
 * têm: fechar ao cêntimo, e nunca mostrar a linha de outra pessoa.
 *
 * COMO É QUE A SEGUNDA SE GARANTE
 * Não com um `if`. O âmbito de leitura (`ambitoDeLeitura`) devolve uma LISTA de ids, e é essa lista
 * que entra no `.in('pessoa_id', …)` da consulta. Uma consulta filtrada por lista não tem como
 * esquecer-se do filtro; um `if (é responsável) lê tudo` colocado antes da consulta esquece-se — e
 * o que se esquece aqui é o dinheiro dos colegas. A lista tem o próprio e, quando há equipa montada
 * E o papel que a abre, os liderados directos (ver `lib/backoffice-equipa.ts`). Em qualquer falha
 * fica só o próprio.
 *
 * UMA SÓ LISTA, DUAS ORIGENS
 * A vista `vendas_extracto` junta as comissões da equipa de vendas e o residual da rede binária.
 * Foi um pedido explícito do dono: «uma pessoa pode ganhar pelos dois, mas tem de ver UM só
 * extracto». Dois ecrãs separados obrigavam-na a somar de cabeça, e a quem não bate o total só
 * sobra desconfiar. A coluna `origem` mantém à vista de onde veio cada linha.
 *
 * O QUE FOI DEVOLVIDO APARECE A NEGATIVO
 * Uma comissão paga e depois devolvida pelo cliente não se apaga nem se esconde: fica na lista com
 * o valor a vermelho e a menos, e desconta no saldo. Um extracto que só soma acaba a mandar pagar
 * outra vez sobre dinheiro que voltou para trás.
 *
 * O FILTRO POR DATA NÃO É CONFORTO. A leitura tem um tecto de linhas (`LIMITE_EXTRACTO`), e um
 * tecto silencioso num extracto é a pior espécie de mentira: os totais fechavam ao cêntimo sobre
 * metade dos movimentos e ninguém tinha como saber. Por isso a página compara o que recebeu com o
 * tecto e, quando bate nele, DIZ que está a ver uma parte e manda apertar as datas.
 *
 * A tabela pagina-se em memória, e de propósito: os totais em cima têm de somar o PERÍODO todo e
 * não a página. Uma paginação na base dava quatro números que mudavam ao virar a página.
 *
 * SÓ LEITURA. Aprovar e pagar comissões é um acto do dono, e faz-se no admin.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
// O âmbito vem do modelo de equipas; o tecto de linhas vem do extracto. As duas coisas são
// precisas ao mesmo tempo: o âmbito diz DE QUEM são as linhas, o tecto diz quando o total em cima
// deixou de ser o do período inteiro.
import { ambitoDaPagina, nomesDe } from '@/lib/backoffice-equipa'
import { LIMITE_EXTRACTO, extractoDoAmbito, somarExtracto, type LinhaExtracto } from '@/lib/vendas/extracto'
import { centimosEmEuros } from '@/lib/vendas/calculo'
import {
  ESTADO_COMISSAO_NOME,
  ORIGEM_NOME,
  dataCurta,
  estadoComissao,
  valorComSinal,
} from '@/lib/backoffice-vista'
import { fatiar, fimDoDia, inicioDoDia, lerDia, lerPagina } from '@/lib/backoffice-paginacao'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Aviso, Cabecalho, Etiqueta, Falhou, Numero, Vazio } from '../_partes/blocos'
import { Campo, ESTILO_CAMPO, Filtros, Paginacao, type Params } from '../_partes/navegar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'O meu extracto · Backoffice MTM' }

const TOM_ESTADO: Record<string, 'neutro' | 'bom' | 'mau' | 'aviso'> = {
  pendente: 'neutro',
  aprovada: 'aviso',
  paga: 'bom',
  cancelada: 'neutro',
  estornada: 'mau',
  outro: 'neutro',
}

const BASE = '/backoffice/extracto'

export default async function ExtractoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const acesso = await abrirPagina('bo.extracto_proprio')
  if (!acesso.ok) {
    return <SemAcesso motivo={acesso.motivo} oQue="O extracto é de quem recebe comissões: afiliados, setters, closers, prospectores e responsáveis de equipa." />
  }
  const { ctx } = acesso

  // O âmbito e a frase que o explica vêm da mesma chamada, para não haver hipótese de a página
  // filtrar por uma lista e dizer à pessoa que está a ver outra.
  const { ambito, aviso } = await ambitoDaPagina(ctx, 'extracto')

  const desde = lerDia(params.desde)
  const ate = lerDia(params.ate)
  const pagina = lerPagina(params)

  let linhas: LinhaExtracto[]
  try {
    linhas = await extractoDoAmbito(getSupabaseAdmin(), ambito, {
      desde: inicioDoDia(desde),
      // O «até» é o fim do dia: um `lte` sobre a meia-noite escondia o dia inteiro, e o filtro
      // parecia estar a perder linhas por avaria.
      ate: fimDoDia(ate),
    })
  } catch (e) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="O meu extracto" sub="O que ganhaste, de onde veio, e o que falta receber." />
        <Falhou oQue="Não consegui ler o extracto." detalhe={e instanceof Error ? e.message : undefined} />
      </div>
    )
  }

  const { totais, porOrigem } = somarExtracto(linhas)
  // Bateu no tecto? Então isto é uma PARTE do extracto, e os totais também. Dizê-lo é a diferença
  // entre um número explicado e um número errado.
  const noTecto = linhas.length >= LIMITE_EXTRACTO
  const daPagina = fatiar(linhas, pagina)

  // Os nomes só se leem quando há mais do que uma pessoa na lista — e quando há, sem eles a tabela
  // seria uma coluna de uuids. Para uma pessoa só, o nome dela não acrescenta nada ao seu extracto.
  const pessoas = [...new Set(linhas.map((l) => l.pessoa_id).filter((v): v is string => !!v))]
  const nomes = pessoas.length > 1 ? await nomesDe(pessoas) : {}

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo={ambito.todos ? 'Extracto (todos)' : 'O meu extracto'}
        sub={
          ambito.todos
            ? 'Todas as comissões da casa, das duas origens, numa lista só. Os valores são os que estão lançados no livro — aprovar e pagar faz-se no admin.'
            : 'O que ganhaste pelo teu trabalho na equipa e pela tua rede, numa lista só. O que foi devolvido por um cliente aparece a negativo e desconta no saldo.'
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          nome="A receber hoje"
          valor={centimosEmEuros(totais.saldo_cents)}
          tom={totais.saldo_cents < 0 ? 'negativo' : 'destaque'}
          nota="O que está por pagar, menos o que há a descontar por devoluções."
        />
        <Numero nome="Por pagar" valor={centimosEmEuros(totais.por_pagar_cents)} nota="Lançado e ainda não pago." />
        <Numero nome="Já pago" valor={centimosEmEuros(totais.pago_cents)} nota="Dinheiro que saiu mesmo." />
        <Numero
          nome="A descontar"
          valor={centimosEmEuros(totais.a_descontar_cents)}
          tom={totais.a_descontar_cents > 0 ? 'negativo' : 'normal'}
          nota="Comissões pagas e depois devolvidas pelo cliente."
        />
      </div>

      {aviso && <Aviso>{aviso}</Aviso>}

      <Filtros base={BASE} activo={!!desde || !!ate}>
        <Campo nome="De">
          <input name="desde" type="date" defaultValue={desde ?? ''} className={ESTILO_CAMPO} />
        </Campo>
        <Campo nome="Até">
          <input name="ate" type="date" defaultValue={ate ?? ''} className={ESTILO_CAMPO} />
        </Campo>
      </Filtros>

      {noTecto && (
        <Falhou
          oQue={`Estás a ver as ${LIMITE_EXTRACTO} linhas mais recentes — e os totais em cima são só destas.`}
          detalhe="Aperta as datas para os números passarem a fechar sobre um período inteiro."
        />
      )}

      {(desde || ate) && (
        <p className="text-xs text-gray-500">
          Os totais em cima contam só os movimentos deste período. Limpa o filtro para verem o
          extracto inteiro.
        </p>
      )}

      {/* De onde vem o dinheiro. Duas origens que não se misturam: o trabalho na equipa e a rede.
          Somadas sem se distinguirem, a pessoa não saberia qual das duas vale a pena trabalhar. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">De onde veio</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['papel', 'mlm'] as const).map((o) => (
            <div key={o} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
              <div className="font-semibold text-[#D2A63C]">{ORIGEM_NOME[o]}</div>
              <dl className="mt-2 space-y-1 text-sm text-gray-400">
                <div className="flex justify-between gap-4">
                  <dt>Ganho</dt>
                  <dd className="text-gray-200">{centimosEmEuros(porOrigem[o].ganho_cents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Por pagar</dt>
                  <dd className="text-gray-200">{centimosEmEuros(porOrigem[o].por_pagar_cents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Pago</dt>
                  <dd className="text-gray-200">{centimosEmEuros(porOrigem[o].pago_cents)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Movimentos {linhas.length > 0 && <span className="text-gray-600">({linhas.length})</span>}
        </h2>

        {daPagina.linhas.length === 0 ? (
          <Vazio
            titulo={desde || ate ? 'Nenhum movimento neste período.' : 'Ainda não tens movimentos.'}
            seguinte={
              desde || ate
                ? 'É o filtro de datas que está a fechar a lista, não o extracto que está vazio. Limpa-o para ver tudo.'
                : 'As comissões aparecem aqui quando uma venda é confirmada — o pagamento tem de entrar primeiro. Se fechaste uma venda e ela não está aqui, diz ao Ricardo para a lançar no livro.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-900/60 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  {pessoas.length > 1 && <th className="px-3 py-2 font-medium">Pessoa</th>}
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Detalhe</th>
                  <th className="px-3 py-2 font-medium">Pack</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70">
                {daPagina.linhas.map((l) => {
                  const valor = valorComSinal(l)
                  const estado = estadoComissao(String(l.estado))
                  return (
                    <tr key={`${l.origem}-${l.id}`} className="text-gray-300">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-400">{dataCurta(l.em)}</td>
                      {pessoas.length > 1 && (
                        <td className="px-3 py-2 text-gray-400">{(l.pessoa_id && nomes[l.pessoa_id]) || '—'}</td>
                      )}
                      <td className="px-3 py-2">
                        <Etiqueta tom={l.origem === 'mlm' ? 'neutro' : 'aviso'}>{ORIGEM_NOME[l.origem]}</Etiqueta>
                      </td>
                      <td className="px-3 py-2">{l.detalhe || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">{l.pack || '—'}</td>
                      <td className="px-3 py-2">
                        <Etiqueta tom={TOM_ESTADO[estado]}>{ESTADO_COMISSAO_NOME[estado]}</Etiqueta>
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-mono ${valor < 0 ? 'text-red-400' : 'text-gray-100'}`}
                      >
                        {centimosEmEuros(valor)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Paginacao base={BASE} params={params} pagina={pagina} mostradas={daPagina.linhas.length} haMais={daPagina.haMais} />

        {totais.cancelado_cents > 0 && (
          <p className="text-xs leading-relaxed text-gray-500">
            Há {centimosEmEuros(totais.cancelado_cents)} em comissões canceladas ou devolvidas antes
            de serem pagas. Não contam para nada: nunca saiu dinheiro por elas, por isso não são
            ganho nem dívida.
          </p>
        )}
      </section>

      <p className="text-xs leading-relaxed text-gray-600">
        Esta página mostra; não mexe. Aprovar e pagar comissões é um acto humano e faz-se no admin —
        o que aqui aparece como «por pagar» é uma proposta do sistema, não uma transferência feita.
      </p>
    </div>
  )
}
