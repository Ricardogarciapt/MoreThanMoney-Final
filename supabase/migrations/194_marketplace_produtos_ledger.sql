-- 194 — Marketplace: carteiras Ledger em «Produtos › Tech Crypto» (06/10/2026).
-- Vendidas pela casa (dono 'casa', vendedor MoreThanMoney) com checkout na loja oficial e o link de
-- afiliado do dono (r=0de5eaac7911, tracker=mtm-marketplace). O preço é o que a shop.ledger.com
-- mostra em Portugal (EUR, ?country=PT) e o cron /api/cron/marketplace-precos actualiza-o.
-- Fotos: as imagens oficiais da página de cada produto (cdn.shopify.com da Ledger), todas 200 a 06/10.
-- Idempotente: um slug que já exista não é tocado.
insert into public.marketplace_produtos
  (slug, tipo, subcategoria, titulo, subtitulo, descricao,
   preco_cents, moeda, imagem_url, imagens,
   checkout_externo_url,
   preco_fonte_url,
   dono, educator_id, vendedor_nome, estado, activo, publicado_em, preco_lido_em,
   periodicidade, recorrente, requer_morada)
select v.slug, v.tipo, v.subcategoria, v.titulo, v.subtitulo, v.descricao, v.preco_cents, v.moeda, v.imagem_url,
       to_jsonb(v.imagens), v.checkout_externo_url, v.preco_fonte_url,
       'casa', null::uuid, 'MoreThanMoney', 'publicado', true, now(), now(), 'unica', false, false
