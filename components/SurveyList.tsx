'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Survey } from '@/lib/types';
import { listSurveys, deleteSurvey, subscribeSurveyList } from '@/lib/store';

export function SurveyList({
  onEdit,
  showDashboardLinks = false,
}: {
  onEdit?: (id: string) => void;
  showDashboardLinks?: boolean;
}) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const list = await listSurveys();
      setSurveys(list);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const unsub = subscribeSurveyList(reload);
    return unsub;
  }, []);

  if (loading) return <div className="card">Carregando enquetes…</div>;
  if (error) return <div className="card" style={{ color: '#dc2626' }}>{error}</div>;

  if (surveys.length === 0) {
    return <div className="empty">Nenhuma enquete ainda.</div>;
  }

  return (
    <div className="card">
      <h2>Enquetes cadastradas</h2>
      {surveys.map((s) => (
        <div key={s.id} className="survey-list-item">
          <div className="meta">
            <strong>{s.title || '(sem título)'}</strong>
            <small>
              {s.questions.length} pergunta(s) · criada em{' '}
              {new Date(s.created_at).toLocaleString()}
            </small>
          </div>
          <div className="row">
            {onEdit && (
              <button className="btn" onClick={() => onEdit(s.id)}>
                Editar
              </button>
            )}
            {showDashboardLinks && (
              <>
                <Link href={`/qr?id=${s.id}`} className="btn primary">
                  QR Code
                </Link>
                <Link href={`/track?id=${s.id}`} className="btn">
                  Acompanhar
                </Link>
              </>
            )}
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Excluir a enquete "${s.title}"? Votos serão perdidos.`)) {
                  deleteSurvey(s.id);
                }
              }}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
