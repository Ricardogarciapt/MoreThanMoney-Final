/**
 *   npx tsx lib/whatsapp/primeira-mensagem.check.ts
 */
import { familiaDaOrigem, linkWhatsApp, numeroParaWaMe, primeiraMensagem, primeiroNomeDe } from './primeira-mensagem'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

teste('nome normal', primeiroNomeDe('ana maria silva') === 'Ana')
teste('nome lixo', primeiroNomeDe('+351 912') === '')
teste('família import', familiaDaOrigem('whatsapp_import') === 'importado')
teste('família ebook', familiaDaOrigem('ebook:o-metodo-frio') === 'ebook')
teste('família pedido', familiaDaOrigem('formulario') === 'pedido')
teste('import pede licença', primeiraMensagem({ nome: 'Rui', origem: 'whatsapp_import' }).includes('Posso mandar-to'))
teste('todas com SAIR', ['whatsapp_import', 'ebook:x', 'formulario', null].every((o) => primeiraMensagem({ origem: o }).includes('SAIR')))
teste('tema do interesse', primeiraMensagem({ nome: 'Rui', origem: 'formulario', interesse: 'mtm_funded' }).includes('MTM Funded'))
teste('sem promessas', !/lucr|ganh|garant/i.test(['whatsapp_import', 'ebook:x', 'formulario'].map((o) => primeiraMensagem({ origem: o })).join(' ')))
teste('PT sem indicativo', numeroParaWaMe('912 345 678') === '351912345678')
teste('00 351', numeroParaWaMe('00351912345678') === '351912345678')
teste('E164', numeroParaWaMe('+33612345678') === '33612345678')
teste('curto', numeroParaWaMe('1234') === null)
teste('link com texto', linkWhatsApp('912345678', 'Olá Rui') === 'https://wa.me/351912345678?text=Ol%C3%A1%20Rui')

if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1) }
console.log('primeira-mensagem: ok')
