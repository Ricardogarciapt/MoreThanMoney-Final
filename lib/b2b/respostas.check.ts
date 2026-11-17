/** Guarda das respostas B2B.   npx tsx lib/b2b/respostas.check.ts */
import { classificar, cruzar, decidirAccoes, semCitacao, textoResumo, type ProspectoContactado } from './respostas'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }
const P: ProspectoContactado[] = [
  { id: 'a', email: 'info@moneymagpie.com', empresa: 'MoneyMagpie', segmento: 'parceria_redes', estado: 'contactado' },
  { id: 'b', email: 'contact@exemple.fr', empresa: 'Exemple SAS', segmento: 'negocio_local', estado: 'contactado' },
  { id: 'c', email: 'geral@ja-respondeu.pt', empresa: 'Já', segmento: 'negocio_local', estado: 'respondeu' },
  { id: 'd', email: 'info@dois.pt', empresa: 'Dois A', segmento: 'x', estado: 'contactado' },
  { id: 'e', email: 'vendas@dois.pt', empresa: 'Dois B', segmento: 'x', estado: 'contactado' },
]

// Devolvidos
teste('mailer-daemon é devolvido', classificar({ de: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', assunto: 'Delivery Status Notification (Failure)', corpo: '' }) === 'devolvido')
teste('devolvido cruza pelo corpo', cruzar({ de: 'mailer-daemon@x.com', assunto: 'Undeliverable', corpo: 'Your message to contact@exemple.fr could not be delivered' }, 'devolvido', P)?.id === 'b')
// Automáticas
teste('ausência é automática', classificar({ de: 'info@moneymagpie.com', assunto: 'Automatic reply: Partnership', corpo: 'I am away' }) === 'automatica')
teste('auto-submitted é automática', classificar({ de: 'info@moneymagpie.com', assunto: 'Re: x', corpo: 'ok', cabecalhos: { 'auto-submitted': 'auto-replied' } }) === 'automatica')
teste('réponse automatique', classificar({ de: 'contact@exemple.fr', assunto: 'Réponse automatique', corpo: '' }) === 'automatica')
teste('auto-submitted: no não é automática', classificar({ de: 'a@b.pt', assunto: 'Re: x', corpo: 'Olá, interessa', cabecalhos: { 'auto-submitted': 'no' } }) === 'resposta')
// Saídas
teste('unsubscribe é saída', classificar({ de: 'info@moneymagpie.com', assunto: 'Re: Partnership', corpo: 'Please unsubscribe us.' }) === 'saida')
teste('não quero receber é saída', classificar({ de: 'geral@x.pt', assunto: 'Re: proposta', corpo: 'Não quero receber mais emails.' }) === 'saida')
teste('désinscrire é saída', classificar({ de: 'contact@exemple.fr', assunto: 'RE: offre', corpo: 'Merci de me désinscrire' }) === 'saida')
teste('unsubscribe só na citação NÃO é saída', classificar({ de: 'info@moneymagpie.com', assunto: 'Re: Partnership', corpo: 'Sounds interesting, call me.\n\nOn Mon, MTM wrote:\n> To unsubscribe click here' }) === 'resposta')
teste('citação corta', semCitacao('Olá\n> antigo') === 'Olá')
// Respostas e cruzamento
teste('resposta normal', classificar({ de: 'Jasmine <jasmine@moneymagpie.com>', assunto: 'Re: Partnership', corpo: 'Tell me more' }) === 'resposta')
teste('cruza por domínio da empresa', cruzar({ de: 'Jasmine <jasmine@moneymagpie.com>', assunto: '', corpo: '' }, 'resposta', P)?.id === 'a')
teste('domínio ambíguo não cruza', cruzar({ de: 'ana@dois.pt', assunto: '', corpo: '' }, 'resposta', P) === null)
teste('webmail não cruza por domínio', cruzar({ de: 'x@gmail.com', assunto: '', corpo: '' }, 'resposta', [{ ...P[0], email: 'y@gmail.com' }]) === null)
teste('desconhecido não cruza', cruzar({ de: 'z@outra.com', assunto: '', corpo: '' }, 'resposta', P) === null)
// Lote
const acc = decidirAccoes([
  { de: 'jasmine@moneymagpie.com', assunto: 'Re: x', corpo: 'Yes please' },
  { de: 'info@moneymagpie.com', assunto: 'Re: x', corpo: 'Actually, unsubscribe us' },
  { de: 'contact@exemple.fr', assunto: 'Réponse automatique', corpo: '' },
  { de: 'geral@ja-respondeu.pt', assunto: 'Re', corpo: 'outra vez' },
], P)
teste('um prospecto, uma acção (saída ganha)', acc.length === 1 && acc[0].prospectoId === 'a' && acc[0].tipo === 'saida')
teste('resumo sem números inventados', !/\d+ ?€|lucro|garant/i.test(textoResumo({ semana_inicio: '2026-11-16', enviados: 0, respostas: 0, saidas: 0, devolvidos: 0, taxa_resposta_pct: null, por_lingua: {}, quem_respondeu: [] })))

if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1) }
console.log('respostas.check: tudo certo')
