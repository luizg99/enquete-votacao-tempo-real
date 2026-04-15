import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  if (!url || !key) {
    throw new Error(
      'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local (dev) ou em GitHub Secrets (prod).'
    );
  }
  cached = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return !!url && !!key;
}
