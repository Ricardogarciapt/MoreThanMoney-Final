/**
 * A GUARDA DA PONTE DO AIOS.
 *
 *   npx tsx lib/aios/ponte.check.ts
 *
 * Esta ponte corre o `claude` no computador do dono. Um buraco aqui não é um bug de interface: é
 * execução de código na máquina dele a partir de qualquer página que ele tenha aberta. Por isso
 * quase todos os testes são sobre o caso mau.
 */
import {
  FERRAMENTAS_PERMITIDAS, ORIGENS_PERMITIDAS, PEDIDO_MAX, argumentosDoClaude, origemPermitida,
  podeCorrer, segredosIguais, textoDaLinha,
} from './ponte'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const SEGREDO = 'a'.repeat(48)
const bom = { origem: 'https://www.morethanmoney.pt', segredoRecebido: SEGREDO, segredoEsperado: SEGREDO, pedido: 'olá' }

// ── Origens ─────────────────────────────────────────────────────────────────
{
  teste('o site passa', origemPermitida('https://www.morethanmoney.pt'))
  teste('o dev local passa', origemPermitida('http://localhost:3001'))
  teste('barra final não estraga', origemPermitida('https://www.morethanmoney.pt/'))

  teste('sem origem não passa', !origemPermitida(null))
  teste('origem vazia não passa', !origemPermitida(''))
  teste('outro site não passa', !origemPermitida('https://evil.com'))

  /**
   * Os três que uma lista escrita a olho deixa passar, e que são precisamente como se ataca isto:
   * um domínio que ACABA no nosso, um que o tem como prefixo, e o mesmo nome em http.
   */
  teste('sufixo não passa', !origemPermitida('https://evil-morethanmoney.pt'))
  teste('subdomínio de outro não passa', !origemPermitida('https://www.morethanmoney.pt.evil.com'))
  teste('o nosso site em http não passa', !origemPermitida('http://www.morethanmoney.pt'))
  teste('a lista não tem 0.0.0.0 nem IPs de rede local', !ORIGENS_PERMITIDAS.some((o) => /0\.0\.0\.0|192\.168|10\.\d/.test(o)))
}

// ── Segredo ─────────────────────────────────────────────────────────────────
{
  teste('igual é igual', segredosIguais('abc123', 'abc123'))
  teste('diferente não passa', !segredosIguais('abc123', 'abc124'))
  teste('vazio nunca passa', !segredosIguais('', ''))
  teste('vazio contra cheio não passa', !segredosIguais('', 'abc'))
  teste('prefixo não passa', !segredosIguais('abc', 'abcdef'))
  teste('comprimento diferente não passa', !segredosIguais('abcdef', 'abc'))
}

// ── A decisão toda ──────────────────────────────────────────────────────────
{
  teste('tudo certo passa', podeCorrer(bom).pode)

  const semOrigem = podeCorrer({ ...bom, origem: null })
  teste('sem origem não corre', !semOrigem.pode)
  teste('e o código diz porquê', semOrigem.codigo === 'origem_recusada')

  /**
   * A ORDEM IMPORTA: quem vem de uma origem errada é recusado ANTES de o segredo ser olhado. Se
   * fosse ao contrário, uma página qualquer podia usar esta ponte como oráculo para adivinhar o
   * segredo, uma tentativa de cada vez.
   */
  const origemMaComSegredoBom = podeCorrer({ ...bom, origem: 'https://evil.com' })
  teste('origem errada ganha ao segredo certo', origemMaComSegredoBom.codigo === 'origem_recusada')

  teste('segredo errado não corre', podeCorrer({ ...bom, segredoRecebido: 'x' }).codigo === 'segredo_errado')
  teste('sem segredo recebido não corre', !podeCorrer({ ...bom, segredoRecebido: null }).pode)

  // Uma ponte que arranca sem segredo não é «menos segura»: é uma porta aberta.
  const semSegredoNaPonte = podeCorrer({ ...bom, segredoEsperado: '' })
  teste('ponte sem segredo recusa tudo', !semSegredoNaPonte.pode)
  teste('e explica o risco', semSegredoNaPonte.porque.includes('qualquer página'))

  teste('pedido vazio não corre', !podeCorrer({ ...bom, pedido: '   ' }).pode)
  teste('pedido gigante não corre', !podeCorrer({ ...bom, pedido: 'x'.repeat(PEDIDO_MAX + 1) }).pode)
  teste('há sempre motivo escrito', [semOrigem, origemMaComSegredoBom, semSegredoNaPonte].every((v) => v.porque.length > 10))
}

