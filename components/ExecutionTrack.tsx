'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Execution, TallyQuestion } from '@/lib/types';
import {
  getExecution,
  tallyExecution,
  countParticipants,
  subscribeExecution,
  subscribeExecutionResponses,
  subscribeParticipants,
} from '@/lib/executions';
import { subscribeSurveyChanges } from '@/lib/store';
import { loadExecutionReport } from '@/lib/reports';
import { ExportButtons } from './ExportButtons';

export function ExecutionTrack({ executionId }: { executionId: string }) {
  const [exec, setExec] = useState<Execution | null>(null);
  const [tally, setTally] = useState<TallyQuestion[]>([]);
  const [participants, setParticipants] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [e, t, c] = await Promise.all([
        getExecution(executionId),
        tallyExecution(executionId),
        countParticipants(executionId),
      ]);
      setExec(e);
      setTally(t);
      setParticipants(c);
      setLastUpdate(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const unsubExec = subscribeExecution(executionId, reload);
    const unsubResp = subscribeExecutionResponses(executionId, reload);
    const unsubPart = subscribeParticipants(executionId, reload);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsubExec();
      unsubResp();
      unsubPart();
      clearInterval(tick);
    };
  }, [executionId]);

  useEffect(() => {
    if (!exec?.survey_id) return;
    const unsub = subscribeSurveyChanges(exec.survey_id, reload);
    return unsub;
  }, [exec?.survey_id]);

  if (loading) return <div className="card">Carregando…</div>;
  if (!exec) return <div className="empty">Execução não encontrada.</div>;

  const secondsAgo = Math.round((now - lastUpdate) / 1000);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1>{exec.title || 'Execução'}</h1>
          <small className="muted">
            {exec.survey?.title} · status: {exec.status} · atualizado há {secondsAgo}s
          </small>
        </div>
        <div className="spacer" />
        <ExportButtons load={() => loadExecutionReport(executionId)} />
        <Link href="/executions" className="btn">← Voltar</Link>
        {exec.status !== 'finished' && (
          <Link href={`/executions/run?id=${executionId}`} className="btn primary">
            Abrir painel
          </Link>
        )}
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="value">{participants}</span>
          <span className="label">Participantes</span>
        </div>
        <div className="stat">
          <span className="value">{exec.survey?.questions.length ?? 0}</span>
          <span className="label">Perguntas</span>
        </div>
      </div>

      {tally.length === 0 && (
        <div className="empty">Esta execução ainda não tem perguntas com respostas.</div>
      )}

      {tally.map((q, idx) => (
        <div key={q.id} className="card track-question">
          <h2>{idx + 1}. {q.text || '(sem texto)'}</h2>
          {q.type === 'text' ? (
            <>
              <small className="muted">{q.total} resposta(s) recebida(s)</small>
              {q.texts.length === 0 ? (
                <div className="empty" style={{ padding: 20, marginTop: 10 }}>
                  Sem respostas ainda.
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  {q.texts.map((t) => (
                    <div key={t.participantId} className="text-card">
                      <div className="text-card-author">
                        <strong>{t.participantName}</strong>
                        {t.participantCompany && (
                          <small className="muted"> · {t.participantCompany}</small>
                        )}
                      </div>
                      <div className="text-card-body">{t.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
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
                      <div className="bar"><div style={{ width: `${a.pct}%` }} /></div>
                      <div className="count">{a.votes} voto(s) · {a.pct}%</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
