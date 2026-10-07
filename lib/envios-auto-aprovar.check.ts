/**
 * A GUARDA DO AUTO-APROVAR DA FILA DO SITE (07/10).   ./node_modules/.bin/tsx lib/envios-auto-aprovar.check.ts
 *
 * Os casos maus primeiro: sem base legal nunca sai; o tecto (do agente, do canal e do AIOS)
 * respeita-se dentro do mesmo lote; chamada, dinheiro, trading e merge nunca saem sozinhos.
 */
import { KIND_ENVIO } from '@/lib/envios-aprovacao'
import { TECTOS_PADRAO, type Evidencia, type Tectos } from '@/lib/agentes/contacto-inicial'
import { decidirLote, familiasDaOferta, pedidoDoEnvio, type ItemLote, type LinhaFila } from './envios-auto-aprovar'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }

const SAIDA = '\n\nSe não quiseres receber mais estes emails, responde SAIR. — MoreThanMoney'
const AG = 'ag-formacao-id'
const linha = (id: string, extra: Partial<LinhaFila> = {}, payload: Record<string, unknown> = {}): LinhaFila => ({
  id, kind: KIND_ENVIO.EMAIL_RECUPERACAO, status: 'pendente', title: id,
  payload: { email: `${id}@gmail.com`, assunto: 'O teu pack Membro está em pausa', texto: 'Olá, o teu pack Membro terminou.' + SAIDA, agente: 'AG-FORMACAO', ...payload },
  ...extra,
})
const exCliente: Evidencia = { familiasCompradas: ['formacao'] }
const semNada: Evidencia = {}
const item = (l: LinhaFila, ev: Evidencia | null = exCliente, agenteId: string | null = AG): ItemLote => ({ prep: pedidoDoEnvio(l), agenteId, evidencia: ev })
const zero = { [AG]: { total: 0, porCanal: { email: 0, telegram: 0 } } }

// ── MAU Nº 1: sem base legal, nunca sai — com tecto folgado e auto-aprovar ligado ──────────────
{
  const d = decidirLote([item(linha('nunca-pagou'), semNada)], zero, TECTOS_PADRAO, 100)
  teste('nunca pagou nem consentiu: bloqueado', d[0].destino === 'bloqueado' && d[0].base === null)
  const sem = decidirLote([item(linha('ev-ilegivel'), null)], zero, TECTOS_PADRAO, 100)
  teste('evidência ilegível: não sai', sem[0].destino !== 'sai')
  const excl = decidirLote([item(linha('saiu'), { ...exCliente, excluido: true })], zero, TECTOS_PADRAO, 100)
  teste('ex-cliente na exclusão global: bloqueado', excl[0].destino === 'bloqueado')
  const semSaida = decidirLote([item(linha('sem-saida', {}, { texto: 'Olá, o teu pack Membro terminou. Volta.' }))], zero, TECTOS_PADRAO, 100)
  teste('ex-cliente sem forma de sair na mensagem: não sai', semSaida[0].destino !== 'sai')
  const outra = decidirLote([item(linha('premium', {}, { assunto: 'O Premium espera-te', texto: 'Volta ao Premium.' + SAIDA }))], zero, TECTOS_PADRAO, 100)
  teste('ex-Membro com oferta de Premium (não semelhante): não sai', outra[0].destino !== 'sai')
  const misto = decidirLote([item(linha('misto', {}, { texto: 'Volta ao Membro, ou ao Premium.' + SAIDA }))], zero, TECTOS_PADRAO, 100)
  teste('oferta que mistura Membro e Premium a um ex-Membro: não sai', misto[0].destino !== 'sai')
  const semAg = decidirLote([item(linha('sem-agente'), exCliente, null)], zero, TECTOS_PADRAO, 100)
  teste('agente desconhecido: não sai', semAg[0].destino === 'saltado')
  const semContagem = decidirLote([item(linha('sem-contagem'))], {}, TECTOS_PADRAO, 100)
  teste('registo de hoje ilegível: não sai', semContagem[0].destino === 'fila')
}

// ── MAU Nº 2: os tectos ───────────────────────────────────────────────────────────────────────
{
  const lote = ['a', 'b', 'c', 'd'].map((x) => item(linha(x)))
  const aios = decidirLote(lote, zero, TECTOS_PADRAO, 2)
  teste('tecto total do AIOS (2): só 2 saem', aios.filter((d) => d.destino === 'sai').length === 2)
  const porAg = decidirLote(lote, zero, TECTOS_PADRAO, 100, { [AG]: 1 })
  teste('tecto por agente do AIOS (1): só 1 sai', porAg.filter((d) => d.destino === 'sai').length === 1)
  const apertado: Tectos = { porAgenteDia: 3, porCanalDia: { email: 30 } }
  const ag = decidirLote(lote, { [AG]: { total: 2, porCanal: { email: 2 } } }, apertado, 100)
  teste('tecto do agente (3, já 2 hoje): só 1 sai neste lote', ag.filter((d) => d.destino === 'sai').length === 1)
  const canal: Tectos = { porAgenteDia: 40, porCanalDia: { email: 2 } }
  const c = decidirLote(lote, zero, canal, 100)
  teste('tecto do canal email (2): só 2 saem', c.filter((d) => d.destino === 'sai').length === 2)
  const nada = decidirLote(lote, zero, TECTOS_PADRAO, 0)
  teste('limite 0 (AIOS esgotado): nada sai', nada.every((d) => d.destino !== 'sai'))
}

