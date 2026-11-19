-- ============================================================
-- MIGRATION: 013 — Captura de leads pelo site
-- - Novo tipo de pop-up "cadastro" (formulário Nome/Telefone/E-mail no site)
--   com cupom de desconto editável pelo sistema (tela Pop-ups do Site).
-- - Origem "Site" em origens_cliente, usada nos leads que chegam pelo pop-up.
-- Execute no Supabase SQL Editor (mesmo projeto do oliveira-joias-frontend).
-- ============================================================

-- Tipo "cadastro" no check de site_popups
ALTER TABLE public.site_popups DROP CONSTRAINT IF EXISTS site_popups_tipo_check;
ALTER TABLE public.site_popups
  ADD CONSTRAINT site_popups_tipo_check
  CHECK (tipo IN ('boas_vindas', 'promocao', 'saida', 'cadastro'));

-- Código do cupom liberado após o cadastro. Não é exposto em GET /api/popups/ativos:
-- o backend só devolve o código na resposta do POST /api/leads.
ALTER TABLE public.site_popups ADD COLUMN IF NOT EXISTS cupom_codigo TEXT;

-- Pop-up de cadastro padrão (10% OFF — BEMVINDO10). Editável em "Pop-ups do Site".
INSERT INTO public.site_popups (tipo, titulo, mensagem, cupom_codigo, ativo, delay_segundos)
SELECT
  'cadastro',
  'Ganhe 10% OFF na sua primeira compra',
  'Cadastre-se e receba na hora um cupom de 10% de desconto para usar nas suas alianças, além de ofertas exclusivas.',
  'BEMVINDO10',
  true,
  5
WHERE NOT EXISTS (SELECT 1 FROM public.site_popups WHERE tipo = 'cadastro');

-- Origem "Site"
INSERT INTO public.origens_cliente (nome, ativo)
SELECT 'Site', true
WHERE NOT EXISTS (SELECT 1 FROM public.origens_cliente WHERE lower(nome) = 'site');

-- Backend (service role) cria/atualiza leads e registra na linha do tempo
GRANT SELECT, INSERT, UPDATE ON public.clientes TO service_role;
GRANT SELECT, INSERT ON public.cliente_timeline TO service_role;
GRANT SELECT, INSERT ON public.origens_cliente TO service_role;

-- Busca de lead existente por e-mail
CREATE INDEX IF NOT EXISTS clientes_email_lower_idx ON public.clientes (lower(email));