// ── Os argumentos do processo ───────────────────────────────────────────────
{
  const base = argumentosDoClaude({})
  teste('pede stream-json', base.includes('--output-format') && base.includes('stream-json'))

  /**
   * O teste que paga este ficheiro: **o pedido do utilizador NUNCA pode ir na linha de comandos.**
   * Vai pelo stdin. Aqui garante-se que nada do que vem de fora entra neste array.
   */
  const LIXO = '; rm -rf / #'
  const comLixo = argumentosDoClaude({ sessao: LIXO })
  // Procura-se o texto EXACTO que veio de fora, e não um pedaço dele: «rm» sozinho também aparece
  // dentro de «--permission-mode», e um teste que caça pedaços falha sem haver defeito nenhum.
  teste('uma sessão com shell dentro não entra nos argumentos', !comLixo.some((a) => a.includes(LIXO)))
  teste('nem nenhum pedaço dela', !comLixo.some((a) => a.includes('-rf') || a.includes(';')))
  teste('e não fica --resume nenhum', !comLixo.includes('--resume'))

  const comSessao = argumentosDoClaude({ sessao: 'abc123-def456-7890' })
  teste('sessão válida passa', comSessao.includes('--resume') && comSessao.includes('abc123-def456-7890'))

  teste('continuar sem sessão usa --continue', argumentosDoClaude({ continuar: true }).includes('--continue'))
  teste('sessão ganha a continuar', !argumentosDoClaude({ continuar: true, sessao: 'abc123-def456-7890' }).includes('--continue'))

  // Nunca se passa o modo que salta todas as permissões — isso é decisão de quem está ao teclado.
  teste('não salta permissões', !base.includes('--dangerously-skip-permissions'))
  teste('escreve mas não corre tudo às cegas', base.includes('acceptEdits'))

  /**
   * A lista de ferramentas: sem ela, o Claude Code pede aprovação a ninguém e responde de memória.
   * COM ela, o perigo muda de lado — por isso o que importa testar é o que NÃO está lá dentro.
   */
  const lista = FERRAMENTAS_PERMITIDAS.join(',')
  teste('a lista é passada', base.includes('--allowedTools') && base.includes(lista))
  teste('pode ler ficheiros', lista.includes('Read') && lista.includes('Grep'))
  teste('pode ver o git', lista.includes('Bash(git status:*)') && lista.includes('Bash(git log:*)'))

  for (const proibido of ['git push', 'git commit', 'rm ', 'curl', 'vercel', 'npm publish', 'Bash(*)', 'Bash(:*)']) {
    teste(`«${proibido.trim()}» NÃO está na lista`, !lista.includes(proibido))
  }
  // Um `Bash` solto autorizaria tudo — é o erro de uma letra que abre a porta inteira.
  teste('não há Bash sem parênteses', !FERRAMENTAS_PERMITIDAS.includes('Bash'))
}

// ── A leitura do stream ─────────────────────────────────────────────────────
{
  teste('lixo não rebenta', textoDaLinha('isto não é json') === null)
  teste('linha vazia é ignorada', textoDaLinha('   ') === null)

  const sistema = textoDaLinha(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc-123' }))
  teste('a sessão é apanhada no init', sistema?.sessao === 'abc-123')

  /**
   * O ruído que escondeu o texto no primeiro teste real: o Claude Code manda dezenas de linhas
   * `system` por pedido (hooks, e um `commands_changed` com as 25 skills de cada vez). Nenhuma
   * delas tem nada para mostrar.
   */
  teste('hooks não passam', textoDaLinha(JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: 'abc-123' })) === null)
  teste('o catálogo de skills não passa', textoDaLinha(JSON.stringify({ type: 'system', subtype: 'commands_changed', session_id: 'abc-123' })) === null)

  const texto = textoDaLinha(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'olá' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: ' mundo' }] },
  }))
  teste('junta só os pedaços de texto', texto?.texto === 'olá mundo')

  // Uma mensagem só com uso de ferramentas não tem nada para mostrar — e mandar isso para o ecrã
  // enchia a consola de ruído que ninguém lê.
  teste('mensagem só de ferramentas não dá texto', textoDaLinha(JSON.stringify({
    type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x' }] },
  })) === null)

  const fim = textoDaLinha(JSON.stringify({ type: 'result', session_id: 'abc-123' }))
  teste('o fim é marcado', fim?.fim === true && fim?.sessao === 'abc-123')
}

if (falhas.length) {
  console.error(`aios/ponte: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('aios/ponte: origens fechadas, segredo em tempo constante, pedido fora da linha de comandos ✓')
