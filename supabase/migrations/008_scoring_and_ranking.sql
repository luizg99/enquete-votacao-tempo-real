-- =============================================================================
-- Migração 008 — Pontuação e ranking nas execuções
-- =============================================================================

-- 1) Configuração de pontuação na enquete
alter table public.surveys
  add column if not exists points_per_correct int not null default 1
  check (points_per_correct between 1 and 10);

alter table public.surveys
  add column if not exists show_own_rank_to_client boolean not null default false;

-- 2) Marcação de resposta correta (múltiplas permitidas por pergunta em multi-choice)
alter table public.answers
  add column if not exists is_correct boolean not null default false;

create index if not exists idx_answers_correct_by_q
  on public.answers (question_id) where is_correct = true;

-- 3) Pontuação materializada por (execução, participante, pergunta)
create table if not exists public.execution_question_scores (
  execution_id   text not null references public.executions(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  question_id    text not null references public.questions(id) on delete cascade,
  points         numeric(12, 4) not null default 0,
  computed_at    timestamptz not null default now(),
  primary key (execution_id, participant_id, question_id)
);

create index if not exists idx_eqscores_exec on public.execution_question_scores(execution_id);

alter table public.execution_question_scores enable row level security;
drop policy if exists "anon_all" on public.execution_question_scores;
create policy "anon_all" on public.execution_question_scores
  for all using (true) with check (true);

alter publication supabase_realtime add table public.execution_question_scores;

-- 4) RPC: computa e materializa todas as pontuações da execução
create or replace function public.compute_execution_scores(p_exec text)
returns void as $$
declare
  v_points int;
  v_survey text;
begin
  select e.survey_id, sv.points_per_correct
    into v_survey, v_points
    from public.executions e
    join public.surveys sv on sv.id = e.survey_id
   where e.id = p_exec;

  if v_points is null then return; end if;

  -- Recompute completo: limpa e re-insere
  delete from public.execution_question_scores where execution_id = p_exec;

  insert into public.execution_question_scores (execution_id, participant_id, question_id, points)
  select
    p_exec,
    p.id,
    q.id,
    case
      when q.type = 'text' then 0
      when coalesce(nc.n_correct, 0) = 0 then 0
      else round(
        (coalesce(cs.correct_selected, 0)::numeric / nc.n_correct::numeric) * v_points,
        4
      )
    end
  from public.participants p
  cross join public.questions q
  left join (
    select question_id, count(*)::int as n_correct
      from public.answers where is_correct = true
      group by question_id
  ) nc on nc.question_id = q.id
  left join (
    select er.participant_id, er.question_id, count(*)::int as correct_selected
      from public.execution_responses er
      join public.answers a on a.id = er.answer_id and a.is_correct = true
     where er.execution_id = p_exec
     group by er.participant_id, er.question_id
  ) cs on cs.participant_id = p.id and cs.question_id = q.id
  where p.execution_id = p_exec
    and q.survey_id = v_survey;
end;
$$ language plpgsql security definer;

grant execute on function public.compute_execution_scores(text) to anon, authenticated;
