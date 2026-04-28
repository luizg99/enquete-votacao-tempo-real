-- =============================================================================
-- Migração 009 — Modos de pontuação e faixas de classificação
-- =============================================================================
-- Introduz três modos exclusivos de pontuação:
--   * 'none'       — sem pontuação
--   * 'general'    — comportamento atual (ponto fixo dividido por respostas corretas)
--   * 'per_answer' — pontos por alternativa (1..10), somados se múltipla escolha
-- =============================================================================

-- 1) surveys.scoring_mode
alter table public.surveys
  add column if not exists scoring_mode text not null default 'general'
  check (scoring_mode in ('none','general','per_answer'));

-- 2) answers.answer_points (nullable; só significativo em per_answer)
alter table public.answers
  add column if not exists answer_points smallint
  check (answer_points is null or (answer_points between 1 and 10));

-- 3) Faixas de classificação (exclusivo de per_answer)
create table if not exists public.survey_score_bands (
  id           text primary key,
  survey_id    text not null references public.surveys(id) on delete cascade,
  position     int  not null default 0,
  min_points   int  not null,
  max_points   int  not null,
  label        text not null default '',
  observation  text not null default '',
  created_at   timestamptz not null default now(),
  check (max_points >= min_points)
);

create index if not exists idx_score_bands_survey
  on public.survey_score_bands(survey_id, position);

alter table public.survey_score_bands enable row level security;
drop policy if exists "anon_all" on public.survey_score_bands;
create policy "anon_all" on public.survey_score_bands
  for all using (true) with check (true);

alter publication supabase_realtime add table public.survey_score_bands;

-- 4) RPC: get_band_for_score — resolve a faixa que contém p_points para a enquete
create or replace function public.get_band_for_score(
  p_survey text,
  p_points int
) returns table(
  label       text,
  observation text,
  min_points  int,
  max_points  int
) language sql security definer as $$
  select label, observation, min_points, max_points
    from public.survey_score_bands
   where survey_id = p_survey
     and p_points between min_points and max_points
   order by position
   limit 1;
$$;

grant execute on function public.get_band_for_score(text, int) to anon, authenticated;

-- 5) Estende compute_execution_scores com branch por scoring_mode
--    - 'none'       → 0
--    - 'general'    → comportamento original (round((corretas/total_corretas) * points_per_correct, 4))
--    - 'per_answer' → sum(answer_points) das alternativas marcadas
create or replace function public.compute_execution_scores(p_exec text)
returns void as $$
declare
  v_points  int;
  v_survey  text;
  v_mode    text;
begin
  select e.survey_id, sv.points_per_correct, sv.scoring_mode
    into v_survey, v_points, v_mode
    from public.executions e
    join public.surveys sv on sv.id = e.survey_id
   where e.id = p_exec;

  if v_survey is null then return; end if;

  -- Recompute completo: limpa e re-insere
  delete from public.execution_question_scores where execution_id = p_exec;

  if v_mode = 'none' then
    -- Sem pontuação: nada a materializar
    return;
  end if;

  if v_mode = 'general' then
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
    return;
  end if;

  if v_mode = 'per_answer' then
    insert into public.execution_question_scores (execution_id, participant_id, question_id, points)
    select
      p_exec,
      p.id,
      q.id,
      case
        when q.type = 'text' then 0
        else coalesce(ps.points_sum, 0)
      end
    from public.participants p
    cross join public.questions q
    left join (
      select er.participant_id, er.question_id,
             sum(coalesce(a.answer_points, 0))::numeric as points_sum
        from public.execution_responses er
        join public.answers a on a.id = er.answer_id
       where er.execution_id = p_exec
       group by er.participant_id, er.question_id
    ) ps on ps.participant_id = p.id and ps.question_id = q.id
    where p.execution_id = p_exec
      and q.survey_id = v_survey;
    return;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.compute_execution_scores(text) to anon, authenticated;
