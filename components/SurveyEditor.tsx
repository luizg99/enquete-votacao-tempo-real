'use client';

import { useEffect, useRef, useState } from 'react';
import type { Survey, ScoringMode } from '@/lib/types';
import {
  getSurvey,
  updateSurvey,
  addQuestion,
  removeQuestion,
  updateQuestion,
  addAnswer,
  removeAnswer,
  updateAnswer,
  subscribeSurveyChanges,
} from '@/lib/store';
import { ScoreBandsEditor } from './ScoreBandsEditor';

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, ms = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), ms);
  };
}

export function SurveyEditor({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const s = await getSurvey(surveyId);
    setSurvey(s);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const unsub = subscribeSurveyChanges(surveyId, reload);
    return unsub;
  }, [surveyId]);

  if (loading) return <div className="card">Carregando…</div>;
  if (!survey) return <div className="card">Enquete não encontrada.</div>;

  const mode: ScoringMode = survey.scoring_mode ?? 'general';
  const isPerAnswer = mode === 'per_answer';
  const isGeneral = mode === 'general';
  const hasScoring = mode !== 'none';

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2>Editando enquete</h2>
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>Fechar editor</button>
      </div>

      <label className="muted">Descrição</label>
      <TitleInput survey={survey} />

      <div style={{ marginTop: 12 }}>
        <label className="muted">Tempo de resposta por pergunta</label>
        <TimePerQuestionInput survey={survey} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="muted">Tipo de Pontuação</label>
        <ScoringModeSelect survey={survey} />
      </div>

      {isGeneral && (
        <div style={{ marginTop: 12 }}>
          <label className="muted">Pontuação por pergunta correta</label>
          <PointsPerCorrectInput survey={survey} />
        </div>
      )}

      {hasScoring && (
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={survey.show_own_rank_to_client}
            onChange={(e) =>
              updateSurvey(survey.id, { show_own_rank_to_client: e.target.checked })
            }
          />
          <span>Mostrar posição própria para o cliente ao final</span>
        </label>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={survey.single_vote_per_device}
          onChange={(e) =>
            updateSurvey(survey.id, { single_vote_per_device: e.target.checked })
          }
        />
        <span>Permitir apenas um voto por dispositivo</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={survey.allow_multiple_choices}
          onChange={(e) =>
            updateSurvey(survey.id, { allow_multiple_choices: e.target.checked })
          }
        />
        <span>Permitir múltiplas escolhas por pergunta</span>
      </label>

      {isPerAnswer && <ScoreBandsEditor surveyId={survey.id} />}

      <div style={{ marginTop: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <h3 style={{ margin: 0 }}>Perguntas</h3>
          <div className="spacer" />
          <ImportButtons survey={survey} />
        </div>
        {survey.questions.map((q) => (
          <QuestionBlock key={q.id} survey={survey} question={q} />
        ))}
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => addQuestion(survey.id, '')}>
            + Adicionar pergunta
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoringModeSelect({ survey }: { survey: Survey }) {
  const current: ScoringMode = survey.scoring_mode ?? 'general';

  const handleChange = async (next: ScoringMode) => {
    if (next === current) return;

    // Confirmações por transição
    if (current === 'general' && next === 'per_answer') {
      const ok = confirm(
        'Trocar para "Com pontuação por resposta"?\n\n' +
          'As marcações de "Resposta correta" serão ignoradas e cada alternativa precisará de uma pontuação (1 a 10).'
      );
      if (!ok) return;
    } else if (current === 'per_answer' && next !== 'per_answer') {
      const ok = confirm(
        'Trocar de "Com pontuação por resposta" para outro modo?\n\n' +
          'Os pontos por alternativa e as faixas de classificação ficarão inativos. Se voltar a este modo no futuro, os dados estarão preservados.'
      );
      if (!ok) return;
    } else if (current === 'none' && next !== 'none') {
      // sem confirmação necessária — só vai aparecer mais UI
    } else if (next === 'none') {
      const ok = confirm(
        'Trocar para "Sem pontuação"?\n\n' +
          'Os campos de pontuação ficam ocultos. Os dados existentes não são apagados.'
      );
      if (!ok) return;
    }

    await updateSurvey(survey.id, { scoring_mode: next });
  };

  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      <select
        className="select"
        value={current}
        onChange={(e) => handleChange(e.target.value as ScoringMode)}
        style={{ maxWidth: 320 }}
      >
        <option value="none">SEM PONTUAÇÃO</option>
        <option value="general">COM PONTUAÇÃO GERAL</option>
        <option value="per_answer">COM PONTUAÇÃO POR RESPOSTA</option>
      </select>
    </div>
  );
}

function ImportButtons({ survey }: { survey: Survey }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'template' | 'import' | null>(null);

  const handleTemplate = async () => {
    setBusy('template');
    try {
      const { downloadTemplate } = await import('@/lib/excelImport');
      await downloadTemplate();
    } catch (e: any) {
      alert('Erro ao gerar planilha: ' + (e.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleImportClick = () => {
    if (survey.questions.length > 0) {
      alert(
        `Esta enquete já tem ${survey.questions.length} pergunta(s) cadastrada(s). ` +
          'Exclua todas as perguntas antes de importar.'
      );
      return;
    }
    fileRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setBusy('import');
    try {
      const { parseQuestionsFile, importQuestionsToSurvey } = await import('@/lib/excelImport');
      const parsed = await parseQuestionsFile(file);
      if (!confirm(`Importar ${parsed.length} pergunta(s) na enquete?`)) {
        return;
      }
      const n = await importQuestionsToSurvey(survey.id, parsed);
      alert(`✓ ${n} pergunta(s) importada(s).`);
    } catch (e: any) {
      alert('Erro ao importar: ' + (e.message ?? e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button className="btn" disabled={!!busy} onClick={handleTemplate}>
        {busy === 'template' ? 'Gerando…' : '⬇ PlanilhaModelo.xlsx'}
      </button>
      <button className="btn" disabled={!!busy} onClick={handleImportClick}>
        {busy === 'import' ? 'Importando…' : '⬆ Importar perguntas'}
      </button>
    </>
  );
}

function TitleInput({ survey }: { survey: Survey }) {
  const [value, setValue] = useState(survey.title);
  const save = useDebouncedCallback((v: string) => updateSurvey(survey.id, { title: v }), 400);

  // Mantém o input controlado sem ser sobrescrito por reloads
  useEffect(() => {
    setValue(survey.title);
    // propositalmente: NÃO dependemos de survey.title, só do id.
    // Reloads não devem apagar o que o usuário está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id]);

  return (
    <input
      type="text"
      value={value}
      placeholder="Descrição/título da enquete"
      onChange={(e) => {
        setValue(e.target.value);
        save(e.target.value);
      }}
    />
  );
}

function QuestionBlock({
  survey,
  question,
}: {
  survey: Survey;
  question: Survey['questions'][number];
}) {
  const isText = question.type === 'text';
  const mode: ScoringMode = survey.scoring_mode ?? 'general';
  const isPerAnswer = mode === 'per_answer';
  const isGeneral = mode === 'general';

  const helperText = (() => {
    if (!isPerAnswer || isText || question.answers.length === 0) return null;
    const letters = question.answers
      .map((a, i) => `${String.fromCharCode(97 + i)}=${a.answer_points ?? '?'} ${a.answer_points === 1 ? 'ponto' : 'pontos'}`)
      .join(' | ');
    const intro = survey.allow_multiple_choices
      ? 'marque uma ou mais alternativas. A pontuação da pergunta será a soma dos pontos das alternativas marcadas.'
      : 'marque uma única alternativa por pergunta.';
    return `Instruções: ${intro}\nPontuação: ${letters}`;
  })();

  return (
    <div className="question-block">
      <div className="row">
        <QuestionTextInput question={question} />
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={question.type}
          onChange={(e) =>
            updateQuestion(question.id, { type: e.target.value as 'options' | 'text' })
          }
        >
          <option value="options">Múltipla escolha</option>
          <option value="text">Resposta dissertativa</option>
        </select>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Deseja realmente excluir a pergunta?')) removeQuestion(question.id);
          }}
        >
          Excluir pergunta
        </button>
      </div>

      {isText ? (
        <>
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Pergunta dissertativa — o participante digitará a resposta livremente. Sem opções a cadastrar.
          </div>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={question.show_text_in_run}
              onChange={(e) =>
                updateQuestion(question.id, { show_text_in_run: e.target.checked })
              }
            />
            <span>Mostrar respostas no painel da execução (palco)</span>
          </label>
          <small className="muted" style={{ display: 'block', marginLeft: 26 }}>
            Mesmo desativado, as respostas sempre aparecem no relatório de acompanhamento.
          </small>
        </>
      ) : (
        <>
          {helperText && (
            <pre
              className="muted"
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 13,
                margin: '8px 0',
                padding: 8,
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
              }}
            >
              {helperText}
            </pre>
          )}

          <div>
            {question.answers.map((a, idx) => (
              <div key={a.id} className="answer-row">
                <span
                  className="muted"
                  style={{ minWidth: 22, textAlign: 'right', fontSize: 13 }}
                >
                  {String.fromCharCode(97 + idx)})
                </span>
                <AnswerTextInput answer={a} />
                {isGeneral && (
                  <label
                    className="answer-correct"
                    title="Marcar como resposta correta"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={a.is_correct}
                      onChange={(e) => updateAnswer(a.id, { is_correct: e.target.checked })}
                    />
                    <span style={{ fontSize: 13 }}>Correta</span>
                  </label>
                )}
                {isPerAnswer && <AnswerPointsInput answer={a} />}
                <button
                  className="btn icon danger"
                  title="Excluir resposta"
                  onClick={() => removeAnswer(a.id)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => addAnswer(question.id, '')}>
              + Adicionar resposta
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionTextInput({ question }: { question: Survey['questions'][number] }) {
  const [value, setValue] = useState(question.text);
  const save = useDebouncedCallback((v: string) => updateQuestion(question.id, { text: v }), 400);

  useEffect(() => {
    setValue(question.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  return (
    <input
      type="text"
      value={value}
      placeholder="Texto da pergunta"
      onChange={(e) => {
        setValue(e.target.value);
        save(e.target.value);
      }}
    />
  );
}

function AnswerTextInput({ answer }: { answer: Survey['questions'][number]['answers'][number] }) {
  const [value, setValue] = useState(answer.text);
  const save = useDebouncedCallback((v: string) => updateAnswer(answer.id, { text: v }), 400);

  useEffect(() => {
    setValue(answer.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer.id]);

  return (
    <input
      type="text"
      value={value}
      placeholder="Texto da resposta"
      onChange={(e) => {
        setValue(e.target.value);
        save(e.target.value);
      }}
    />
  );
}

function AnswerPointsInput({
  answer,
}: {
  answer: Survey['questions'][number]['answers'][number];
}) {
  const [value, setValue] = useState(answer.answer_points == null ? '' : String(answer.answer_points));
  const save = useDebouncedCallback((v: string) => {
    const trimmed = v.trim();
    if (trimmed === '') {
      updateAnswer(answer.id, { answer_points: null });
      return;
    }
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed < 1 || parsed > 10) return;
    updateAnswer(answer.id, { answer_points: parsed });
  }, 400);

  useEffect(() => {
    setValue(answer.answer_points == null ? '' : String(answer.answer_points));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer.id]);

  const handleChange = (raw: string) => {
    if (raw === '') {
      setValue('');
      save('');
      return;
    }
    if (!/^\d+$/.test(raw)) return; // só dígitos
    const parsed = parseInt(raw, 10);
    if (parsed > 10) return; // rejeita digitação que excede o limite
    setValue(raw);
    save(raw);
  };

  const invalid = value !== '' && parseInt(value, 10) < 1;

  return (
    <label
      className="answer-points"
      title="Pontuação desta alternativa (1 a 10)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 13 }} className="muted">
        Pontos
      </span>
      <input
        type="number"
        min={1}
        max={10}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          width: 64,
          ...(invalid ? { borderColor: '#dc2626', background: '#fef2f2' } : {}),
        }}
      />
    </label>
  );
}

function TimePerQuestionInput({ survey }: { survey: Survey }) {
  const [value, setValue] = useState(String(survey.time_per_question ?? 60));
  const save = useDebouncedCallback((v: string) => {
    const parsed = parseInt(v, 10);
    const n = Math.max(5, Math.min(3600, Number.isFinite(parsed) ? parsed : 60));
    updateSurvey(survey.id, { time_per_question: n });
  }, 400);

  useEffect(() => {
    setValue(String(survey.time_per_question ?? 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id]);

  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      <input
        type="number"
        min={5}
        max={3600}
        step={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          save(e.target.value);
        }}
        style={{ maxWidth: 120 }}
      />
      <span className="muted">segundos (5–3600)</span>
    </div>
  );
}

function PointsPerCorrectInput({ survey }: { survey: Survey }) {
  const [value, setValue] = useState(String(survey.points_per_correct ?? 1));
  const save = useDebouncedCallback((v: string) => {
    if (v === '') return;
    const parsed = parseInt(v, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed < 1 || parsed > 10) return;
    updateSurvey(survey.id, { points_per_correct: parsed });
  }, 400);

  useEffect(() => {
    setValue(String(survey.points_per_correct ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id]);

  const handleChange = (raw: string) => {
    if (raw === '') {
      setValue('');
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const parsed = parseInt(raw, 10);
    if (parsed > 10) return;
    setValue(raw);
    save(raw);
  };

  const handleBlur = () => {
    if (value === '' || parseInt(value, 10) < 1) {
      setValue(String(survey.points_per_correct ?? 1));
    }
  };

  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      <input
        type="number"
        min={1}
        max={10}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        style={{ maxWidth: 120 }}
      />
      <span className="muted">pontos (1–10) por pergunta acertada</span>
    </div>
  );
}
