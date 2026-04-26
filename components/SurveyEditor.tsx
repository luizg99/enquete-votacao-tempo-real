'use client';

import { useEffect, useRef, useState } from 'react';
import type { Survey } from '@/lib/types';
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

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2>Editando enquete</h2>
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>Fechar editor</button>
      </div>

      <label className="muted">Descrição</label>
      <TitleInput survey={survey} />

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

      <div style={{ marginTop: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <h3 style={{ margin: 0 }}>Perguntas</h3>
          <div className="spacer" />
          <ImportButtons survey={survey} />
        </div>
        {survey.questions.map((q) => (
          <QuestionBlock key={q.id} surveyId={survey.id} question={q} />
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
  surveyId,
  question,
}: {
  surveyId: string;
  question: Survey['questions'][number];
}) {
  const isText = question.type === 'text';
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
            if (confirm('Excluir esta pergunta?')) removeQuestion(question.id);
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
          <div>
            {question.answers.map((a) => (
              <div key={a.id} className="answer-row">
                <AnswerTextInput answer={a} />
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
