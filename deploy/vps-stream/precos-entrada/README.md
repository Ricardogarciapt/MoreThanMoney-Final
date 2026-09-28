# MTM — preços de um terminal remoto (a redundância do terminal do conector)

Os preços rápidos da casa (p50 **94 ms**) vinham de **um** terminal MT5 no VPS com o EA `MTMConector`.
Um terminal, um ponto único de falha — e ele falhou: **28/09/2026**, o MetaTrader entrou em ciclo de
auto-actualização, o último tick real ficou em **sexta 21:59:59 UTC** e os motores passaram meio dia
nas fontes REST (2–4 s) com o mercado aberto.

Isto deixa **outro terminal MT5, noutra máquina** (o Mac do Ricardo, com o **mesmo EA sem uma linha
alterada**) alimentar os mesmos motores:

```
MT5 do Mac (EA MTMConector) → ticks.json local
  → agente (services/precos-entrada/agente-remoto.ts): só o que mudou, assinado (HMAC)
    → receptor no VPS (services/precos-entrada/receptor.ts): autentica, valida, aplica ao retrato
      → /var/lib/mtm-precos-entrada/<fonte>/MQL5/Files/mtm-conector/ticks.json
        → os motores leem-no como leem o do terminal local (CONECTOR_TICKS_RAIZES)
```

**O VPS continua a ser o principal.** O Mac é mais uma raiz de ticks e ganha símbolo a símbolo só
quando o seu tick tem **hora de mercado mais fresca** — a regra já existia (`TECTOS`,
`utilizavelComMovimento`, `idadeMs` em `services/motor-real/precos-nossos.ts`) e não foi duplicada.

## 1. Base de dados

Nenhuma migração. Isto não escreve na Supabase: só ficheiros que os motores já lêem.

## 2. O que mudou nos motores (e porque não é uma regressão)

Com **duas** raízes de ticks, «tick novo» deixou de poder ser «tick diferente»: o ficheiro lido em
segundo lugar sobrepunha o seu tick atrasado ao bom do primeiro. Agora ganha a **hora de mercado mais
alta**, em `services/motor-real/precos-nossos.ts` e em `services/funded-motor/fonte-conector-mt5.ts`.
Com uma só raiz (o estado de hoje) o comportamento é **idêntico**. Guardas:
`npx tsx services/motor-real/precos-duas-raizes.check.ts`.

O resumo do motor passa a dizer **quem está a mandar**: `conector.simbolosPorFonte`
(`{"mtm-conector":11,"mac-ricardo":2}`) e `conector.porFonte` (ticks acumulados). A etiqueta sai do
nome da raiz — nada a configurar.

## 3. Construir

```bash
node_modules/.bin/esbuild services/precos-entrada/receptor.ts --bundle --platform=node \
  --target=node18 --format=cjs --minify-syntax --legal-comments=none \
  --outfile=deploy/vps-stream/precos-entrada/dist/receptor.js

# o agente, para levar para o Mac (um ficheiro, sem node_modules)
node_modules/.bin/esbuild services/precos-entrada/agente-remoto.ts --bundle --platform=node \
  --target=node18 --format=cjs --minify-syntax --legal-comments=none \
  --outfile=deploy/mac-precos-agente/dist/agente.js
```

Guardas antes de subir:

```bash
npx tsx lib/precos-entrada/sanidade.check.ts
npx tsx lib/precos-entrada/assinatura.check.ts
npx tsx lib/precos-entrada/lote.check.ts
npx tsx services/motor-real/precos-duas-raizes.check.ts
npx tsx services/precos-entrada/cadeia.e2e.check.ts   # levanta receptor + agente e prova a cadeia
```

## 4. VPS — receptor

```bash
# o segredo: 48 caracteres, um por fonte
openssl rand -hex 24

sudo install -d -o ubuntu -g ubuntu -m 0755 /var/lib/mtm-precos-entrada
sudo install -d -m 0755 /opt/mtm/precos-entrada
sudo cp deploy/vps-stream/precos-entrada/dist/receptor.js /opt/mtm/precos-entrada/
sudo cp deploy/vps-stream/precos-entrada/mtm-precos-entrada.service /etc/systemd/system/
```

`/etc/mtm-precos-entrada.env` (chmod 600, root):

```
PRECOS_ENTRADA_PORTA=8791
PRECOS_ENTRADA_RAIZ=/var/lib/mtm-precos-entrada
PRECOS_ENTRADA_FONTES=mac-ricardo:<segredo de 48 caracteres>
# o ticks.json do terminal LOCAL: enquanto ele estiver vivo serve de referência e um preço que
# divirja dele mais de 1,5 % é recusado. Vazio = sem essa defesa (não recomendado).
PRECOS_ENTRADA_REFERENCIA=/var/lib/mtm-conector/MQL5/Files/mtm-conector/ticks.json
# para ver o estado: curl -H "x-mtm-vigia: <isto>" .../precos-entrada/estado
PRECOS_ENTRADA_SEGREDO_VIGIA=<outro segredo>
# o mesmo mapa de símbolos dos motores, quando existir
CONECTOR_TICKS_MAPA=
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now mtm-precos-entrada
curl -s localhost:8791/precos-entrada/saude
```

