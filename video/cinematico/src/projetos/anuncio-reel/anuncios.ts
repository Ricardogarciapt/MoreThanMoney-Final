// Reels de anúncio (Meta) com o gémeo HeyGen como camada base e edição completa por cima.
// Render: bash video/cinematico/projetos-anuncio.sh <chave>   (chaves: cor seg edu b2b rgs rgl)
// Tempos em SEGUNDOS da voz (legendas.json vem das .srt da HeyGen; stock/anuncios/<chave>.mp4 é o vídeo sem legendas).
import { getInputProps } from 'remotion'
import legendas from './legendas.json'

export type Imagem = { de: number; ate: number; src: string; tipo: 'video' | 'app'; grade?: 'noite' | 'frio' | 'ouro' | 'neutro'; srcs?: string[]; demo?: string[] }
export type Anuncio = {
  marca: 'morethanmoney' | 'ricardo-garcia'
  gancho: { linhas: string[]; ate: number }
  imagens: Imagem[]
  chips: { em: number; t: string }[]
  cartoes?: { em: number; n: string; t: string }[]
  destaque?: { em: number; ate: number; t: string }
  cta: { de: number; topo: string; grande: string; botao: string; url: string }
  aviso?: string
}

export const CAUDA = 2.4 // s de cartão final depois da voz

export const ANUNCIOS: Record<string, Anuncio> = {
  cor: {
    marca: 'morethanmoney',
    gancho: { linhas: ['O TEU DINHEIRO', 'ESTÁ EM TEU NOME?'], ate: 2.75 },
    imagens: [
      { de: 2.9, ate: 6.0, src: 'stress_papel_1', tipo: 'video', grade: 'frio' },
      { de: 6.1, ate: 8.4, src: 'app-webtrader.jpg', tipo: 'app' },
      { de: 8.4, ate: 11.0, src: 'app-scanner.jpg', tipo: 'app' },
    ],
    chips: [
      { em: 4.65, t: '⚠ Outra carteira? Sai.' },
      { em: 7.25, t: '✓ Corretora regulada' },
      { em: 8.45, t: '✓ Conta em teu nome' },
      { em: 9.9, t: '✓ Regras de risco' },
    ],
    destaque: { em: 12.2, ate: 14.9, t: 'CORRETORA' },
    cta: { de: 14.9, topo: 'Envia-me por mensagem', grande: '«CORRETORA»', botao: 'Enviar mensagem', url: '@morethanmoney.pt' },
    aviso: 'Conteúdo educativo, não é consultoria financeira. Trading com CFD envolve risco de perda de capital.',
  },
  seg: {
    marca: 'morethanmoney',
    gancho: { linhas: ['TROQUEI HORAS', 'POR DINHEIRO.'], ate: 2.6 },
    imagens: [
      { de: 2.77, ate: 5.65, src: 'noite_cansado_1', tipo: 'video', grade: 'noite' },
      { de: 5.72, ate: 8.6, src: 'app-scanner.jpg', tipo: 'app' },
      { de: 8.6, ate: 11.1, src: 'app-alertas.jpg', tipo: 'app' },
      { de: 11.3, ate: 15.0, src: 'liberdade_1', tipo: 'video', grade: 'ouro' },
    ],
    chips: [
      { em: 4.95, t: 'O tempo não volta.' },
      { em: 7.3, t: '✓ Método' },
      { em: 8.65, t: '✓ Risco escrito antes' },
      { em: 13.4, t: 'Sem promessas. Sem atalhos.' },
    ],
    cta: { de: 15.1, topo: 'Aprende comigo', grande: 'SEGUE A PÁGINA', botao: 'Seguir', url: '@morethanmoney.pt' },
    aviso: 'Conteúdo educativo, não é consultoria financeira.',
  },
  edu: {
    marca: 'morethanmoney',
    gancho: { linhas: ['APRENDES TRADING', 'PELO YOUTUBE?'], ate: 3.2 },
    imagens: [
      { de: 3.46, ate: 5.25, src: 'stress_papel_2', tipo: 'video', grade: 'frio' },
      { de: 5.3, ate: 8.05, src: 'app-aulas.jpg', tipo: 'app' },
      { de: 8.05, ate: 10.9, src: 'app-chat.jpg', tipo: 'app' },
    ],
    chips: [
      { em: 3.5, t: 'Vídeos soltos ≠ método' },
      { em: 6.6, t: '✓ Análise' },
      { em: 7.5, t: '✓ Gestão de risco' },
      { em: 9.1, t: '✓ Comunidade' },
      { em: 11.9, t: '🔒 Conta em teu nome' },
    ],
    cta: { de: 13.45, topo: 'Começa pelo primeiro passo', grande: '3 DIAS GRÁTIS', botao: 'Começar · sem cartão', url: 'morethanmoney.pt' },
    aviso: 'Conteúdo educativo, não é consultoria financeira. Trading envolve risco.',
  },
  b2b: {
    marca: 'morethanmoney',
    gancho: { linhas: ['QUANTOS CLIENTES', 'PERDESTE ESTA SEMANA?'], ate: 3.6 },
    imagens: [
      { de: 3.73, ate: 6.8, src: 'negocio_tecnologia_1', tipo: 'video', grade: 'neutro' },
      { de: 6.84, ate: 9.65, src: 'app-chat.jpg', tipo: 'app' },
      { de: 9.66, ate: 12.4, src: 'noite_cansado_2', tipo: 'video', grade: 'noite' },
    ],
    chips: [
      { em: 4.5, t: '🤖 Assistente com IA' },
      { em: 6.9, t: '✓ Site' },
      { em: 7.7, t: '✓ Instagram' },
      { em: 8.5, t: '✓ WhatsApp' },
      { em: 9.7, t: '✓ Orçamento + reunião' },
      { em: 10.9, t: '🕚 Às 23:00' },
    ],
    cta: { de: 12.6, topo: 'Demos por sector', grande: 'VÊ AS DEMOS', botao: 'Ver demos', url: 'morethanmoney.pt/solucoes' },
  },
  rgs: {
    marca: 'ricardo-garcia',
    gancho: { linhas: ['EU TINHA UM EMPREGO', 'E ZERO TEMPO.'], ate: 3.55 },
    imagens: [
      { de: 3.8, ate: 7.7, src: 'negocio_tecnologia_2', tipo: 'video', grade: 'frio' },
      { de: 7.85, ate: 12.1, src: 'equipa_formacao_1', tipo: 'video', grade: 'neutro' },
    ],
    chips: [
      { em: 3.85, t: 'Hoje: negócios com IA' },
      { em: 9.43, t: '✓ O que funciona' },
      { em: 10.2, t: '✗ O que falha' },
      { em: 10.9, t: '→ O que aprendi' },
    ],
    cta: { de: 12.35, topo: 'Bastidores sem filtro', grande: 'SEGUE', botao: 'Seguir', url: '@ricardogarciapt' },
  },
  rgl: {
    marca: 'ricardo-garcia',
    gancho: { linhas: ['TRÊS CAMINHOS.', 'UMA CONVERSA.'], ate: 2.25 },
    imagens: [{ de: 2.4, ate: 8.95, src: 'liberdade_2', tipo: 'video', grade: 'frio' }],
    chips: [],
    cartoes: [
      { em: 2.43, n: '01', t: 'Investir com método' },
      { em: 4.74, n: '02', t: 'IA no teu negócio' },
      { em: 7.3, n: '03', t: 'Trabalhar comigo' },
    ],
    cta: { de: 9.0, topo: 'Escolhe o teu caminho', grande: 'MARCA A CONVERSA', botao: 'Marcar conversa', url: 'morethanmoney.pt/ricardogarcia' },
    aviso: 'Conteúdo educativo, não é consultoria financeira.',
  },
  com: {
    marca: 'morethanmoney',
    gancho: { linhas: ['40 HORAS POR SEMANA.', 'E SOBRA POUCO?'], ate: 3.4 },
    imagens: [
      { de: 3.6, ate: 4.9, src: 'noite_cansado_1', tipo: 'video', grade: 'noite' },
      { de: 9.7, ate: 11.0, src: 'edu-ricardo.jpg', tipo: 'app' },
      { de: 11.0, ate: 12.9, src: 'edu-ruben.jpg', tipo: 'app' },
      { de: 12.9, ate: 14.6, src: 'edu-maria.jpg', tipo: 'app' },
      { de: 14.86, ate: 17.0, src: 'equipa_formacao_1', tipo: 'video', grade: 'ouro' },
      { de: 17.0, ate: 18.3, src: 'app-feed.jpg', tipo: 'app' },
      { de: 18.3, ate: 21.0, src: 'app-chat.jpg', tipo: 'app' },
      { de: 21.26, ate: 26.0, src: 'app-solucoes.jpg', tipo: 'app' },
      { de: 26.3, ate: 29.6, src: 'liberdade_1', tipo: 'video', grade: 'ouro' },
    ],
    chips: [
      { em: 7.4, t: '✓ Não aprendes sozinho' },
      { em: 10.0, t: '📈 Trading · Ricardo' },
      { em: 11.6, t: '₿ Cripto · Ruben' },
      { em: 13.4, t: '🎭 Faceless · Maria' },
      { em: 16.0, t: '✓ Também os dias maus' },
      { em: 18.6, t: '🤖 Mentor IA a qualquer hora' },
      { em: 22.5, t: '🏢 Para o teu negócio' },
      { em: 26.4, t: 'Sem promessas de lucro' },
      { em: 28.2, t: 'Método · Disciplina · Equipa' },
    ],
    cta: { de: 30.0, topo: 'Vê os destaques', grande: '3 DIAS GRÁTIS', botao: 'Começar · sem cartão', url: 'morethanmoney.pt' },
    aviso: 'Conteúdo educativo, não é consultoria financeira. Trading envolve risco.',
  },
}

