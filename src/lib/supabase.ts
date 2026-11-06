import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://srcbzszaiorjztprleux.supabase.co";
export const SUPABASE_KEY = "sb_publishable_-Nuit5iYnfhztQZYu3KwvQ_wc68_Rh-";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type JobStatus =
  | "awaiting_payment" | "searching" | "accepted" | "in_progress"
  | "finished" | "confirmed" | "disputed" | "cancelled" | "refunded";

export interface Job {
  id: string;
  customer_id: string;
  worker_id: string | null;
  job_type_id: number;
  suburb_id: number;
  address: string;
  notes: string;
  start_at: string;
  asap: boolean;
  price_cents: number;
  fee_cents: number;
  extra_cents: number;
  status: JobStatus;
  payment_intent_id: string | null;
  eta_at: string | null;
  created_at: string;
  searching_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  confirmed_at: string | null;
}

export interface JobType {
  id: number; name: string; description: string; price_cents: number; max_hours: number;
  needs_insurance: boolean; needs_vehicle: boolean; active: boolean; sort: number;
}
export interface Suburb { id: number; name: string }
export interface Profile { id: string; full_name: string; phone: string | null; photo_path: string | null; is_worker: boolean; is_admin: boolean }
export interface PersonCard { full_name: string; photo_path: string | null; rating: number | null; jobs_done: number; id_verified: boolean }

// Calls the server functions (payments, payouts, worker checks).
export async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.functions.invoke("api", { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx) { const j = await ctx.json(); if (j?.error) msg = j.error; }
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// Pilot jobs: no card hold, the customer pays the worker directly.
export const isDirectPay = (j: { fee_cents: number; payment_intent_id: string | null }) => j.fee_cents === 0 && !j.payment_intent_id;

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
