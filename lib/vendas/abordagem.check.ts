/**
 * A GUARDA DA ABORDAGEM.
 *
 *   npx tsx lib/vendas/abordagem.check.ts
 *
 * Nada aqui rebenta em produção — é esse o problema. Um canal sugerido que não existe, ou uma
 * ordem que manda insistir num lead queimado antes de pegar num que acabou de responder, não dá
 * erro nenhum: dá leads que não fecham, e isso ninguém atribui ao código.
 */
import {
  OBJECCOES, caminhos, diasDesde, objeccaoDe, proximoPasso, type PessoaDoNegocio,
} from './abordagem'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const AGORA = new Date('2026-10-01T12:00:00Z')
const haDias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString()

// ── Por onde se fala ────────────────────────────────────────────────────────
{
  const so_email: PessoaDoNegocio = { email: 'a@b.pt' }
  teste('só email dá um caminho', caminhos(so_email).length === 1)
  teste('e diz que é o único', caminhos(so_email)[0].porque.includes('único'))

  const com_tel = caminhos({ email: 'a@b.pt', telefone: '+351912345678' })
  // A mensagem vem antes da chamada: a chamada interrompe, a mensagem espera.
  teste('whatsapp antes da chamada', com_tel[0].canal === 'whatsapp' && com_tel[1].canal === 'telefone')
  teste('e o email fica para reforço', com_tel[com_tel.length - 1].canal === 'email')

  // A origem manda: quem veio do Instagram responde no Instagram.
  const ig = caminhos({ email: 'a@b.pt', instagram_handle: '@joao', origem: 'instagram_comentario' })
  teste('o Instagram vem primeiro quando foi de lá que veio', ig[0].canal === 'instagram')
  teste('o arroba não fica duplicado', ig[0].destino === '@joao')

  const igSemOrigem = caminhos({ email: 'a@b.pt', instagram_handle: 'joao', origem: 'marketplace' })
  teste('sem essa origem, o email ganha ao Instagram', igSemOrigem[0].canal === 'email')

  const tg = caminhos({ telegram_username: '@z', origem: 'telegram_bot' })
  teste('o Telegram vem primeiro quando foi de lá que veio', tg[0].canal === 'telegram')

  teste('sem contactos não há caminhos', caminhos({}).length === 0)
}

// ── Dias ────────────────────────────────────────────────────────────────────
{
  teste('conta os dias', diasDesde(haDias(3), AGORA) === 3)
  // «não sei» NÃO é «foi hoje» — e é a confusão que faz tratar um lead por tocar como um lead
  // acabado de contactar.
  teste('sem data é null, não zero', diasDesde(null, AGORA) === null)
  teste('data inválida é null', diasDesde('ontem', AGORA) === null)
}

