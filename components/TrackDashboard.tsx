'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TallyQuestion, Survey } from '@/lib/types';
import {
  getSurvey,
  tallySurvey,
  subscribeSurveyVotes,
  subscribeSurveyChanges,
} from '@/lib/store';

export function TrackDashboard({ surveyId }: { surveyId: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [tally, setTally] = useState<TallyQuestion[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [s, t] = await Promise.all([getSurvey(surveyId), tallySurvey(surveyId)]);
      setSurvey(s);
      setTally(t);
      setLastUpdate(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const unsubVotes = subscribeSurveyVotes(surveyId, reload);
    const unsubChanges = subscribeSurveyChanges(surveyId, reload);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsubVotes();
      unsubChanges();
      clearInterval(tick);
    };
  }, [surveyId]);

  if (loading) return <div className="card">Carregando…</div>;
  if (!survey) return <div className="empty">Enquete não encontrada.</div>;

  const participants = Math.max(0, ...tally.map((q) => q.total));
  const secondsAgo = Math.round((now - lastUpdate) / 1000);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1>{survey.title || 'Enquete'}</h1>
          <small className="muted">
            Atualizado há {secondsAgo}s · realtime via Supabase
          </small>
        </div>
        <div className="spacer" />
        <Link href="/admin" className="btn">← Admin</Link>
        <Link href={`/qr?id=${surveyId}`} className="btn primary">QR Code</Link>
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="value">{participants}</span>
          <span className="label">Participantes (máx. por pergunta)</span>
        </div>
        <div className="stat">
          <span className="value">{survey.questions.length}</span>
          <span className="label">Perguntas</span>
        </div>
      </div>

      {tally.length === 0 && (
        <div className="empty">Esta enquete ainda não possui perguntas.</div>
      )}

      {tally.map((q, idx) => {
        if (q.type !== 'options') return null;
        return (
          <div key={q.id} className="card track-question">
            <h2>{idx + 1}. {q.text || '(sem texto)'}</h2>
            <small className="muted">Total de votos: {q.total}</small>

            {q.answers.length === 0 ? (
              <div className="empty" style={{ padding: 20, marginTop: 10 }}>
                Sem respostas configuradas.
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                {q.answers.map((a) => (
                  <div key={a.id} className="bar-row">
                    <div className="label">{a.text || '(sem texto)'}</div>
                    <div className="bar">
                      <div style={{ width: `${a.pct}%` }} />
                    </div>
                    <div className="count">{a.votes} voto(s) · {a.pct}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
