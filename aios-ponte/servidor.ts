#!/usr/bin/env node
/**
 * A PONTE DO AIOS — corre no computador do dono, não na nuvem.
 *
 *   npx tsx aios-ponte/servidor.ts
 *
 * ═══ PARA QUE SERVE ════════════════════════════════════════════════════════════════════════
 *
 * O /aios corre na Vercel. As 25 skills do Claude Code (graphify, ui-ux-pro-max, design-system,
 * mtm-executive-os…) estão instaladas NESTE computador. Esta ponte é o que os liga: recebe um
 * pedido do AIOS no browser, corre o `claude` aqui dentro, e devolve a resposta em directo.
 *
 * ═══ ISTO EXECUTA CÓDIGO NA TUA MÁQUINA ════════════════════════════════════════════════════
 *
 * Não é uma API qualquer. Quem conseguir falar com esta ponte manda o Claude Code correr no teu
 * computador, com acesso ao repositório. Por isso:
 *
 *  · escuta SÓ em 127.0.0.1 — nunca 0.0.0.0, por mais apetecível que pareça para «testar do
 *    telemóvel». Nesse momento a rede inteira do café passa a poder falar com ela;
 *  · exige um segredo, gerado no arranque e guardado em `.aios-ponte-segredo` (ignorado pelo git);
 *  · só aceita as origens de `lib/aios/ponte.ts`;
 *  · o pedido vai por STDIN, nunca na linha de comandos.
 *
 * As decisões vivem em `lib/aios/ponte.ts`, puras e provadas por `ponte.check.ts`. Este ficheiro
 * só as aplica — para não haver duas versões da regra de quem pode entrar.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const PORTA = Number(process.env.AIOS_PONTE_PORTA || 4319)

/**
 * As decisões vêm do módulo puro. Duplicá-las aqui seria ter duas versões da regra de quem entra —
 * e seria esta, a que ninguém testa, a que mandava na porta.
 *
 * É por isto que este ficheiro é `.ts` e se corre com `npx tsx`: um servidor `.mjs` a carregar
 * TypeScript em tempo de execução entra em ciclo de módulos (`ERR_REQUIRE_CYCLE_MODULE`). Correr o
 * próprio servidor sob `tsx` resolve-o sem truque nenhum.
 */
import {
  ORIGENS_PERMITIDAS, TEMPO_LIMITE_MS, argumentosDoClaude, podeCorrer, textoDaLinha,
} from '../lib/aios/ponte'

// ── O segredo ───────────────────────────────────────────────────────────────
const FICHEIRO_SEGREDO = join(RAIZ, '.aios-ponte-segredo')
let SEGREDO = ''
if (existsSync(FICHEIRO_SEGREDO)) {
  SEGREDO = readFileSync(FICHEIRO_SEGREDO, 'utf8').trim()
}
if (!SEGREDO) {
  SEGREDO = randomBytes(24).toString('hex')
  writeFileSync(FICHEIRO_SEGREDO, SEGREDO + '\n', { mode: 0o600 })
}

function cabecalhos(origem: string | null): Record<string, string> {
  const permitida = origem ? ORIGENS_PERMITIDAS.includes(origem.replace(/\/$/, '')) : false
  return {
    // Devolve-se a origem exacta e nunca `*`: com `*` qualquer página do mundo podia ler o que
    // esta ponte responde.
    ...(permitida && origem ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'content-type, x-aios-segredo',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    // O Chrome exige isto para uma página https poder falar com 127.0.0.1 (Private Network Access).
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  }
}

const servidor = createServer(async (req, res) => {
  const origem = req.headers.origin ?? null
  const base = cabecalhos(origem)

  if (req.method === 'OPTIONS') { res.writeHead(204, base); res.end(); return }

  // Um ping para o AIOS saber se a ponte está de pé — sem segredo, porque não revela nada: só diz
  // que existe. Quem já está a falar com 127.0.0.1 sabe-o de qualquer forma.
  if (req.method === 'GET' && req.url?.startsWith('/saude')) {
    res.writeHead(200, { ...base, 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ponte: 'aios', raiz: RAIZ }))
    return
  }

  if (req.method !== 'POST' || !req.url?.startsWith('/pedido')) {
    res.writeHead(404, base); res.end(); return
  }

  let corpo = ''
  for await (const p of req) {
    corpo += p
    if (corpo.length > 200_000) { res.writeHead(413, base); res.end(); return }
  }
  let dados: { pedido?: string; sessao?: string; continuar?: boolean } = {}
  try { dados = JSON.parse(corpo || '{}') } catch { /* fica vazio e a decisão recusa */ }

  const v = podeCorrer({
    origem,
    segredoRecebido: (req.headers['x-aios-segredo'] as string | undefined) ?? null,
    segredoEsperado: SEGREDO,
    pedido: dados.pedido,
  })
  if (!v.pode) {
    console.warn(`[ponte] recusado (${v.codigo}): ${v.porque}`)
    res.writeHead(v.codigo === 'origem_recusada' ? 403 : 401, { ...base, 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, codigo: v.codigo, porque: v.porque }))
    return
  }

  // ── Correr o Claude Code ──────────────────────────────────────────────────
  res.writeHead(200, { ...base, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const manda = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)

  const filho = spawn('claude', argumentosDoClaude({ sessao: dados.sessao, continuar: dados.continuar }), {
    cwd: RAIZ,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // O PEDIDO VAI POR AQUI, e não nos argumentos: texto de fora numa linha de comandos é uma
  // injeção à espera de acontecer, e aqui a injeção dava execução nesta máquina.
  filho.stdin.write(String(dados.pedido))
  filho.stdin.end()

  const limite = setTimeout(() => {
    manda({ erro: `O pedido passou dos ${Math.round(TEMPO_LIMITE_MS / 60000)} minutos e foi parado.` })
    filho.kill('SIGTERM')
  }, TEMPO_LIMITE_MS)

  let sobra = ''
  filho.stdout.on('data', (p: Buffer) => {
    // As linhas do stream-json vêm cortadas a meio entre pedaços. Sem guardar a sobra, perde-se
    // uma linha inteira de cada vez que isso acontece.
    const linhas = (sobra + p.toString()).split('\n')
    sobra = linhas.pop() ?? ''
    for (const linha of linhas) {
      const r = textoDaLinha(linha)
      if (r) manda(r)
    }
  })
  filho.stderr.on('data', (p: Buffer) => console.error('[claude]', p.toString().trim().slice(0, 300)))

  filho.on('close', (codigo: number | null) => {
    clearTimeout(limite)
    if (codigo !== 0) manda({ erro: `O Claude Code saiu com código ${codigo}. Vê a consola da ponte.` })
    manda({ fim: true })
    res.end()
  })

  req.on('close', () => { clearTimeout(limite); filho.kill('SIGTERM') })
})

// 127.0.0.1 e não 0.0.0.0. Esta linha é a diferença entre «só este computador» e «toda a rede».
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log('')
  console.log('  Ponte do AIOS de pé em http://127.0.0.1:' + PORTA)
  console.log('  Repositório: ' + RAIZ)
  console.log('')
  console.log('  Segredo (cola-o uma vez no AIOS):')
  console.log('  ' + SEGREDO)
  console.log('')
  console.log('  Guardado em .aios-ponte-segredo — não o partilhes nem o metas no git.')
  console.log('')
})
