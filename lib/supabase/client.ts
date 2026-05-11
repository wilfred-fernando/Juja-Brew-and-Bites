import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(supabaseUrl, supabaseKey)

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}