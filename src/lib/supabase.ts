import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const configured = Boolean(url && key)
export const supabase = createClient(url || 'https://example.supabase.co', key || 'not-configured', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
export function assertOk(error: { message: string } | null) { if (error) throw new Error(error.message) }
