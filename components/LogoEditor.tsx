'use client';

import { useEffect, useRef, useState } from 'react';
import { getBranding, uploadLogo, deleteLogo, subscribeBranding } from '@/lib/branding';

const SECRET_PASSWORD = 'logo123321';
const SESSION_KEY = 'taskq:logoUnlocked';

export function LogoEditor() {
  const [unlocked, setUnlocked] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pwInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1') {
      setUnlocked(true);
    }
  }, []);

  const tryUnlock = () => {
    const raw = pwInputRef.current?.value ?? '';
    if (raw.trim() === SECRET_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setUnlocked(true);
    } else {
      alert('Senha incorreta.');
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    const load = async () => {
      try {
        const b = await getBranding();
        if (active) setLogoUrl(b?.logo_url ?? null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const unsub = subscribeBranding(load);
    return () => { active = false; unsub(); };
  }, [unlocked]);

  if (!unlocked) {
    return (
      <form
        className="card"
        style={{ maxWidth: 420, margin: '60px auto' }}
        onSubmit={(e) => {
          e.preventDefault();
          tryUnlock();
        }}
      >
        <h1>Acesso restrito</h1>
        <p className="muted">Informe a senha para editar a logo.</p>
        <input
          ref={pwInputRef}
          type="password"
          name="logo-password"
          autoComplete="off"
          autoFocus
          placeholder="Senha"
        />
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button type="submit" className="btn primary">
            Entrar
          </button>
        </div>
      </form>
    );
  }

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Arquivo muito grande (máx. 2MB).');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadLogo(file);
      setLogoUrl(url);
    } catch (e: any) {
      alert('Erro no upload: ' + (e.message ?? e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir a logo atual?')) return;
    setBusy(true);
    try {
      await deleteLogo();
      setLogoUrl(null);
    } catch (e: any) {
      alert('Erro ao excluir: ' + (e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="card">Carregando…</div>;

  return (
    <div>
      <h1>Editor de logo</h1>
      <p className="muted">A logo aparece no topo de todas as telas administrativas.</p>

      <div className="card">
        <h2>Pré-visualização</h2>
        <div className="logo-preview">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo atual" />
          ) : (
            <div className="empty" style={{ padding: 30 }}>Nenhuma logo cadastrada.</div>
          )}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            style={{ display: 'none' }}
          />
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {logoUrl ? 'Substituir logo' : 'Selecionar logo'}
          </button>
          {logoUrl && (
            <button className="btn danger" disabled={busy} onClick={handleDelete}>
              Excluir logo
            </button>
          )}
          {busy && <small className="muted">Enviando…</small>}
        </div>

        <small className="muted" style={{ display: 'block', marginTop: 12 }}>
          Formatos aceitos: PNG, JPG, SVG, WebP. Tamanho máximo: 2MB.
        </small>
      </div>
    </div>
  );
}
