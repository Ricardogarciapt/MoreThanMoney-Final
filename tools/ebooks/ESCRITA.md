# Como se escrevem os e-books MTM

Regras para reescrever ou escrever capítulos em `conteudo-privado/ebooks/<slug>/NN-*.md`.
O Ricardo pediu (21/11/2026): livros mais reais, escrita humana e não de IA, pragmáticos para
todos, com elementos ilustrados (posts, cartões, fotos, conversas).

## 1. Voz humana

- Escreve como uma pessoa que fala com um amigo à mesa, não como um relatório. PT-PT, «tu».
- Frases de tamanhos diferentes. Algumas muito curtas. Outras mais compridas, com uma vírgula a mais, como se fala.
- Pormenores concretos e portugueses: o Multibanco, o MB Way, o talão do Continente, o portal das Finanças,
  o IRS em abril, o passe Navegante, a renda, o café a 0,80 €, o salário que cai no dia 25.
- Admite dúvidas, erros e coisas que não sabes. Um pouco de humor seco é bem-vindo.
- Começa os capítulos por uma cena ou um caso, não por uma definição.
- Cada capítulo tem pelo menos uma coisa para fazer **hoje**, em passos numerados, que qualquer pessoa
  consegue fazer (sem jargão, ou com o jargão explicado na mesma frase).

### Proibido (cheira a IA)

- Travessões longos (—). Usa vírgula, ponto ou parênteses.
- «Não se trata de X, trata-se de Y», «Não é X. É Y.» repetido, «A verdade é que», «E é aqui que»,
  «Repara», «Imagina que» a abrir parágrafos seguidos, «Em suma», «Em última análise», «Vale a pena referir».
- Palavras: jornada, mergulhar, desbloquear, potenciar, alavancar (fora do sentido financeiro), crucial,
  fundamental, no mundo atual, a magia acontece, game changer, transformador, holístico, sinergia.
- Listas de três adjetivos por hábito. Perguntas retóricas em série. Cada parágrafo a acabar numa moral.
- Títulos com dois pontos («Disciplina: o segredo…»).

## 2. Regras da casa (não negociáveis)

- Sem promessas de lucro ou rendimento, sem números de desempenho inventados. Exemplos com números
  dizem «exemplo ilustrativo». Disclaimer educativo onde se fala de trading ou cripto.
- Não nomear a plataforma dos cursos. Não nomear Jifu, Golden Era, Trendwave, KillShot. Sem «network marketing».
- Nomes de produtos não se traduzem (Scanner GoldKiller, Premium, MTM Funded, She Is Faceless Academy).
- MTM Funded são contas SIMULADAS, não é prop firm.
- Não inventes factos biográficos de pessoas reais. Casos práticos usam personagens fictícias,
  apresentadas como exemplo («Pensa na Sara, 31 anos, enfermeira em Coimbra…»).
- Mantém a primeira linha `# Título do capítulo` e a linha seguinte `> epígrafe` (curta, humana).
- Mantém **todas** as marcas `[[grafico:id]]` que já existem no ficheiro, com o mesmo id.

## 3. Elementos ilustrados (usar 4 a 6 por capítulo, variados)

Foto (ficheiro em `tools/ebooks/img/`; estilo `polaroid`, `larga` ou `lado`):

    [[foto: rg-farda.jpg | Legenda curta, escrita à mão | polaroid]]

Post de Instagram (o quadrado leva texto grande OU uma foto; sem números de gostos):

    :::post @morethanmoney.pt
    imagem: Estável não é o mesmo que seguro.
    legenda: Texto da legenda, como se fosse publicado.
    :::

    :::post @ruben.cripto
    foto: ruben-reel-dca.jpg
    legenda: …
    :::

Story (ecrã vertical de telemóvel, com sticker opcional):

    :::story
    Quantas horas da tua semana são mesmo tuas?
    sticker: Menos de 10 | Mais de 10
    :::

Conversa (DM ou WhatsApp; `eu:` ou `tu:` aparece à direita, qualquer outro nome à esquerda):

    :::conversa WhatsApp · Mãe
    Mãe: Então e o emprego?
    eu: Vou sair, mãe. Tenho um plano.
    :::

Cartão recortável (regras, checklists, frases para colar no frigorífico):

    :::cartao Regras do colete
    - Nunca mais de 1 % por operação.
    - Stop definido antes de entrar.
    :::

Post-it manuscrito:

    :::nota
    Hoje: abrir o extrato e marcar a vermelho tudo o que não me lembro de ter comprado.
    :::

Ecrã de app (carteira, banco, corretora, notificações; linhas `rótulo: valor`):

    :::ecra Carteira · Saldo
    Bitcoin: 0,0012 BTC
    Taxa da rede: 0,40 €
    Estado: confirmado ✓
    :::

Os blocos de sempre continuam: `:::destaque`, `:::exercicio`, `:::alerta`, `:::historia`, tabelas,
`[[citacao: texto | autor]]` e linhas `______` para escrever.
