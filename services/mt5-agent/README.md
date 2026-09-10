# Agente MT5 — criação de contas do Torneio e do MTM Funded

Corre no **Mac do Ricardo**, onde o MetaTrader 5 está instalado. Pergunta ao site se há
contas para criar, conduz o MT5, e devolve as credenciais. **Sem ninguém à frente.**

## Como funciona

O site escreve o pedido numa fila (`mtm_account_requests`); o agente reclama-o e trata dele.
Se o Mac estiver desligado, o pedido **espera** — quando voltar, apanha o atraso todo.

### A parte que interessa: às cegas, mas nunca a mentir

O MT5 no Mac corre sob **Wine**, e o Wine não expõe menus nem janelas à acessibilidade do
macOS — `System Events` não vê um único botão. Só as teclas funcionam.

Conduzir uma interface às cegas seria irresponsável se não houvesse forma de confirmar. Há:
o MT5 escreve no journal

```
new demo account '960035257' opened on TheTradingMaster-Live
```

**O journal é a fonte da verdade.** As teclas tentam; o log confirma. Se o log não confirmar,
nada foi criado, nada se inventa, e o pedido volta à fila.

### A password não se lê — define-se

Ler a password do ecrã exigia OCR e permissão de gravação de ecrã, e uma password mal lida
entrega uma conta que não abre (o participante diz que não entra, nós dizemos que enviámos).

Em vez disso: assim que a conta existe, **muda-se a password para uma que geramos** — 12
caracteres, três classes, sem símbolos (há servidores MT5 que os recusam) — e confirma-se no
journal com `change of password completed`. Passa-se de adivinhar para saber.

Se a mudança falhar, a conta NÃO é entregue: melhor um pedido devolvido à fila do que uma
conta que ninguém consegue abrir.

## Instalar

```bash
cd ~/Projetos/morethanmoney/services/mt5-agent
./instalar.sh
```

Arranca com o Mac e levanta-se sozinho. Precisa de:

| Requisito | Porquê | Estado |
|---|---|---|
| MetaTrader 5 aberto | é o que o agente conduz | abrir e deixar aberto |
| Acessibilidade | enviar teclas ao MT5 | concedida |
| `MTMFUNDED_AGENT_SECRET` | falar com o site | na Vercel e em `~/.mtm-agent.env` |
| `MTMFUNDED_CRED_KEY` | cifrar as passwords | na Vercel |

Gravação de ecrã **não é precisa** — foi por isso que o caminho da password mudou.

## Comandos

```bash
./agente.sh uma-vez     # processa um pedido e sai
./agente.sh correr      # ciclo contínuo, em primeiro plano
./agente.sh estado      # o serviço está vivo?
./agente.sh registos    # últimas linhas do log
launchctl unload ~/Library/LaunchAgents/pt.morethanmoney.mt5agent.plist   # parar
```

## O que ainda precisa de uma passagem com olhos

A **sequência de teclas** do formulário (`criar_conta.py`) foi escrita a partir do diálogo
do MT5, sem o poder ver a funcionar — o Wine não deixa inspecionar a janela e a gravação de
ecrã está desligada. Os atalhos (`Ctrl+Shift+N`, `Ctrl+O`) e a ordem dos campos são os do MT5
para Windows.

Isto **falha em segurança**: se a sequência não chegar ao fim, o journal não regista, e o
agente devolve erro em vez de inventar credenciais. Mas até a primeira criação real correr
bem, conta com tentativas falhadas.

A primeira execução deve ser vista:

```bash
./agente.sh uma-vez     # com o MT5 à vista, para ver onde a sequência trava
```

## Ficheiros

| Ficheiro | O quê |
|---|---|
| `agente.sh` | o ciclo: reclama, cria, entrega |
| `criar_conta.py` | conduz o MT5 e confirma no journal |
| `ler_credenciais.py` | OCR do diálogo — alternativa, se um dia a gravação de ecrã for ligada |
| `ocr.swift` / `ocr` | OCR nativo (framework Vision), sem serviços externos |
| `teste_ocr.py` | 7 casos, incluindo os que **têm de ser recusados** |
