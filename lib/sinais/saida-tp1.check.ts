/**
 *   npx tsx lib/sinais/saida-tp1.check.ts
 */
import { alvoComRRMinimo } from './saida-tp1'

const falhas: string[] = []
const t = (n: string, c: boolean) => { if (!c) falhas.push(n) }

// 25/10 23:30: SELL 80045.4, SL 80283.5, TP1 79688.2 (1,5R) → TP1.
t('TP1 a 1,5R', alvoComRRMinimo('sell', 80045.4, 80283.5, [79688.2, 79450.1, 79092.9]) === 79688.2)
// 20/10: BUY 82120.9, SL 81817.3, TP1 82576.3 (1,5R).
t('compra TP1', alvoComRRMinimo('buy', 82120.9, 81817.3, [82576.3, 82879.8]) === 82576.3)
// TP1 só a 1R → salta para o TP2 (2R).
t('salta TP1 curto', alvoComRRMinimo('buy', 100, 99, [101, 102]) === 102)
// Nenhum alvo chega a 1,5R → não abre.
t('sem alvo', alvoComRRMinimo('buy', 100, 99, [101, 101.2]) === null)
// Stop do lado errado → não abre.
t('stop errado', alvoComRRMinimo('buy', 100, 101, [102]) === null)
// Ordem dos alvos não importa.
t('ordem', alvoComRRMinimo('sell', 100, 101, [97, 98.5, 96]) === 98.5)

if (falhas.length) { console.error('FALHOU: ' + falhas.join(', ')); process.exit(1) }
console.log('saida-tp1: alvo único ≥ 1,5R')
