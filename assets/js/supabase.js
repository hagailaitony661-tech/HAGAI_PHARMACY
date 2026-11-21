import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  'https://mnkemnnaiqpqtylqjlxg.supabase.co',
  'sb_publishable_BTOsriGYsN2MsZTJYomm3Q_jodwyH7-',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  }
);
