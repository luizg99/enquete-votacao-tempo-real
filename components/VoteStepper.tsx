'use client';

import { useEffect, useState } from 'react';
import type { Survey } from '@/lib/types';
import { getSurvey, registerVote } from '@/lib/store';
import { hasVoted, markVoted } from '@/lib/voter';

export function VoteStepper({ surveyId }: { surveyId: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Map<string, string[]>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [confirmedRevote, setConfirmedRevote] = useState(false);
  const [declinedRevote, setDeclinedRevote] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSurvey(surveyId);
        setSurvey(s);
        setAlreadyVoted(hasVoted(surveyId));
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

  // Já respondeu e a enquete permite só um voto → bloqueia
  if (alreadyVoted && !submitted && survey.single_vote_per_device) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1>✓ Você já respondeu</h1>
        <p className="muted">Cada dispositivo pode votar apenas uma vez nesta enquete.</p>
      </div>
    );
  }

  // Já respondeu, mas a enquete permite múltiplos votos → pergunta
  if (alreadyVoted && !submitted && !confirmedRevote && !declinedRevote) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1>Você já votou nesta enquete</h1>
        <p className="muted">Deseja responder novamente?</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="btn ghost" onClick={() => setDeclinedRevote(true)}>
            Não, obrigado
          </button>
          <button className="btn primary" onClick={() => setConfirmedRevote(true)}>
            Sim, votar novamente
          </button>
        </div>
      </div>
    );
  }

  if (declinedRevote) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1>✓ Obrigado pela participação!</h1>
        <p className="muted">Sua resposta anterior já foi registrada.</p>
      </div>
    );
  }

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
  const selectedIds = selections.get(q.id) ?? [];
  const multi = survey.allow_multiple_choices;
  const canGo = selectedIds.length > 0;
  const isLast = step === valid.length - 1;

  const toggleAnswer = (answerId: string) => {
    const next = new Map(selections);
    const current = next.get(q.id) ?? [];
    if (multi) {
      next.set(
        q.id,
        current.includes(answerId) ? current.filter((id) => id !== answerId) : [...current, answerId]
      );
    } else {
      next.set(q.id, [answerId]);
    }
    setSelections(next);
  };

  return (
    <div className="vote-wrapper">
      <h1>{survey.title || 'Enquete'}</h1>
      <div className="stepper">
        Pergunta {step + 1} de {valid.length}
        {multi && <span> · múltipla escolha</span>}
      </div>
      <div className="progress">
        <div style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card">
        <h2>{q.text || '(pergunta sem texto)'}</h2>

        {q.answers.map((a) => {
          const isSelected = selectedIds.includes(a.id);
          return (
            <label
              key={a.id}
              className={`option${isSelected ? ' selected' : ''}`}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`q-${q.id}`}
                checked={isSelected}
                onChange={() => toggleAnswer(a.id)}
              />
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
                  for (const [qId, aIds] of selections) {
                    for (const aId of aIds) {
                      await registerVote(survey.id, qId, aId);
                    }
                  }
                  markVoted(survey.id);
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
