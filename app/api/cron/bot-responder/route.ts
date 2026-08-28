import { NextRequest, NextResponse } from 'next/server'
import {
  conversasProntas, contarDisparo, encontrarAutomacao, marcarRespondidas, textoDaResposta,
} from '@/lib/automacoes'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Responde às conversas que estiveram a juntar mensagens.
 *
 * Corre a cada minuto e trata do que já venceu o "smart delay" — ver `enfileirarParaIA`. Uma
 * pessoa que manda três mensagens seguidas recebe UMA resposta, ao conjunto, em vez de três
 * respostas à primeira.
 *
 * Falhar um envio NÃO marca a conversa como respondida: fica para a passagem seguinte. O
 * contrário — marcar e depois falhar — deixava a pessoa sem resposta nenhuma e sem forma de o
 * sistema saber.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  const dado = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (segredo && dado !== segredo) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }

  const token = getMtmcopyBotToken()
  const prontas = await conversasProntas()
  let respondidas = 0

  for (const c of prontas) {
    try {
      const auto = await encontrarAutomacao(c.canal, c.texto)
      // Sem regra que apanhe, as mensagens saem da fila na mesma: deixá-las lá fazia a fila
      // crescer para sempre com conversas que ninguém vai responder por aqui.
      if (!auto) {
        await marcarRespondidas(c.ids)
        continue
      }

      const texto = await textoDaResposta(auto, c.texto)
      if (!texto) {
        await marcarRespondidas(c.ids)
        continue
      }

      if (c.canal === 'telegram' && token) {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: c.pessoa, text: texto, parse_mode: 'HTML' }),
        })
        if (!r.ok) continue // fica para a próxima passagem
      }

      await marcarRespondidas(c.ids)
      await contarDisparo(auto.id)
      respondidas++
    } catch {
      /* uma conversa que falha não pode travar as outras */
    }
  }

  return NextResponse.json({ ok: true, prontas: prontas.length, respondidas })
}
