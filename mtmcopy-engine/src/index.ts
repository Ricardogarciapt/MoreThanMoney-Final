// ──────────────────────────────────────────────────────────────────────────
// Copygram Engine — ponto de entrada
//
// Serviço autónomo (fora da Vercel) que liga o Telegram (canais de sinais)
// ao MT5 dos utilizadores via MetaApi.cloud. Corre em long-running process
// num VPS, Railway, Render, ou no próprio VPS Windows do utilizador (com
// Node instalado) — ver README para opções de deploy.
//
// O que este processo faz, em loop contínuo:
//   1. Liga-se ao bot do Telegram (@MoreThanMoney_aibot) e escuta mensagens
//      dos canais configurados pelos utilizadores em /mtmcopy
//   2. Extrai sinais estruturados (símbolo/direção/SL/TP) do texto
//   3. Calcula o lote conforme as preferências de cada utilizador
//   4. Executa a ordem na conta MT5 (via MetaApi) e regista tudo na BD
// ──────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { startListener } from './telegram-listener'

async function main() {
  console.log('──────────────────────────────────────────')
  console.log(' Copygram Engine — MoreThanMoney')
  console.log(` ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log('──────────────────────────────────────────')

  await startListener()

  console.log('[engine] arrancado com sucesso. À escuta de sinais...')
}

main().catch((err) => {
  console.error('[engine] erro fatal no arranque:', err)
  process.exit(1)
})

// Encerramento limpo (Ctrl+C, ou sinal do gestor de processos / plataforma)
process.on('SIGINT', () => { console.log('\n[engine] a encerrar (SIGINT)...'); process.exit(0) })
process.on('SIGTERM', () => { console.log('\n[engine] a encerrar (SIGTERM)...'); process.exit(0) })
process.on('unhandledRejection', (reason) => { console.error('[engine] promessa rejeitada sem handler:', reason) })
