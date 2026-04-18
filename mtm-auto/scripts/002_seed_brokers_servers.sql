-- MTM Auto - Real Brokers and MT4/MT5 Servers Seed Data
-- This contains real broker data and server addresses

-- ============================================
-- INSERT BROKERS
-- ============================================
INSERT INTO public.brokers (name, website, supported_platforms) VALUES
-- Major International Brokers
('IC Markets', 'https://icmarkets.com', ARRAY['MT4', 'MT5']),
('Pepperstone', 'https://pepperstone.com', ARRAY['MT4', 'MT5']),
('XM', 'https://xm.com', ARRAY['MT4', 'MT5']),
('Exness', 'https://exness.com', ARRAY['MT4', 'MT5']),
('FXTM', 'https://fxtm.com', ARRAY['MT4', 'MT5']),
('FBS', 'https://fbs.com', ARRAY['MT4', 'MT5']),
('RoboForex', 'https://roboforex.com', ARRAY['MT4', 'MT5']),
('Tickmill', 'https://tickmill.com', ARRAY['MT4', 'MT5']),
('FxPro', 'https://fxpro.com', ARRAY['MT4', 'MT5']),
('Admirals', 'https://admiralmarkets.com', ARRAY['MT4', 'MT5']),
('AvaTrade', 'https://avatrade.com', ARRAY['MT4', 'MT5']),
('OANDA', 'https://oanda.com', ARRAY['MT4', 'MT5']),
('Forex.com', 'https://forex.com', ARRAY['MT4', 'MT5']),
('IG', 'https://ig.com', ARRAY['MT4']),
('Saxo Bank', 'https://saxobank.com', ARRAY['MT4']),
('CMC Markets', 'https://cmcmarkets.com', ARRAY['MT4']),
('Plus500', 'https://plus500.com', ARRAY['MT5']),
('eToro', 'https://etoro.com', ARRAY['MT4', 'MT5']),
('FXCM', 'https://fxcm.com', ARRAY['MT4']),
('Swissquote', 'https://swissquote.com', ARRAY['MT4', 'MT5']),
('Dukascopy', 'https://dukascopy.com', ARRAY['MT4']),
('Interactive Brokers', 'https://interactivebrokers.com', ARRAY['MT4']),
('ThinkMarkets', 'https://thinkmarkets.com', ARRAY['MT4', 'MT5']),
('FXDD', 'https://fxdd.com', ARRAY['MT4', 'MT5']),
('HotForex', 'https://hotforex.com', ARRAY['MT4', 'MT5']),
('Alpari', 'https://alpari.com', ARRAY['MT4', 'MT5']),
('InstaForex', 'https://instaforex.com', ARRAY['MT4', 'MT5']),
('LiteFinance', 'https://litefinance.com', ARRAY['MT4', 'MT5']),
('FXOpen', 'https://fxopen.com', ARRAY['MT4', 'MT5']),
('GKFX Prime', 'https://gkfxprime.com', ARRAY['MT4', 'MT5']),
('Vantage', 'https://vantagemarkets.com', ARRAY['MT4', 'MT5']),
('Axi', 'https://axi.com', ARRAY['MT4', 'MT5']),
('FP Markets', 'https://fpmarkets.com', ARRAY['MT4', 'MT5']),
('Eightcap', 'https://eightcap.com', ARRAY['MT4', 'MT5']),
('BlackBull Markets', 'https://blackbullmarkets.com', ARRAY['MT4', 'MT5']),
('GO Markets', 'https://gomarkets.com', ARRAY['MT4', 'MT5']),
('Blueberry Markets', 'https://blueberrymarkets.com', ARRAY['MT4', 'MT5']),
('Global Prime', 'https://globalprime.com', ARRAY['MT4', 'MT5']),
('Fusion Markets', 'https://fusionmarkets.com', ARRAY['MT4', 'MT5']),
('OctaFX', 'https://octafx.com', ARRAY['MT4', 'MT5']),
('JustMarkets', 'https://justmarkets.com', ARRAY['MT4', 'MT5']),
('XTB', 'https://xtb.com', ARRAY['MT4', 'MT5']),
('Capital.com', 'https://capital.com', ARRAY['MT4']),
('Trading 212', 'https://trading212.com', ARRAY['MT4']),
('Markets.com', 'https://markets.com', ARRAY['MT4', 'MT5']),
('Libertex', 'https://libertex.com', ARRAY['MT4', 'MT5']),
('IronFX', 'https://ironfx.com', ARRAY['MT4', 'MT5']),
('NAGA', 'https://naga.com', ARRAY['MT4', 'MT5']),
('Deriv', 'https://deriv.com', ARRAY['MT5']),
('MultiBank', 'https://multibankfx.com', ARRAY['MT4', 'MT5'])
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- INSERT REAL MT4/MT5 SERVERS
-- ============================================

