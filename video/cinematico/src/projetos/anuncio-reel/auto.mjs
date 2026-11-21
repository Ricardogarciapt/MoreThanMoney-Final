// GERADOR DA PEÇA CINEMÁTICA (20/11/2026) — o molde AnuncioReel aprovado pelo Ricardo, sem mão humana.
//
// Entra: as legendas do gémeo (segmentos [ini, fim, texto] em segundos, do Whisper), a marca e o guião
// (gancho no ecrã, palavra-chave, nicho/linha, imagens de apoio já descarregadas). Sai: a config do
// AnuncioReel (gancho cinético, imagens em PiP, chips, destaque da palavra-chave, cartão final com CTA,
// aviso) — a mesma forma de ANUNCIOS em anuncios.ts. Puro e determinista (sem rede, sem relógio).
//
// Regras de casa que este ficheiro garante: nada de números inventados (os chips só repetem o que a
// voz diz), disclaimer sempre que se fala de trading/mercados, CTA com a palavra-chave do guião.

const PONTUACAO = /[.?!:]$/

/** Junta os segmentos em frases: [{ de, ate, texto, segs }]. */
export function frases(legendas) {
  const out = []
  let cur = null
  for (const [de, ate, t] of legendas) {
    if (!cur) cur = { de, ate, texto: '', segs: [] }
    cur.ate = ate
    cur.texto = `${cur.texto} ${t}`.trim()
    cur.segs.push([de, ate, t])
    if (PONTUACAO.test(String(t).trim())) { out.push(cur); cur = null }
  }
  if (cur) out.push(cur)
  return out
}

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Parte um gancho em duas linhas equilibradas, em maiúsculas (máx. ~22 caracteres por linha). */
export function linhasGancho(texto) {
  const p = String(texto || '').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().split(' ').filter(Boolean)
  if (!p.length) return []
  const corte = p.join(' ').length > 50 ? p.slice(0, 9) : p
  if (corte.join(' ').length <= 16) return [corte.join(' ')]
  let melhor = 1, dif = Infinity
  for (let i = 1; i < corte.length; i++) {
    const d = Math.abs(corte.slice(0, i).join(' ').length - corte.slice(i).join(' ').length)
    if (d < dif) { dif = d; melhor = i }
  }
  return [corte.slice(0, melhor).join(' '), corte.slice(melhor).join(' ')]
}

/** Sem gancho no guião: a pergunta (última oração) se a 1.ª frase pergunta, senão a 1.ª oração; ≤ 8 palavras. */
export function ganchoDaFrase(texto) {
  const t = String(texto || '').trim()
  const oracoes = t.split(/[,:;]\s+/).filter(Boolean)
  const o = (/\?$/.test(t) ? oracoes[oracoes.length - 1] : oracoes[0]) || t
  const p = o.split(/\s+/)
  return p.length > 8 ? p.slice(0, 7).join(' ') + '…' : o
}

