/**
 * A GUARDA DO QUE O CAMINHO GENÉRICO PUBLICA (perpétuos cripto, forex, índices).
 *
 *   npx tsx lib/sinais/publicacao-generica.check.ts
 *
 * Os casos são os da trade do MTM Sensei X em BTCUSDT.P de 25/10/2026 e os cartões de 20/10.
 */
import { decidirPublicacaoGenerica } from './publicacao-generica'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

const perp = { classe: 'crypto_perp', seguimento: false } as const

// Entrada boa sai.
teste('entrada boa', decidirPublicacaoGenerica({ ...perp, direcao: 'sell', entrada: 80045.4, sl: 80283.5, tp1: 79800 }).publicar === 'entrada')

// O break-even das 01:40 (seguimento ligado) responde à entrada; nunca é «Novo sinal».
const be = decidirPublicacaoGenerica({ seguimento: true, alertType: 'breakeven', entradaChatId: 'abc', classe: 'crypto_perp' })
teste('BE ligado → seguimento break_even', be.publicar === 'seguimento' && be.evento === 'break_even')

// Seguimento sem entrada publicada (ligacao sem_entrada) não sai.
teste('seguimento sem entrada → nada', decidirPublicacaoGenerica({ seguimento: true, alertType: 'breakeven', entradaChatId: null }).publicar === null)

// Seguimento sem tipo conhecido não sai como entrada.
teste('seguimento sem tipo → nada', decidirPublicacaoGenerica({ seguimento: true, alertType: null, entradaChatId: 'abc' }).publicar === null)

// Eventos.
const tp1 = decidirPublicacaoGenerica({ seguimento: true, alertType: 'tp_hit', tpLevel: 1, entradaChatId: 'x' })
teste('TP1 → partial', tp1.publicar === 'seguimento' && tp1.evento === 'partial')
const tp4 = decidirPublicacaoGenerica({ seguimento: true, alertType: 'tp_hit', tpLevel: 4, entradaChatId: 'x' })
teste('TP4 → target_final', tp4.publicar === 'seguimento' && tp4.evento === 'target_final')
const slp = decidirPublicacaoGenerica({ seguimento: true, alertType: 'sl_hit', slProtegido: true, entradaChatId: 'x' })
teste('SL protegido', slp.publicar === 'seguimento' && slp.evento === 'stop_protegido')
const sl = decidirPublicacaoGenerica({ seguimento: true, alertType: 'sl_hit', entradaChatId: 'x' })
teste('SL', sl.publicar === 'seguimento' && sl.evento === 'stop_loss')

// 20/10: compra a 82120.9 com stop 82421.14 (stop acima da entrada) não sai.
teste('stop do lado do lucro', decidirPublicacaoGenerica({ ...perp, direcao: 'buy', entrada: 82120.9, sl: 82421.14, tp1: 82500 }).publicar === null)
// Stop igual à entrada não sai.
teste('stop = entrada', decidirPublicacaoGenerica({ ...perp, direcao: 'sell', entrada: 80045.4, sl: 80045.4 }).publicar === null)
// Alvo do lado errado não sai.
teste('alvo errado', decidirPublicacaoGenerica({ ...perp, direcao: 'buy', entrada: 100, sl: 99, tp1: 98 }).publicar === null)
// Entrada repetida não sai.
teste('duplicada', decidirPublicacaoGenerica({ ...perp, duplicada: true, direcao: 'buy', entrada: 100, sl: 99, tp1: 102 }).publicar === null)
// Perpétuo sem stop não sai; forex sem stop continua como antes.
teste('perp sem stop', decidirPublicacaoGenerica({ ...perp, direcao: 'buy', entrada: 100, sl: null }).publicar === null)
teste('forex sem stop mantém-se', decidirPublicacaoGenerica({ seguimento: false, classe: 'forex', direcao: 'buy', entrada: 1.1, sl: null }).publicar === 'entrada')
// Forex com stop errado também não sai.
teste('forex stop errado', decidirPublicacaoGenerica({ seguimento: false, classe: 'forex', direcao: 'sell', entrada: 1.1, sl: 1.09 }).publicar === null)

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):\n- ${falhas.join('\n- ')}`)
  process.exit(1)
}
console.log('publicacao-generica: todos os casos passam')