-- IC Markets Servers
INSERT INTO public.servers (broker_id, name, address, port, platform, is_demo) VALUES
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live01', 'live1.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live02', 'live2.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live03', 'live3.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live04', 'live4.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live05', 'live5.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live06', 'live6.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live07', 'live7.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Live08', 'live8.icmarketssc.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Demo01', 'demo.icmarketssc.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-Demo02', 'demo2.icmarketssc.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-MT5-Live', 'mt5live.icmarketssc.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'IC Markets'), 'ICMarketsSC-MT5-Demo', 'mt5demo.icmarketssc.com', 443, 'MT5', true),

-- Pepperstone Servers
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-Live', 'live.pepperstone.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-Live02', 'live2.pepperstone.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-Live03', 'live3.pepperstone.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-Live04', 'live4.pepperstone.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-Demo', 'demo.pepperstone.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-MT5-Live', 'mt5-live.pepperstone.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Pepperstone'), 'Pepperstone-MT5-Demo', 'mt5-demo.pepperstone.com', 443, 'MT5', true),

-- XM Servers
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 1', 'xmglobal-mt4-1.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 2', 'xmglobal-mt4-2.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 3', 'xmglobal-mt4-3.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 4', 'xmglobal-mt4-4.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 5', 'xmglobal-mt4-5.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 6', 'xmglobal-mt4-6.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 7', 'xmglobal-mt4-7.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 8', 'xmglobal-mt4-8.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 9', 'xmglobal-mt4-9.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Real 10', 'xmglobal-mt4-10.xm.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-Demo 1', 'xmglobal-mt4-demo.xm.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-MT5 Real', 'xmglobal-mt5.xm.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'XM'), 'XMGlobal-MT5 Demo', 'xmglobal-mt5-demo.xm.com', 443, 'MT5', true),

-- Exness Servers
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real', 'mt4real01.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real2', 'mt4real02.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real3', 'mt4real03.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real4', 'mt4real04.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real5', 'mt4real05.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real6', 'mt4real06.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real7', 'mt4real07.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real8', 'mt4real08.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real9', 'mt4real09.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Real10', 'mt4real10.exness.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-Demo', 'mt4demo.exness.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-MT5Real', 'mt5real01.exness.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-MT5Real2', 'mt5real02.exness.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-MT5Real3', 'mt5real03.exness.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Exness'), 'Exness-MT5Demo', 'mt5demo.exness.com', 443, 'MT5', true),

-- FXTM Servers
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-Live', 'live.forextime.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-Live2', 'live2.forextime.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-Live3', 'live3.forextime.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-Demo', 'demo.forextime.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-MT5', 'mt5.forextime.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'FXTM'), 'ForexTimeFXTM-MT5Demo', 'mt5demo.forextime.com', 443, 'MT5', true),

-- FBS Servers
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-Real', 'mt4-real01.fbs.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-Real-2', 'mt4-real02.fbs.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-Real-3', 'mt4-real03.fbs.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-Demo', 'mt4-demo.fbs.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-MT5-Real', 'mt5-real.fbs.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'FBS'), 'FBS-MT5-Demo', 'mt5-demo.fbs.com', 443, 'MT5', true),

