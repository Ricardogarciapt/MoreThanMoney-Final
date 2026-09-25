/**
 * TRABALHAR UM NEGÓCIO — mover de estado, escrever uma nota, atribuir papéis.
 *
 * A ORDEM DESTA ROTA É A SEGURANÇA DELA, e é por isso que ela é sempre a mesma:
 *
 *   1. `exigirCapacidade` — esta pessoa pode mexer em negócios? (autorizar)
 *   2. `ambitoDaEquipa`   — em QUEM? Devolve uma LISTA DE IDS (o próprio + os liderados)
 *   3. ler o negócio e `podeMexerNoNegocio(negocio, ambito)` — este negócio está nessa lista?
 *   4. só então escrever, e gravar o evento
 *
 * O passo 3 é o que distingue autorizar de filtrar. Uma rota que faça só o passo 1 responde 200 e
 * muda o negócio de outra pessoa — com o número certo no sítio errado. E o filtro é uma LISTA e
 * não um `if (é responsável de equipa)`: um `if` esquece-se numa refactorização e nada no ecrã
 * muda; uma lista que não contém o id devolve `false` todas as vezes.
 *
 * UM ESTADO É UM FACTO COM AUTOR. Nenhuma mudança de estado se escreve sem a linha correspondente
 * em `vendas_negocio_eventos` — quem, quando, de onde para onde. Quando alguém disser «eu marquei
 * essa reunião», a resposta tem de estar na base e não na memória de duas pessoas.
 *
 * ⚠️ GANHO NÃO É DINHEIRO. Marcar um negócio como ganho muda três campos do negócio e mais nada:
 * não cria linha em `vendas_vendas`, não cria comissão. A venda nasce do PAGAMENTO confirmado
 * (migração 128, regra 3). Se as duas coisas se pudessem separar, alguém acabava por marcar ganhos
 * que não existiram — e o livro pagava sobre eles.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { pode } from '@/lib/backoffice-papeis'
import { COLUNAS_DE_PARTICIPACAO, ehUuid } from '@/lib/backoffice-negocios'
import type { AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'
import {
  camposDaMudancaDeEstado,
  eventoDeAtribuicao,
  eventoDeEstado,
  podeMexerNoNegocio,
  texto,
  validarAtribuicao,
  validarMudancaDeEstado,
} from '@/lib/backoffice-escrita'

const COLUNAS = `id, nome, estado, nota, motivo_perda, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`

/**
 * O negócio como esta rota o precisa de ler. O tipo está escrito à mão porque o `select` é montado
 * a partir de `COLUNAS_DE_PARTICIPACAO` — e é isso que garante que as cinco colunas de atribuição
 * vêm todas: uma lista esquecida no `select` fazia `podeMexerNoNegocio` decidir com meio negócio.
 */
