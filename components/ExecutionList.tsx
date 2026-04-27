'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Execution, Survey } from '@/lib/types';
import {
  listExecutions,
  deleteExecution,
  finishExecution,
  startExecution,
  subscribeExecutionList,
} from '@/lib/executions';
import { listSurveys } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { ExecutionCreateModal } from './ExecutionCreateModal';

export function ExecutionList() {
  const [items, setItems] = useState<Execution[]>([]);
  const [scoredSurveys, setScoredSurveys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const router = useRouter();

  const reload = async () => {
    try {
      const list = await listExecutions();
      setItems(list);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const reloadScoredSurveys = async () => {
    try {
      const sb = getSupabase();
      const { data } = await sb
        .from('answers')
        .select('question_id, questions(survey_id)')
        .eq('is_correct', true);
      const ids = new Set<string>();
      (data ?? []).forEach((row: any) => {
        const sid = row.questions?.survey_id;
        if (sid) ids.add(sid);
      });
      setScoredSurveys(ids);
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    reload();
    reloadScoredSurveys();
    const unsub = subscribeExecutionList(() => {
      reload();
      reloadScoredSurveys();
    });
    return unsub;
  }, []);

  const openCreate = async () => {
    try {
      const list = await listSurveys();
      setSurveys(list);
      setShowCreate(true);
    } catch (e: any) {
      alert('Erro ao carregar enquetes: ' + (e.message ?? e));
    }
  };

  const handleStart = async (id: string) => {
    try {
      await startExecution(id);
      router.push(`/executions/run?id=${id}`);
    } catch (e: any) {
      alert('Erro ao iniciar execução: ' + (e.message ?? e));
    }
  };

  const handleFinish = async (id: string, title: string) => {
    if (!confirm(`Deseja realmente finalizar a execução "${title}"?`)) return;
    try {
      await finishExecution(id);
    } catch (e: any) {
      alert('Erro ao finalizar: ' + (e.message ?? e));
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (
      !confirm(
        `Excluir a execução "${title}"? Os dados desta execução serão perdidos. A enquete original NÃO será excluída.`
      )
    )
      return;
    try {
      await deleteExecution(id);
    } catch (e: any) {
      alert('Erro ao excluir: ' + (e.message ?? e));
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 18 }}>
        <h1>Execuções</h1>
        <div className="spacer" />
        <button className="btn primary big" onClick={openCreate}>
          + Criar Execução de Tasks
        </button>
      </div>

      {showCreate && (
        <ExecutionCreateModal
          surveys={surveys}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      {loading ? (
        <div className="card">Carregando execuções…</div>
      ) : error ? (
        <div className="card" style={{ color: '#dc2626' }}>{error}</div>
      ) : items.length === 0 ? (
        <div className="empty">Nenhuma execução ainda.</div>
      ) : (
        <div className="card">
          <h2>Execuções cadastradas</h2>
          {items.map((e) => (
            <div key={e.id} className="survey-list-item">
              <div className="meta">
                <strong>{e.title || '(sem título)'}</strong>
                <small>
                  Enquete: {e.survey?.title ?? '—'} ·{' '}
                  <span className={`status-badge status-${e.status}`}>{statusLabel(e.status)}</span>{' '}
                  · criada em {new Date(e.created_at).toLocaleString()}
                </small>
              </div>
              <div className="row">
                {e.status === 'finished' ? (
                  <button className="btn" disabled title="Execução finalizada">
                    Iniciar/Abrir
                  </button>
                ) : (
                  <button className="btn primary" onClick={() => handleStart(e.id)}>
                    {e.status === 'draft' ? 'Iniciar' : 'Abrir'}
                  </button>
                )}
                {e.status !== 'finished' && (
                  <button className="btn" onClick={() => handleFinish(e.id, e.title)}>
                    Finalizar
                  </button>
                )}
                <Link href={`/executions/track?id=${e.id}`} className="btn">
                  Acompanhar
                </Link>
                {e.status === 'finished' && scoredSurveys.has(e.survey_id) && (
                  <Link href={`/executions/ranking?id=${e.id}`} className="btn primary">
                    Ver ranking
                  </Link>
                )}
                <button className="btn danger" onClick={() => handleDelete(e.id, e.title)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function statusLabel(s: string) {
  if (s === 'draft') return 'rascunho';
  if (s === 'running') return 'em andamento';
  if (s === 'finished') return 'finalizada';
  return s;
}