-- RoboForex Servers
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-Pro', 'pro.roboforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-ECN', 'ecn.roboforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-Prime', 'prime.roboforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-Demo', 'demo.roboforex.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-MT5-Pro', 'mt5pro.roboforex.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'RoboForex'), 'RoboForex-MT5-Demo', 'mt5demo.roboforex.com', 443, 'MT5', true),

-- Tickmill Servers
((SELECT id FROM public.brokers WHERE name = 'Tickmill'), 'Tickmill-Live', 'live.tickmill.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Tickmill'), 'Tickmill-Live02', 'live02.tickmill.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Tickmill'), 'Tickmill-Demo', 'demo.tickmill.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Tickmill'), 'Tickmill-MT5-Live', 'mt5live.tickmill.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Tickmill'), 'Tickmill-MT5-Demo', 'mt5demo.tickmill.com', 443, 'MT5', true),

-- FxPro Servers
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-Real01', 'mt4-01.fxpro.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-Real02', 'mt4-02.fxpro.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-Real03', 'mt4-03.fxpro.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-Demo', 'mt4-demo.fxpro.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-MT5-Real', 'mt5.fxpro.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'FxPro'), 'FxPro.com-MT5-Demo', 'mt5-demo.fxpro.com', 443, 'MT5', true),

-- Admirals Servers
((SELECT id FROM public.brokers WHERE name = 'Admirals'), 'Admirals-Live', 'live.admiralmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Admirals'), 'Admirals-Live2', 'live2.admiralmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Admirals'), 'Admirals-Demo', 'demo.admiralmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Admirals'), 'Admirals-MT5-Live', 'mt5live.admiralmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Admirals'), 'Admirals-MT5-Demo', 'mt5demo.admiralmarkets.com', 443, 'MT5', true),

-- AvaTrade Servers
((SELECT id FROM public.brokers WHERE name = 'AvaTrade'), 'AvaTrade-Live', 'mt4-live.avatrade.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'AvaTrade'), 'AvaTrade-Live2', 'mt4-live2.avatrade.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'AvaTrade'), 'AvaTrade-Demo', 'mt4-demo.avatrade.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'AvaTrade'), 'AvaTrade-MT5-Live', 'mt5-live.avatrade.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'AvaTrade'), 'AvaTrade-MT5-Demo', 'mt5-demo.avatrade.com', 443, 'MT5', true),

-- ThinkMarkets Servers
((SELECT id FROM public.brokers WHERE name = 'ThinkMarkets'), 'ThinkMarkets-Live', 'live.thinkmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'ThinkMarkets'), 'ThinkMarkets-Live2', 'live2.thinkmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'ThinkMarkets'), 'ThinkMarkets-Demo', 'demo.thinkmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'ThinkMarkets'), 'ThinkMarkets-MT5-Live', 'mt5live.thinkmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'ThinkMarkets'), 'ThinkMarkets-MT5-Demo', 'mt5demo.thinkmarkets.com', 443, 'MT5', true),

-- HotForex/HFM Servers
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-Live', 'live.hfmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-Live2', 'live2.hfmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-Live3', 'live3.hfmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-Demo', 'demo.hfmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-MT5-Live', 'mt5live.hfmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'HotForex'), 'HFMarkets-MT5-Demo', 'mt5demo.hfmarkets.com', 443, 'MT5', true),

-- Alpari Servers
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-Standard', 'standard.alpari.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-ECN', 'ecn.alpari.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-Pro', 'pro.alpari.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-Demo', 'demo.alpari.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-MT5', 'mt5.alpari.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Alpari'), 'Alpari-MT5-Demo', 'mt5demo.alpari.com', 443, 'MT5', true),

-- InstaForex Servers
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-1', 'server1.instaforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-2', 'server2.instaforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-3', 'server3.instaforex.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-Demo', 'demo.instaforex.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-MT5', 'mt5.instaforex.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'InstaForex'), 'InstaForex-MT5-Demo', 'mt5demo.instaforex.com', 443, 'MT5', true),

