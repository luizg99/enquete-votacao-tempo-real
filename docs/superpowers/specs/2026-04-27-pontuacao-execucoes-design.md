# Pontuação e ranking nas execuções — Design

**Status:** aprovado para implementação
**Data:** 2026-04-27

## Objetivo

Transformar execuções em "quizzes pontuados". Cada enquete pode ter um valor de pontuação por pergunta correta; cada pergunta de múltipla escolha pode ter uma ou mais respostas marcadas como corretas. Ao finalizar a execução, o sistema computa as pontuações e exibe um ranking dos participantes.

Funcionalidade **não afeta** enquetes/execuções não pontuadas (sem `is_correct` marcado), nem rotas legadas (`/vote`, `/track`, `/qr`).

## Regras de negócio

### RB-1 — Cadastro
1. Enquete tem campo **`points_per_correct`** (int, 1–10, default 1) — valor base do prêmio por pergunta correta.
2. Enquete tem flag **`show_own_rank_to_client`** (boolean, default `false`) — define se o cliente vê a própria posição ao final.
3. Cada pergunta de tipo `options` tem um checkbox "Correta?" por opção. Múltiplas opções podem ser marcadas como corretas (caso multi-choice).
4. Pergunta tipo `text` (dissertativa) **não pontua**.
5. Excluir pergunta exige confirmação `"Deseja realmente excluir a pergunta?"`.

### RB-2 — Algoritmo de pontuação

Para cada `(participant, question)`:

```
if question.type == 'text':
    score = 0
else:
    n_correct = COUNT(answers WHERE question_id = q AND is_correct = true)
    if n_correct == 0:
        score = 0
    else:
        correct_selected = COUNT(execution_responses WHERE
                                 participant_id = p AND question_id = q
                                 AND answer_id IN (corretas))
        score = (correct_selected / n_correct) * points_per_correct
```

**Sem penalidade** por seleção de respostas erradas. Cliente que escolhe 2 corretas + 1 errada em uma pergunta de 3 corretas: `2/3 × points_per_correct`.

**Pontuação total do participante:** soma dos scores de todas as perguntas.

### RB-3 — Quando calcular

Cálculo ocorre **apenas no `finishExecution`**. Chamada de uma RPC `compute_execution_scores(execution_id)` materializa os scores na tabela `execution_question_scores`. Rodar de novo a RPC sobre uma execução já finalizada **substitui** os valores (UPSERT por chave primária).

**Justificativa:** elimina necessidade de triggers em tempo real. Como a regra do timer (decisão R3) impede o cliente de alterar respostas após expiração, a "resposta final" no momento de `finishExecution` é a verdade. Não há `delta` a aplicar in-flight.

### RB-4 — Cliente bloqueado quando timer expira

Mantém a regra atual da feature de timer:
- Após o timer expirar, cliente fica bloqueado de alterar resposta.
- Apenas o botão "↻ Reiniciar timer" do admin libera nova janela.
- Como pontuação só é computada na finalização, alterações feitas após reinício do timer entram no cálculo final automaticamente. Não há mecânica especial de "descartar pontuação anterior" — não existe pontuação anterior gravada até o `finishExecution`.

### RB-5 — Ranking
- Lista todos os participantes da execução, ordenada por **pontuação total descendente**.
- **Empate**: posição compartilhada estilo olímpico — dois primeiros = "1º"; próximo = "3º".
- Exibe: posição, nome do participante, empresa, pontuação total (2 casas decimais no display).

### RB-6 — Visualização do ranking
- Em `/executions`, cada item finalizado de enquete pontuada ganha botão **"Ver ranking"**.
- Botão visível **apenas se** `status = 'finished'` E enquete é considerada pontuada (vide RB-7).
- Nova rota `/executions/ranking?id=<exec>` exibe a tabela.

### RB-7 — Definição de "enquete pontuada"
Enquete é pontuada se **pelo menos uma pergunta** da survey vinculada tem **pelo menos uma resposta** com `is_correct = true`.

Não há flag explícita `is_scored` na enquete — a presença de marcações define o estado. Sem marcações, o sistema se comporta como enquete normal (sem ranking).

### RB-8 — Cliente vê a própria posição
- Se `surveys.show_own_rank_to_client = true` E execução está finalizada E enquete é pontuada:
  - Tela do cliente em `/join` mostra: posição (ex.: "Você ficou em 3º"), pontos totais (ex.: "26.67 / 50").
- Se `false`: cliente vê apenas a tela atual de "✓ Execução encerrada — obrigado".

## Modelo de dados

### Migration 008

