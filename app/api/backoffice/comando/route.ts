/**
 * TEXTO → ACÇÃO no backoffice (o que se disse ao microfone, ou se escreveu na caixa do comando).
 *
 * Ler corre já e devolve o resultado. Mudar NUNCA corre aqui: volta como `proposta`, e o botão
 * «Confirmar» do ecrã chama as rotas de sempre (`PATCH /api/backoffice/negocios/[id]`,
 * `POST /api/backoffice/tarefas`), com as fechaduras de sempre. Esta rota não escreve em tabela
 * nenhuma do negócio — por isso não tem como passar ao lado delas.
 *
 * IA: cadeia GRÁTIS (`chamarIAGratis`). Se falhar, diz-se que falhou; não se inventa acção.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { notaDoNegocio, procurarNegocios, type NegocioCurto } from '@/lib/backoffice-procura'
import { filaDoUtilizador } from '@/lib/backoffice-prioridade'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { pode } from '@/lib/backoffice-papeis'
import { ESTADO_PIPELINE_NOME, type EstadoPipeline } from '@/lib/backoffice-vista'
import { FUNIL_NOME } from '@/lib/backoffice-funis'
import { chamarIAGratis, mensagemIndisponivel } from '@/lib/ia/chamar'
import { ferramentaPorNome } from '@/lib/mcp/ferramentas'
import { blocoFramework } from '@/lib/framework-mtm'
import { TIPOS_CHAMADA } from '@/lib/backoffice-chamada'
import type { ContextoBackoffice } from '@/lib/backoffice-sessao'
import {
  MAX_TEXTO_COMANDO,
  PAGINAS_VOZ,
  interpretarAccao,
  notaDaVoz,
  padraoDeTarefa,
  sistemaDoComando,
  sistemaDoRascunho,
} from '@/lib/backoffice-voz'

/** As tarefas ABERTAS da própria pessoa cujo título bate com o que disse. */
async function procurarTarefas(ctx: ContextoBackoffice, texto: string) {
  const { data } = await getSupabaseAdmin()
    .from('vendas_tarefas')
    .select('id, titulo, prazo')
    .eq('responsavel_id', ctx.userId)
    .eq('estado', 'aberta')
    .ilike('titulo', padraoDeTarefa(texto))
    .order('prazo', { ascending: true, nullsFirst: false })
    .limit(5)
  return (data ?? []) as { id: string; titulo: string; prazo: string | null }[]
}

