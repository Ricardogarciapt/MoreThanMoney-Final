/**
 * GERAR UM MATERIAL DE DIVULGAÇÃO — apoio à escrita, e nada mais.
 *
 * Esta rota devolve texto. Não escreve na base, não contacta ninguém, não publica em lado nenhum.
 * É a máquina de vendas a ajudar uma pessoa da equipa a escrever, e a pessoa é que decide o que faz
 * com o que sai.
 *
 * A REVISÃO É QUEM MANDA, NÃO O PROMPT
 * O prompt diz ao modelo o que pode dizer; `revistarMaterial` verifica o que ele disse. Todo o
 * número de dinheiro ou percentagem que apareça no texto tem de ser um dos que foram DADOS — os da
 * escada, os do bónus, os da prova medida. Se aparecer outro, o texto não sai daqui: tenta-se uma
 * segunda vez a apontar o erro, e se voltar a falhar a resposta é a lista de problemas, sem o texto.
 *
 * Isto recusa, de vez em quando, texto que estava bom. É a troca certa: um material recusado custa
 * um clique, e um número inventado numa publicação custa a confiança de quem o leu — e anda-se
 * meses a tirá-lo de todo o lado, que foi exactamente o que aconteceu com as promessas de «50%
 * recorrente» e «20 000 €/mês».
 *
 * O TRAVÃO é por pessoa e existe porque cada pedido custa dinheiro a sério. Vive em memória: numa
 * função sem estado não trava tudo, mas trava o dedo preso no botão, que é o caso real.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { modeloClaude } from '@/lib/modelo-claude'
import { getPipsProof, provaParaLead, notaViesPreco, publicavel, RESSALVA_LEGAL } from '@/lib/pips-proof'
import {
  enquadramentoDaMarca,
  revistarMaterial,
  tipoDeMaterial,
  valoresPermitidos,
} from '@/lib/backoffice-material-ia'

/** Um pedido de cada vez, com pausa entre eles, e um tecto por dia. */
const ESPERA_MS = 8000
const POR_DIA = 40
const ultimoPedido = new Map<string, { em: number; dia: string; contagem: number }>()

function travar(userId: string): string | null {
  const agora = Date.now()
  const dia = new Date().toISOString().slice(0, 10)
  const anterior = ultimoPedido.get(userId)
  if (anterior && anterior.dia === dia) {
    if (agora - anterior.em < ESPERA_MS) return 'Espera uns segundos antes de gerar outro.'
    if (anterior.contagem >= POR_DIA) return 'Já geraste muitos materiais hoje. Continua amanhã.'
    ultimoPedido.set(userId, { em: agora, dia, contagem: anterior.contagem + 1 })
  } else {
    ultimoPedido.set(userId, { em: agora, dia, contagem: 1 })
  }
  return null
}

async function pedirAoModelo(sistema: string, pedido: string, limite: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('Falta a chave da IA no servidor.')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modeloClaude(process.env.BACKOFFICE_MATERIAL_MODEL),
        max_tokens: Math.max(400, Math.ceil(limite / 2)),
        system: sistema,
        messages: [{ role: 'user', content: pedido }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`A IA respondeu ${res.status}.`)
    const data = await res.json()
    return ((data?.content ?? []) as Array<{ type?: string; text?: string }>)
      .filter((p) => p?.type === 'text')
      .map((p) => p.text || '')
      .join('')
      .trim()
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.material')
  if (ctx instanceof NextResponse) return ctx

  const travado = travar(ctx.userId)
  if (travado) return NextResponse.json({ error: travado }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const tipo = tipoDeMaterial(String(body.tipo ?? ''))
  if (!tipo) return NextResponse.json({ error: 'Escolhe um tipo de material.' }, { status: 400 })

  // O tema é texto da pessoa, e é a única coisa que ela escreve. Limitado no tamanho porque um
  // «tema» de dois mil caracteres é uma tentativa de escrever o prompt por cima do nosso.
  const tema = String(body.tema ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  if (tema.length < 3) return NextResponse.json({ error: 'Diz sobre o que é o material.' }, { status: 400 })

  /**
   * A prova entra MEDIDA ou não entra. `publicavel()` é quem decide, e quando diz que não há prova
   * a resposta certa não é ir buscar uma antiga — é o enquadramento falar de método.
   */
  let linhaDeProva: string | null = null
  let ressalva: string | null = null
  try {
    const prova = await getPipsProof()
    if (publicavel(prova)) {
      linhaDeProva = provaParaLead(prova)
      ressalva = [notaViesPreco(prova), RESSALVA_LEGAL].filter(Boolean).join(' ')
    }
  } catch {
    // Sem prova lida, fica sem prova. Nunca se substitui por um número escrito à mão.
  }

  const sistema = enquadramentoDaMarca({ linhaDeProva, ressalva })
  const permitidos = valoresPermitidos(linhaDeProva)
  const base = `${tipo.instrucao}\n\nTema: ${tema}\n\nMáximo ${tipo.limite} caracteres.`

  let texto = ''
  let revisao = { aprovado: false, problemas: ['Não cheguei a gerar nada.'] }
  try {
    texto = await pedirAoModelo(sistema, base, tipo.limite)
    revisao = revistarMaterial(texto, permitidos)

    // Segunda tentativa, a apontar o erro. Uma só: se o modelo insiste no número inventado, o
    // problema não se resolve a pedir com mais jeito.
    if (!revisao.aprovado) {
      const correcao =
        `${base}\n\nA versão anterior foi RECUSADA por isto:\n` +
        revisao.problemas.map((p) => `· ${p}`).join('\n') +
        '\n\nEscreve outra vez sem nada disso. Se precisares de um número que não te foi dado, escreve a frase sem ele.'
      texto = await pedirAoModelo(sistema, correcao, tipo.limite)
      revisao = revistarMaterial(texto, permitidos)
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não consegui gerar.' }, { status: 502 })
  }

  if (!revisao.aprovado) {
    // O texto NÃO vai junto. Mostrá-lo «para a pessoa decidir» era transformar a revisão num aviso,
    // e um aviso ignora-se com um copiar-colar.
    return NextResponse.json(
      {
        error: 'O material gerado não passou na revisão e não te é mostrado.',
        problemas: revisao.problemas,
        detalhe:
          'Nenhum material pode ter números que não venham do sistema, nem promessas de ganhos. Tenta com um tema mais concreto.',
      },
      { status: 422 },
    )
  }

  return NextResponse.json({ ok: true, texto, tipo: tipo.chave, temProva: !!linhaDeProva })
}
