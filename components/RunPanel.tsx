'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import type { Execution, TallyQuestion } from '@/lib/types';
import {
  getExecution,
  setCurrentQuestion,
  finishExecution,
  tallyExecution,
  countParticipants,
  restartCurrentQuestionTimer,
  listQuestionStates,
  subscribeQuestionStates,
  subscribeExecution,
  subscribeExecutionResponses,
  subscribeParticipants,
} from '@/lib/executions';
import { subscribeSurveyChanges } from '@/lib/store';
import { Timer } from './Timer';

type LayoutMode = 'split' | 'qr-fullscreen' | 'graph-fullscreen';

export function RunPanel({ executionId }: { executionId: string }) {
  const router = useRouter();
  const [exec, setExec] = useState<Execution | null>(null);
  const [tally, setTally] = useState<TallyQuestion[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [questionStates, setQuestionStates] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<LayoutMode>('split');

  const reload = async () => {
    try {
      const [e, t, c] = await Promise.all([
        getExecution(executionId),
        tallyExecution(executionId),
        countParticipants(executionId),
      ]);
      setExec(e);
      setTally(t);
      setParticipantCount(c);
    } finally {
      setLoading(false);
    }
  };

  const reloadQuestionStates = async () => {
    try {
      const list = await listQuestionStates(executionId);
      const map = new Map<string, string>();
      list.forEach((s) => map.set(s.question_id, s.started_at));
      setQuestionStates(map);
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    reload();
    reloadQuestionStates();
    const unsubExec = subscribeExecution(executionId, reload);
    const unsubResp = subscribeExecutionResponses(executionId, reload);
    const unsubPart = subscribeParticipants(executionId, () => {
      countParticipants(executionId).then(setParticipantCount).catch(() => {});
    });
    const unsubQS = subscribeQuestionStates(executionId, reloadQuestionStates);
    return () => {
      unsubExec();
      unsubResp();
      unsubPart();
      unsubQS();
    };
  }, [executionId]);

  useEffect(() => {
    if (!exec?.survey_id) return;
    const unsub = subscribeSurveyChanges(exec.survey_id, reload);
    return unsub;
  }, [exec?.survey_id]);

  const questions = exec?.survey?.questions ?? [];
  const currentIdx = useMemo(() => {
    if (!exec?.current_question_id) return -1;
    return questions.findIndex((q) => q.id === exec.current_question_id);
  }, [exec?.current_question_id, questions]);

  const currentQuestion = currentIdx >= 0 ? questions[currentIdx] : null;
  const currentTally = currentQuestion ? tally.find((t) => t.id === currentQuestion.id) : null;

  const goPrev = async () => {
    if (currentIdx <= 0) return;
    await setCurrentQuestion(executionId, questions[currentIdx - 1].id);
  };
  const goNext = async () => {
    if (currentIdx < 0 || currentIdx >= questions.length - 1) return;
    await setCurrentQuestion(executionId, questions[currentIdx + 1].id);
  };
  const handleFinish = async () => {
    if (!confirm('Deseja realmente finalizar a execução?')) return;
    await finishExecution(executionId);
    router.push('/executions');
  };

  if (loading) return <div className="card">Carregando…</div>;
  if (!exec) return <div className="empty">Execução não encontrada.</div>;

  if (layout === 'qr-fullscreen') {
    return (
      <QrFullscreen
        executionId={executionId}
        title={exec.title}
        onClose={() => setLayout('split')}
      />
    );
  }

  return (
    <div className={`run-panel layout-${layout}`}>
      <div className="run-header">
        <button className="btn ghost" onClick={() => router.push('/executions')}>
          ← Voltar
        </button>
        <div className="run-title">
          <strong>{exec.title || 'Execução'}</strong>
          <small className="muted">
            {exec.survey?.title} · {participantCount} participante(s) ·{' '}
            <span className={`status-badge status-${exec.status}`}>{exec.status}</span>
          </small>
        </div>
        <div className="spacer" />
        {layout === 'graph-fullscreen' && (
          <button className="btn primary" onClick={() => setLayout('split')}>
            Mostrar QR Code
          </button>
        )}
      </div>

      <div className="run-body">
        <section className="run-graph">
          {!currentQuestion ? (
            <div className="empty">
              {questions.length === 0
                ? 'Esta enquete não tem perguntas.'
                : 'Nenhuma pergunta selecionada.'}
            </div>
          ) : (
            <div className="run-graph-inner">
              <div className="run-graph-header">
                <div className="run-question-meta">
                  Pergunta {currentIdx + 1} de {questions.length}
                  {currentQuestion.type === 'text' && ' · dissertativa'}
                </div>
                <Timer
                  size="large"
                  startedAt={questionStates.get(currentQuestion.id) ?? null}
                  durationSec={exec.survey?.time_per_question ?? 60}
                />
              </div>
              <h2 className="run-question-text">{currentQuestion.text || '(sem texto)'}</h2>
              <small className="muted">
                {currentQuestion.type === 'text'
                  ? `${currentTally?.total ?? 0} resposta(s) recebida(s)`
                  : `Total de votos: ${currentTally?.total ?? 0}`}
              </small>

              {currentQuestion.type === 'text' ? (
                currentQuestion.show_text_in_run ? (
                  <div className="run-texts">
                    {currentTally && currentTally.type === 'text' && currentTally.texts.length > 0 ? (
                      currentTally.texts.map((t) => (
                        <div key={t.participantId} className="text-card">
                          <div className="text-card-author">
                            <strong>{t.participantName}</strong>
                            {t.participantCompany && (
                              <small className="muted"> · {t.participantCompany}</small>
                            )}
                          </div>
                          <div className="text-card-body">{t.text}</div>
                        </div>
                      ))
                    ) : (
                      <div className="empty" style={{ padding: 20, marginTop: 10 }}>
                        Aguardando respostas dos participantes…
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty" style={{ padding: 30, marginTop: 14 }}>
                    Respostas ocultas durante a execução.<br />
                    {currentTally?.total ?? 0} resposta(s) recebida(s) — disponíveis no relatório.
                  </div>
                )
              ) : (
                <div className="run-bars">
                  {currentQuestion.answers.length === 0 ? (
                    <div className="empty" style={{ padding: 20, marginTop: 10 }}>
                      Pergunta sem respostas configuradas.
                    </div>
                  ) : (
                    (currentTally && currentTally.type === 'options'
                      ? currentTally.answers
                      : currentQuestion.answers.map((a) => ({
                          id: a.id, text: a.text, votes: 0, pct: 0,
                        }))
                    ).map((a) => (
                      <div key={a.id} className="bar-row big">
                        <div className="label">{a.text || '(sem texto)'}</div>
                        <div className="bar"><div style={{ width: `${a.pct}%` }} /></div>
                        <div className="count">{a.votes} · {a.pct}%</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {layout === 'split' && (
          <aside className="run-qr-aside">
            <QrInline executionId={executionId} />
            <button
              className="btn primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => setLayout('qr-fullscreen')}
            >
              Mostrar QR em tela cheia
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => setLayout('graph-fullscreen')}
            >
              Ocultar painel QR
            </button>
          </aside>
        )}
      </div>

      <div className="run-footer">
        <button className="btn" disabled={currentIdx <= 0} onClick={goPrev}>
          ← Pergunta anterior
        </button>
        <div className="muted" style={{ alignSelf: 'center' }}>
          {questions.length > 0
            ? `Pergunta ${Math.max(currentIdx + 1, 1)} de ${questions.length}`
            : '—'}
        </div>
        <button
          className="btn primary"
          disabled={currentIdx < 0 || currentIdx >= questions.length - 1}
          onClick={goNext}
        >
          Próxima pergunta →
        </button>
        <button
          className="btn"
          disabled={!exec.current_question_id || exec.status !== 'running'}
          onClick={async () => {
            if (!confirm('Reiniciar contagem desta pergunta?')) return;
            try {
              await restartCurrentQuestionTimer(executionId);
            } catch (e: any) {
              alert('Erro ao reiniciar: ' + (e.message ?? e));
            }
          }}
        >
          ↻ Reiniciar timer
        </button>
        <div className="spacer" />
        <button className="btn danger" onClick={handleFinish} disabled={exec.status === 'finished'}>
          Finalizar execução
        </button>
      </div>
    </div>
  );
}

function buildJoinUrl(executionId: string): string {
  if (typeof window === 'undefined') return '';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${window.location.origin}${basePath}/join/?id=${executionId}`;
}

function QrInline({ executionId }: { executionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = buildJoinUrl(executionId);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 1 }, (err) => {
      if (err) console.error(err);
    });
  }, [url]);

  return (
    <div className="qr-inline">
      <canvas ref={canvasRef} />
      <div className="url-label">{url}</div>
    </div>
  );
}

function QrFullscreen({
  executionId,
  title,
  onClose,
}: {
  executionId: string;
  title: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = buildJoinUrl(executionId);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 480, margin: 1 }, (err) => {
      if (err) console.error(err);
    });
  }, [url]);

  return (
    <div className="qr-fullscreen">
      <button className="btn close" onClick={onClose}>✕ Fechar</button>
      <h2>{title || 'Execução'}</h2>
      <canvas ref={canvasRef} />
      <div className="url-label">{url}</div>
      <p className="muted" style={{ marginTop: 8 }}>Aponte a câmera do celular para participar</p>
    </div>
  );
}