// ── MAU Nº 3: o que nunca é automático ────────────────────────────────────────────────────────
{
  teste('chamada (contacto imediato) é saltada', pedidoDoEnvio(linha('ch', { kind: KIND_ENVIO.CONTACTO_IMEDIATO })).saltar)
  teste('kind desconhecido é saltado', pedidoDoEnvio(linha('x', { kind: 'envio:qualquer' })).saltar)
  teste('tarefa interna (não envio) é saltada', pedidoDoEnvio(linha('t', { kind: 'tarefa' })).saltar)
  teste('já aprovado/rejeitado não se reaprova', pedidoDoEnvio(linha('r', { status: 'rejeitado' })).saltar)
  for (const t of ['Pedimos o teu IBAN para o reembolso', 'Vamos abrir posição em ouro por ti', 'Faço merge do ramo hoje', 'Vou apagar a conta']) {
    teste(`nunca sozinho: «${t}»`, pedidoDoEnvio(linha('m', {}, { texto: t + SAIDA })).saltar)
  }
}

// ── BOM: o ex-cliente de formação, oferta de formação, com saída, sai com a base escrita ───────
{
  const d = decidirLote([item(linha('bom'))], zero, TECTOS_PADRAO, 5)
  teste('ex-cliente + produto semelhante + saída: sai por soft opt-in', d[0].destino === 'sai' && d[0].base === 'soft_opt_in')
  const cons = decidirLote([item(linha('cons', {}, { texto: 'Novidade do Premium.' + SAIDA }), { consentimentoCanal: true })], zero, TECTOS_PADRAO, 5)
  teste('consentimento gravado para email: sai', cons[0].destino === 'sai' && cons[0].base === 'consentimento')
  teste('família explícita ganha à leitura', familiasDaOferta({ familia_oferta: 'copy', texto: 'Premium' }).join() === 'copy')
  teste('Membro lê-se como formação', familiasDaOferta({ texto: 'o teu pack Membro' }).join() === 'formacao')
}

// ── SERVIÇO (07/10): sobre o contrato dela, a quem pagou ou tentou pagar ─────────────────────
{
  const falhou = (id: string, texto: string) => linha(id, {}, { segmento: 'a · pagamento falhado', assunto: 'O teu pack Membro ficou parado', texto })
  const tentou: Evidencia = { familiasContrato: ['formacao'] }
  const ok = decidirLote([item(falhou('srv', 'O débito do teu pack Membro foi recusado. Actualiza o cartão.'), tentou)], zero, TECTOS_PADRAO, 5)
  teste('pagamento recusado do Membro, aviso do Membro: sai por serviço', ok[0].destino === 'sai' && ok[0].base === 'servico')
  const nunca = decidirLote([item(falhou('srv0', 'O débito do teu pack Membro foi recusado.'), semNada)], zero, TECTOS_PADRAO, 5)
  teste('«serviço» a quem nunca teve contrato: bloqueado', nunca[0].destino === 'bloqueado')
  const outra = decidirLote([item(falhou('srv1', 'O Membro falhou. Experimenta antes o Premium.'), tentou)], zero, TECTOS_PADRAO, 5)
  teste('«serviço» que oferece outro produto: não sai', outra[0].destino !== 'sai')
  const excl = decidirLote([item(falhou('srv2', 'O débito do teu pack Membro foi recusado.'), { ...tentou, excluido: true })], zero, TECTOS_PADRAO, 5)
  teste('«serviço» a quem saiu: bloqueado', excl[0].destino === 'bloqueado')
  const marketing = decidirLote([item(linha('mk', {}, { texto: 'Volta ao Membro.' + SAIDA }), tentou)], zero, TECTOS_PADRAO, 5)
  teste('só tentou pagar, mensagem de marketing: não sai (soft opt-in pede compra real)', marketing[0].destino !== 'sai')
  const tecto = decidirLote(['s1', 's2', 's3'].map((x) => item(falhou(x, 'O débito do teu pack Membro foi recusado.'), tentou)), zero, TECTOS_PADRAO, 1)
  teste('serviço também respeita o tecto do AIOS', tecto.filter((d) => d.destino === 'sai').length === 1)
}

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):\n - ` + falhas.join('\n - '))
  process.exit(1)
}
console.log('envios-auto-aprovar: todos os casos passam')
