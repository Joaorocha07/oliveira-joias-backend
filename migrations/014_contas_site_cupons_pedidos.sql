-- ============================================================
-- MIGRATION: 014 — Contas de clientes no site, cupons e pedidos do site
--
-- IMPORTANTE (segurança): as contas do site NÃO usam o Supabase Auth.
-- O Supabase Auth é o login da equipe no sistema, e as políticas do banco
-- liberam tudo para "authenticated". Clientes fazem login pelo backend
-- (e-mail + senha com hash scrypt), que usa a service role.
--
-- Execute no Supabase SQL Editor (mesmo projeto do oliveira-joias-frontend),
-- depois da 013_leads_site.sql.
-- ============================================================

-- ── Desconto do cupom do pop-up de cadastro ─────────────────────────────────
ALTER TABLE public.site_popups ADD COLUMN IF NOT EXISTS cupom_percentual NUMERIC(5,2);
UPDATE public.site_popups SET cupom_percentual = 10
WHERE tipo = 'cadastro' AND cupom_codigo IS NOT NULL AND cupom_percentual IS NULL;

-- ── Contas do site ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_contas (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID        NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  senha_hash       TEXT        NOT NULL,
  -- A loja confirma no sistema que a conta é mesmo da pessoa do cadastro.
  -- Só depois disso o perfil mostra as compras feitas na loja.
  verificado       BOOLEAN     NOT NULL DEFAULT false,
  ultimo_login_em  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS site_contas_email_idx ON public.site_contas (lower(email));

-- ── Cupons (um registro por cliente — controla o uso) ───────────────────────
CREATE TABLE IF NOT EXISTS public.cupons (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID          NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo      TEXT          NOT NULL,
  descricao   TEXT,
  tipo        TEXT          NOT NULL DEFAULT 'percentual' CHECK (tipo IN ('percentual', 'valor')),
  valor       NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  status      TEXT          NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'usado', 'cancelado')),
  validade    DATE,
  origem      TEXT          NOT NULL DEFAULT 'manual' CHECK (origem IN ('boas_vindas', 'manual')),
  venda_id    UUID          REFERENCES public.vendas(id) ON DELETE SET NULL,
  usado_em    TIMESTAMPTZ,
  created_by  UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cupons_cliente_idx ON public.cupons (cliente_id, status);
-- Cada cliente recebe no máximo um cupom de boas-vindas
CREATE UNIQUE INDEX IF NOT EXISTS cupons_boas_vindas_unico ON public.cupons (cliente_id) WHERE origem = 'boas_vindas';

-- ── Pedidos feitos pelo carrinho do site ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_pedidos (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      BIGINT        GENERATED ALWAYS AS IDENTITY UNIQUE,
  cliente_id  UUID          NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  -- [{ slug, nome, quantidade, valor_unitario, observacao }]
  itens       JSONB         NOT NULL,
  subtotal    NUMERIC(12,2) NOT NULL,
  cupom_id    UUID          REFERENCES public.cupons(id) ON DELETE SET NULL,
  cupom_codigo TEXT,
  desconto    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL,
  observacoes TEXT,
  status      TEXT          NOT NULL DEFAULT 'novo'
                CHECK (status IN ('novo', 'em_atendimento', 'concluido', 'cancelado')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS site_pedidos_cliente_idx ON public.site_pedidos (cliente_id);
CREATE INDEX IF NOT EXISTS site_pedidos_status_idx ON public.site_pedidos (status);

-- ── Permissões ──────────────────────────────────────────────────────────────
-- Visitantes (anon) não acessam nada direto: tudo passa pelo backend.
ALTER TABLE public.site_contas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pedidos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_contas, public.cupons, public.site_pedidos FROM anon;
REVOKE ALL ON public.site_contas, public.cupons, public.site_pedidos FROM authenticated;
GRANT ALL ON public.site_contas, public.cupons, public.site_pedidos TO service_role;
GRANT SELECT ON public.vendas, public.venda_itens TO service_role;
GRANT SELECT ON public.catalogo_produtos TO service_role;

-- Equipe (sistema): vê as contas sem o hash da senha e só pode marcar "verificado".
GRANT SELECT (id, cliente_id, email, verificado, ultimo_login_em, created_at) ON public.site_contas TO authenticated;
GRANT UPDATE (verificado, updated_at) ON public.site_contas TO authenticated;
DROP POLICY IF EXISTS site_contas_equipe_select ON public.site_contas;
DROP POLICY IF EXISTS site_contas_equipe_update ON public.site_contas;
CREATE POLICY site_contas_equipe_select ON public.site_contas FOR SELECT TO authenticated USING (true);
CREATE POLICY site_contas_equipe_update ON public.site_contas FOR UPDATE TO authenticated USING (true);

-- Equipe: gerencia cupons e pedidos do site.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cupons TO authenticated;
GRANT SELECT, UPDATE ON public.site_pedidos TO authenticated;
DROP POLICY IF EXISTS cupons_equipe ON public.cupons;
DROP POLICY IF EXISTS site_pedidos_equipe_select ON public.site_pedidos;
DROP POLICY IF EXISTS site_pedidos_equipe_update ON public.site_pedidos;
CREATE POLICY cupons_equipe ON public.cupons FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY site_pedidos_equipe_select ON public.site_pedidos FOR SELECT TO authenticated USING (true);
CREATE POLICY site_pedidos_equipe_update ON public.site_pedidos FOR UPDATE TO authenticated USING (true);

-- ── Cupom de boas-vindas para quem já se cadastrou pelo pop-up (013) ─────────
INSERT INTO public.cupons (cliente_id, codigo, descricao, tipo, valor, origem)
SELECT c.id, p.cupom_codigo, '10% OFF na primeira compra', 'percentual', COALESCE(p.cupom_percentual, 10), 'boas_vindas'
FROM public.clientes c
JOIN public.origens_cliente o ON o.id = c.origem_id AND lower(o.nome) = 'site'
CROSS JOIN LATERAL (
  SELECT cupom_codigo, cupom_percentual FROM public.site_popups
  WHERE tipo = 'cadastro' AND cupom_codigo IS NOT NULL
  ORDER BY created_at DESC LIMIT 1
) p
WHERE NOT EXISTS (SELECT 1 FROM public.vendas v WHERE v.cliente_id = c.id AND v.status NOT IN ('cancelado', 'orcamento'))
ON CONFLICT DO NOTHING;
