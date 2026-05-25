import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  console.error('[DashTrees] Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY — check your .env file')
} else {
  console.info('[DashTrees] Supabase client init →', supabaseUrl, '| key prefix:', supabaseKey.slice(0, 20) + '…')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