**Sem `PRECOS_ENTRADA_FONTES` o serviço não arranca** — um receptor de preços aberto é pior do que
não haver reserva.

### nginx

Colar no bloco 443 de `stream.morethanmoney.pt`, **antes** do `location /` genérico (o prefixo
`/precos` já vai para a porta 8788 do funded-motor, por isso este tem de vir **antes** dele):

```nginx
location /precos-entrada/ {
    proxy_pass http://127.0.0.1:8791;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 10s;
    proxy_send_timeout 10s;
    proxy_buffering off;
    client_max_body_size 512k;
}
```

`sudo nginx -t && sudo systemctl reload nginx`.

### Ligar a reserva aos motores

Acrescentar a raiz nova ao `CONECTOR_TICKS_RAIZES` de `/etc/mtm-motor-real.env` **e** de
`/etc/mtm-funded-motor.env` (a ordem não decide nada — decide a frescura):

```
CONECTOR_TICKS_RAIZES=/var/lib/mtm-conector,/var/lib/mtm-precos-entrada/mac-ricardo
```

e reiniciar os dois motores. **Fazer isto só depois de ver ticks a entrar** (secção 7).

## 5. Mac — o EA

O Ricardo tem de, no MT5 do Mac:

1. copiar `MTMConector.mq5` para `MQL5/Experts/` (Ficheiro → Abrir Pasta de Dados) e compilar no
   MetaEditor (F7). **É o mesmo ficheiro do VPS** — não há variante para o Mac;
2. arrastar o EA para **um** gráfico e deixar `PermitirNegociar = false` (é o valor de origem: o EA
   do Mac nunca manda ordens, só publica cotações) e `TicksMs = 50`;
3. ter no **Market Watch** os símbolos que interessam (XAUUSD, EURUSD, BTCUSD, índices…): o EA só
   publica o que lá está;
4. **não** precisa de autorizar URLs nas definições do terminal — o EA não faz `WebRequest`; quem
   fala com a rede é o agente, fora do terminal.

## 6. Mac — o agente

```bash
mkdir -p ~/mtm-precos-agente && cp deploy/mac-precos-agente/dist/agente.js ~/mtm-precos-agente/
cp deploy/mac-precos-agente/com.morethanmoney.precos-agente.plist ~/Library/LaunchAgents/
# editar no ficheiro copiado: caminhos (ALTERAR), o segredo e o caminho do ticks.json
launchctl load -w ~/Library/LaunchAgents/com.morethanmoney.precos-agente.plist
tail -f ~/Library/Logs/mtm-precos-agente.log
```

Ensaio à mão, antes do launchd:

```bash
PRECOS_AGENTE_URL=https://stream.morethanmoney.pt/precos-entrada/lote \
PRECOS_AGENTE_FONTE=mac-ricardo PRECOS_AGENTE_SEGREDO=… \
PRECOS_AGENTE_TICKS="…/MQL5/Files/mtm-conector/ticks.json" \
node ~/mtm-precos-agente/agente.js
```

Tráfego: manda-se **só o símbolo que teve tick** (e a fotografia completa de 5 em 5 s, para o
retrato do receptor se repor depois de um reinício). Mercado fechado = zero pedidos.

## 7. Ver se está a entrar

```bash
# no VPS
curl -s -H "x-mtm-vigia: <segredo>" localhost:8791/precos-entrada/estado | jq
ls -l --time-style=full-iso /var/lib/mtm-precos-entrada/mac-ricardo/MQL5/Files/mtm-conector/ticks.json
# e depois de ligar a raiz nos motores, no cartão do motor em /admin/centro:
#   conector.simbolosPorFonte → {"mtm-conector":11,"mac-ricardo":2}
```

`razoes` no estado é o mapa das recusas (`salto`, `divergencia`, `velho`, `spread`, `simbolo`…). Um
`divergencia` constante quer dizer que o Mac está noutra corretora/conta — aí ou se corrige a conta
do terminal ou se sobe o limite com conhecimento de causa, nunca por conveniência.

## 8. A tranca (porque um preço falso é dinheiro real)

| Camada | O que impede |
|---|---|
| TLS (nginx) | escuta e alteração no caminho |
| HMAC-SHA256 por fonte, sobre o corpo inteiro | autoria: um lote reetiquetado ou com os preços trocados cai |
| janela de ±30 s + sequência sempre a subir | reenviar um lote nosso gravado antes (preço velho como novo) |
| forma (símbolo, bid/ask, ask≥bid, spread ≤3 %) | lixo e spreads absurdos a arrastar o médio |
| hora (`time_msc` sem futuro >5 s, sem idade >60 s, nunca a recuar) | ticks velhos e ticks empurrados para trás |
| salto ≤5 % dentro de 2 min | um preço inventado longe do último aceite |
| divergência ≤1,5 % da referência, quando o terminal do VPS está vivo | tudo o resto — quem injecta não consegue mover a fonte principal |
| chave do retrato = símbolo **canónico** | escapar à guarda do salto com um sufixo inventado (`XAUUSD` vs `XAUUSD.s`) |

E por cima disto, a regra que já existia e que não se mexeu: **um preço velho não é um preço**. Se o
Mac parar, os seus ticks envelhecem e os motores voltam sozinhos ao que havia antes.
