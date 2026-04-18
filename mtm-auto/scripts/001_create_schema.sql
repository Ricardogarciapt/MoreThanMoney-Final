-- MTM Auto Database Schema
-- Complete schema for copy trading platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'banned')),
  avatar_url TEXT,
  telegram_id TEXT,
  telegram_notifications BOOLEAN DEFAULT false,
  email_notifications BOOLEAN DEFAULT true,
  two_factor_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "admin_select_all" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);
CREATE POLICY "admin_update_all" ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- BROKERS TABLE (real broker data)
-- ============================================
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website TEXT,
  supported_platforms TEXT[] DEFAULT ARRAY['MT4', 'MT5'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brokers_select_all" ON public.brokers FOR SELECT TO authenticated USING (true);

-- ============================================
-- SERVERS TABLE (real MT4/MT5 servers)
-- ============================================
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  port INTEGER DEFAULT 443,
  platform TEXT NOT NULL CHECK (platform IN ('MT4', 'MT5')),
  is_demo BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(broker_id, name, platform)
);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers_select_all" ON public.servers FOR SELECT TO authenticated USING (true);

-- ============================================
-- MT ACCOUNTS TABLE (user trading accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS public.mt_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.brokers(id),
  server_id UUID REFERENCES public.servers(id),
  account_number TEXT NOT NULL,
  account_name TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('MT4', 'MT5')),
  password_encrypted TEXT, -- encrypted investor/master password
  is_master BOOLEAN DEFAULT false, -- if true, this is a master account for strategies
  balance DECIMAL(15,2) DEFAULT 0,
  equity DECIMAL(15,2) DEFAULT 0,
  margin DECIMAL(15,2) DEFAULT 0,
  free_margin DECIMAL(15,2) DEFAULT 0,
  leverage INTEGER DEFAULT 100,
  currency TEXT DEFAULT 'USD',
  connection_status TEXT DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'connecting')),
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mt_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_own" ON public.mt_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "accounts_insert_own" ON public.mt_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "accounts_update_own" ON public.mt_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "accounts_delete_own" ON public.mt_accounts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "admin_accounts_all" ON public.mt_accounts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- STRATEGIES TABLE (master trading strategies)
-- ============================================
CREATE TABLE IF NOT EXISTS public.strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  master_account_id UUID REFERENCES public.mt_accounts(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'forex' CHECK (category IN ('forex', 'indices', 'commodities', 'crypto', 'mixed')),
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'aggressive')),
  min_deposit DECIMAL(15,2) DEFAULT 100,
  monthly_fee DECIMAL(15,2) DEFAULT 0,
  performance_fee DECIMAL(5,2) DEFAULT 0, -- percentage
  
  -- Performance metrics
  total_return DECIMAL(10,2) DEFAULT 0,
  monthly_return DECIMAL(10,2) DEFAULT 0,
  max_drawdown DECIMAL(10,2) DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  profit_factor DECIMAL(5,2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  avg_trade_duration TEXT,
  sharpe_ratio DECIMAL(5,2) DEFAULT 0,
  
  -- Stats
  subscribers_count INTEGER DEFAULT 0,
  total_copied_volume DECIMAL(20,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'inactive', 'rejected')),
  is_featured BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategies_select_public" ON public.strategies FOR SELECT USING (is_public = true OR owner_id = auth.uid());
CREATE POLICY "strategies_insert_own" ON public.strategies FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "strategies_update_own" ON public.strategies FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "admin_strategies_all" ON public.strategies FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- SUBSCRIPTIONS TABLE (copy relationships)
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  slave_account_id UUID NOT NULL REFERENCES public.mt_accounts(id) ON DELETE CASCADE,
  
  -- Copy settings
  copy_mode TEXT DEFAULT 'fixed_lot' CHECK (copy_mode IN ('fixed_lot', 'lot_multiplier', 'equity_percentage', 'balance_ratio')),
  fixed_lot DECIMAL(10,2) DEFAULT 0.01,
  lot_multiplier DECIMAL(10,2) DEFAULT 1.0,
  equity_percentage DECIMAL(5,2) DEFAULT 1.0,
  max_lot_size DECIMAL(10,2) DEFAULT 10.0,
  min_lot_size DECIMAL(10,2) DEFAULT 0.01,
  
  -- Risk management
  max_daily_loss DECIMAL(15,2),
  max_daily_loss_percent DECIMAL(5,2),
  max_total_loss DECIMAL(15,2),
  max_total_loss_percent DECIMAL(5,2),
  max_open_trades INTEGER DEFAULT 50,
  max_lot_per_trade DECIMAL(10,2) DEFAULT 5.0,
  
  -- Filters
  copy_pending_orders BOOLEAN DEFAULT true,
  copy_sl_tp BOOLEAN DEFAULT true,
  reverse_trades BOOLEAN DEFAULT false,
  allowed_symbols TEXT[], -- NULL means all symbols
  blocked_symbols TEXT[],
  
  -- SafeGuard settings
  safeguard_enabled BOOLEAN DEFAULT true,
  safeguard_max_drawdown DECIMAL(5,2) DEFAULT 30,
  safeguard_action TEXT DEFAULT 'pause' CHECK (safeguard_action IN ('pause', 'close_all', 'notify')),
  
  -- Status & Stats
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'stopped', 'rejected')),
  total_profit DECIMAL(15,2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(strategy_id, slave_account_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_insert_own" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscriptions_update_own" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_delete_own" ON public.subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "admin_subscriptions_all" ON public.subscriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- TRADES TABLE (trade history)
-- ============================================
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.mt_accounts(id) ON DELETE CASCADE,
  master_ticket TEXT,
  slave_ticket TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  lot_size DECIMAL(10,2) NOT NULL,
  open_price DECIMAL(20,5) NOT NULL,
  close_price DECIMAL(20,5),
  sl DECIMAL(20,5),
  tp DECIMAL(20,5),
  profit DECIMAL(15,2),
  commission DECIMAL(15,2) DEFAULT 0,
  swap DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled', 'error')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select_own" ON public.trades FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.mt_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "admin_trades_all" ON public.trades FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- CLIENT GROUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.client_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  max_strategies INTEGER DEFAULT 10,
  max_accounts INTEGER DEFAULT 5,
  allowed_strategies UUID[],
  custom_fees JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_all" ON public.client_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_groups_all" ON public.client_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- USER GROUP MEMBERSHIP
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.client_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_groups_select_own" ON public.user_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_user_groups_all" ON public.user_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- GLOBAL SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.global_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_all" ON public.global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_settings_all" ON public.global_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- ACTIVITY LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs_select_own" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin_logs_all" ON public.activity_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_mt_accounts_user_id ON public.mt_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_strategy_id ON public.subscriptions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trades_account_id ON public.trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_subscription_id ON public.trades(subscription_id);
CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON public.trades(opened_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_servers_broker_id ON public.servers(broker_id);

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mt_accounts_updated_at BEFORE UPDATE ON public.mt_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'client'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