// Tema da frase → clip de stock (Mixkit, video/cinematico/public/stock) com a grade de cor da emoção.
const TEMAS = [
  { re: /\b(cansad|noite|madrugada|23|exaust|horas extra|emprego|patrao|chefe|40 ?h)/, clips: ['noite_cansado_1', 'noite_cansado_2'], grade: 'noite' },
  { re: /\b(stress|contas|dividas?|papel|confus|perdi|perder|medo|caos|ansied)/, clips: ['stress_papel_1', 'stress_papel_2'], grade: 'frio' },
  { re: /\b(liberdade|familia|tempo livre|viajar|praia|sonho|vida que|filhos)/, clips: ['liberdade_1', 'liberdade_2'], grade: 'ouro' },
  { re: /\b(equipa|aprend|formac|aulas?|comunidade|mentor|ensin|curso)/, clips: ['equipa_formacao_1', 'equipa_formacao_2'], grade: 'neutro' },
  { re: /\b(negocio|empresa|clientes?|ia\b|inteligencia artificial|automat|site|tecnolog)/, clips: ['negocio_tecnologia_1', 'negocio_tecnologia_2'], grade: 'neutro' },
  { re: /\b(telemovel|mensagem|whatsapp|instagram|agenda|marca)/, clips: ['cliente_marca_1', 'cliente_marca_2'], grade: 'neutro' },
]
// Tema da frase → ecrãs REAIS das Demos e Soluções do site (21/11, pedido do Ricardo: os ecrãs da app MTM System
// deixaram de servir; mostrar as demos novas e várias opções). O robô captura as páginas ao montar
// (robo-cinematico.mjs capturarDemos); uma demo ainda não publicada dá 404 e cai fora sozinha.
// Cada entrada pode ter várias páginas: o telemóvel passa por elas (montra de opções).
const DEMOS = [
  { re: /\b(nota de voz|por voz|crm|ficha|visita|comercia)/, p: ['/solucoes/demos/crm-por-voz'] },
  { re: /\b(reuni|meet|resumo|ata\b)/, p: ['/solucoes/demos/reuniao-com-resumo'] },
  { re: /\b(marcac|marcar|agenda|horario|whatsapp)/, p: ['/solucoes/demos/marcacoes-whatsapp', '/demos?modelo=barbearia'] },
  { re: /\b(orcament|formulario|propostas?\b)/, p: ['/solucoes/demos/orcamento-automatico'] },
  { re: /\b(avaliac|google|estrelas|reviews?)/, p: ['/solucoes/demos/avaliacoes-google'] },
  { re: /\b(linktree|link na bio|bio\b|pagina|site)/, p: ['/solucoes/demos/linktree-para-app'] },
  { re: /\b(fatura|contabil|papeis|papelada|fornecedor)/, p: ['/solucoes/demos/faturas-por-email', '/demos?modelo=profissional'] },
  { re: /\b(mentor|comunidade|alunos|estrategia|scanner|sinais?|trading|trader)/, p: ['/solucoes/demos/mentor-ia-comunidade', '/solucoes/demos/diario-trading-alunos'] },
  { re: /\b(alojamento|check-?in|hospede|turist)/, p: ['/solucoes/demos/checkin-alojamento-local'] },
  { re: /\b(pastelaria|encomenda|cozinha|restaurante|tasca|cafe)/, p: ['/solucoes/demos/encomendas-pastelaria', '/demos?modelo=restaurante'] },
  { re: /\b(mensalidade|ginasio|treino|cobra|pagamento)/, p: ['/solucoes/demos/mensalidades-em-dia', '/demos?modelo=ginasio'] },
  { re: /\b(imobili|casas?\b|imove)/, p: ['/demos?modelo=imobiliaria'] },
  { re: /\b(clinica|fisio|saude|consulta)/, p: ['/demos?modelo=clinica'] },
  { re: /\b(barbear|cabeleir|estetica|beleza|unhas)/, p: ['/demos?modelo=barbearia', '/demos?modelo=beleza'] },
]
// Fala de negócio/IA sem sector concreto: várias opções seguidas, cada uma com a sua marca fictícia.
const MONTRA = ['/demos?modelo=restaurante', '/demos?modelo=barbearia', '/demos?modelo=clinica', '/demos?modelo=ginasio']
const RE_NEGOCIO = /\b(negocio|empresa|clientes?|ia\b|inteligencia artificial|automat|solucoes|sistema|tecnolog|app)/
/** Nome do ficheiro capturado para uma página (o robô escreve-o em public/stock/auto). */
export const ficheiroDemo = (p) => `demo-${p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.jpg`
const ecraDemo = (paginas) => ({ tipo: 'app', src: `stock/auto/${ficheiroDemo(paginas[0])}`, srcs: paginas.map((x) => `stock/auto/${ficheiroDemo(x)}`), demo: paginas })

