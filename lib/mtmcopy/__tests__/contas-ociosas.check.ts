/** Não acordar contas paradas nos trabalhos de verificação. Correr: npx tsx lib/mtmcopy/__tests__/contas-ociosas.check.ts */
import { deveSaltarLeitura } from "../contas-ociosas"

let ok = 0, mau = 0
const eq = (nome: string, a: unknown, b: unknown) => {
  if (a === b) ok++
  else { mau++; console.error(`✗ ${nome}\n   obtido: ${String(a)}\n   esperado: ${String(b)}`) }
}

const estados = new Map([
  ["ligada", { state: "DEPLOYED", connectionStatus: "CONNECTED" }],
  ["deployed-a-religar", { state: "DEPLOYED", connectionStatus: "DISCONNECTED" }],
  ["parada", { state: "UNDEPLOYED", connectionStatus: "DISCONNECTED" }],
])

// Com linhas abertas lê-se SEMPRE, esteja como estiver — é aí que há dinheiro a gerir.
eq("parada com linhas abertas é lida", deveSaltarLeitura({ accountId: "parada", mt5Status: "error", estadosMetaApi: estados, temLinhasAbertas: true }), false)
eq("desconhecida com linhas abertas é lida", deveSaltarLeitura({ accountId: "x", mt5Status: null, estadosMetaApi: null, temLinhasAbertas: true }), false)

// Listagem fiável: manda o estado da MetaApi.
eq("deployed é lida", deveSaltarLeitura({ accountId: "ligada", mt5Status: "error", estadosMetaApi: estados, temLinhasAbertas: false }), false)
eq("deployed a religar é lida", deveSaltarLeitura({ accountId: "deployed-a-religar", mt5Status: "connected", estadosMetaApi: estados, temLinhasAbertas: false }), false)
eq("undeployed sem linhas salta", deveSaltarLeitura({ accountId: "parada", mt5Status: "connected", estadosMetaApi: estados, temLinhasAbertas: false }), true)
eq("fora da listagem sem linhas salta", deveSaltarLeitura({ accountId: "apagada", mt5Status: "connected", estadosMetaApi: estados, temLinhasAbertas: false }), true)

// Sem listagem: cai no estado guardado na base.
eq("sem listagem e connected é lida", deveSaltarLeitura({ accountId: "x", mt5Status: "connected", estadosMetaApi: null, temLinhasAbertas: false }), false)
eq("sem listagem e pending salta", deveSaltarLeitura({ accountId: "x", mt5Status: "pending", estadosMetaApi: null, temLinhasAbertas: false }), true)

console.log(`contas-ociosas: ${ok} ok, ${mau} falhas`)
if (mau) process.exit(1)
