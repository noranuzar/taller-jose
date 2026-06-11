import { createClient } from '@supabase/supabase-js';

// =============================================
// SUPABASE CONFIG
// Estos valores se sacan del dashboard de Supabase:
// Settings → API → Project URL y anon/public key
// =============================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'TU_URL_AQUI';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'TU_KEY_AQUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
