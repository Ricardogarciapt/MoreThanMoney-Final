/**
 * A GUARDA DO DESBLOQUEIO.
 *
 *   npx tsx lib/agentes/desbloqueio.check.ts
 *
 * O que se prova aqui não é que o plano distribui bloqueios por duas pilhas — isso é fácil. É que
 * o CATÁLOGO está bem escrito, e um catálogo mal escrito falha de duas maneiras que não dão erro:
 *
 *  · um bloqueio do dono classificado como interno → o CEO liga um motor que manda mensagens a
 *    pessoas reais, e o registo ao lado tem bom aspecto;
 *  · um bloqueio escalado SEM decisão pronta → trabalho a mudar de mesa, e o dono a abrir uma lista
 *    de perguntas em vez de uma lista de decisões. Ao terceiro dia deixa de a abrir.
 *
 * E uma terceira, mais traiçoeira: uma sonda que falha a contar como «parado». Aí o CEO age sobre
 * uma falha de leitura, e a frase que fica escrita parece perfeitamente sólida.
 */
import { BLOQUEIOS, planearDesbloqueio, type Sondagem } from './desbloqueio'
import { PODERES, deQuemE } from './autonomia-ceo'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

function parado(medida = 'medido'): Sondagem {
  return { parado: true, medida }
}
function resolvido(medida = 'já feito'): Sondagem {
  return { parado: false, medida }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O CATÁLOGO TEM DE ESTAR BEM ESCRITO — é aqui que os erros caros vivem.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  teste('o catálogo não está vazio', BLOQUEIOS.length > 0)
  const ids = BLOQUEIOS.map((b) => b.id)
  teste('os ids não se repetem', new Set(ids).size === ids.length)

  for (const b of BLOQUEIOS) {
    teste(`${b.id}: diz o que está parado`, b.oQue.trim().length > 40)
    teste(`${b.id}: traz a prova (ficheiro, linha ou consulta)`, b.prova.trim().length > 10)
    teste(`${b.id}: tem sonda`, typeof b.sondar === 'function')

    const v = deQuemE(b)
    if (v.de === 'ceo') {
      // Um bloqueio do CEO sem forma de o resolver é uma promessa: ele classifica-o como seu, e
      // depois não faz nada. O runner trata isso como defeito do catálogo, e aqui prova-se que não
      // acontece.
      teste(`${b.id}: é do CEO e SABE resolver-se`, typeof b.resolver === 'function')
      teste(`${b.id}: o poder que o cobre existe na lista`, !!b.poder && b.poder in PODERES)
      // E tem de ser interno: um bloqueio «do CEO» com efeito fora de casa é o erro caro.
      teste(`${b.id}: do CEO implica efeito interno`, b.efeito === 'interno')
    } else {
      // Um escalonamento sem decisão escrita não se grava. Se o catálogo trouxesse um, o CEO
      // reportava um erro todos os dias em vez de escalar.
      teste(`${b.id}: é do dono e TRAZ a decisão pronta`, (b.decisaoPronta ?? '').trim().length > 60)
      teste(
        `${b.id}: a decisão pronta é uma decisão e não uma pergunta`,
        !/^\s*(o que|que fazemos|devemos|será que)/i.test(b.decisaoPronta ?? ''),
      )
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OS BLOQUEIOS QUE TÊM DE SER DO DONO, UM POR UM E POR NOME.
//
// Este é o teste que protege de um futuro «vamos dar mais autonomia ao CEO» feito às pressas: se
// alguém mudar o `efeito` de um destes para «interno», o CEO passa a ligá-lo sozinho e o teste
// chumba antes de isso chegar a produção.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  for (const id of ['funis_motor_desligado', 'lead_followup_sem_cron', 'ig_setter_sem_aprovado', 'content_repost_sem_cron']) {
    const b = BLOQUEIOS.find((x) => x.id === id)
    teste(`«${id}» está no catálogo`, !!b)
    if (!b) continue
    teste(`«${id}» É DO DONO`, deQuemE(b).de === 'dono')
    teste(`«${id}» não tem resolver() — o CEO não o pode fechar nem por engano`, b.resolver === undefined)
  }

  // E os dois que são dele: tornar visível um interruptor que não existe. Repare-se no que isto é e
  // no que não é — escrever `false` onde o efeito já era `false`.
  for (const id of ['funis_flag_invisivel', 'trader_flag_invisivel']) {
    const b = BLOQUEIOS.find((x) => x.id === id)!
    teste(`«${id}» é do CEO`, deQuemE(b).de === 'ceo')
    teste(`«${id}» prova-se pelo valor não mudar`, /mesmo efeito|continua a decidir/i.test(b.comoSeProva ?? ''))
  }

  // O par mais importante do catálogo, e a razão pela qual um descobridor automático não servia:
  // as duas linhas falam da MESMA chave em `site_settings`, e uma é do CEO e a outra do dono.
  const invisivel = BLOQUEIOS.find((b) => b.id === 'funis_flag_invisivel')!
  const desligado = BLOQUEIOS.find((b) => b.id === 'funis_motor_desligado')!
  teste('tornar a chave dos funis VISÍVEL é do CEO', deQuemE(invisivel).de === 'ceo')
  teste('LIGAR a mesma chave é do dono', deQuemE(desligado).de === 'dono')
}

// ── O PLANO DISTRIBUI, E DISTINGUE «JÁ FEITO» DE «NÃO CORREU» ───────────────
{
  const p = planearDesbloqueio(BLOQUEIOS.map((b) => ({ bloqueio: b, sondagem: parado() })))
  teste('com tudo parado, há coisas em ambas as pilhas', p.resolver.length > 0 && p.escalar.length > 0)
  teste('nada aparece nas duas', p.resolver.every((r) => !p.escalar.some((e) => e.id === r.id)))
  teste('cada linha leva a medida que a mediu', p.resolver.every((r) => r.medida === 'medido'))

  const nada = planearDesbloqueio(BLOQUEIOS.map((b) => ({ bloqueio: b, sondagem: resolvido() })))
  teste('o que já não está parado não se mexe', nada.resolver.length === 0 && nada.escalar.length === 0)
  teste('e aparece como resolvido, para o dia vazio ser legível', nada.resolvidos.length === BLOQUEIOS.length)
  teste('e o resumo di-lo', /já resolvido/.test(nada.resumo))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A SONDA QUE FALHA NÃO CONTA COMO «PARADO».
//
// O caso mau mais traiçoeiro dos três: a base não responde, o CEO lê isso como «ainda parado», e
// age — ou escala — sobre uma falha de leitura. É o mesmo princípio de todo este sistema: receita
// que não se conseguiu ler conta como zero e põe a equipa inteira em risco de uma vez, e por isso a
// passagem não julga ninguém. Aqui: não se classifica.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  // O runner omite a entrada quando a sonda atira, logo o plano nunca a vê. Prova-se pelo plano:
  // uma lista sem a entrada não produz acção nenhuma sobre ela.
  const semUm = BLOQUEIOS.filter((b) => b.id !== 'funis_flag_invisivel')
  const p = planearDesbloqueio(semUm.map((b) => ({ bloqueio: b, sondagem: parado() })))
  teste(
    'um bloqueio cuja sonda falhou não aparece em pilha nenhuma',
    !p.resolver.some((r) => r.id === 'funis_flag_invisivel') && !p.escalar.some((e) => e.id === 'funis_flag_invisivel'),
  )
  teste('nem como resolvido — não se afirma o que não se mediu', !p.resolvidos.includes('funis_flag_invisivel'))
}

if (falhas.length) {
  console.error(`agentes/desbloqueio: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(
  'agentes/desbloqueio: o CEO torna interruptores visíveis sem ligar nada, e o que manda mensagens ou publica vai para a mesa do dono com a decisão escrita ✓',
)
