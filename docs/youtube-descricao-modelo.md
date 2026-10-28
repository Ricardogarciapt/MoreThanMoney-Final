# Modelo de descrição do YouTube (canal Ricardo Garcia)

Todos os vídeos e Shorts MTM terminam com este bloco: **registo pelo onboarding, ebook grátis,
Telegram e corretora PU Prime**. A fonte é `lib/youtube/descricao.ts` (`blocoDescricao`,
`juntarBloco`); este ficheiro é a cópia para os uploads feitos pelo browser no Mac.

## Regras
- O bloco vai **no fim** da descrição do vídeo, sem mexer no texto de cima.
- Vídeo em português (playlists PT, «Como começar», cortes das aulas) → bloco PT. Vídeo em inglês
  (playlists EN, `*-en-*`) → bloco EN.
- Se a descrição já tiver um bloco «Começa aqui» / «Start here», **troca-se**, não se repete.
- Os links são curtos e nossos (`morethanmoney.pt/l/…`). Para mudar o destino (outro ebook,
  outro grupo, outro IB) muda-se `DESTINOS_CURTOS` em `lib/youtube/descricao.ts`: os vídeos já
  publicados acompanham sem se editar nada no YouTube.
- Nomes de produtos e scanners não se traduzem. Nada de números de desempenho inventados.
- Shorts enviados pela API (`lib/videocliper/publicar.ts`) já levam o bloco PT sozinhos.

## Atualizar vídeos já publicados (YouTube Studio, edição em lote)
Studio → Conteúdo → filtrar/selecionar os vídeos MTM de uma língua → **Editar → Descrição →
«Acrescentar ao fim da descrição existente»** → colar o bloco dessa língua → Atualizar vídeos.
Não usa quota da API. Selecionar primeiro só os PT, depois só os EN. Não apagar vídeos.

## Bloco PT
```
▬▬▬▬ Começa aqui ▬▬▬▬
🚀 Regista-te no MTM (3 dias de Premium grátis): https://www.morethanmoney.pt/l/registo
📘 Ebook grátis, o guia Golden Zone (PDF): https://www.morethanmoney.pt/l/ebook
💬 Entra no nosso Telegram: https://www.morethanmoney.pt/l/telegram
🏦 Abre a tua conta na corretora PU Prime: https://www.morethanmoney.pt/l/corretora

⚠️ Conteúdo educativo, não constitui consultoria financeira. O trading envolve risco de perda; resultados passados não garantem resultados futuros.
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
```

## Bloco EN
```
▬▬▬▬ Start here ▬▬▬▬
🚀 Join MTM (3 days of Premium free): https://www.morethanmoney.pt/l/start
📘 Free ebook, the Golden Zone guide (PDF): https://www.morethanmoney.pt/l/ebook-en
💬 Join us on Telegram: https://www.morethanmoney.pt/l/telegram
🏦 Open your PU Prime broker account: https://www.morethanmoney.pt/l/corretora

⚠️ Educational content, not financial advice. Trading involves risk of loss; past results do not guarantee future results.
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
```
