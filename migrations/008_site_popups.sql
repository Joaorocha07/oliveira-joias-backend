-- ============================================================
-- MIGRATION: 008 — site_popups
-- Pop-ups configuráveis exibidos no site público.
-- Tipos: boas_vindas (welcome), promocao (produto específico), saida (exit intent).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_popups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT        NOT NULL CHECK (tipo IN ('boas_vindas', 'promocao', 'saida')),
  titulo          TEXT        NOT NULL DEFAULT '',
  mensagem        TEXT        NOT NULL DEFAULT '',
  imagem_url      TEXT,
  produto_slug    TEXT,        -- apenas para tipo = 'promocao'
  cta_texto       TEXT,        -- texto do botão de ação
  cta_url         TEXT,        -- destino do botão
  ativo           BOOLEAN     NOT NULL DEFAULT true,
  delay_segundos  INTEGER     NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON public.site_popups TO service_role;
GRANT SELECT ON public.site_popups TO anon;
GRANT SELECT ON public.site_popups TO authenticated;
