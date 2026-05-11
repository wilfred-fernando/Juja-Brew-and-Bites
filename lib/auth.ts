import { createClient } from './suparbase/server'

export async function getUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function getUserRole(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error) return null
  return data?.role
}