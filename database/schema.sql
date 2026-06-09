-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    social_link VARCHAR(255),
    jifu_id VARCHAR(50),
    package VARCHAR(50),
    role VARCHAR(50) DEFAULT 'Membro',
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create affiliates table
CREATE TABLE IF NOT EXISTS public.affiliates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    affiliate_code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create commission_history table
CREATE TABLE IF NOT EXISTS public.commission_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    affiliate_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    customer_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    product_name VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trading_ideas table
CREATE TABLE IF NOT EXISTS public.trading_ideas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),
    entry_price DECIMAL(15,5),
    stop_loss DECIMAL(15,5),
    take_profit DECIMAL(15,5),
    risk_reward DECIMAL(5,2),
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    likes INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
    result VARCHAR(20) CHECK (result IN ('win', 'loss', 'breakeven')),
    pnl DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trading_idea_comments table
CREATE TABLE IF NOT EXISTS public.trading_idea_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    idea_id UUID REFERENCES public.trading_ideas(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id VARCHAR(255),
    paypal_order_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    product_name VARCHAR(100) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('stripe', 'paypal')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_commission_affiliate ON public.commission_history(affiliate_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_customer ON public.commission_history(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_trading_ideas_author ON public.trading_ideas(author_id);
CREATE INDEX IF NOT EXISTS idx_trading_ideas_symbol ON public.trading_ideas(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_idea_comments_idea ON public.trading_idea_comments(idea_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_affiliates_updated_at BEFORE UPDATE ON public.affiliates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commission_history_updated_at BEFORE UPDATE ON public.commission_history FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trading_ideas_updated_at BEFORE UPDATE ON public.trading_ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_idea_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Users policies
CREATE POLICY "Users can view their own data" ON public.users
    FOR SELECT USING (auth.uid()::text = id::text OR is_admin = true);

CREATE POLICY "Users can update their own data" ON public.users
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Allow user registration" ON public.users
    FOR INSERT WITH CHECK (true);

-- Affiliates policies
CREATE POLICY "Users can view their own affiliate data" ON public.affiliates
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their own affiliate data" ON public.affiliates
    FOR ALL USING (auth.uid()::text = user_id::text);

-- Commission history policies
CREATE POLICY "Affiliates can view their commissions" ON public.commission_history
    FOR SELECT USING (auth.uid()::text = affiliate_user_id::text);

-- Trading ideas policies
CREATE POLICY "Anyone can view trading ideas" ON public.trading_ideas
    FOR SELECT USING (true);

CREATE POLICY "Users can create trading ideas" ON public.trading_ideas
    FOR INSERT WITH CHECK (auth.uid()::text = author_id::text);

CREATE POLICY "Authors can update their trading ideas" ON public.trading_ideas
    FOR UPDATE USING (auth.uid()::text = author_id::text);

CREATE POLICY "Authors can delete their trading ideas" ON public.trading_ideas
    FOR DELETE USING (auth.uid()::text = author_id::text);

-- Trading idea comments policies
CREATE POLICY "Anyone can view comments" ON public.trading_idea_comments
    FOR SELECT USING (true);

CREATE POLICY "Users can create comments" ON public.trading_idea_comments
    FOR INSERT WITH CHECK (auth.uid()::text = author_id::text);

CREATE POLICY "Authors can update their comments" ON public.trading_idea_comments
    FOR UPDATE USING (auth.uid()::text = author_id::text);

CREATE POLICY "Authors can delete their comments" ON public.trading_idea_comments
    FOR DELETE USING (auth.uid()::text = author_id::text);

-- Payments policies
CREATE POLICY "Users can view their own payments" ON public.payments
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can create payments" ON public.payments
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Insert some sample data (optional)
INSERT INTO public.users (username, name, email, password_hash, is_admin, role) VALUES
('demo', 'Demo User', 'demo@example.com', '$2a$10$example.hash.here', false, 'Membro')
ON CONFLICT (username) DO NOTHING;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
