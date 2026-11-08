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
  details: string;
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
  customer_paid_at: string | null;
  title: string | null;
  invited: string[]; included?: string[]; excluded?: string[];
  worker_received_at: string | null;
}

export interface Dispute {
  reporter_is_me: boolean; reporter_name: string; reason: string; fix: string | null; details: string; created_at: string;
  respond_by: string | null; response: string | null; responded_at: string | null; decide_by: string | null; resolved: boolean;
  outcome: string | null; amount_cents: number | null; decision_note: string | null; decided_at: string | null;
}

export interface JobType {
  id: number; name: string; description: string; price_cents: number; max_hours: number;
  needs_insurance: boolean; needs_vehicle: boolean; active: boolean; sort: number;
  category_id: number | null; photo_path: string | null; included: string[]; excluded: string[];
  custom_price: boolean; min_price_cents: number; max_price_cents: number;
}
export interface Category { id: number; name: string; icon: string; photo_path: string | null; sort: number; active: boolean }
export interface Suburb { id: number; name: string }
export type IdStatus = "none" | "pending" | "verified" | "retake" | "rejected";
export interface Profile {
  id: string; full_name: string; phone: string | null; photo_path: string | null; is_worker: boolean; is_admin: boolean;
  id_status: IdStatus; id_note: string | null; suspended: boolean; created_at: string;
}
export interface PersonCard { full_name: string; photo_path: string | null; rating: number | null; jobs_done: number; id_verified: boolean; member_since: string }

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

export function brandUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return sb.storage.from("brand").getPublicUrl(path).data.publicUrl;
}

// Private job photos and videos: short-lived signed links.
export async function mediaUrls(paths: string[]): Promise<Record<string, string>> {
  const clean = paths.filter(Boolean);
  if (!clean.length) return {};
  const { data } = await sb.storage.from("job-media").createSignedUrls(clean, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