// Fotos REAIS do Ricardo animadas em vários planos (21/11, pedido dele: «anima fotos em vários planos», métodos
// de conteúdo magnético; estética real, nada de pistas de IA). Cada foto tem o fundo e a figura recortados em
// public/fotos-planos/<k>-fundo.jpg + <k>-figura.png; o Video.tsx (FotoPlanos) faz parallax entre as camadas e
// corta em 2 planos (aberto → aproximado no rosto). Máx. 2 por reel, nunca seguidas; pelo menos 1 em cada reel.
const FOTOS = [
  { re: /\b(disciplin|rotina|regras|militar|gnr|farda|tropa|servic|ordem|compromisso|plano)/, k: 'farda' },
  // 'grade' fora desde 21/11 (Ricardo: a animação não ficou boa). Volta se houver um clip melhor.
  { re: /\b(origem|porto|infancia|crianc|pobre|adotad|comec|historia|pais\b|nada\b)/, k: 'origem' },
  { re: /\b(palco|ensin|partilh|evento|comunidade|mentor|alunos|aprend|formac|metodo)/, k: 'palco' },
  { re: /\b(liberdade|lisboa|viaj|tempo livre|vida|sonho|recome|resultado|futuro|escolh|paciencia)/, k: 'recomeco' },
  { re: /\b(conteudo|grav|camara|video|marca|digital|online|instagram|criar|negocio|solucoes|ia\b)/, k: 'estudio' },
  { re: /\b(decis|conversa|mensagem|telemovel|mentoria|emoc|dinheiro|risco|trading|mercado)/, k: 'retrato' },
]
export const FOTOS_PLANOS = FOTOS.map((x) => x.k)

// Palavras ditas → chip curto (só repete o que a voz disse; nunca um número).
const CHIPS = [
  { re: /gestao de risco|regras de risco|\brisco\b/, t: '✓ Gestão de risco' },
  { re: /corretora regulada|regulad/, t: '✓ Corretora regulada' },
  { re: /em teu nome/, t: '🔒 Conta em teu nome' },
  { re: /\bmetodo\b/, t: '✓ Método' },
  { re: /\bdisciplina/, t: '✓ Disciplina' },
  { re: /\bcomunidade/, t: '✓ Comunidade' },
  { re: /\bscanner/, t: '📡 Scanner' },
  { re: /inteligencia artificial|\bia\b/, t: '🤖 Com IA' },
  { re: /automat/, t: '⚙ Automatizado' },
  { re: /\bdemos?\b/, t: '▶ Demos por sector' },
  { re: /\b(orcamento|marcac)/, t: '✓ Orçamento + marcação' },
  { re: /\bsem cartao/, t: '✓ Sem cartão' },
  { re: /\bgratis|gratuit/, t: '✓ Grátis' },
  { re: /\bpaciencia/, t: '⏳ Paciência' },
  { re: /\bemoc/, t: '✗ Emoção' },
  { re: /promessa/, t: 'Sem promessas.' },
  { re: /\btempo\b/, t: '⏱ Tempo' },
]
const TRADING = /trading|mercad|corretora|forex|ouro|cripto|bitcoin|invest|sinal|scanner|operar|cfd|lucro|bolsa/

// MoreThanMoney Soluções (B2B: demos por sector, kits, Mentor IA para empresas) — pedido do Ricardo 20/11:
// quando o reel fala de negócio/clientes/IA para empresas, o cartão final leva a /solucoes.
const SOLUCOES = /\b(negocio|empresa|clientes?|loja|restaurante|ginasio|clinica|pastelaria|orcamento|marcacoes|automat|assistente|atendimento|site)/
export const URL_SOLUCOES = 'morethanmoney.pt/solucoes'

const ARROBA = { morethanmoney: '@morethanmoney.pt', 'ricardo-garcia': '@ricardogarciapt' }

/**
 * @param {{ marca: 'morethanmoney'|'ricardo-garcia', legendas: [number,number,string][],
 *   guiao?: { gancho?: string, palavra_chave?: string, nicho?: string, cta_url?: string },
 *   stock?: string[], apoio?: { src: string, tipo: 'video'|'app' }[] }} e
 */
