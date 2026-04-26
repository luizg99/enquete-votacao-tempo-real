-- =============================================================================
-- Migração 005 — Suporte a respostas dissertativas no fluxo legacy + toggle
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================================

-- 1) Permitir respostas de texto livre na tabela legacy `votes`
alter table public.votes alter column answer_id drop not null;
alter table public.votes add column if not exists text text;

-- 2) Toggle: mostrar respostas dissertativas durante a execução (palco)
--    Não afeta os relatórios — só o painel /executions/run.
alter table public.questions
  add column if not exists show_text_in_run boolean not null default true;