export type Seg = [number, number, string]
export const LEGENDAS = legendas as unknown as Record<string, Seg[]>

/*
 * MODO AUTO (20/11, reels diários): o mesmo molde, mas a peça vem nas props em vez de estar escrita
 * aqui à mão. O robô (video/cinematico/robo-cinematico.mjs) gera-a com auto.mjs a partir do vídeo do
 * gémeo + Whisper + guião e passa { anuncio: 'auto', auto: { config, legendas, video, musica } }.
 */
export type Auto = { config: Anuncio; legendas: Seg[]; video: string; musica: string }
type Props = { anuncio?: string; auto?: Auto }
const propsAtuais = (): Props => {
  try { return getInputProps() as Props } catch { return {} }
}
const autoDe = (k: string, props?: Props): Auto | null => (k === 'auto' ? (props ?? propsAtuais()).auto ?? null : null)
export const anuncioDe = (k: string, props?: Props): Anuncio => autoDe(k, props)?.config ?? ANUNCIOS[k]
export const segsDe = (k: string, props?: Props): Seg[] => autoDe(k, props)?.legendas ?? LEGENDAS[k]
export const videoDe = (k: string) => autoDe(k)?.video ?? `stock/anuncios/${k}.mp4`
export const musicaDe = (k: string) => autoDe(k)?.musica ?? `stock/anuncios/${k}-musica.wav`
export const fimVoz = (k: string, props?: Props) => { const s = segsDe(k, props); return s[s.length - 1][1] }
export const duracao = (k: string, props?: Props) => fimVoz(k, props) + CAUDA
