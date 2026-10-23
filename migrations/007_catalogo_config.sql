-- ============================================================
-- MIGRATION: 007 — catalogo_config
-- Tabela singleton para configurações gerais do catálogo.
-- Armazena o bloco de descrição padrão exibido em cada produto
-- (Produto, Você sabia?, FAQ), editável pelo sistema.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalogo_config (
  id          TEXT        PRIMARY KEY DEFAULT 'default',
  info_produto TEXT       NOT NULL DEFAULT '',
  voce_sabia  TEXT        NOT NULL DEFAULT '',
  faq         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Linha padrão com conteúdo já existente no frontend
INSERT INTO public.catalogo_config (id, info_produto, voce_sabia, faq)
VALUES (
  'default',
  'Sob encomenda. Prazo de fabricação de até 72h úteis.'
    || E'\n\n' || 'Importante: Valor referente ao par de alianças e caixinha de veludo.'
    || E'\n\n' || 'Incluso: Todos os pares acompanham caixinha de brinde.',
  'Nossas alianças são de fabricação própria, aqui você pode personalizar como desejar! Por exemplo: acrescentar/remover pedras, solicitar modelo liso, espessura maior e muito mais.'
    || E'\n\n' || 'Faça já seu orçamento via WhatsApp que vamos lhe direcionar ♡',
  '[
    {"pergunta": "Qual o material da joia?", "resposta": "Nossas peças são fabricadas em prata premium 950 com designers especializados em joias."},
    {"pergunta": "Quanto tempo de garantia?", "resposta": "Todas as peças possuem garantia eterna sob a autenticidade da joia.\n\nObs: não damos garantia em pedras."},
    {"pergunta": "Como funciona caso precise efetuar uma troca/ajuste de aliança?", "resposta": "Você tem até 7 dias para fazer uma troca ou ajuste na aliança.\n\nNão efetuamos trocas para defeitos identificados previamente como mau uso, somente para peças com defeito de fábrica.\n\nPara ajuste de alianças, se for preciso aumentar/diminuir até 2 números, será cobrada uma taxa de apenas R$ 25,00. Caso a aliança tenha pedra, não será possível fazer o ajuste, somente a troca.\n\nCaso o ajuste seja acima de 2 numerações, será cobrado o valor de 1/3 sobre o valor integral das alianças."}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.catalogo_config TO service_role;
GRANT SELECT ON public.catalogo_config TO anon;
GRANT SELECT ON public.catalogo_config TO authenticated;