type NegocioParaEscrita = AtribuicoesDoNegocio & {
  id: string
  nome: string
  estado: string
  nota: string | null
  motivo_perda: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCapacidade(request, 'bo.pipeline_proprio')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'pipeline')

  const { data, error: erroLeitura } = await supabase
    .from('vendas_negocios')
    .select(COLUNAS)
    .eq('id', id)
    .maybeSingle()
  const negocio = (data ?? null) as NegocioParaEscrita | null

  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 500 })

  // 404 e não 403 a quem não participa: responder «não podes» confirmava que o negócio existe, e
  // quem pergunta pelo id de um negócio alheio não tem nada a saber sobre ele.
  if (!negocio || !podeMexerNoNegocio(negocio, ambito)) {
    return NextResponse.json(
      { error: 'Negócio não encontrado', detalhe: 'Ou não existe, ou não participas nele.' },
      { status: 404 },
    )
  }

  const agora = new Date()
  const campos: Record<string, unknown> = {}
  const eventos: Array<Record<string, unknown>> = []

  // ── Mover de estado ────────────────────────────────────────────────────────
  if (body.estado !== undefined) {
    const mudanca = validarMudancaDeEstado({
      de: String(negocio.estado),
      para: body.estado,
      motivoPerda: body.motivo_perda,
    })
    if (!mudanca.ok) return NextResponse.json({ error: mudanca.erro }, { status: 400 })

    Object.assign(campos, camposDaMudancaDeEstado(mudanca.valor.para, mudanca.valor.motivoPerda, agora))
    eventos.push(
      eventoDeEstado({
        negocioId: id,
        de: String(negocio.estado),
        para: mudanca.valor.para,
        por: ctx.userId,
        nota: texto(body.nota_do_evento, 500),
      }),
    )
  }

  // ── Escrever a nota do negócio ────────────────────────────────────────────
  // A nota é o que se sabe da pessoa, e reescreve-se. Não é histórico: o histórico são os eventos.
  if (body.nota !== undefined) {
    campos.nota = texto(body.nota, 2000)
  }

  // ── Atribuir papéis ───────────────────────────────────────────────────────
  // «Quem prospectou, quem marcou, quem fecha.» Atribuir é dar acesso ao negócio e, quando ele
  // fechar, à comissão desse papel — por isso a regra vive em `validarAtribuicao` e usa a LISTA.
  const atribuicoes = body.atribuicoes
  if (atribuicoes && typeof atribuicoes === 'object' && !Array.isArray(atribuicoes)) {
    const temEquipa = pode(ctx.capacidades, 'bo.pipeline_equipa')
    const nomes = await nomesDe(supabase, [
      ...Object.values(atribuicoes as Record<string, unknown>),
      ctx.userId,
    ])

    for (const [papel, pedido] of Object.entries(atribuicoes as Record<string, unknown>)) {
      // `'eu'` é o único atalho que esta rota aceita, e existe para o cliente NUNCA ter de mandar
      // um id: quem se põe a si próprio num lugar vago manda a palavra, e quem decide quem é «eu» é
      // a sessão. Assim não há sequer um caminho em que o id de quem entra venha do browser.
      const novoId = pedido === 'eu' ? ctx.userId : pedido
      const validada = validarAtribuicao({
        papel,
        ocupanteActual: (negocio as unknown as Record<string, string | null>)[`${papel}_id`] ?? null,
        novoId,
        autorId: ctx.userId,
        ambito,
        temAmbitoEquipa: temEquipa,
      })
      if (!validada.ok) return NextResponse.json({ error: validada.erro }, { status: 403 })

      campos[validada.valor.coluna] = validada.valor.novoId
      campos.atualizado_em = agora.toISOString()
      eventos.push(
        eventoDeAtribuicao({
          negocioId: id,
          estadoActual: String(campos.estado ?? negocio.estado),
          papel: validada.valor.papel,
          paraNome: validada.valor.novoId ? (nomes[validada.valor.novoId] ?? 'alguém da equipa') : null,
          por: ctx.userId,
        }),
      )
    }
  }

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: 'Não pediste nenhuma mudança.' }, { status: 400 })
  }
  campos.atualizado_em = agora.toISOString()

  // A escrita repete o `id` e mais nada: a decisão de quem pode já foi tomada em cima, com o
  // negócio lido e o âmbito na mão.
  const { data: gravado, error } = await supabase
    .from('vendas_negocios')
    .update(campos)
    .eq('id', id)
    .select(COLUNAS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!gravado) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  // O evento vai DEPOIS da escrita: gravá-lo antes deixava histórico de movimentos que não
  // aconteceram, se a escrita falhasse. Ao contrário — escrita feita, evento falhado — fica um
  // buraco no histórico, que se diz em voz alta na resposta em vez de se calar.
  let aviso: string | undefined
  if (eventos.length > 0) {
    const { error: erroEvento } = await supabase.from('vendas_negocio_eventos').insert(eventos)
    if (erroEvento) aviso = 'A mudança ficou gravada, mas o histórico não registou quem a fez. Diz ao Ricardo.'
  }

  return NextResponse.json({ ok: true, negocio: gravado, aviso_historico: aviso })
}

/** Os nomes de quem entra numa atribuição — só para o histórico se ler sem uuids. */
async function nomesDe(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ids: unknown[],
): Promise<Record<string, string>> {
  const limpos = [...new Set(ids.filter(ehUuid))]
  if (limpos.length === 0) return {}
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', limpos)
  return Object.fromEntries(
    (data ?? []).map((p) => [String(p.id), String(p.full_name || p.email || 'alguém da equipa')]),
  )
}
