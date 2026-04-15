'use client';

import { useEffect, useState } from 'react';
import type { Survey } from '@/lib/types';
import { getSurvey, registerVote } from '@/lib/store';

export function VoteStepper({ surveyId }: { surveyId: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSurvey(surveyId);
        setSurvey(s);
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [surveyId]);

  if (loading) return <div className="card">Carregando…</div>;
  if (error) return <div className="card" style={{ color: '#dc2626' }}>{error}</div>;
  if (!survey) return <div className="empty">Enquete não encontrada.</div>;

  const valid = survey.questions.filter((q) => q.answers.length > 0);
  if (valid.length === 0) {
    return <div className="empty">Esta enquete ainda não possui perguntas com respostas.</div>;
  }

  if (submitted) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1>✓ Obrigado!</h1>
        <p className="muted">Sua resposta foi registrada.</p>
      </div>
    );
  }

  const q = valid[step];
  const progressPct = Math.round(((step + 1) / valid.length) * 100);
  const selectedId = selections.get(q.id);
  const canGo = !!selectedId;
  const isLast = step === valid.length - 1;

  return (
    <div className="vote-wrapper">
      <h1>{survey.title || 'Enquete'}</h1>
      <div className="stepper">Pergunta {step + 1} de {valid.length}</div>
      <div className="progress">
        <div style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card">
        <h2>{q.text || '(pergunta sem texto)'}</h2>

        {q.answers.map((a) => {
          const isSelected = selectedId === a.id;
          return (
            <label
              key={a.id}
              className={`option${isSelected ? ' selected' : ''}`}
              onClick={() => {
                const next = new Map(selections);
                next.set(q.id, a.id);
                setSelections(next);
              }}
            >
              <input type="radio" name={`q-${q.id}`} checked={isSelected} onChange={() => {}} />
              <span>{a.text || '(sem texto)'}</span>
            </label>
          );
        })}

        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn ghost"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            ← Voltar
          </button>
          <div className="spacer" />
          {isLast ? (
            <button
              className="btn primary"
              disabled={!canGo || submitting}
              onClick={async () => {
                if (!canGo) return;
                setSubmitting(true);
                try {
                  for (const [qId, aId] of selections) {
                    await registerVote(survey.id, qId, aId);
                  }
                  setSubmitted(true);
                } catch (e: any) {
                  alert('Erro ao registrar voto: ' + (e.message ?? e));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? 'Enviando…' : 'Enviar respostas'}
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!canGo}
              onClick={() => setStep((s) => s + 1)}
            >
              Próxima →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