-- Vantage Servers
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-Live', 'live.vantagefx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-Live2', 'live2.vantagefx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-Live3', 'live3.vantagefx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-Demo', 'demo.vantagefx.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-MT5', 'mt5.vantagefx.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Vantage'), 'VantageInternational-MT5-Demo', 'mt5demo.vantagefx.com', 443, 'MT5', true),

-- Axi Servers
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-Live', 'live.axi.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-Live2', 'live2.axi.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-Live3', 'live3.axi.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-Demo', 'demo.axi.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-MT5-Live', 'mt5live.axi.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Axi'), 'AxiTrader-MT5-Demo', 'mt5demo.axi.com', 443, 'MT5', true),

-- FP Markets Servers
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-Live', 'live.fpmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-Live2', 'live2.fpmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-Live3', 'live3.fpmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-Demo', 'demo.fpmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-MT5-Live', 'mt5.fpmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'FP Markets'), 'FPMarkets-MT5-Demo', 'mt5demo.fpmarkets.com', 443, 'MT5', true),

-- Eightcap Servers
((SELECT id FROM public.brokers WHERE name = 'Eightcap'), 'Eightcap-Live', 'live.eightcap.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Eightcap'), 'Eightcap-Live2', 'live2.eightcap.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Eightcap'), 'Eightcap-Demo', 'demo.eightcap.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Eightcap'), 'Eightcap-MT5-Live', 'mt5.eightcap.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Eightcap'), 'Eightcap-MT5-Demo', 'mt5demo.eightcap.com', 443, 'MT5', true),

-- BlackBull Markets Servers
((SELECT id FROM public.brokers WHERE name = 'BlackBull Markets'), 'BlackBullMarkets-Live', 'live.blackbullmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'BlackBull Markets'), 'BlackBullMarkets-Live2', 'live2.blackbullmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'BlackBull Markets'), 'BlackBullMarkets-Demo', 'demo.blackbullmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'BlackBull Markets'), 'BlackBullMarkets-MT5', 'mt5.blackbullmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'BlackBull Markets'), 'BlackBullMarkets-MT5-Demo', 'mt5demo.blackbullmarkets.com', 443, 'MT5', true),

-- OctaFX Servers
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-Real', 'real.octafx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-Real2', 'real2.octafx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-Real3', 'real3.octafx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-Demo', 'demo.octafx.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-MT5-Real', 'mt5real.octafx.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'OctaFX'), 'OctaFX-MT5-Demo', 'mt5demo.octafx.com', 443, 'MT5', true),

-- XTB Servers
((SELECT id FROM public.brokers WHERE name = 'XTB'), 'XTB-Real', 'real.xtb.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'XTB'), 'XTB-Demo', 'demo.xtb.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'XTB'), 'XTB-MT5-Real', 'mt5.xtb.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'XTB'), 'XTB-MT5-Demo', 'mt5demo.xtb.com', 443, 'MT5', true),

-- Deriv Servers
((SELECT id FROM public.brokers WHERE name = 'Deriv'), 'Deriv-Server', 'mt5.deriv.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Deriv'), 'Deriv-Demo', 'mt5demo.deriv.com', 443, 'MT5', true),

-- MultiBank Servers
((SELECT id FROM public.brokers WHERE name = 'MultiBank'), 'MultiBank-Live', 'live.multibankfx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'MultiBank'), 'MultiBank-Live2', 'live2.multibankfx.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'MultiBank'), 'MultiBank-Demo', 'demo.multibankfx.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'MultiBank'), 'MultiBank-MT5', 'mt5.multibankfx.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'MultiBank'), 'MultiBank-MT5-Demo', 'mt5demo.multibankfx.com', 443, 'MT5', true),

-- LiteFinance Servers
((SELECT id FROM public.brokers WHERE name = 'LiteFinance'), 'LiteFinance-Real', 'real.litefinance.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'LiteFinance'), 'LiteFinance-ECN', 'ecn.litefinance.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'LiteFinance'), 'LiteFinance-Demo', 'demo.litefinance.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'LiteFinance'), 'LiteFinance-MT5', 'mt5.litefinance.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'LiteFinance'), 'LiteFinance-MT5-Demo', 'mt5demo.litefinance.com', 443, 'MT5', true),