// ── O próximo passo ─────────────────────────────────────────────────────────
{
  // O caso que o retrato de 01/10 mostrou: 106 leads que ninguém tocou.
  const novo = proximoPasso({ email: 'a@b.pt', estado: 'lead', criado_em: haDias(1) }, AGORA)
  teste('lead novo por tocar é o mais urgente', novo.urgencia === 1000)
  teste('e diz-se o que fazer', novo.accao.startsWith('Primeiro contacto'))

  const velho = proximoPasso({ email: 'a@b.pt', estado: 'lead', criado_em: haDias(40) }, AGORA)
  teste('lead antigo por tocar vale menos que um novo', velho.urgencia < novo.urgencia)
  teste('mas continua a valer mais que esperar', velho.urgencia > 100)

  /**
   * O ERRO QUE ISTO EXISTE PARA APANHAR: quem RESPONDEU tem de passar à frente de quem nunca
   * respondeu. A janela de atenção de quem respondeu fecha em horas; a do resto, em semanas.
   */
  const respondeu = proximoPasso(
    { email: 'a@b.pt', estado: 'contactado', criado_em: haDias(30), ultimo_contacto: haDias(3) }, AGORA)
  teste('quem respondeu passa à frente', respondeu.urgencia > novo.urgencia - 150 && respondeu.urgencia >= 900)
  teste('e manda retomar', respondeu.accao.startsWith('Retomar'))

  // Sem contacto nenhum não se sugere um contacto impossível.
  const cego = proximoPasso({ estado: 'lead', criado_em: haDias(1) }, AGORA)
  teste('sem canal não há canal sugerido', cego.canal === null && cego.destino === null)
  teste('e a acção é arranjar contacto', cego.accao.includes('contacto'))
  teste('e explica que não há por onde falar', cego.porque.includes('não tem'))

  // Insistir cedo demais queima o contacto.
  const cedo = proximoPasso(
    { email: 'a@b.pt', estado: 'lead', criado_em: haDias(10), ultimo_contacto: haDias(1), tentativas: 1 }, AGORA)
  teste('não manda insistir ao fim de 1 dia', cedo.accao === 'Esperar')
  teste('e a urgência é baixa', cedo.urgencia <= 100)

  const horas = proximoPasso(
    { email: 'a@b.pt', telefone: '+351900', estado: 'lead', criado_em: haDias(10), ultimo_contacto: haDias(5), tentativas: 1 }, AGORA)
  teste('passados dias, insiste', horas.accao.startsWith('Insistir'))
  // Repetir o mesmo canal que já falhou responde menos do que mudar.
  teste('e muda de canal', horas.canal !== caminhos({ email: 'a@b.pt', telefone: '+351900' })[0].canal)

  const queimado = proximoPasso(
    { email: 'a@b.pt', estado: 'lead', criado_em: haDias(60), ultimo_contacto: haDias(20), tentativas: 5 }, AGORA)
  teste('ao fim de 5 tentativas, fecha', queimado.accao.includes('arquivar'))
  teste('e deixa de ser prioridade', queimado.urgencia < 200)

  teste('perdido não gera trabalho', proximoPasso({ email: 'a@b.pt', estado: 'perdido' }, AGORA).urgencia === 0)
  teste('ganho gera acompanhamento', proximoPasso({ email: 'a@b.pt', estado: 'ganho' }, AGORA).accao.includes('arranque'))
  teste('no_show remarca sem culpar', proximoPasso({ email: 'a@b.pt', estado: 'no_show' }, AGORA).porque.includes('sem culpa'))

  // Todas as decisões têm de trazer motivo escrito: um ecrã que manda fazer sem dizer porquê
  // ensina quem o usa a ignorá-lo.
  const todas = [novo, velho, respondeu, cego, cedo, horas, queimado]
  teste('há sempre motivo', todas.every((x) => x.porque.length > 20))
  teste('a urgência fica no intervalo', todas.every((x) => x.urgencia >= 0 && x.urgencia <= 1000))
}

// ── As objeções ─────────────────────────────────────────────────────────────
{
  teste('«é caro» é reconhecido', objeccaoDe('acho que é caro para mim')?.chave === 'caro')
  teste('sem acentos também', objeccaoDe('nao tenho tempo')?.chave === 'tempo')
  teste('maiúsculas também', objeccaoDe('VOU PENSAR')?.chave === 'pensar')
  teste('texto solto não inventa objeção', objeccaoDe('olá bom dia') === null)
  teste('vazio não rebenta', objeccaoDe('') === null)

  teste('todas têm o que está por trás', OBJECCOES.every((o) => o.porTras.length > 25))
  teste('todas dizem o que FAZER', OBJECCOES.every((o) => o.resposta.length > 40))

  /**
   * A regra da casa dentro das respostas: nenhuma sugere inventar um número. A objeção da
   * confiança é a tentação — é ali que apetece atirar uma percentagem bonita.
   */
  const confianca = OBJECCOES.find((o) => o.chave === 'confianca')!
  teste('a prova tem de ter origem', confianca.resposta.includes('ONDE VEM') || confianca.resposta.includes('onde vem'))
  teste('e é em pips', confianca.resposta.includes('pips'))
  const risco = OBJECCOES.find((o) => o.chave === 'risco')!
  teste('nunca se promete que não perde', risco.resposta.includes('Não prometas'))
  teste('nenhuma resposta promete ganhos', !OBJECCOES.some((o) => /garantid|lucro certo|sem risco/i.test(o.resposta)))
}

if (falhas.length) {
  console.error(`vendas/abordagem: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('vendas/abordagem: canal que existe, quem respondeu primeiro, e objeções sem números inventados ✓')
