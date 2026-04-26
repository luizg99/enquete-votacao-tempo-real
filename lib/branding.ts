import { getSupabase } from './supabase';
import type { Branding } from './types';

const BUCKET = 'branding';
const LOGO_PATH_PREFIX = 'logo';

export async function getBranding(): Promise<Branding | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from('branding').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data as Branding) ?? null;
}

export async function uploadLogo(file: File): Promise<string> {
  const sb = getSupabase();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${LOGO_PATH_PREFIX}-${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: updErr } = await sb
    .from('branding')
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (updErr) throw updErr;

  return url;
}

export async function deleteLogo(): Promise<void> {
  const sb = getSupabase();

  const { data: list } = await sb.storage.from(BUCKET).list('', { limit: 100 });
  if (list && list.length > 0) {
    const paths = list
      .filter((f) => f.name.startsWith(LOGO_PATH_PREFIX))
      .map((f) => f.name);
    if (paths.length > 0) {
      await sb.storage.from(BUCKET).remove(paths);
    }
  }

  const { error } = await sb
    .from('branding')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

export function subscribeBranding(onChange: () => void) {
  const sb = getSupabase();
  const name = `branding-${Math.random().toString(36).slice(2, 10)}`;
  const channel = sb
    .channel(name)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'branding' }, () => onChange())
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
