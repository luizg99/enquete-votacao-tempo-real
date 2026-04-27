'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Execution, RankingEntry } from '@/lib/types';
import {
  getExecution,
  loadRanking,
  computeExecutionScores,
} from '@/lib/executions';

export function RankingScreen({ executionId }: { executionId: string }) {
  const [exec, setExec] = useState<Execution | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [e, r] = await Promise.all([
        getExecution(executionId),
        loadRanking(executionId),
      ]);
      setExec(e);
      setRanking(r);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [executionId]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await computeExecutionScores(executionId);
      await reload();
    } catch (err: any) {
      alert('Erro ao recomputar: ' + (err.message ?? err));
    } finally {
      setRecomputing(false);
    }
  };

  if (loading) return <div className="card">Carregando ranking…</div>;
  if (error) return <div className="card" style={{ color: '#dc2626' }}>{error}</div>;
  if (!exec) return <div className="empty">Execução não encontrada.</div>;

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1>Ranking — {exec.title || 'Execução'}</h1>
          <small className="muted">
            {exec.survey?.title} · {ranking.length} participante(s)
          </small>
        </div>
        <div className="spacer" />
        <button className="btn" disabled={recomputing} onClick={handleRecompute}>
          {recomputing ? 'Recomputando…' : '↻ Recomputar'}
        </button>
        <Link href="/executions" className="btn">← Voltar</Link>
      </div>

      {ranking.length === 0 ? (
        <div className="empty">Nenhum participante registrou pontuação.</div>
      ) : (
        <div className="card">
          <table className="ranking-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Posição</th>
                <th>Participante</th>
                <th>Empresa</th>
                <th style={{ width: 120, textAlign: 'right' }}>Pontuação</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.participantId} className={r.position <= 3 ? `rank-top rank-${r.position}` : ''}>
                  <td className="rank-position">{positionLabel(r.position)}</td>
                  <td>{r.name || '—'}</td>
                  <td className="muted">{r.company || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {r.totalPoints.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function positionLabel(p: number): string {
  if (p === 1) return '🥇 1º';
  if (p === 2) return '🥈 2º';
  if (p === 3) return '🥉 3º';
  return `${p}º`;
}