```sql
-- Configuração de pontuação na enquete
alter table public.surveys
  add column if not exists points_per_correct int not null default 1
  check (points_per_correct between 1 and 10);

alter table public.surveys
  add column if not exists show_own_rank_to_client boolean not null default false;

-- Resposta correta por opção (múltiplas permitidas por pergunta)
alter table public.answers
  add column if not exists is_correct boolean not null default false;

create index if not exists idx_answers_correct_by_q
  on public.answers (question_id) where is_correct = true;

-- Pontuação materializada por (execução, participante, pergunta)
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

-- RPC: computa e materializa todas as pontuações da execução
create or replace function public.compute_execution_scores(p_exec text)
returns void as $$
declare
  v_points int;
begin
  select sv.points_per_correct into v_points
    from public.executions e
    join public.surveys sv on sv.id = e.survey_id
   where e.id = p_exec;

  if v_points is null then return; end if;

  -- Limpa pontuações antigas (recompute completo)
  delete from public.execution_question_scores where execution_id = p_exec;

  -- Insere pontuação por (participant, question)
  -- Score = (corretas_marcadas_pelo_part / total_corretas_da_pergunta) * v_points
  -- Skipa perguntas sem corretas, perguntas tipo text
  insert into public.execution_question_scores (execution_id, participant_id, question_id, points)
  select
    p_exec,
    p.id,
    q.id,
    case
      when q.type = 'text' then 0
      when nc.n_correct = 0 then 0
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
    and q.survey_id = (select survey_id from public.executions where id = p_exec);
end;
$$ language plpgsql security definer;

grant execute on function public.compute_execution_scores(text) to anon, authenticated;
```

### Tipos TypeScript adicionais

```ts
// Em Survey:
//   points_per_correct: number;
//   show_own_rank_to_client: boolean;

// Em Answer:
//   is_correct: boolean;

export type ExecutionScore = {
  execution_id: string;
  participant_id: string;
  question_id: string;
  points: number;  // numeric vem como string ou number do supabase-js; tratar
  computed_at: string;
};

export type RankingEntry = {
  participantId: string;
  name: string;
  company: string;
  totalPoints: number;
  position: number; // já com regra de empate aplicada
};
```

## Componentes do frontend

### `SurveyEditor`
- **Input** "Pontuação por pergunta correta" (number, min 1 max 10, default 1) próximo aos toggles existentes.
- **Toggle** "Mostrar posição do participante ao final" (checkbox).
- Em cada `Answer` (apenas para perguntas tipo `options`):
  - Novo checkbox "Correta?" antes do botão `🗑` de excluir.
  - Cliques disparam `updateAnswer({is_correct: !current})`.
- Em `removeQuestion`: confirmar com `"Deseja realmente excluir a pergunta?"` (texto exato).

### `ExecutionList`
- Botão **"Ver ranking"** novo, ao lado de "Acompanhar"/"Excluir".
- Visível apenas quando:
  - `execution.status === 'finished'`
  - Survey vinculada tem ao menos uma `answer.is_correct = true` (pré-fetch ou flag computada)

### `RankingScreen` (nova rota `/executions/ranking?id=<exec>`)
- Header: nome da execução + título da survey.
- Tabela: Posição | Nome | Empresa | Pontuação.
- Lógica de posição com empate compartilhado (estilo olímpico).
- Botão "← Voltar" para `/executions`.

### `JoinFlow` (cliente)
- Quando `execution.status === 'finished'`:
  - Se `survey.show_own_rank_to_client` e survey é pontuada:
    - Buscar o ranking, encontrar a posição do participante.
    - Exibir: "Você ficou em **Xº**" + pontuação total + "✓ Obrigado pela participação!"
  - Senão: tela atual de "✓ Execução encerrada".

### `lib/executions.ts`
- Nova função `computeExecutionScores(executionId)` chama RPC.
- Modificar `finishExecution`: depois do update de status, chamar `compute_execution_scores`.
- Nova função `loadRanking(executionId)`: busca participantes + suas pontuações totais, monta `RankingEntry[]` com regra de empate aplicada client-side.
- Nova função `loadOwnRank(executionId, participantId)`: variante mais leve para o `JoinFlow` — busca só o necessário pra encontrar a posição do cliente.
- Nova função para detectar se uma execução é "pontuada": `executionIsScored(executionId)` ou similar (ler `survey.questions[].answers[].is_correct`).

## Casos de uso

### CU-1: Quiz simples com 3 perguntas single-choice, 1 correta cada, 10 pontos cada
- Pergunta 1: cliente seleciona correta → 10 pts
- Pergunta 2: cliente seleciona errada → 0 pts
- Pergunta 3: cliente não responde (não selecionou nada) → 0 pts
- Total: 10 pts

### CU-2: Multi-choice, pergunta com 2 corretas, 10 pontos
- Cliente seleciona 1 correta + 1 errada → `1/2 × 10 = 5 pts`
- Cliente seleciona 2 corretas → `2/2 × 10 = 10 pts`
- Cliente seleciona só 1 errada → `0/2 × 10 = 0 pts`

### CU-3: Multi-choice, pergunta com 3 corretas, 10 pontos
- Cliente seleciona 1 correta → `1/3 × 10 = 3.3333 pts` (armazenado), exibido `3.33`.
- Cliente seleciona 3 corretas → `3/3 × 10 = 10.0000 pts`.