/** De vários candidatos, o que tem exactamente o nome dito; senão, o único; senão nenhum. */
function escolherUm(candidatos: NegocioCurto[], dito: string): NegocioCurto | null {
  const exacto = candidatos.filter((c) => c.nome.trim().toLowerCase() === dito.trim().toLowerCase())
  if (exacto.length === 1) return exacto[0]
  return candidatos.length === 1 ? candidatos[0] : null
}

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.entrar')
  if (ctx instanceof NextResponse) return ctx

  let texto = ''
  try {
    const b = (await request.json()) as { texto?: unknown }
    texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, MAX_TEXTO_COMANDO) : ''
  } catch {
    /* corpo inválido → texto vazio */
  }
  if (!texto) return NextResponse.json({ error: 'Diz ou escreve o que queres fazer.' }, { status: 400 })

  const podeGestao = ctx.admin || pode(ctx.capacidades, 'bo.gestao_crm')
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

  let bruto: string
  try {
    const r = await chamarIAGratis({
      sistema: sistemaDoComando(hoje, podeGestao),
      mensagens: [{ role: 'user', content: texto }],
      json: true,
      temperatura: 0,
      maxTokens: 300,
      preferencia: 'rapido',
      tarefa: 'backoffice-voz',
    })
    bruto = r.texto
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }

  const accao = interpretarAccao(bruto, podeGestao)

  switch (accao.tipo) {
    case 'responder':
      return NextResponse.json({ texto, accao, resposta: accao.texto })

    case 'abrir':
      return NextResponse.json({ texto, accao, navegar: PAGINAS_VOZ[accao.pagina] })

    case 'procurar_negocio': {
      const negocios = await procurarNegocios(ctx, accao.texto)
      if (!negocios) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      return NextResponse.json({
        texto,
        accao,
        resposta: negocios.length ? `Encontrei ${negocios.length}.` : `Não encontrei nenhum negócio com «${accao.texto}».`,
        negocios,
      })
    }

    case 'minhas_tarefas': {
      if (!pode(ctx.capacidades, 'bo.tarefas_proprias')) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem tarefas.' })
      const { data } = await getSupabaseAdmin()
        .from('vendas_tarefas')
        .select('id, titulo, prazo')
        .eq('responsavel_id', ctx.userId)
        .eq('estado', 'aberta')
        .order('prazo', { ascending: true, nullsFirst: false })
        .limit(10)
      const tarefas = data ?? []
      return NextResponse.json({ texto, accao, resposta: tarefas.length ? `Tens ${tarefas.length} tarefa(s) abertas.` : 'Não tens tarefas abertas.', tarefas })
    }

    case 'proxima_accao': {
      const fila = await filaDoUtilizador(ctx, 5)
      if (!fila) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      if (!fila.length) return NextResponse.json({ texto, accao, resposta: 'Não tens negócios abertos à espera de ti. Bom momento para prospectar.' })
      const [primeiro] = fila
      return NextResponse.json({
        texto,
        accao,
        resposta: `Começa por ${primeiro.nome}: ${primeiro.accao.toLowerCase()}${primeiro.porque.length ? ` (${primeiro.porque.join('; ')})` : ''}.`,
        ligacoes: fila.map((i) => ({ href: `/backoffice/pipeline/ficha/${i.id}`, nome: i.nome, rotulo: `${i.nome} · ${i.accao}` })),
      })
    }

    case 'resumo_pipeline': {
      const f = ferramentaPorNome('pipeline_vendas')
      const r = (await f?.correr({ dias: accao.dias })) as
        | { total?: number; porEtapa?: [string, number][]; porOrigem?: [string, number][]; erro?: string }
        | undefined
      if (!r || r.erro) return NextResponse.json({ texto, accao, resposta: 'Não consegui ler o pipeline agora.' })
      const etapas = (r.porEtapa ?? []).map(([e, n]) => `${ESTADO_PIPELINE_NOME[e as EstadoPipeline] ?? e}: ${n}`).join(' · ')
      const origens = (r.porOrigem ?? []).slice(0, 4).map(([o, n]) => `${o}: ${n}`).join(' · ')
      return NextResponse.json({ texto, accao, resposta: `Últimos ${accao.dias} dias: ${r.total ?? 0} negócios. ${etapas}. Principais origens: ${origens}.` })
    }

    case 'mover_negocio': {
      const candidatos = await procurarNegocios(ctx, accao.negocio)
      if (!candidatos) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      if (!candidatos.length) return NextResponse.json({ texto, accao, resposta: `Não encontrei «${accao.negocio}» no teu pipeline.` })
      return NextResponse.json({
        texto,
        accao,
        resposta: `Passar para «${ESTADO_PIPELINE_NOME[accao.estado]}». Confirma o negócio certo:`,
        proposta: { tipo: 'mover_negocio', estado: accao.estado, motivo_perda: accao.motivo_perda ?? null, candidatos },
      })
    }

    case 'mudar_funil': {
      const candidatos = await procurarNegocios(ctx, accao.negocio)
      if (!candidatos) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      if (!candidatos.length) return NextResponse.json({ texto, accao, resposta: `Não encontrei «${accao.negocio}» no teu pipeline.` })
      const nome = accao.funil ? FUNIL_NOME[accao.funil] : 'sem funil'
      return NextResponse.json({
        texto,
        accao,
        resposta: `Pôr no funil «${nome}». Confirma o negócio certo:`,
        proposta: { tipo: 'mudar_funil', funil: accao.funil, nome_funil: nome, candidatos },
      })
    }

    case 'nota_negocio': {
      const candidatos = await procurarNegocios(ctx, accao.negocio)
      if (!candidatos) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      if (!candidatos.length) return NextResponse.json({ texto, accao, resposta: `Não encontrei «${accao.negocio}» no teu pipeline.` })
      // A nota nova é composta aqui (a antiga fica por baixo); o toque grava pela rota de sempre.
      const comNota = await Promise.all(
        candidatos.slice(0, 4).map(async (n) => {
          const atual = await notaDoNegocio(ctx, n.id)
          return { ...n, nota_nova: notaDaVoz(hoje, accao.texto, atual?.nota ?? null) }
        }),
      )
      return NextResponse.json({
        texto,
        accao,
        resposta: `Acrescentar à nota: «${accao.texto}». Confirma o negócio certo:`,
        proposta: { tipo: 'nota_negocio', texto: accao.texto, candidatos: comNota },
      })
    }

    case 'concluir_tarefa':
    case 'adiar_tarefa': {
      if (!pode(ctx.capacidades, 'bo.tarefas_proprias')) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem tarefas.' })
      const tarefas = await procurarTarefas(ctx, accao.tarefa)
      if (!tarefas.length) return NextResponse.json({ texto, accao, resposta: `Não encontrei nenhuma tarefa aberta tua com «${accao.tarefa}».` })
      return NextResponse.json({
        texto,
        accao,
        resposta: accao.tipo === 'concluir_tarefa' ? 'Marcar como feita. Confirma a tarefa:' : `Mudar o prazo para ${accao.prazo}. Confirma a tarefa:`,
        proposta: accao.tipo === 'concluir_tarefa' ? { tipo: 'concluir_tarefa', tarefas } : { tipo: 'adiar_tarefa', prazo: accao.prazo, tarefas },
      })
    }

    case 'preparar_chamada': {
      const base = `/backoffice/chamadas?tipo=${accao.tipo_chamada}`
      if (!accao.negocio) return NextResponse.json({ texto, accao, navegar: base })
      const candidatos = (await procurarNegocios(ctx, accao.negocio)) ?? []
      const um = escolherUm(candidatos, accao.negocio)
      const link = (n: NegocioCurto) => `${base}&negocio=${n.id}&nome=${encodeURIComponent(n.nome)}`
      if (um) return NextResponse.json({ texto, accao, navegar: link(um) })
      return NextResponse.json({
        texto,
        accao,
        resposta: candidatos.length
          ? `Chamada de ${TIPOS_CHAMADA[accao.tipo_chamada].toLowerCase()}. Com quem?`
          : `Não encontrei «${accao.negocio}». Abre a sala e escolhe lá.`,
        ligacoes: (candidatos.length ? candidatos : []).map((n) => ({ href: link(n), nome: n.nome })),
        ...(candidatos.length ? {} : { navegar: base }),
      })
    }

    case 'rascunho_mensagem': {
      const candidatos = await procurarNegocios(ctx, accao.negocio)
      if (!candidatos) return NextResponse.json({ texto, accao, resposta: 'Esta conta não tem acesso ao pipeline.' })
      const um = escolherUm(candidatos, accao.negocio)
      if (!um) {
        return NextResponse.json({
          texto,
          accao,
          resposta: candidatos.length
            ? `Há ${candidatos.length} negócios com «${accao.negocio}»: ${candidatos.map((c) => c.nome).join(', ')}. Diz o nome completo.`
            : `Não encontrei «${accao.negocio}» no teu pipeline.`,
        })
      }
      const ficha = await notaDoNegocio(ctx, um.id)
      if (!ficha) return NextResponse.json({ texto, accao, resposta: `Não encontrei «${accao.negocio}» no teu pipeline.` })
      const { data: contacto } = await getSupabaseAdmin().from('vendas_negocios').select('telefone, email').eq('id', um.id).maybeSingle()
      let rascunho: string
      try {
        const r = await chamarIAGratis({
          sistema: sistemaDoRascunho(accao.canal, blocoFramework('setter')),
          mensagens: [
            {
              role: 'user',
              content: [
                `Lead: ${um.nome} · etapa: ${um.estado}`,
                `Nota do CRM: ${(ficha.nota ?? '(sem nota)').slice(0, 1500)}`,
                `Objectivo da mensagem: ${accao.objetivo}`,
              ].join('\n'),
            },
          ],
          temperatura: 0.5,
          maxTokens: 500,
          tarefa: 'backoffice-rascunho',
        })
        rascunho = r.texto.trim()
      } catch (e) {
        return NextResponse.json({ texto, accao, resposta: mensagemIndisponivel(e) })
      }
      const digitos = String(contacto?.telefone ?? '').replace(/\D/g, '')
      const tel = digitos.length === 9 ? `351${digitos}` : digitos
      const email = String(contacto?.email ?? '').trim()
      return NextResponse.json({
        texto,
        accao,
        resposta: `Rascunho para ${um.nome}. Revê, copia e envia tu.`,
        rascunho: {
          canal: accao.canal,
          texto: rascunho,
          abrir:
            accao.canal === 'whatsapp' && tel.length >= 9
              ? `https://wa.me/${tel}?text=${encodeURIComponent(rascunho)}`
              : accao.canal === 'email' && email
                ? `mailto:${email}`
                : null,
        },
      })
    }

    case 'criar_tarefa': {
      if (!pode(ctx.capacidades, 'bo.tarefas_proprias')) return NextResponse.json({ texto, accao, resposta: 'Esta conta não pode criar tarefas.' })
      const candidatos = accao.negocio ? ((await procurarNegocios(ctx, accao.negocio)) ?? []) : []
      return NextResponse.json({
        texto,
        accao,
        resposta: 'Criar esta tarefa?',
        proposta: { tipo: 'criar_tarefa', titulo: accao.titulo, prazo: accao.prazo, negocio: accao.negocio, candidatos },
      })
    }
  }
}