export function anuncioAuto(e) {
  const marca = e.marca === 'ricardo-garcia' ? 'ricardo-garcia' : 'morethanmoney'
  const g = e.guiao || {}
  const fs = frases(e.legendas)
  // Guião de trading: a montra de negócios (restaurante, barbearia…) não tem nada a ver; só demos de trading ou vida real.
  const deTrading = /\b(trad|forex|ouro|mercado|risco|grafico|pips|bolsa|invest|dinheiro rapido|sinais?)/.test(sem(fs.map((x) => x.texto).join(' ') + ' ' + (e.guiao?.nicho || '')))
  if (!fs.length) throw new Error('sem legendas')
  const fimVoz = e.legendas[e.legendas.length - 1][1]
  const stock = new Set(e.stock || [])
  const palavra = String(g.palavra_chave || '').trim().toUpperCase()
  const todo = sem(fs.map((f) => f.texto).join(' '))

  // 1) Gancho: o texto de ecrã do guião, senão a primeira frase. Fica até ao fim da 1.ª frase (≤ 3,8 s).
  const gancho = { linhas: linhasGancho(g.gancho || ganchoDaFrase(fs[0].texto)), ate: Math.min(3.8, Math.max(1.6, fs[0].ate)) }

  // 2) CTA: a última frase com a palavra-chave ou um verbo de acção; senão os últimos ~3 s.
  const reCta = new RegExp(`${palavra ? sem(palavra) + '|' : ''}comenta|escreve|manda|envia|segue|clica|link|marca`)
  let iCta = -1
  for (let i = fs.length - 1; i >= 1; i--) if (reCta.test(sem(fs[i].texto))) { iCta = i; break }
  const ctaDe = iCta > 0 ? fs[iCta].de : Math.max(fs[0].ate + 1, fimVoz - 3)
  const iFimMeio = iCta > 0 ? iCta : fs.length

  // 3) Imagens em PiP: frases do meio (nem o gancho nem o CTA), uma sim uma não, ≥ 1,6 s.
  const imagens = []
  const usados = new Set()
  const apoio = [...(e.apoio || [])]
  // Janelas: cada frase do meio, partida em pedaços de ≤ 3,4 s (frases longas dão 2 imagens).
  const janelas = []
  for (let i = 1; i < iFimMeio; i++) {
    const f = fs[i]
    if (f.ate - f.de < 1.6 || f.de >= ctaDe - 0.3) continue
    let pedaco = []
    for (const sg of f.segs) {
      pedaco.push(sg)
      if (sg[1] - pedaco[0][0] >= 3.0) { janelas.push(pedaco); pedaco = [] }
    }
    if (pedaco.length) janelas.push(pedaco)
  }
  for (const jan of janelas) {
    const t = sem(jan.map((x) => x[2]).join(' '))
    // deixa o gémeo respirar ≥ 1 s a ecrã inteiro entre duas imagens
    const prev = imagens.length ? imagens[imagens.length - 1].ate + 1.0 : 0
    const de = +Math.max(jan[0][0], gancho.ate + 0.1, prev).toFixed(2)
    const ate = +Math.min(jan[jan.length - 1][1], de + 3.4, ctaDe - 0.2).toFixed(2)
    if (ate - de < 1.4) continue
    let img = null
    if (apoio.length) img = apoio.shift()
    const nFotos = imagens.filter((x) => x.tipo === 'foto').length
    const ultimaFoto = imagens.length > 0 && imagens[imagens.length - 1].tipo === 'foto'
    const foto = !img && nFotos < 2 && !ultimaFoto ? FOTOS.find((x) => x.re.test(t) && !usados.has(`foto:${x.k}`)) : null
    if (foto) { img = { tipo: 'foto', src: foto.k }; usados.add(`foto:${foto.k}`) }
    if (!img) {
      const tema = TEMAS.find((x) => x.re.test(t) && x.clips.some((c) => stock.has(c) && !usados.has(c)))
      const demo = DEMOS.find((x) => x.re.test(t) && !usados.has(x.p[0]))
      const montra = !demo && !deTrading && RE_NEGOCIO.test(t) && !usados.has(MONTRA[0])
      // alterna: depois de um ecrã de demo, se houver vida real a condizer, vai vida real
      const ultimaApp = imagens.length > 0 && imagens[imagens.length - 1].tipo === 'app'
      if (tema && (!(demo || montra) || ultimaApp)) {
        img = { src: tema.clips.find((x) => stock.has(x) && !usados.has(x)), tipo: 'video', grade: tema.grade }
      } else if (demo) img = ecraDemo(demo.p)
      else if (montra) img = ecraDemo(MONTRA)
      else {
        const livre = TEMAS.flatMap((x) => x.clips.map((c) => ({ c, g: x.grade }))).find((x) => stock.has(x.c) && !usados.has(x.c))
        if (livre) img = { src: livre.c, tipo: 'video', grade: livre.g }
        else if (!deTrading && !usados.has(MONTRA[0])) img = ecraDemo(MONTRA)
        else continue
      }
    }
    if (img.demo) img.demo.forEach((x) => usados.add(x))
    usados.add(img.src)
    imagens.push({ de, ate, ...img })
    if (imagens.length >= 4) break
  }

  // Pelo menos uma foto real por reel: se nenhuma frase pediu, a primeira imagem de stock dá lugar ao retrato.
  if (imagens.length && !imagens.some((x) => x.tipo === 'foto')) {
    const i = imagens.findIndex((x) => x.tipo === 'video')
    const k = marca === 'ricardo-garcia' ? 'retrato' : 'estudio'
    if (i >= 0) imagens[i] = { de: imagens[i].de, ate: imagens[i].ate, tipo: 'foto', src: k }
  }

  // 4) Chips: palavras que a voz diz, no segmento em que as diz; máx. 4, ≥ 1,1 s entre eles.
  const chips = []
  const vistos = new Set()
  for (const [de, , t] of e.legendas) {
    if (de < gancho.ate || de >= ctaDe - 0.2) continue
    const c = CHIPS.find((x) => x.re.test(sem(t)) && !vistos.has(x.t))
    if (!c) continue
    if (chips.length && de - chips[chips.length - 1].em < 1.1) continue
    vistos.add(c.t)
    chips.push({ em: +de.toFixed(2), t: c.t })
    if (chips.length >= 4) break
  }

  // 5) Destaque glitch: a palavra-chave no momento em que é dita (até ao fim da voz).
  let destaque
  if (palavra) {
    // Só antes do cartão final (no cartão a palavra já está em grande).
    const s = e.legendas.find(([de, , t]) => de >= gancho.ate && de < ctaDe - 0.8 && sem(t).includes(sem(palavra)))
    if (s) destaque = { em: +s[0].toFixed(2), ate: +Math.min(ctaDe, s[0] + 2.7).toFixed(2), t: palavra }
  }

  // 6) Cartão final.
  const b2b = SOLUCOES.test(todo) && !TRADING.test(todo)
  const url = g.cta_url || (b2b ? URL_SOLUCOES : ARROBA[marca])
  const cta = b2b && !palavra
    ? { de: +ctaDe.toFixed(2), topo: 'Demos por sector', grande: 'VÊ AS DEMOS', botao: 'Ver demos', url }
    : palavra
    ? { de: +ctaDe.toFixed(2), topo: 'Comenta a palavra', grande: `«${palavra}»`, botao: 'Comentar', url }
    : marca === 'ricardo-garcia'
      ? { de: +ctaDe.toFixed(2), topo: 'Bastidores sem filtro', grande: 'SEGUE', botao: 'Seguir', url }
      : { de: +ctaDe.toFixed(2), topo: 'Aprende com método', grande: 'SEGUE A PÁGINA', botao: 'Seguir', url }

  const out = { marca, gancho, imagens, chips, cta }
  if (destaque && destaque.ate - destaque.em > 0.8) out.destaque = destaque
  if (TRADING.test(todo)) out.aviso = 'Conteúdo educativo, não é consultoria financeira. Trading envolve risco de perda de capital.'
  return out
}

/** Tempos para a síntese da música/SFX (som/anuncio-reel/sintese.py), iguais aos do gerar-som.py. */
export function temposSom(config, fimVoz, cauda = 2.4) {
  return {
    total: fimVoz + cauda,
    cortes: [...config.imagens.map((i) => i.de), config.cta.de],
    impactos: [0.05, config.cta.de],
    risers: [config.cta.de],
    pulso_desde: 0.0,
  }
}

/** Whisper (palavras {w, ini, fim}) → segmentos de 2–4 palavras, cortando na pontuação. */
export function segmentosDePalavras(palavras) {
  const out = []
  let cur = []
  const fecha = () => { if (cur.length) out.push([+cur[0].ini.toFixed(2), +cur[cur.length - 1].fim.toFixed(2), cur.map((p) => p.w).join(' ')]); cur = [] }
  for (const p of palavras) {
    const w = String(p.w || '').trim()
    if (!w) continue
    if (cur.length && p.ini - cur[cur.length - 1].fim > 0.45) fecha()
    cur.push({ w, ini: Number(p.ini), fim: Number(p.fim) })
    if (PONTUACAO.test(w) || /,$/.test(w) && cur.length >= 2 || cur.length >= 4) fecha()
  }
  fecha()
  return out
}
