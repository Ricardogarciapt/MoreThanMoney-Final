# VPS stream (HLS público + ingest RTMP no SRS)

## Sintoma que isto corrige

- OBS liga ao VPS (RTMP) mas **no site não há imagem/som**.
- `curl https://stream.morethanmoney.pt/hls/qualquercoisa.m3u8` devolve corpo **`MTM stream OK`** em vez de `#EXTM3U`.

Causa típica: o `server { listen 443 ssl; }` do Certbot **não inclui** os blocos `location /hls/` e `location /live/`, pelo que os pedidos HTTPS caem no `location /` genérico.

## Verificação (no Mac ou CI)

Na raiz do repo:

```bash
./scripts/diagnose-lms-stream.sh
./scripts/diagnose-lms-stream.sh https://stream.morethanmoney.pt mtm_a_tua_chave
```

- **Falha** com “MTM stream OK” → nginx ainda mal configurado para HTTPS.
- **OK** → corpo começa por `#EXTM3U` (com ingest ativo e chave certa).

## Opção A — Já tens SSL (Certbot) e só falta o proxy HLS

1. SSH na VPS.
2. Abre o site ativo, por exemplo:

   `sudo nano /etc/nginx/sites-enabled/mtm-stream`

   (ou o ficheiro que tiver `server_name stream.morethanmoney.pt` e `listen 443 ssl`).

3. **Dentro do bloco `server { ... 443 ... }`**, cola o conteúdo de  
   `nginx-mtm-stream.locations-snippet.conf` **acima** de qualquer `location /` que devolva `MTM stream OK`.

4. Testa e recarrega:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. Volta a correr `./scripts/diagnose-lms-stream.sh`.

## Opção B — Ficheiro novo completo (exemplo com Let’s Encrypt)

1. Copia `nginx-mtm-stream-https.conf.example` para a VPS e ajusta `server_name` e caminhos `ssl_certificate` se necessário.
2. Coloca em `/etc/nginx/sites-available/mtm-stream`, ativa com symlink em `sites-enabled`, remove duplicados que conflitem no mesmo `server_name`.
3. `sudo nginx -t && sudo systemctl reload nginx`
4. Se o certificado ainda não existir: `sudo certbot --nginx -d stream.morethanmoney.pt`

## Requisitos no mesmo host

- **SRS** (ou stack equivalente) a servir HLS em **`http://127.0.0.1:8080/live/`** (alinhado com `proxy_pass` destes ficheiros).
- **RTMP** na porta esperada pelo OBS (configuração do SRS; não passa por estes `location` HTTP).

## Menos atraso (latência HLS)

HLS **nunca** é “tempo real” como uma videochamada: o atraso mínimo é da ordem de **alguns segmentos** (tipicamente **~2× duração do segmento** + rede). Para aproximar o máximo possível:

### No site (já no repo)

- Player **hls.js** com buffer mais curto e sincronização mais agressiva (`hooks/use-lms-hls-video.ts`).

### Na VPS — nginx

- Os `location` `/hls/` e `/live/` usam **`Cache-Control: no-store`** e **`proxy_cache off`** (evita cache intermédia). Aplica a mesma lógica dos ficheiros em `deploy/vps-stream/` no teu `mtm-stream` e `nginx -t && reload`.

### Na VPS — SRS (Docker `/opt/mtm-stream` ou equivalente)

No ficheiro de config do SRS (v5/v6), para a app **`live`**, reduz fragmentos HLS, por exemplo (nomes exatos variam com a versão do SRS — consulta a doc da tua imagem):

- **`hls_fragment`** (ou equivalente): **1** segundo (em vez de 2–6 s).
- Janela / playlist curta: poucos segmentos na lista (ex. **3–6**).
- Reiniciar o contentor SRS depois de alterar.

### No OBS

- **Intervalo de keyframe** alinhado ao segmento (ex. **1 s** ou **2 s** se o SRS usar fragmento de 2 s).
- Bitrate estável; “Encoder Tune” para **low latency** no x264/NVENC se disponível.

Para latência **sub-segundo**, seria necessário **WebRTC** ou **LL-HLS** completo (SRS + player com suporte a partial segments) — fora do escopo deste ajuste simples.

## Ficheiros

| Ficheiro | Uso |
|----------|-----|
| `nginx-mtm-stream.conf` | Só porta 80 (útil para testes / antes de SSL). |
| `nginx-mtm-stream.locations-snippet.conf` | Colar dentro do `server` HTTPS existente. |
| `nginx-mtm-stream-https.conf.example` | Site completo 80 + 443 com HLS nos dois. |