from (values
  ('ledger-nano-s-plus', 'produto', 'Tech Crypto', $t$Ledger Nano S Plus$t$, $t$A carteira de hardware clássica da Ledger, em USB-C$t$, $d$A Nano S Plus é a carteira de hardware de entrada da Ledger: guarda as chaves privadas fora da internet, num chip seguro, e cada operação confirma-se no próprio aparelho. Gere-se com a app Ledger Wallet, no computador ou num Android.

O que traz:
- Secure Element com certificação CC EAL6+ (chip ST33K1M5) e o sistema Ledger OS
- Ecrã OLED de 1,1" para verificar cada operação
- Passkey de dupla autenticação (2FA) para os teus logins

Especificações:
- Ligação USB-C (computador e Android)
- Ecrã OLED monocromático de 128 × 64 px
- Aço inoxidável escovado e plástico
- 62,4 × 17,4 × 8,2 mm, 21 g
- Na caixa: Nano S Plus, cabo USB-C para USB-A, 3 folhas de recuperação, fita de chaveiro
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 59 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   5900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/lnsp_black1.webp?v=1774605459', array['https://cdn.shopify.com/s/files/1/2974/4858/files/lnsp_black1.webp?v=1774605459','https://cdn.shopify.com/s/files/1/2974/4858/files/lnsp_black2.webp?v=1774605459','https://cdn.shopify.com/s/files/1/2974/4858/files/lnsp_blue_3x_8d216695-10a8-42e5-835a-2d2afb207b66.webp?v=1774605459','https://cdn.shopify.com/s/files/1/2974/4858/files/lnsp_green_3x_56413475-9b9d-473a-94dd-95e2f10b6453.webp?v=1774605459']::text[],
   'https://shop.ledger.com/products/ledger-nano-s-plus/matte-black?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-nano-s-plus/matte-black?country=PT'),
  ('ledger-nano-x', 'produto', 'Tech Crypto', $t$Ledger Nano X$t$, $t$A carteira de hardware Ledger com Bluetooth, para usar com o telemóvel$t$, $d$A Nano X é a carteira de hardware da Ledger para quem gere cripto no telemóvel: liga por Bluetooth ao iPhone ou ao Android, e por USB-C ao computador. As chaves privadas ficam num chip seguro, fora da internet, e cada operação confirma-se no aparelho.

O que traz:
- Secure Element com certificação CC EAL5+ (chip ST33J2M0) e o sistema Ledger OS
- Ecrã de 1,1" para verificar cada operação
- Bluetooth e bateria com cerca de 5 horas de autonomia
- Passkey de dupla autenticação (2FA) para os teus logins

Especificações:
- Bluetooth (BLE 5.2) para iOS 14+ e Android 10+; USB-C para computador e Android
- Ecrã OLED monocromático de 128 × 64 px
- Aço inoxidável escovado e plástico
- 72 × 18,6 × 11,7 mm, 34 g
- Na caixa: Nano X, cabo USB-C para USB-A, 3 folhas de recuperação, fita de chaveiro
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 99 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   9900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/lnx_black1.webp?v=1774605495', array['https://cdn.shopify.com/s/files/1/2974/4858/files/lnx_black1.webp?v=1774605495','https://cdn.shopify.com/s/files/1/2974/4858/files/lnx_black3.webp?v=1774605495','https://cdn.shopify.com/s/files/1/2974/4858/files/lnx_black2.webp?v=1774605495']::text[],
   'https://shop.ledger.com/products/ledger-nano-x/onyx-black?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-nano-x/onyx-black?country=PT'),
  ('ledger-nano-gen5', 'produto', 'Tech Crypto', $t$Ledger Nano Gen5$t$, $t$A Nano da nova geração, com ecrã táctil E Ink, Bluetooth e NFC$t$, $d$A Nano Gen5 é a geração mais recente da linha Nano: ecrã táctil E Ink para ler os detalhes de cada operação, Bluetooth para o telemóvel e NFC para a Ledger Recovery Key, que vem incluída. Disponível em quatro cores (preto, vermelho, verde e branco).

O que traz:
- Secure Element com certificação CC EAL6+ (chip ST33K1M5) e o sistema Ledger OS
- Ecrã seguro para verificar todos os detalhes antes de assinar
- Detecção automática de ameaças, para ajudar a evitar burlas
- Passkey de dupla autenticação (2FA)
- Ledger Recovery Key incluída

Especificações:
- Bluetooth (BLE 5.2) para iOS 15+ e Android 10+; NFC; USB-C
- Ecrã táctil E Ink monocromático de 300 × 400 px, vidro resistente a riscos, anti-reflexo
- Estrutura e traseira em plástico
- 79,4 × 53,3 × 8,6 mm, 46 g
- Na caixa: Nano Gen5, cabo USB-C para USB-C, 3 folhas de recuperação, 1 Ledger Recovery Key
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 179 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   17900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_lng5_1.png?v=1774363239', array['https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_lng5_1.png?v=1774363239','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_lng5_1_3.webp?v=1775639268','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_lng5_1_4.webp?v=1775639268','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_lng5_1_2.webp?v=1775639268']::text[],
   'https://shop.ledger.com/products/ledger-nano-gen5/jet-black?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-nano-gen5/jet-black?country=PT'),
  ('ledger-flex', 'produto', 'Tech Crypto', $t$Ledger Flex$t$, $t$Carteira de hardware com ecrã táctil E Ink de 2,8" em Gorilla Glass$t$, $d$A Ledger Flex junta um ecrã táctil E Ink grande a uma carteira de hardware: lês os detalhes de cada operação com clareza antes de a assinar. Liga por Bluetooth, NFC e USB-C, e traz a Ledger Recovery Key.

O que traz:
- Secure Element com certificação CC EAL6+ (chip ST33K1M5) e o sistema Ledger OS
- Ecrã de 2,8" em Gorilla Glass para verificar os detalhes de relance
- Detecção automática de ameaças, para ajudar a mitigar burlas
- Passkey de dupla autenticação (2FA)
- Bateria com cerca de 10 horas de autonomia

Especificações:
- Bluetooth (BLE 5.2) para iOS 14+ e Android 10+; NFC; USB-C
- Ecrã táctil E Ink de 16 tons de cinzento, 480 × 600 px, anti-reflexo
- Estrutura em alumínio e traseira em plástico
- 78,4 × 56,5 × 7,7 mm, 57,5 g
- Na caixa: Ledger Flex, cabo USB-C para USB-C, folha de recuperação, 1 Ledger Recovery Key
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 249 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   24900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_flex_graphite_1_4.webp?v=1774363192', array['https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_flex_graphite_1_4.webp?v=1774363192','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_flex_btc_1_fb3100cf-76fc-4d13-badf-48753365bb77.webp?v=1774363192','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_flex_solana_1.webp?v=1774363192','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_flex_oxydate.webp?v=1774363192']::text[],
   'https://shop.ledger.com/products/ledger-flex/graphite?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-flex/graphite?country=PT'),
  ('ledger-stax', 'produto', 'Tech Crypto', $t$Ledger Stax$t$, $t$A carteira de hardware topo de gama da Ledger, do tamanho de um cartão$t$, $d$A Ledger Stax é a carteira de hardware topo de gama da Ledger: do tamanho de um cartão de crédito, com um ecrã E Ink curvo que dá a volta à lateral e que podes personalizar. Liga por Bluetooth, NFC e USB-C, carrega sem fios (Qi) e traz a Ledger Recovery Key.

O que traz:
- Secure Element com certificação CC EAL6+ (chip ST33K1M5) e o sistema Ledger OS
- Ecrã de 3,7" que cobre a frente e a lateral
- Detecção automática de ameaças, para ajudar a evitar burlas
- Passkey de dupla autenticação (2FA)
- Bateria com cerca de 10 horas de autonomia e carregamento Qi

Especificações:
- Bluetooth (BLE 5.2) para iOS 14+ e Android 10+; NFC; USB-C
- Ecrã táctil E Ink curvo de 16 tons de cinzento, 400 × 670 px, anti-reflexo
- Alumínio e plástico, com ímanes para empilhar; cor grafite
- 85 × 54 × 6 mm, 44,2 g
- Na caixa: Ledger Stax, cabo USB-C para USB-C, 3 folhas de recuperação, capa magnética Midnight Black, 1 Ledger Recovery Key
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 399 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   39900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_stax_graphite_1_ba27be6f-2d99-49d5-a633-9ca92dafe23f.webp?v=1774363129', array['https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_stax_graphite_1_ba27be6f-2d99-49d5-a633-9ca92dafe23f.webp?v=1774363129','https://cdn.shopify.com/s/files/1/2974/4858/files/stax-lrk.png?v=1774363129','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_stax_graphite_2.webp?v=1774363129','https://cdn.shopify.com/s/files/1/2974/4858/files/carrousel_stax_graphite_3.webp?v=1774363129']::text[],
   'https://shop.ledger.com/products/ledger-stax/ledger-stax%E2%84%A2-+-recovery-key?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-stax/ledger-stax%E2%84%A2-+-recovery-key?country=PT'),
  ('ledger-backup-pack', 'produto', 'Tech Crypto', $t$Ledger Backup Pack$t$, $t$Nano X + Nano S Plus: uma para andar contigo, outra de reserva$t$, $d$O Backup Pack junta duas carteiras de hardware Ledger: a Nano X para usar no dia-a-dia, também no telemóvel por Bluetooth, e a Nano S Plus para ficar em casa ou guardada como aparelho de reserva. Com as duas podes guardar, gerir e fazer staking de criptoactivos na app Ledger Wallet.

O que traz:
- 1 Ledger Nano X (Bluetooth e USB-C, Secure Element CC EAL5+)
- 1 Ledger Nano S Plus (USB-C, Secure Element CC EAL6+)
- As especificações de cada uma são as das fichas Nano X e Nano S Plus deste marketplace
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 142 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   14200, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/products/1400x1880-BackupPack.png?v=1657632093', array['https://cdn.shopify.com/s/files/1/2974/4858/products/1400x1880-BackupPack.png?v=1657632093','https://cdn.shopify.com/s/files/1/2974/4858/products/02.png?v=1658918095','https://cdn.shopify.com/s/files/1/2974/4858/products/LNSP_image_3_251a683e-c95a-4ccc-ae20-794e5f6a9d1d.png?v=1658918095','https://cdn.shopify.com/s/files/1/2974/4858/products/02_145a143c-5777-4b7f-88d0-41a3562bc3a1.png?v=1658918095']::text[],
   'https://shop.ledger.com/products/ledger-backup-pack/ledger-backup-pack?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-backup-pack/ledger-backup-pack?country=PT'),
  ('ledger-family-pack-x', 'produto', 'Tech Crypto', $t$Ledger Family Pack X$t$, $t$Três Ledger Nano X, para a família entrar no mundo cripto$t$, $d$O Family Pack X traz três Ledger Nano X, para cada pessoa da família guardar os seus activos na sua própria carteira de hardware. A Ledger limita esta oferta a 5 packs por cliente.

Cada Nano X traz:
- Secure Element com certificação CC EAL5+ (chip ST33J2M0) e o sistema Ledger OS
- Bluetooth (BLE 5.2) para iOS 14+ e Android 10+; USB-C
- Ecrã OLED monocromático de 128 × 64 px
- Aço inoxidável escovado e plástico; 72 × 18,6 × 11,7 mm, 34 g
- Na caixa: cabo USB-C para USB-A, 3 folhas de recuperação, fita de chaveiro
- Activos: mais de 500 criptomoedas na app Ledger Wallet (Bitcoin, Ethereum, Solana, XRP, stablecoins…) e milhares de moedas, tokens e NFTs através de carteiras de terceiros
- Requisitos: computador de 64 bits (Windows 10/11, macOS, Ubuntu LTS); não é compatível com Chromebook nem serve para mineração

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 267 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   26700, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/products/1400x1880-FamilyPack_2.png?v=1662018928', array['https://cdn.shopify.com/s/files/1/2974/4858/products/1400x1880-FamilyPack_2.png?v=1662018928','https://cdn.shopify.com/s/files/1/2974/4858/products/04_909b971a-628d-4462-9a83-e99b062489a3.png?v=1662018928','https://cdn.shopify.com/s/files/1/2974/4858/products/03_66dd0502-9200-4a59-bc43-9a6d45eeee76.png?v=1662018928','https://cdn.shopify.com/s/files/1/2974/4858/products/05_6f351703-3e89-4efe-a746-d4302491405f.png?v=1662018928']::text[],
   'https://shop.ledger.com/products/ledger-nano-x-3pack/ledger-family-pack-x?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/ledger-nano-x-3pack/ledger-family-pack-x?country=PT'),
  ('cryptotag-zeus', 'produto', 'Tech Crypto', $t$Cryptotag Zeus$t$, $t$Placas de titânio para gravar a frase de recuperação da tua Ledger$t$, $d$A frase de recuperação de 24 palavras é a única cópia de segurança da cripto guardada na tua Ledger. O Cryptotag Zeus guarda-a em duas placas de titânio de 6 mm, que gravas tu com o punção incluído, em vez de papel. O fabricante descreve-o como resistente à água, ao fogo e à corrosão.

Especificações:
- Material: titânio
- Capacidade: 24 palavras de recuperação (2 × 12)
- 11,3 × 6,8 × 0,6 cm, 210 g
- Na caixa: 2 placas, punção de centro, folha de conversão, tampões para os ouvidos, guia de instalação

A compra, o envio e a garantia são feitos directamente na loja oficial da Ledger. Preço de referência na loja a 06/10/2026: 139 EUR (Portugal). O preço final é o que aparece na loja.$d$,
   13900, 'eur', 'https://cdn.shopify.com/s/files/1/2974/4858/files/cryptotag_zeus_1.webp?v=1774363340', array['https://cdn.shopify.com/s/files/1/2974/4858/files/cryptotag_zeus_1.webp?v=1774363340','https://cdn.shopify.com/s/files/1/2974/4858/products/Cryptotag02.png?v=1774363340','https://cdn.shopify.com/s/files/1/2974/4858/products/Cryptotag03.png?v=1774363340','https://cdn.shopify.com/s/files/1/2974/4858/products/Cryptotag04.png?v=1774363340']::text[],
   'https://shop.ledger.com/products/cryptotag-zeus/cryptotag?r=0de5eaac7911&tracker=mtm-marketplace',
   'https://shop.ledger.com/products/cryptotag-zeus/cryptotag?country=PT')
) as v(slug, tipo, subcategoria, titulo, subtitulo, descricao, preco_cents, moeda, imagem_url, imagens, checkout_externo_url, preco_fonte_url)
on conflict (slug) do nothing;
