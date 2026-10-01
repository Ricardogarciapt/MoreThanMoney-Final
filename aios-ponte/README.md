# A ponte do AIOS

Liga o `/aios` do site ao **Claude Code que corre nesta máquina** — com as skills todas e com
acesso ao repositório.

```bash
npx tsx aios-ponte/servidor.ts
```

Escreve um segredo no arranque. Abre o `/aios`, escolhe **💻 Local** no painel da esquerda e cola
o segredo uma vez (fica guardado nesse browser).

## Porque é que isto existe

O `/aios` corre na Vercel e fala com a API da Anthropic. Sabe da MTM pelos prompts de cada agente,
e mais nada: não vê o código, não corre nada, não tem skills. O Claude Code desta máquina tem as
duas coisas. A ponte é o que os junta — e é por isso que o motor «local» não é «o mesmo mas mais
perto»: é outra capacidade.

## Isto executa código no teu computador

Não é uma API qualquer. Quem conseguir falar com esta ponte manda o Claude Code correr aqui. Três
camadas, e todas têm de passar:

1. **Escuta só em `127.0.0.1`.** Nunca `0.0.0.0`. É a diferença entre «só este computador» e «toda
   a rede do café». Se alguma vez te apetecer mudar isto para testar do telemóvel — não mudes.
2. **Origem na lista** (`lib/aios/ponte.ts`). Recusa-se antes de ler o corpo do pedido.
3. **Segredo partilhado**, comparado em tempo constante. Comparar com `===` conta o tempo e deixa
   adivinhar o segredo carácter a carácter.

O segredo vive em `.aios-ponte-segredo` (fora do git). Apaga o ficheiro e reinicia para o trocar.

## O que o Claude pode fazer sozinho por aqui

Do lado do AIOS **não há ninguém ao teclado para aprovar nada**. Por isso a ponte passa uma lista
explícita (`FERRAMENTAS_PERMITIDAS`): ler ficheiros, procurar, editar, `git` de leitura, typecheck,
correr as guardas. Fora da lista fica tudo o que muda o mundo: `git push`, `git commit`, `rm`,
`curl`, deploys. Isso continua a precisar de ti no terminal.

Sem essa lista o comportamento é pior do que parece: o Claude pede autorização, ninguém responde, e
ele responde **de memória**. Aconteceu no primeiro teste — deu o ramo e o commit certos a partir do
retrato do arranque da sessão, e teve a honestidade de o dizer. Uma ferramenta que responde de cor
quando devia ler é pior do que uma que falha, porque parece que funcionou.

## Verificar

```bash
npx tsx lib/aios/ponte.check.ts     # origens, segredo, argumentos, leitura do stream
curl -s http://127.0.0.1:4319/saude
```
