/**
 * A GUARDA DA APP DE ALUNOS.
 *
 *   npx tsx lib/lms/app-de-alunos.check.ts
 *
 * O caso mau que isto existe para travar é o que não dá erro nenhum: mandar comprar outra vez quem
 * já pagou, porque a venda foi lá fora e o nosso `jaComprou` nunca a viu.
 */
import { portaDaApp, textoDoAcesso, vendaPassaPorNos, type Porta } from './app-de-alunos'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const SFA = { app_alunos_url: 'https://alunosfa.lovable.app', app_alunos_produto_slug: 'she-is-faceless-academy' }
const CURSO_LA_FORA = {
  slug: 'she-is-faceless-academy',
  titulo: 'She Is Faceless Academy',
  preco_cents: 12700,
  checkout_externo_url: 'https://shop.beacons.ai/sheisfacelessacademy/abc',
}
const CURSO_CA_DENTRO = { slug: 'curso-mtm', titulo: 'Curso MTM', preco_cents: 9900, checkout_externo_url: null }

// ── Sem app, não há cartão ──────────────────────────────────────────────────
{
  teste('canal sem app não mostra nada', !portaDaApp(null, CURSO_LA_FORA).mostrar)
  teste('url vazio não mostra nada', !portaDaApp({ app_alunos_url: '  ' }, CURSO_LA_FORA).mostrar)
  /**
   * Um caminho relativo não é uma app externa. Aceitá-lo punha o botão «abrir a app» a navegar
   * dentro do próprio site — e `//outro-sitio.com` mandava o visitante para outro domínio a partir
   * de um campo de texto do painel.
   */
  for (const mau of ['/alunos', '//alunosfa.lovable.app', 'alunosfa.lovable.app', 'javascript:alert(1)']) {
    teste(`«${mau}» não é endereço de app`, !portaDaApp({ app_alunos_url: mau }, CURSO_LA_FORA).mostrar)
  }
}

// ── O CASO MAU: venda lá fora ───────────────────────────────────────────────
{
  teste('venda lá fora: não passa por nós', !vendaPassaPorNos(CURSO_LA_FORA))

  const p = portaDaApp(SFA, CURSO_LA_FORA)
  teste('venda lá fora → duas portas', p.mostrar && p.modo === 'duas_portas')
  teste('e assume que não sabe quem é aluna', p.mostrar && p.modo === 'duas_portas' && !p.sabemosQuemEAluna)
  teste('com caminho para o curso', p.mostrar && p.modo === 'duas_portas' && p.produtoHref === '/marketplace/she-is-faceless-academy')

  /**
   * ESTE É O TESTE QUE IMPORTA. Alguém comprou na loja da academia. O nosso `jaComprou` diz falso
   * porque nunca viu a venda — e um cadeado ingénuo mandava a aluna comprar o curso outra vez.
   * A porta de entrada tem de continuar lá.
   */
  const jaPagouLaFora = portaDaApp(SFA, { ...CURSO_LA_FORA, jaComprou: false })
  teste('quem pagou lá fora continua a ter porta de entrada',
    jaPagouLaFora.mostrar && jaPagouLaFora.modo === 'duas_portas' && jaPagouLaFora.appUrl === 'https://alunosfa.lovable.app')

  // E o contrário do mesmo erro: um `jaComprou` a verdadeiro num produto externo não é de confiar,
  // porque não há maneira de ele ser verdadeiro — mas se alguém o puser, não fecha a outra porta.
  const mentira = portaDaApp(SFA, { ...CURSO_LA_FORA, jaComprou: true })
  teste('jaComprou não manda num produto vendido lá fora', mentira.mostrar && mentira.modo === 'duas_portas')
}

// ── Venda cá dentro: aí sabemos ─────────────────────────────────────────────
{
  teste('venda cá dentro: passa por nós', vendaPassaPorNos(CURSO_CA_DENTRO))

  const comprou = portaDaApp(SFA, { ...CURSO_CA_DENTRO, jaComprou: true })
  teste('comprou cá dentro → porta única', comprou.mostrar && comprou.modo === 'entra')

  const naoComprou = portaDaApp(SFA, { ...CURSO_CA_DENTRO, jaComprou: false })
  teste('não comprou cá dentro → duas portas', naoComprou.mostrar && naoComprou.modo === 'duas_portas')
  teste('e aí sabemos mesmo quem é aluna',
    naoComprou.mostrar && naoComprou.modo === 'duas_portas' && naoComprou.sabemosQuemEAluna)
}

// ── Sem produto ligado ──────────────────────────────────────────────────────
{
  const semProduto = portaDaApp({ app_alunos_url: 'https://alunosfa.lovable.app' }, null)
  teste('sem produto ligado, a app continua a abrir', semProduto.mostrar && semProduto.modo === 'duas_portas')
  teste('mas não inventa um caminho para comprar',
    semProduto.mostrar && semProduto.modo === 'duas_portas' && semProduto.produtoHref === null)
}

// ── O texto diz o que sabemos, e só isso ────────────────────────────────────
{
  const laFora = textoDoAcesso(portaDaApp(SFA, CURSO_LA_FORA), 'She Is Faceless Academy')
  teste('lá fora: nomeia o curso', laFora.includes('She Is Faceless Academy'))
  teste('lá fora: admite que não sabe se já és aluna', /não consegue saber/.test(laFora))

  const caDentro = textoDoAcesso(portaDaApp(SFA, { ...CURSO_CA_DENTRO, jaComprou: false }), 'Curso MTM')
  teste('cá dentro: NÃO diz que não sabe', !/não consegue saber/.test(caDentro))

  const dentro = textoDoAcesso(portaDaApp(SFA, { ...CURSO_CA_DENTRO, jaComprou: true }), 'Curso MTM')
  teste('quem tem acesso não lê um convite a comprar', !/compra|curso está aqui/i.test(dentro))

  teste('sem app não há texto', textoDoAcesso({ mostrar: false } as Porta) === '')
  teste('sem título, há uma frase na mesma',
    textoDoAcesso(portaDaApp(SFA, CURSO_LA_FORA), null).length > 30)
}

if (falhas.length) {
  console.error(`lms/app-de-alunos: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('lms/app-de-alunos: duas portas quando a venda é lá fora, e nunca se manda comprar duas vezes ✓')
