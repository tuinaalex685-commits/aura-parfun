-- CHADRA FACTURE - DATABASE SCHEMA (SUPABASE / POSTGRESQL FRIENDLY)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. USERS Table (Note: In Supabase, auth is handled by auth.users, but we can have a public profiles or custom table if needed. Let's create a custom users table or reference auth.users for Supabase integration)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    tax_pref_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and update their own profile" 
    ON public.profiles FOR ALL 
    USING (auth.uid() = id);

-- 2. CLIENTS Table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can perform all actions on their own clients" 
    ON public.clients FOR ALL 
    USING (auth.uid() = user_id);

-- 3. INVOICES Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'unpaid', -- 'paid', 'unpaid', 'partially_paid'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can perform all actions on their own invoices" 
    ON public.invoices FOR ALL 
    USING (auth.uid() = user_id);

-- 4. INVOICE ITEMS Table
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- Enable RLS on invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can perform all actions on items of their invoices" 
    ON public.invoice_items FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices 
            WHERE public.invoices.id = public.invoice_items.invoice_id 
            AND public.invoices.user_id = auth.uid()
        )
    );

-- 5. PAYMENTS Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can perform all actions on payments of their invoices" 
    ON public.payments FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices 
            WHERE public.invoices.id = public.payments.invoice_id 
            AND public.invoices.user_id = auth.uid()
        )
    );