### CU-4: Empate no ranking
- Alice: 30 pts, Bob: 30 pts, Carol: 20 pts.
- Posições: Alice = 1º, Bob = 1º, Carol = 3º (Olympic-style).

### CU-5: Cliente vê a própria posição
- `show_own_rank_to_client = true`. Cliente em `/join` após finalização vê "Você ficou em 2º — 24.67 pts".

### CU-6: Enquete sem nenhuma marcação de correta
- Pontuação não é computada (RPC roda mas `n_correct = 0` para todas as perguntas → tudo zero).
- Botão "Ver ranking" não aparece em `/executions` (RB-7).

### CU-7: Pergunta tipo `text` no meio de um quiz
- Pergunta dissertativa contribui 0 para todos os participantes. Não interfere no ranking.

## Validações

- `points_per_correct` entre 1 e 10 (constraint DB + clamp UI).
- `is_correct` só significativo em perguntas tipo `options` (UI esconde checkbox em texto).
- `compute_execution_scores` é idempotente — pode ser re-executada sem efeito colateral além de atualizar `computed_at`.
- Ranking lido apenas quando `status='finished'` (UI bloqueia acesso senão).

## Edge cases e fluxos de erro

| Cenário | Comportamento |
|---|---|
| Admin altera `is_correct` ou `points_per_correct` **após finalizar** | RPC `compute_execution_scores` deve ser re-executada para refletir. UI do ranking pode oferecer botão "Recomputar" ao admin (opcional, fora de escopo inicial). |
| Participante sem nenhuma resposta gravada | Aparece no ranking com 0 pts, na última posição (empatado com outros zeros). |
| Pergunta excluída após `finishExecution` | `on delete cascade` em `execution_question_scores` limpa scores órfãos. Recompute pode ser necessário. |
| Cliente abre `/join` em execução finalizada antes da RPC ter rodado | Race muito rara (RPC roda imediatamente após `update status`). Se ocorrer, cliente vê "✓ Encerrada" sem rank por alguns segundos. Tolerável. |
| Multi-correta + `allow_multiple_choices = false` | Cliente só pode selecionar 1 → score = `(0 ou 1) / n_correct × points`. Funciona, mas resultado pode parecer estranho (nunca atinge full points). Cabe ao admin não fazer essa combinação na enquete. |
| Numerical drift no display | Armazena `numeric(12,4)`, exibe arredondado a 2 casas. Soma é exata internamente. |

## Out of scope (YAGNI)

- ❌ Penalidade por seleção de resposta errada
- ❌ Pontuação diferente por pergunta individual (todas usam `points_per_correct` da enquete)
- ❌ Recompute sob demanda na tela de ranking (só roda no finalize)
- ❌ Histórico de mudanças de pontuação (`computed_at` registra apenas o último)
- ❌ Ranking parcial durante execução em andamento

## Arquivos a criar/modificar

**Novos:**
- `supabase/migrations/008_scoring_and_ranking.sql`
- `components/RankingScreen.tsx`
- `app/executions/ranking/page.tsx`

**Modificados:**
- `lib/types.ts` — `Survey.points_per_correct`, `Survey.show_own_rank_to_client`, `Answer.is_correct`, `ExecutionScore`, `RankingEntry`
- `lib/store.ts` — normalize/update Survey (novos campos), addAnswer/updateAnswer (is_correct), removeQuestion (texto do confirm)
- `lib/executions.ts` — `computeExecutionScores`, `loadRanking`, `loadOwnRank`, `executionIsScored`; `finishExecution` chama o compute
- `components/SurveyEditor.tsx` — input pontos, toggle rank cliente, checkbox "Correta?" por answer
- `components/ExecutionList.tsx` — botão "Ver ranking" condicional
- `components/JoinFlow.tsx` — exibir posição do cliente quando configurado
- `app/globals.css` — estilos da tela de ranking + checkbox correto

## Plano de teste manual

1. Criar enquete pontuada com 3 perguntas (1 single-correct, 1 multi com 2 corretas, 1 dissertativa). `points_per_correct = 10`.
2. Marcar `show_own_rank_to_client = true`.
3. Iniciar execução, abrir 2 abas de cliente (A, B).
4. A responde Q1 correto, Q2 1 de 2 corretas, Q3 algum texto.
   Expected: A → 10 + 5 + 0 = **15 pts**.
5. B responde Q1 errado, Q2 2 corretas, Q3 vazio.
   Expected: B → 0 + 10 + 0 = **10 pts**.
6. Admin finaliza.
7. Em `/executions`, ver botão "Ver ranking" para a execução.
8. Abrir ranking — verificar A (1º, 15.00 pts) e B (2º, 10.00 pts).
9. Cliente A em `/join` deve ver "Você ficou em 1º — 15.00 pts".
10. Mudar `show_own_rank_to_client = false`, recarregar `/join` — cliente A vê só "✓ Encerrada".
11. Criar enquete **sem** marcações de `is_correct` — botão "Ver ranking" não deve aparecer.
12. Empate: criar cenário com 2 participantes empatados — verificar Olympic-style positions.
