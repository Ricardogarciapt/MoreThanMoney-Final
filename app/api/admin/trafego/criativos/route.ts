import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { chamarIA, extrairJson, mensagemIndisponivel } from '@/lib/ia/chamar'

export const dynamic = 'force-dynamic'

/**
 * ESTÚDIO DE ANÚNCIOS — POST { produto, publico, objectivo, angulo? } → 3 variações de anúncio Meta.
 *
 * O que o OpenAdKit faz num estúdio de criativos (gancho, texto principal, título, CTA), escrito com as
 * regras da casa: PT-PT e «tu», nenhum número de desempenho inventado, nada de resultados garantidos,
 * o aviso educativo, e a palavra-chave para comentar — que é o que o funil nativo do Instagram apanha
 * e leva para o CRM. Só escreve texto: publicar continua no Gestor de Anúncios.
 */
const PALAVRAS = ['SCANNER', 'SISTEMA', 'BOOTCAMP', 'RESULTADOS', 'LIBERDADE']

const SISTEMA = `És o copywriter de anúncios Meta (Facebook/Instagram) da MoreThanMoney (Ricardo Garcia), uma mentoria de educação financeira e trading em Portugal.
Regras que não se quebram:
- Português de Portugal, tratar por "tu". Nunca "você". "Ecrã", "telemóvel".
- NUNCA inventes números de desempenho, ganhos, percentagens, número de alunos ou testemunhos.
- NUNCA prometas ou sugiras resultados garantidos ou dinheiro fácil. Nada de "fica rico", "lucro garantido".
- Inclui no fim do texto principal: "Conteúdo educativo, não constitui consultoria financeira."
- Tom: autêntico, próximo, inspirador, sem exageros. Emojis moderados.
- O CTA é comentar uma palavra-chave (o funil responde por mensagem) ou marcar uma conversa.
Responde só com JSON: {"variacoes":[{"angulo":"","gancho":"","texto":"","titulo":"","descricao":"","cta":"","palavraChave":""}]} com exactamente 3 variações de ângulos diferentes.
- "gancho": a primeira frase / os primeiros 3 segundos (máx. 90 caracteres)
- "texto": texto principal (máx. 600 caracteres)
- "titulo": máx. 40 caracteres · "descricao": máx. 30 caracteres
- "palavraChave": uma de ${PALAVRAS.join(', ')}`

export async function POST(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const campo = (k: string, n = 300) => String(b[k] ?? '').trim().slice(0, n)
  const produto = campo('produto')
  if (!produto) return NextResponse.json({ error: 'Diz o que é para anunciar.' }, { status: 400 })

  try {
    const r = await chamarIA({
      tarefa: 'trafego-criativos',
      preferencia: 'qualidade',
      json: true,
      maxTokens: 1800,
      sistema: SISTEMA,
      mensagens: [{
        role: 'user',
        content: `Produto/oferta: ${produto}\nPúblico: ${campo('publico') || 'adultos 25-45, Portugal, querem sair da armadilha das 40h/semana'}\nObjectivo da campanha: ${campo('objectivo') || 'leads'}\nÂngulo pedido (opcional): ${campo('angulo') || '—'}`,
      }],
    })
    const d = JSON.parse(extrairJson(r.fornecedor, r.texto)) as { variacoes?: Array<Record<string, string>> }
    const variacoes = (d.variacoes ?? []).slice(0, 3).map((v) => ({
      angulo: String(v.angulo ?? ''),
      gancho: String(v.gancho ?? ''),
      texto: String(v.texto ?? ''),
      titulo: String(v.titulo ?? ''),
      descricao: String(v.descricao ?? ''),
      cta: String(v.cta ?? ''),
      palavraChave: PALAVRAS.includes(String(v.palavraChave ?? '').toUpperCase()) ? String(v.palavraChave).toUpperCase() : null,
    }))
    return NextResponse.json({ variacoes, modelo: r.modelo })
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }
}