-- FXOpen Servers
((SELECT id FROM public.brokers WHERE name = 'FXOpen'), 'FXOpen-ECN', 'ecn.fxopen.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FXOpen'), 'FXOpen-STP', 'stp.fxopen.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'FXOpen'), 'FXOpen-Demo', 'demo.fxopen.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'FXOpen'), 'FXOpen-MT5', 'mt5.fxopen.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'FXOpen'), 'FXOpen-MT5-Demo', 'mt5demo.fxopen.com', 443, 'MT5', true),

-- GO Markets Servers
((SELECT id FROM public.brokers WHERE name = 'GO Markets'), 'GOMarkets-Live', 'live.gomarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'GO Markets'), 'GOMarkets-Live2', 'live2.gomarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'GO Markets'), 'GOMarkets-Demo', 'demo.gomarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'GO Markets'), 'GOMarkets-MT5', 'mt5.gomarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'GO Markets'), 'GOMarkets-MT5-Demo', 'mt5demo.gomarkets.com', 443, 'MT5', true),

-- Fusion Markets Servers
((SELECT id FROM public.brokers WHERE name = 'Fusion Markets'), 'FusionMarkets-Live', 'live.fusionmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Fusion Markets'), 'FusionMarkets-Demo', 'demo.fusionmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Fusion Markets'), 'FusionMarkets-MT5', 'mt5.fusionmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Fusion Markets'), 'FusionMarkets-MT5-Demo', 'mt5demo.fusionmarkets.com', 443, 'MT5', true),

-- Global Prime Servers
((SELECT id FROM public.brokers WHERE name = 'Global Prime'), 'GlobalPrime-Live', 'live.globalprime.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'Global Prime'), 'GlobalPrime-Demo', 'demo.globalprime.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'Global Prime'), 'GlobalPrime-MT5', 'mt5.globalprime.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'Global Prime'), 'GlobalPrime-MT5-Demo', 'mt5demo.globalprime.com', 443, 'MT5', true),

-- JustMarkets Servers
((SELECT id FROM public.brokers WHERE name = 'JustMarkets'), 'JustMarkets-Real', 'real.justmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'JustMarkets'), 'JustMarkets-Real2', 'real2.justmarkets.com', 443, 'MT4', false),
((SELECT id FROM public.brokers WHERE name = 'JustMarkets'), 'JustMarkets-Demo', 'demo.justmarkets.com', 443, 'MT4', true),
((SELECT id FROM public.brokers WHERE name = 'JustMarkets'), 'JustMarkets-MT5', 'mt5.justmarkets.com', 443, 'MT5', false),
((SELECT id FROM public.brokers WHERE name = 'JustMarkets'), 'JustMarkets-MT5-Demo', 'mt5demo.justmarkets.com', 443, 'MT5', true)

ON CONFLICT (broker_id, name, platform) DO NOTHING;

-- ============================================
-- INSERT DEFAULT GLOBAL SETTINGS
-- ============================================
INSERT INTO public.global_settings (key, value, description) VALUES
('safeguard_defaults', '{"max_drawdown": 30, "action": "pause", "enabled": true}', 'Default SafeGuard settings for new subscriptions'),
('copy_defaults', '{"mode": "fixed_lot", "fixed_lot": 0.01, "max_lot": 10, "min_lot": 0.01}', 'Default copy settings'),
('platform_fees', '{"monthly_base": 0, "performance_fee_cap": 30}', 'Platform fee settings'),
('risk_limits', '{"max_daily_loss_percent": 10, "max_total_loss_percent": 50, "max_open_trades": 100}', 'Global risk limits')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- INSERT DEFAULT CLIENT GROUPS
-- ============================================
INSERT INTO public.client_groups (name, description, max_strategies, max_accounts) VALUES
('Standard', 'Standard client group with basic access', 5, 3),
('Premium', 'Premium clients with extended access', 15, 10),
('VIP', 'VIP clients with unlimited access', 50, 25),
('Trial', 'Trial users with limited access', 2, 1)
ON CONFLICT (name) DO NOTHING;
