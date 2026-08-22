"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * The publishable key is public by design — it ships in the browser bundle on
 * every Supabase app. Row Level Security is the actual security boundary, and
 * every wb_ table has it on with owner-scoped policies. No secret key is
 * deployed anywhere in this project.
 */
const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

export const ASSET_BUCKET = "world-assets";

export const supabase = createClient(URL, KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
