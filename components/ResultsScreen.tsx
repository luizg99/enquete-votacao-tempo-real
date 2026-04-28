'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Execution, ParticipantResult, ScoringMode } from '@/lib/types';
import {
  getExecution,
  loadParticipantResults,
  computeExecutionScores,
} from '@/lib/executions';

export function ResultsScreen({ executionId }: { executionId: string }) {
  const [exec, setExec] = useState<Execution | null>(null);
  const [results, setResults] = useState<ParticipantResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>('all');

  const reload = async () => {
    try {
      const [e, r] = await Promise.all([
        getExecution(executionId),
        loadParticipantResults(executionId),
      ]);
      setExec(e);
      setResults(r);
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

  const mode: ScoringMode = exec?.survey?.scoring_mode ?? 'general';
  const showBandColumn = mode === 'per_answer';

  const bandKeys = useMemo(() => {
    if (!showBandColumn) return [] as string[];
    const seen = new Set<string>();
    const list: { key: string; label: string; range: string }[] = [];
    for (const r of results) {
      if (!r.band) continue;
      const key = `${r.band.min_points}-${r.band.max_points}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        key,
        label: r.band.label || '—',
        range: `${r.band.min_points}–${r.band.max_points}`,
      });
    }
    list.sort((a, b) => {
      const am = parseInt(a.key.split('-')[0], 10);
      const bm = parseInt(b.key.split('-')[0], 10);
      return am - bm;
    });
    return list.map((b) => `${b.key}|${b.label}|${b.range}`);
  }, [results, showBandColumn]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      if (q) {
        const hay = `${r.name} ${r.company}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (showBandColumn && bandFilter !== 'all') {
        const key = r.band ? `${r.band.min_points}-${r.band.max_points}` : 'none';
        if (key !== bandFilter) return false;
      }
      return true;
    });
  }, [results, search, bandFilter, showBandColumn]);

  if (loading) return <div className="card">Carregando resultados…</div>;
  if (error) return <div className="card" style={{ color: '#dc2626' }}>{error}</div>;
  if (!exec) return <div className="empty">Execução não encontrada.</div>;

  if (mode === 'none') {
    return (
      <div>
        <div className="row" style={{ marginBottom: 12 }}>
          <h1>Resultados — {exec.title || 'Execução'}</h1>
          <div className="spacer" />
          <Link href="/executions" className="btn">← Voltar</Link>
        </div>
        <div className="empty">
          Esta enquete está configurada como <strong>sem pontuação</strong>.
          Não há resultados para exibir.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1>Resultados — {exec.title || 'Execução'}</h1>
          <small className="muted">
            {exec.survey?.title} · {results.length} participante(s)
            {exec.finished_at && (
              <> · finalizada em {new Date(exec.finished_at).toLocaleString()}</>
            )}
          </small>
        </div>
        <div className="spacer" />
        <button className="btn" disabled={recomputing} onClick={handleRecompute}>
          {recomputing ? 'Recomputando…' : '↻ Recomputar'}
        </button>
        <Link href="/executions" className="btn">← Voltar</Link>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar por nome ou empresa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 200 }}
          />
          {showBandColumn && bandKeys.length > 0 && (
            <select
              className="select"
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              style={{ maxWidth: 320 }}
            >
              <option value="all">Todas as classificações</option>
              {bandKeys.map((entry) => {
                const [key, label, range] = entry.split('|');
                return (
                  <option key={key} value={key}>
                    {label} ({range} pts)
                  </option>
                );
              })}
              <option value="none">Sem classificação</option>
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {results.length === 0
            ? 'Nenhum participante registrou pontuação.'
            : 'Nenhum participante corresponde aos filtros.'}
        </div>
      ) : (
        <div className="card">
          <table className="ranking-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Posição</th>
                <th>Participante</th>
                <th>Empresa</th>
                <th style={{ width: 110, textAlign: 'right' }}>Pontuação</th>
                {showBandColumn && <th>Classificação</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.participantId}
                  className={r.position <= 3 ? `rank-top rank-${r.position}` : ''}
                >
                  <td className="rank-position">{positionLabel(r.position)}</td>
                  <td>{r.name || '—'}</td>
                  <td className="muted">{r.company || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {r.totalPoints.toFixed(2)}
                  </td>
                  {showBandColumn && (
                    <td>
                      {r.band ? (
                        <>
                          <strong>{r.band.label || '—'}</strong>
                          {r.band.observation && (
                            <small className="muted"> · {r.band.observation}</small>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
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
