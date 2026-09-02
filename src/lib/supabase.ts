import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getSupabaseAdminEnv } from "./env";

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createClient(env.supabaseUrl, env.supabaseAnonKey);
}

export function createAdminSupabaseClient() {
  const env = getSupabaseAdminEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
