import { connFee } from "../lib/fee";
import { AlertsBell } from "../ui/Alerts";
import { areaSuburbs } from "../lib/suburbs";
import { FeePayScreen, OwedBanner, useOwed, type OwedFee } from "./Fees";
import { claimGifts, InvoiceBanner, useDueInvoices, usePayments } from "../ui/Payments";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, avatarUrl, firstPhoto, mediaUrls, rpc, sb, type Category, type JobType, type Suburb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go, usePath } from "../lib/router";
import { money, money2, photoForReading, priceAbout, priceWords, shrinkImage, UNIT_COUNT } from "../lib/format";
import { draftMedia, type DraftItem } from "../lib/draftMedia";
import { CatIcon, Icon, Logo, Screen, SearchPicker, StepHero, useToast } from "../ui/kit";
import { AuthScreen } from "../ui/Auth";
import { VerifyFlow } from "../ui/Verify";
import { VoiceScreen, voiceSupported } from "../ui/Voice";
import { JobCamera } from "../ui/JobCamera";
import { PayScreen } from "./Pay";
import { AddCardScreen, cardLabel } from "./Cards";
import { lc } from "../worker/Skills";
import { PlaceMap } from "../ui/PlaceMap";
import { loadMapKit } from "../ui/LiveMap";
import { SetSide, SideSwitch } from "../ui/SideSwitch";
import { TabBar } from "../ui/TabBar";
import { FeedOfferCard, useFeedOffer } from "../ui/LocalOffers";
import { PhotoStep } from "../worker/Signup";
import { AreaPin, ComingSoon, isSoon, useArea, useChangeArea, useHere } from "../lib/area";

/* Post a job: price, show the job, who can take it, where, when, check. */

interface Reused { path: string; kind: "photo" | "video" }
interface Draft {
  categoryId: number | null; priceCents: number; suburbId: number | null; address: string; notes: string; details: string;
  asap: boolean; startAt: string; invited: string[]; openAfter: number | null; reuse: Reused[];
  included: string[]; excluded: string[]; priceSet?: boolean; skills?: number[]; payMethod?: "cash" | "bank";
  budgetMin?: number | null; budgetMax?: number | null;
  // The job's name ("Backyard clean-up") and its other kinds of work besides the main one.
  title?: string; extraCats?: number[];
  // What the price is for: fixed (the whole job), or an hour, a day, a visit; and about how many. priceCents is then the rate.
  priceUnit?: "fixed" | "hour" | "day" | "visit"; unitQty?: number;
  // 0 for just once; otherwise it posts itself again every 1, 2 or 4 weeks.
  repeatWeeks?: 0 | 1 | 2 | 4;
}
const DRAFT_KEY = "mm-draft-2";
const blank: Draft = { categoryId: null, priceCents: 8000, suburbId: null, address: "", notes: "", details: "", asap: true, startAt: "", invited: [], openAfter: 10, reuse: [], included: [], excluded: [], payMethod: "cash" };
const MAX_PHOTOS = 6;
// Every new job starts with the address empty: they use their current location or type it. Pay by always starts on cash.
// Older versions kept the last job's address on the phone and filled it in; clear it so it never shows again.
try { localStorage.removeItem("mm-last-job"); } catch { /* private mode */ }
const MAX_VIDEO_SECONDS = 60;

export interface PastWorker { worker_id: string; full_name: string; photo_path: string | null; id_verified: boolean; rating: number | null; jobs_for_me: number; last_job: string | null; online?: boolean }

export function Book() {
  const path = usePath().split("?")[0];
  const { session, profile } = useSession();
  const toast = useToast();
  const [types, setTypes] = useState<JobType[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [skillList, setSkillList] = useState<{ id: number; category_id: number; name: string; needs: string | null; licence: string | null; trade: boolean }[]>([]);
  useEffect(() => {
    sb.from("skills").select("id,category_id,name,sort,trade,credential_types(name,trade)").eq("kind", "skill").eq("active", true).order("sort")
      .then(({ data }) => setSkillList(((data ?? []) as unknown as { id: number; category_id: number; name: string; trade: boolean; credential_types: { name: string; trade: boolean } | null }[])
        .map((k) => ({ id: k.id, category_id: k.category_id, name: k.name, needs: k.credential_types?.name ?? null, licence: k.credential_types?.trade ? k.credential_types.name : null, trade: !!k.trade }))));
  }, []);
  const [suburbs, setSuburbs] = useState<Suburb[]>([]);
  const [fee, setFee] = useState(15);
  const [pilot, setPilot] = useState(true);
  const [feeSetting, setFeeMode] = useState("off");
  // Fees always apply. During the pilot they're invoiced and paid by bank transfer; after it, the fee setting decides (card through Stripe).
  const feeMode = pilot ? "invoice" : feeSetting;
  const [cardScreen, setCardScreen] = useState(false);
  const cardAdded = useRef(false);
  const [photoScreen, setPhotoScreen] = useState(false);
  const photoAdded = useRef(false);
  const [verifyScreen, setVerifyScreen] = useState(false);
  const verifySent = useRef(false);
  const [feePct, setFeePct] = useState(15);
  const [feeMin, setFeeMin] = useState(995);
  const [feeMax, setFeeMax] = useState(5995);
  const [d, setD] = useState<Draft>(() => { try { return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") }; } catch { return blank; } });
  const [media, setMedia] = useState<(DraftItem & { url: string })[]>([]);
  const [reuseUrls, setReuseUrls] = useState<Record<string, string>>({});
  const [past, setPast] = useState<PastWorker[]>([]);
  const [payJob, setPayJob] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [discard, setDiscard] = useState(false);
  const [pickMethod, setPickMethod] = useState(false);
  const [pickWho, setPickWho] = useState<null | "people" | "after">(null);
  const [pickRepeat, setPickRepeat] = useState(false);

  const { area } = useArea();
  // Only the suburbs of the area they're in.
  useEffect(() => {
    if (area) areaSuburbs<Suburb>(area.id, "id,name,area_id,lat,lng").then(setSuburbs).catch(() => {});
  }, [area?.id]);
  useEffect(() => {
    sb.from("job_types").select("*").eq("active", true).eq("custom_price", true).order("sort").then(({ data }) => setTypes((data ?? []) as JobType[]));
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    sb.from("settings").select("key,value").in("key", ["fee_percent", "pilot_mode", "booking_fee_percent", "booking_fee_min_cents", "booking_fee_max_cents", "fee_mode"]).then(({ data }) => {
      for (const r of data ?? []) {
        if (r.key === "fee_percent") setFee(Number(r.value)); if (r.key === "pilot_mode") setPilot(r.value === "true"); if (r.key === "fee_mode") setFeeMode(r.value);
        if (r.key === "booking_fee_percent") setFeePct(Number(r.value)); if (r.key === "booking_fee_min_cents") setFeeMin(Number(r.value)); if (r.key === "booking_fee_max_cents") setFeeMax(Number(r.value));
      }
    });
    draftMedia.all().then((items) => setMedia(items.map((m) => ({ ...m, url: URL.createObjectURL(m.blob) }))));
  }, []);
  // Book on a worker's page (mahiman.app/w/ID, then Book): start a job sent to that worker. Once signed in, they're saved,
  // so they show under "People you've used" and the job can go to them first.
  // The link can carry their id or their card name (mahiman.app/w/grant-goes); a name is looked up first.
  const scannedKey = path.match(/^\/w\/([A-Za-z0-9-]{2,60})\/book$/)?.[1] ?? null;
  const [scanned, setScanned] = useState<string | null>(null);
  useEffect(() => {
    if (!scannedKey) return;
    if (/^[0-9a-f-]{36}$/.test(scannedKey)) { setScanned(scannedKey); return; }
    rpc<{ id: string } | null>("worker_public", { p_key: scannedKey }).then((w) => setScanned(w?.id ?? null)).catch(() => {});
  }, [scannedKey]);
  useEffect(() => { if (scanned) { sessionStorage.setItem("mm-worker", scanned); startNew({ invited: [scanned] }); } }, [scanned]);
  useEffect(() => {
    if (!session) { setPast([]); return; }
    const pending = sessionStorage.getItem("mm-worker");
    (pending ? rpc("save_worker", { p_worker: pending }).catch(() => {}).finally(() => sessionStorage.removeItem("mm-worker")) : Promise.resolve())
      .then(() => rpc<PastWorker[]>("my_past_workers")).then(setPast).catch(() => setPast([]));
  }, [session?.user.id]);
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }, [d]);
  useEffect(() => { if (d.reuse.length) mediaUrls(d.reuse.map((r) => r.path)).then(setReuseUrls); }, [d.reuse]);

  const cat = cats.find((c) => c.id === d.categoryId) ?? null;
  const jt = types.find((t) => t.category_id === d.categoryId) ?? null;
  const suburb = suburbs.find((s) => s.id === d.suburbId) ?? null;
  // A job with a trade in it (set per skill in Admin: landscaping, carpentry, electrical...) is a trade job: tradies send a fixed quote.
  const typeIds = [d.categoryId, ...(d.extraCats ?? [])].filter((x): x is number => x != null);
  const jobSkills = skillList.filter((k) => typeIds.includes(k.category_id) && (d.skills ?? []).includes(k.id));
  const tradeSkill = jobSkills.find((k) => k.trade && k.licence) ?? jobSkills.find((k) => k.trade) ?? null;
  const isTrade = !!tradeSkill;
  // The whole-job amount: the price itself if fixed, otherwise the rate times about how many hours, days or visits.
  const unit = d.priceUnit === "hour" || d.priceUnit === "day" || d.priceUnit === "visit" ? d.priceUnit : "fixed";
  const qty = unit === "fixed" ? 1 : d.unitQty ?? 1;
  const jobCents = unit === "fixed" ? d.priceCents : Math.round(d.priceCents * qty);
  const total = jobCents + Math.round((jobCents * fee) / 100);
  // Invoice mode: the connection fee is billed when the customer selects a worker, at the rate their plan gives them.
  const { p: payInfo } = usePayments(feeMode === "invoice" && !!session);
  const invoiceFee = (() => {
    if (feeMode !== "invoice" || isTrade) return null;
    const r = payInfo?.rates ?? { payg: feePct, payg_min: feeMin, payg_max: feeMax, topup: 0, topup_min: 0, plus: 0, plus_min: 0, plus_max: 0 };
    const amt = (pct: number, min: number, max?: number) => connFee(jobCents, pct, min, max);
    const plan = (payInfo?.plan ?? "now") as "now" | "weekly" | "fortnightly";
    if (payInfo?.senior) return { cents: 0, pct: 0, min: false, from: "senior" as const };
    if (payInfo && payInfo.plus_until && new Date(payInfo.plus_until) > new Date()) {
      const c = amt(r.plus, r.plus_min, r.plus_max);
      return { cents: c, pct: r.plus, min: c === r.plus_min && c > Math.round((jobCents * r.plus) / 100), from: payInfo.balance >= c ? "balance" as const : plan };
    }
    const c = amt(r.payg, r.payg_min, r.payg_max);
    const min = c === r.payg_min && c > Math.round((jobCents * r.payg) / 100);
    if (payInfo && payInfo.balance >= c) return { cents: c, pct: r.payg, min, from: "balance" as const };
    return { cents: c, pct: r.payg, min, from: plan };
  })();
  const bookingFee = feeMode === "on_choose" && !isTrade ? connFee(jobCents, feePct, feeMin, feeMax) : 0;
  const photos = media.filter((m) => m.kind === "photo");
  const video = media.find((m) => m.kind === "video") ?? null;
  const reusedPhotos = d.reuse.filter((r) => r.kind === "photo");
  const reusedVideo = d.reuse.find((r) => r.kind === "video") ?? null;
  const photoCount = photos.length + reusedPhotos.length;

  // A new job starts on the one-tap start screen; a job posted again goes straight to Check and post.
  async function startNew(prefill?: Partial<Draft>, to = "/book/start") {
    await draftMedia.clear();
    setMedia([]);
    setReuseUrls({});
    uploads.current = {};
    setErr("");
    setD({ ...blank, ...prefill, ...(prefill?.priceCents ? { priceCents: Math.max(prefill.priceCents, LO) } : {}), priceSet: !!prefill?.priceCents });
    go(to);
  }

  // Photos upload while they check the job, so Post is instant.
  const uploads = useRef<Record<string, Promise<string>>>({});
  const upload = (m: DraftItem) => {
    if (!session) return Promise.reject(new Error("Sign in first"));
    const uid = session.user.id;
    return (uploads.current[m.id] ??= (async () => {
      const ext = m.kind === "photo" ? "jpg" : (m.name.split(".").pop() || "mp4").toLowerCase();
      const p = `${uid}/${m.id}.${ext}`;
      const { error } = await sb.storage.from("job-media").upload(p, m.blob, { upsert: true, contentType: m.kind === "photo" ? "image/jpeg" : (m.blob.type || "video/mp4") });
      if (error) { delete uploads.current[m.id]; throw new Error("A photo didn't upload. Check your signal and try again."); }
      return p;
    })());
  };
  useEffect(() => {
    if (path === "/book/check" && session) for (const m of media) upload(m).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, session?.user.id, media]);
  const mediaIn = useRef<HTMLInputElement>(null);
  const [pickUnit, setPickUnit] = useState(false);
  const [pickWhen, setPickWhen] = useState(false);
  // Pick a day and time, right here: the next 6 days, then a start time from 6am to 8pm, at least an hour away.
  const [pickDay, setPickDay] = useState(false);
  const [pickTime, setPickTime] = useState(false);
  const [dayPick, setDayPick] = useState("");
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const walkDays = Array.from({ length: 6 }, (_, i) => {
    const x = new Date(); x.setDate(x.getDate() + i);
    const nice = x.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    return { id: `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`, label: i === 0 ? `Today, ${nice}` : i === 1 ? `Tomorrow, ${nice}` : nice };
  });
  const walkTimes = (day: string) => {
    const out: { id: string; label: string }[] = [];
    const earliest = Date.now() + 60 * 60 * 1000;
    for (let m = 6 * 60; m <= 20 * 60; m += 30) {
      const id = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
      if (new Date(`${day}T${id}`).getTime() < earliest) continue;
      out.push({ id, label: new Date(2000, 0, 1, m / 60, m % 60).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase() });
    }
    return out;
  };
  // The suburb for a place: by name first, otherwise the nearest one we serve.
  const suburbFor = (locality: string | null | undefined, lat: number, lng: number) => {
    const byName = locality ? suburbs.find((x) => x.name.toLowerCase() === locality.toLowerCase()) : undefined;
    if (byName) return byName;
    return [...(suburbs as (Suburb & { lat: number; lng: number })[])].filter((x) => x.lat != null)
      .sort((a, b) => ((a.lat - lat) ** 2 + (a.lng - lng) ** 2) - ((b.lat - lat) ** 2 + (b.lng - lng) ** 2))[0];
  };
  // A place from Apple Maps into the draft: street number and street, and the suburb.
  type Place = { coordinate: { latitude: number; longitude: number }; subThoroughfare?: string; thoroughfare?: string; locality?: string; name?: string };
  const applyPlace = (pl: Place) => {
    const street = [pl.subThoroughfare, pl.thoroughfare].filter(Boolean).join(" ") || pl.name || "";
    const sub = suburbFor(pl.locality, pl.coordinate.latitude, pl.coordinate.longitude);
    setD({ ...d, address: street || d.address, suburbId: sub?.id ?? d.suburbId });
    setAddrSug([]); setErr("");
    // No house number from the map: put the cursor at the start of the street so they just add it.
    if (!pl.subThoroughfare) { setNeedNumber(pl.thoroughfare ? "number" : "street"); window.setTimeout(() => { addrBox.current?.focus(); addrBox.current?.setSelectionRange(0, 0); }, 50); }
  };
  const [needNumber, setNeedNumber] = useState<false | "number" | "street">(false);
  const addrBox = useRef<HTMLInputElement>(null);
  // Current location: the phone's position, turned into the street address by Apple Maps (Uber's "Current location").
  const [locating, setLocating] = useState(false);
  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr("Location isn't available on this phone. Type the address instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const { latitude, longitude } = p.coords;
      const mk = await loadMapKit();
      if (!mk) { const sub = suburbFor(null, latitude, longitude); if (sub) setD({ ...d, suburbId: sub.id }); setLocating(false); return; }
      new mk.Geocoder({ language: "en-AU" }).reverseLookup(new mk.Coordinate(latitude, longitude), (e: unknown, r: { results?: Place[] }) => {
        setLocating(false);
        if (e || !r?.results?.length) { const sub = suburbFor(null, latitude, longitude); if (sub) setD({ ...d, suburbId: sub.id }); return; }
        applyPlace(r.results[0]);
      });
    }, () => { setLocating(false); setErr("Couldn't get your location. Type the address instead."); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  // Typing the address: Apple Maps suggestions under the box, the way Uber's "Enter destination" works.
  const [addrSug, setAddrSug] = useState<{ line1: string; line2: string; raw: unknown }[]>([]);
  const sugTimer = useRef<number | undefined>(undefined);
  const typeAddress = (q: string) => {
    setD({ ...d, address: q }); setErr("");
    window.clearTimeout(sugTimer.current);
    if (q.trim().length < 3) { setAddrSug([]); return; }
    sugTimer.current = window.setTimeout(async () => {
      const mk = await loadMapKit();
      if (!mk) return;
      const near = suburb as (Suburb & { lat?: number; lng?: number }) | null;
      const search = new mk.Search({ language: "en-AU", ...(near?.lat != null ? { region: new mk.CoordinateRegion(new mk.Coordinate(near.lat, near.lng), new mk.CoordinateSpan(0.6, 0.6)) } : {}) });
      search.autocomplete(q, (e: unknown, r: { results?: { displayLines: string[] }[] }) => {
        if (e || !r?.results) return setAddrSug([]);
        setAddrSug(r.results.slice(0, 5).map((x) => ({ line1: x.displayLines[0] ?? "", line2: x.displayLines[1] ?? "", raw: x })));
      });
    }, 250);
  };
  const pickSuggestion = async (raw: unknown) => {
    const mk = await loadMapKit();
    if (!mk) return;
    new mk.Search({ language: "en-AU" }).search(raw, (e: unknown, r: { places?: Place[] }) => { if (!e && r?.places?.length) applyPlace(r.places[0]); });
  };
  const addPicked = async (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const ph = all.filter((f) => f.type.startsWith("image/")), vid = all.filter((f) => f.type.startsWith("video/")).slice(0, 1);
    if (ph.length) await addFiles(ph, "photo");
    if (vid.length) await addFiles(vid, "video");
  };

  async function addFiles(files: FileList | File[] | null, kind: "photo" | "video") {
    if (!files?.length) return;
    setErr("");
    const next: (DraftItem & { url: string })[] = [];
    for (const f of Array.from(files)) {
      if (kind === "photo") {
        if (photoCount + next.length >= MAX_PHOTOS) { toast(`Up to ${MAX_PHOTOS} photos`); break; }
        let blob: Blob = f;
        try { blob = await shrinkImage(f); } catch { /* keep original */ }
        next.push({ id: crypto.randomUUID(), kind, blob, name: f.name, url: URL.createObjectURL(blob) });
      } else {
        const secs = await videoSeconds(f);
        if (secs > MAX_VIDEO_SECONDS + 1) { setErr(`Keep the video under ${MAX_VIDEO_SECONDS} seconds. Trim it in your Photos app and add it again.`); return; }
        if (f.size > 50 * 1024 * 1024) { setErr("That video is too big. Record a shorter one."); return; }
        if (video) { await draftMedia.remove(video.id); }
        if (reusedVideo) setD({ ...d, reuse: d.reuse.filter((r) => r.kind !== "video") });
        next.push({ id: crypto.randomUUID(), kind, blob: f, name: f.name, url: URL.createObjectURL(f) });
      }
    }
    for (const n of next) await draftMedia.put({ id: n.id, kind: n.kind, blob: n.blob, name: n.name });
    setMedia((m) => [...(kind === "video" ? m.filter((x) => x.kind !== "video") : m), ...next]);
  }

  // Photos from Snap it go straight into the job's photos.
  async function addBlobs(blobs: Blob[]) {
    const next: (DraftItem & { url: string })[] = [];
    for (const b of blobs) {
      if (photoCount + next.length >= MAX_PHOTOS) break;
      let blob: Blob = b;
      try { blob = await shrinkImage(b); } catch { /* keep original */ }
      next.push({ id: crypto.randomUUID(), kind: "photo", blob, name: "photo.jpg", url: URL.createObjectURL(blob) });
    }
    for (const n of next) await draftMedia.put({ id: n.id, kind: n.kind, blob: n.blob, name: n.name });
    setMedia((m) => [...m, ...next]);
  }

  async function removeMedia(id: string) {
    await draftMedia.remove(id);
    setMedia((m) => m.filter((x) => x.id !== id));
  }
  const removeReused = (p: string) => setD({ ...d, reuse: d.reuse.filter((r) => r.path !== p) });

  async function book() {
    if (!isTrade && !d.payMethod) { setPickMethod(true); return; }
    setErr("");
    if (!jt) return go("/book/details");
    if (d.details.trim().length < 15) return go("/book/details");
    if (!(d.included ?? []).some((x) => x.trim())) { setErr("Add at least one thing that's included."); return; }
    if (!photoCount && !video && !reusedVideo) { mediaIn.current?.click(); return; }
    if (!photoCount) { setErr("Add at least one photo. A video on its own isn't enough."); return; }
    if (!isTrade && (d.priceCents < LO || jobCents > HI)) { setErr(`Set a price from ${money(LO)} to ${money(HI)}.`); return; }
    if (!suburb || d.address.trim().length < 3) return go("/book/where");
    if (!d.asap && !/T\d/.test(d.startAt)) return go("/book/when");
    if (!session) { setAuth(true); return; }
    // A face to go with the job: workers see it before they offer.
    if (!profile?.photo_path && !photoAdded.current) { setPhotoScreen(true); return; }
    if (bookingFee > 0 && !profile?.card_last4 && !cardAdded.current) { setCardScreen(true); return; }
    // Customers can book a few jobs before verifying their ID (Admin, Settings); after that, verify first and the job posts straight after.
    if (profile?.id_status !== "verified" && profile?.id_status !== "pending" && !verifySent.current) {
      const g = await rpc<{ verify_now: boolean } | null>("booking_gate").catch(() => null);
      if (g?.verify_now) { setVerifyScreen(true); return; }
    }
    setBusy(true);
    try {
      const uid = session.user.id;
      const uploaded: { path: string; kind: string }[] = d.reuse.filter((r) => r.path.startsWith(`${uid}/`)).map((r) => ({ path: r.path, kind: r.kind }));
      // Most are already up: they started uploading when this screen opened.
      for (const m of media) uploaded.push({ path: await upload(m), kind: m.kind });
      const invited = d.invited.filter((w) => past.some((p) => p.worker_id === w));
      const id = await rpc<string>("create_job", {
        p_job_type: jt.id, p_suburb: d.suburbId, p_address: d.address, p_notes: d.notes,
        p_asap: d.asap, p_start_at: d.asap ? new Date().toISOString() : new Date(d.startAt).toISOString(),
        p_details: d.details, p_media: uploaded, p_price_cents: jobCents,
        p_price_unit: unit, p_unit_price_cents: unit === "fixed" ? null : d.priceCents, p_unit_qty: qty,
        p_invited: invited, p_open_after_minutes: invited.length ? d.openAfter : null,
        p_included: (d.included ?? []).map((x) => x.trim()).filter(Boolean), p_excluded: (d.excluded ?? []).map((x) => x.trim()).filter(Boolean), p_skills: jobSkills.map((k) => k.id),
        p_title: d.title?.trim() || null, p_extra_categories: d.extraCats ?? [],
        p_budget_min_cents: null, p_budget_max_cents: null,
        p_pay_method: isTrade ? null : d.payMethod ?? null,
      });
      // A repeat: set up now the job is posted. If it fails the job still stands; they can set it from Home.
      if (!isTrade && d.repeatWeeks) await rpc("repeat_set", { p_job: id, p_weeks: d.repeatWeeks }).catch(() => toast("Posted. The repeat didn't save, so post it again from Home to repeat it."));
      const finish = async () => {
        sessionStorage.removeItem(DRAFT_KEY);
        await draftMedia.clear();
        go(`/job/${id}`);
      };
      if (isTrade || feeMode === "invoice") await finish(); else setPayJob(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const bar = (label: string, onNext: () => void, disabled = false, nextName = "") => (
    <div className="bottombar">
      <span className="t15 light muted">{nextName ? `Next, ${nextName}` : ""}</span>
      <button className="btn primary" disabled={disabled} onClick={onNext}>{label} {Icon.arrow("#fff")}</button>
    </div>
  );

  // ---------- Screens ----------
  if (path === "/book/price" && isTrade) { go("/book/check", true); return null; }
  if (path === "/book/price") {
    return <PriceStep value={d.priceCents} catName={d.priceSet ? null : cat?.name ?? null} onChange={(v) => setD({ ...d, priceCents: v, priceSet: true })} />;
  }

  if (path === "/book/start") {
    return <WalkWhat d={d} setD={setD} cats={cats} skillList={skillList} suggest={(id) => types.find((t) => t.category_id === id)?.price_cents ?? null} />;
  }

  // Step 2: a photo, shown big. One tap adds one (camera or library, the phone asks). Adding the first moves on by itself.
  if (path === "/book/photo") {
    const urls = [...photos.map((m) => m.url), ...reusedPhotos.map((r) => reuseUrls[r.path]).filter(Boolean)];
    const nextStep = isTrade ? "/book/when-where" : "/book/w-price";
    const take = async (list: FileList | null) => { const had = photoCount; await addPicked(list); if (!had && list?.length) go(nextStep); };
    return (
      <WalkShell n={2} title="Add a photo" onBack={() => history.back()} err={err}
        onNext={() => { if (!photoCount) return setErr("Add a photo so workers can see the job."); setErr(""); go(nextStep); }}>
        <label className={urls.length ? "wk-hero" : "wk-hero empty"} style={urls[0] ? { backgroundImage: `url("${urls[0]}")` } : undefined}>
          {!urls.length && <span>{Icon.camera("var(--emerald)")}<b>Add a photo</b></span>}
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
        </label>
        {urls.length > 0 && (
          <div className="wk-thumbs">
            {urls.slice(1).map((u) => <span key={u} style={{ backgroundImage: `url("${u}")` }} />)}
            {photoCount < MAX_PHOTOS && <label className="add" aria-label="Add another photo">{Icon.plus("var(--emerald)")}
              <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} /></label>}
          </div>
        )}
      </WalkShell>
    );
  }

  // Step 3: the price, Airbnb's price filter: what most people pay, the bars, the slider on them, then the boxes to type in.
  // Fixed, hourly, daily or per visit; for anything but fixed, about how many. Ranges are what Australians pay (cost guides in job_types).
  if (path === "/book/w-price") {
    if (isTrade) { go("/book/when-where", true); return null; }
    const hourly = unit === "hour" || unit === "day";
    const perDay = unit === "day" ? 7 : 1;
    const lo = hourly ? (jt?.hour_lo_cents ?? 4000) * perDay : jt?.range_lo_cents ?? Math.round((jt?.price_cents ?? 8000) * 0.7);
    const hi = hourly ? (jt?.hour_hi_cents ?? 6000) * perDay : jt?.range_hi_cents ?? Math.round((jt?.price_cents ?? 8000) * 1.5);
    const mid = hourly ? Math.round((lo + hi) / 2) : jt?.range_mid_cents ?? Math.round((lo + hi) / 2);
    const max = unit === "hour" ? 20000 : unit === "day" ? 150000 : 100000;
    const min = 2500;
    const set = (c: number) => setD({ ...d, priceCents: Math.min(HI, Math.max(min, c)), priceSet: true });
    // The scale runs far enough for big jobs but spreads out everyday prices: position is the square root of the share.
    const pct = (c: number) => Math.sqrt(Math.max(0, Math.min(1, (c - min) / (max - min)))) * 100;
    const fromPct = (p: number) => Math.round((min + (p / 100) ** 2 * (max - min)) / 500) * 500;
    const UNITS = [{ id: "fixed", label: "Fixed" }, { id: "hour", label: "Hourly" }, { id: "day", label: "Daily" }, { id: "visit", label: "Per visit" }] as const;
    const per = unit === "fixed" ? "for the job" : unit === "hour" ? "an hour" : unit === "day" ? "a day" : "a visit";
    const startAt = (u: string) => u === "hour" ? Math.round(((jt?.hour_lo_cents ?? 4000) + (jt?.hour_hi_cents ?? 6000)) / 2 / 500) * 500
      : u === "day" ? Math.round(((jt?.hour_lo_cents ?? 4000) + (jt?.hour_hi_cents ?? 6000)) / 2 * 7 / 500) * 500 : jt?.range_mid_cents ?? jt?.price_cents ?? 8000;
    return (
      <WalkShell n={3} title="What will you pay?" onBack={() => history.back()} onNext={() => after("/book/when-where")}>
        <p className="wk-sub">Most people pay {money(lo)} to {money(hi)} {per}.</p>
        <div className="wk-hist" aria-hidden="true">
          {Array.from({ length: 36 }, (_, k) => {
            const at = ((k + 0.5) / 36) * 100;
            const m = pct(mid), sd = Math.max(5, (at < m ? m - pct(lo) : pct(hi) - m) * 0.75);
            const h = 6 + 94 * Math.exp(-(((at - m) / sd) ** 2));
            return <i key={k} className={at <= pct(d.priceCents) ? "on" : ""} style={{ height: `${h}%` }} />;
          })}
        </div>
        <div className="wk-scale">
          <input className="mm-range" type="range" min={0} max={100} step={0.5} value={pct(d.priceCents)} aria-label="Price"
            onChange={(e) => set(fromPct(Number(e.target.value)))} />
        </div>
        <div className="wk-boxes">
          <label className="wk-box"><small>Your price</small><span>$<input inputMode="numeric" value={Math.round(d.priceCents / 100)}
            onChange={(e) => set(Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)) * 100)} aria-label="Type a price" /></span></label>
          <button className="wk-box" onClick={() => setPickUnit(true)}><small>Price is</small><span>{UNITS.find((u) => u.id === unit)!.label}{Icon.down("var(--ink)")}</span></button>
        </div>
        {unit !== "fixed" && (
          <div className="wk-qty">
            <span>About how many {UNIT_COUNT[unit][1]}?</span>
            <div><button onClick={() => setD({ ...d, unitQty: Math.max(unit === "hour" ? 0.5 : 1, qty - (unit === "hour" ? 0.5 : 1)) })} aria-label="Fewer">−</button>
              <b>{qty}</b>
              <button onClick={() => setD({ ...d, unitQty: Math.min(100, qty + (unit === "hour" ? 0.5 : 1)) })} aria-label="More">+</button></div>
            <small>{money(jobCents)} in all</small>
          </div>
        )}
        <div className="wk-pay2">
          <span>Pay by</span>
          {PAY_METHODS.map((m) => <button key={m.id} className={(d.payMethod ?? "cash") === m.id ? "on" : ""} onClick={() => setD({ ...d, payMethod: m.id })}>{(d.payMethod ?? "cash") === m.id && Icon.tick("#fff", 18)}{m.short}</button>)}
        </div>
        {pickUnit && <SearchPicker title="Price is" value={[unit]} options={UNITS.map((u) => ({ id: u.id, label: u.label }))}
          onClose={() => setPickUnit(false)} onChange={(v) => { const u = String(v[0]) as NonNullable<Draft["priceUnit"]>; setD({ ...d, priceUnit: u, unitQty: u === "hour" ? 2 : 1, priceCents: startAt(u), priceSet: true }); }} />}
      </WalkShell>
    );
  }

  // Step 4: when and where, the Uber way: When is one quick select, starting on Now. Where is the address itself, typed straight in,
  // with Use my current location under it, and the pin on the map to confirm.
  if (path === "/book/when-where") {
    const when = d.asap ? "Now" : new Date(d.startAt).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return (
      <WalkShell n={4} title="When and where?" onBack={() => history.back()} err={err}
        onNext={() => { if (d.address.trim().length < 3 || !suburb) return setErr("Add the address, or use your current location."); setErr(""); after("/book/check"); }}>
        <h2 className="wk-h">When</h2>
        <button className="wk-ww" onClick={() => setPickWhen(true)}>{Icon.clock("var(--emerald)", 26)}<span><b>{when}</b></span>{Icon.down("var(--ink)")}</button>
        <h2 className="wk-h">Where</h2>
        <label className="wk-ww wk-in">{Icon.pin("var(--emerald)")}
          <span><input ref={addrBox} value={d.address} placeholder="Street address" autoComplete="street-address" onChange={(e) => { setNeedNumber(false); typeAddress(e.target.value); }} />
            {needNumber ? <small className="em">{needNumber === "number" ? "Add your street number" : "Type your street address"}</small> : suburb && <small>{suburb.name}</small>}</span></label>
        {addrSug.length > 0 && (
          <div className="wk-sug">{addrSug.map((x, k) => <button key={k} onClick={() => pickSuggestion(x.raw)}>{Icon.pin("var(--muted)")}<span><b>{x.line1}</b><small>{x.line2}</small></span></button>)}</div>
        )}
        <button className="wk-loc" onClick={useMyLocation} disabled={locating}>{Icon.pin("var(--emerald)")}{locating ? "Finding you…" : "Use my current location"}</button>
        <div className="wk-where"><div className="wk-map"><PlaceMap lat={suburb?.lat ?? null} lng={suburb?.lng ?? null} /></div></div>
        {pickWhen && <SearchPicker title="When" value={[d.asap ? "now" : "pick"]} options={[{ id: "now", label: "Now" }, { id: "pick", label: "Pick a day and time" }]}
          onClose={() => setPickWhen(false)} onChange={(v) => { if (v[0] === "now") setD({ ...d, asap: true }); else { setPickWhen(false); setPickDay(true); } }} />}
        {pickDay && <SearchPicker title="Which day?" value={[]} options={walkDays} onClose={() => setPickDay(false)}
          onChange={(v) => { setPickDay(false); setDayPick(String(v[0])); window.setTimeout(() => setPickTime(true), 0); }} />}
        {pickTime && dayPick && <SearchPicker title="What time?" value={[]} options={walkTimes(dayPick)} onClose={() => setPickTime(false)}
          onChange={(v) => { setPickTime(false); setD({ ...d, asap: false, startAt: `${dayPick}T${v[0]}` }); }} />}
      </WalkShell>
    );
  }

  if (path === "/book/details") {
    return <DetailsStep d={d} setD={setD} cats={cats} skillList={skillList} suggest={(id) => types.find((t) => t.category_id === id)?.price_cents ?? null}
      driving={!!jt?.needs_driver} photoUrls={[...photos.map((m) => m.url), ...reusedPhotos.map((r) => reuseUrls[r.path]).filter(Boolean)]} photoCount={photoCount} addPhotos={addBlobs}
      err={err} setErr={setErr} bar={bar} />;
  }

  if (path === "/book/photos") {
    return <PhotosStep photos={photos} video={video} reused={d.reuse} reuseUrls={reuseUrls}
      photoCount={photoCount} addFiles={addFiles} removeMedia={removeMedia} removeReused={removeReused} err={err} setErr={setErr} bar={bar} />;
  }

  if (path === "/book/where" || path === "/book/when" || path === "/book/who") {
    return <WhereStep d={d} setD={setD} suburbs={suburbs} suburb={suburb} past={past} bar={bar} trade={isTrade} />;
  }

  if (path === "/book/check") {
    const chosen = past.filter((p) => d.invited.includes(p.worker_id));
    return (
      <div className="app wk">
        {(() => {
          const jobName = d.title?.trim() || jobSkills.map((k) => k.name).join(", ") || cat?.name || "The job";
          const when = d.asap ? "Now" : new Date(d.startAt).toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
          // The connection fee Mahi Man charges. Invoiced (bank transfer) in the pilot, by card after it.
          const connCents = invoiceFee ? invoiceFee.cents : bookingFee > 0 ? bookingFee : connFee(jobCents, feePct, feeMin, feeMax);
          const connCharged = !isTrade && (invoiceFee ? true : bookingFee > 0);
          return (<>
            {/* Check and post: the job, then four plain rows. Lists, skills and the rest live in Edit. */}
            <div className="wk-head">
              <div className="wk-prog" aria-label="Step 5 of 5">{[1, 2, 3, 4, 5].map((i) => <i key={i} className="on" />)}</div>
              <h1>Check and post</h1>
            </div>
            {/* The photos and video, straight under the job: a job needs at least one photo to post. */}
            <section className="ck-media">
              {reusedPhotos.map((r) => reuseUrls[r.path] && (
                <span key={r.path} className="ck-tile" style={{ backgroundImage: `url("${reuseUrls[r.path]}")` }}>
                  <button onClick={() => removeReused(r.path)} aria-label="Remove photo">{Icon.x("#fff", 14)}</button></span>
              ))}
              {photos.map((m) => (
                <span key={m.id} className="ck-tile" style={{ backgroundImage: `url("${m.url}")` }}>
                  <button onClick={() => removeMedia(m.id)} aria-label="Remove photo">{Icon.x("#fff", 14)}</button></span>
              ))}
              {(video || (reusedVideo && reuseUrls[reusedVideo.path])) && (
                <VideoTile src={video ? video.url : reuseUrls[reusedVideo!.path]} onRemove={() => (video ? removeMedia(video.id) : removeReused(reusedVideo!.path))} />
              )}
              {photoCount === 0 ? (
                <button className="ck-addm need" onClick={() => mediaIn.current?.click()}>{Icon.camera("#14211c")}<span>Add a photo or video</span></button>
              ) : photoCount < MAX_PHOTOS && (
                <button className="ck-addm" onClick={() => mediaIn.current?.click()}>{Icon.camera("var(--emerald)")}<span>Add more</span></button>
              )}
              {photoCount === 0 && <p>Workers decide from what they see. Add one to post.</p>}
              <input ref={mediaIn} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addPicked(e.target.files); e.target.value = ""; }} />
            </section>

            <section className="cp2-job">
              <div className="cp2-jh"><b className="cp2-t">{jobName}</b><button className="btn stone small" onClick={() => go("/book/details")}>Edit</button></div>
              <p>{d.details}</p>
            </section>

            <section className="cp2-rows">
              <button className="qk-row" onClick={() => go("/book/when")}>{Icon.clock("var(--emerald)", 22)}<span>When</span><b>{when}</b>{Icon.chevron("var(--muted)")}</button>
              <button className="qk-row" onClick={() => go("/book/where")}>{Icon.pin("var(--emerald)")}<span>Where</span><b className={d.address?.trim() ? "" : "ph"}>{[d.address?.trim(), suburb?.name].filter(Boolean).join(", ") || "Add the address"}</b>{Icon.chevron("var(--muted)")}</button>
              {isTrade ? (
                <div className="cp2-pay">{Icon.card("var(--emerald)")}<span>Price</span><b className="cp2-q">Tradies quote you</b><small>Select a quote and pay the tradie directly. $0 fee.</small></div>
              ) : (<>
                <button className="qk-row" onClick={() => { retTo("/book/check"); go("/book/w-price"); }}>{Icon.card("var(--emerald)")}<span>Price</span><b>{priceWords({ price_cents: jobCents, price_unit: unit, unit_price_cents: d.priceCents })}{unit !== "fixed" && <small className="cp2-sub">{priceAbout({ price_cents: jobCents, price_unit: unit, unit_price_cents: d.priceCents, unit_qty: qty })}</small>}</b>{Icon.chevron("var(--muted)")}</button>
                <button className="qk-row" onClick={() => setPickMethod(true)}>{Icon.doc("var(--emerald)", 22)}<span>Pay by</span><b>{PAY_METHODS.find((m) => m.id === d.payMethod)?.short ?? ""}</b>{Icon.chevron("var(--muted)")}</button>
                {(() => {
                  const first = chosen[0];
                  return past.length > 0 && <button className="qk-row" onClick={() => setPickWho("people")}>{Icon.person("var(--emerald)")}<span>Who</span><b>{first ? `${chosen.map((p) => p.full_name.split(" ")[0]).join(", ")} first` : "Anyone nearby"}</b>{Icon.chevron("var(--muted)")}</button>;
                })()}
                <button className="qk-row" onClick={() => setPickRepeat(true)}>{Icon.repeat("var(--emerald)")}<span>Repeat</span><b className={d.repeatWeeks ? "" : "ph"}>{REPEATS.find((r) => r.v === (d.repeatWeeks ?? 0))!.label}</b>{Icon.chevron("var(--muted)")}</button>
                <div className="cp2-fee">
                  <span>Mahi Man fee <b>{invoiceFee?.from === "senior" ? "Free" : connCharged ? money2(connCents) : "Free"}</b>, only when you select a worker</span>
                  <button className="ck-i" onClick={() => go("/pricing")} aria-label="How the fee works">{Icon.help("currentColor", 20)}</button>
                </div>
                {bookingFee > 0 && session && <button className="qk-row" onClick={() => setCardScreen(true)}>{Icon.card("var(--emerald)")}<span>Card</span><b>{profile?.card_last4 ? cardLabel(profile) : "Add a card"}</b>{Icon.chevron("var(--muted)")}</button>}
              </>)}
            </section>
          </>);
        })()}

        {err && <p className="err" style={{ padding: "0 20px" }}>{err}</p>}
        <div style={{ flex: 1 }} />
        <div className="bottombar ck-bar">
          <div className="ck-btns">
            {discard
              ? <><button className="btn stone" onClick={() => setDiscard(false)}>{Icon.back("currentColor")}Keep it</button>
                <button className="btn out" onClick={async () => { sessionStorage.removeItem(DRAFT_KEY); await draftMedia.clear(); go("/post", true); }}>{Icon.cancel("currentColor")}Throw away</button></>
              : <><button className="btn stone" onClick={() => setDiscard(true)}>{Icon.cancel("currentColor")}Cancel</button>
                <button className="btn primary" disabled={busy} onClick={book}>
                  {busy ? "Posting…" : photoCount === 0 ? "Add a photo" : session && bookingFee > 0 && !profile?.card_last4 ? "Add a card" : <>Post my job {Icon.arrow("#fff")}</>}
                </button></>}
          </div>
          <span className="ck-terms">{discard ? "This job and its photos will be deleted." : <>By posting, you agree to the <a href="/terms" onClick={(e) => { e.preventDefault(); go("/terms"); }}>terms and conditions</a>.</>}</span>
        </div>
        {pickWho === "people" && <SearchPicker title="Ask first" multi placeholder="Search by name" value={d.invited}
          options={past.map((p) => ({ id: p.worker_id, label: p.full_name, hint: p.jobs_for_me ? `Did ${p.jobs_for_me} job${p.jobs_for_me === 1 ? "" : "s"} for you` : "Saved from their code" }))}
          onClose={() => setPickWho(null)} onChange={(v) => { setD({ ...d, invited: v.map(String) }); if (v.length) window.setTimeout(() => setPickWho("after"), 0); }} />}
        {pickWho === "after" && <SearchPicker title="If they can't take it" value={[OPEN_AFTER.find((o) => o.v === d.openAfter)?.id ?? "10"]}
          options={OPEN_AFTER.filter((o) => !d.asap || o.v != null).map((o) => ({ id: o.id, label: o.label }))}
          onClose={() => setPickWho(null)} onChange={(v) => setD({ ...d, openAfter: OPEN_AFTER.find((o) => o.id === v[0])?.v ?? null })} />}
        {pickRepeat && <SearchPicker title="Repeat" value={[d.repeatWeeks ?? 0]}
          options={REPEATS.map((r) => ({ id: r.v, label: r.label, hint: repeatHint(d, r.v) }))}
          onClose={() => setPickRepeat(false)} onChange={(v) => setD({ ...d, repeatWeeks: Number(v[0]) as Draft["repeatWeeks"] })} />}
        {pickMethod && <SearchPicker title="How will you pay?" value={d.payMethod ? [d.payMethod] : []} options={PAY_METHODS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
          onChange={(v) => setD({ ...d, payMethod: String(v[0]) as Draft["payMethod"] })} onClose={() => setPickMethod(false)} />}
        {verifyScreen && <VerifyFlow onClose={() => setVerifyScreen(false)} onSubmitted={() => { verifySent.current = true; setVerifyScreen(false); window.setTimeout(book, 300); }} />}
        {photoScreen && <PhotoStep note="Workers see it before they say they're available, so they know who they're meeting." saveLabel="Save and post" photoOnly
          onBack={() => setPhotoScreen(false)} onSaved={() => { photoAdded.current = true; setPhotoScreen(false); window.setTimeout(book, 300); }} />}
        {cardScreen && <AddCardScreen onBack={() => setCardScreen(false)} onSaved={() => { cardAdded.current = true; setCardScreen(false); window.setTimeout(book, 300); }} />}
        {auth && (
          <AuthScreen title="Almost there" reason="Sign in and your job posts straight away. Your photos are saved."
            onBack={() => setAuth(false)} onDone={() => { setAuth(false); window.setTimeout(book, 300); }} />
        )}
        {payJob && <PayScreen jobId={payJob} amountLabel={money2(total)} onBack={() => setPayJob(null)}
          onPaid={async () => { sessionStorage.removeItem(DRAFT_KEY); await draftMedia.clear(); go(`/job/${payJob}`); }} />}
      </div>
    );
  }

  return <PostHome cats={cats} signedIn={!!session} uid={session?.user.id ?? null} onStart={startNew} />;
}


// Repeats: the job posts itself again every 1, 2 or 4 weeks, on the same weekday. An as-soon-as-possible job repeats at 8am.
const REPEATS = [{ v: 0, label: "Just once" }, { v: 1, label: "Every week" }, { v: 2, label: "Every 2 weeks" }, { v: 4, label: "Every 4 weeks" }] as const;
const fmtTime = (t: Date) => t.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(/\s?([ap])\.?m\.?/i, "$1m").toLowerCase();
function firstRepeatAt(d: Draft, weeks: number) {
  const start = d.asap || !/T\d/.test(d.startAt) ? new Date() : new Date(d.startAt);
  const t = new Date(start); t.setDate(t.getDate() + weeks * 7);
  if (d.asap || !/T\d/.test(d.startAt)) t.setHours(8, 0, 0, 0);
  return t;
}
const nextLabel = (t: Date) => `${t.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}, ${fmtTime(t)}`;
function repeatHint(d: Draft, weeks: number) {
  if (!weeks) return "This job only";
  const t = firstRepeatAt(d, weeks);
  const day = t.toLocaleDateString("en-AU", { weekday: "long" });
  return weeks === 1 ? `${day}s, ${fmtTime(t)}` : `Every ${weeks === 2 ? "second" : "fourth"} ${day}, ${fmtTime(t)}`;
}

// A video in the photo row, with its length.
function VideoTile({ src, onRemove }: { src: string; onRemove: () => void }) {
  const [secs, setSecs] = useState<number | null>(null);
  return (
    <span className="ck-tile vid">
      <video src={src} muted playsInline preload="metadata" onLoadedMetadata={(e) => setSecs(Math.round(e.currentTarget.duration || 0))} />
      <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      {secs != null && <em>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</em>}
      <button onClick={onRemove} aria-label="Remove video">{Icon.x("#fff", 14)}</button>
    </span>
  );
}


// ---------- Get help: one button, then your recent jobs ----------
// Jobs still under way, and what the customer sees about each one.
const LIVE: Record<string, string> = { searching: "Finding people near you", accepted: "Booked", in_progress: "Under way", finished: "Done. Check it and confirm", disputed: "Problem reported" };

interface Recent {
  id: string; title: string | null; extra_categories: number[] | null; details: string; skill_ids: number[] | null; included: string[] | null; excluded: string[] | null; price_cents: number; price_unit: "fixed" | "hour" | "day" | "visit" | null; unit_price_cents: number | null; unit_qty: number | null; suburb_id: number; address: string; notes: string; created_at: string;
  status: string; worker_id: string | null; job_types: { category_id: number | null } | null; suburbs: { name: string } | null;
  job_media: { path: string; kind: "photo" | "video"; sort: number }[];
}

// How many workers are switched on and cover where the customer is. Shown only from 10 up.
function Available() {
  const here = useHere();
  const { area } = useArea();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!here && !area) return;
    let live = true;
    const args = here ? { p_lat: here.lat, p_lng: here.lng } : { p_area: area!.id };
    const load = () => rpc<number>("workers_available", args).then((c) => live && setN(c)).catch(() => {});
    load();
    const t = window.setInterval(load, 60000);
    return () => { live = false; window.clearInterval(t); };
  }, [here?.lat, here?.lng, area?.id]);
  // Under 10 says nothing. From 10 it rounds down: 10+, 20+, 50+, 100+.
  if (!n || n < 10) return null;
  const shown = n >= 100 ? "100+" : n >= 50 ? "50+" : n >= 20 ? "20+" : "10+";
  return (
    <span className="avail-now">
      <span className="avail-dot" />
      <span><b>{shown}</b> people available now</span>
    </span>
  );
}

function PostHome({ cats, signedIn, uid, onStart }: { cats: Category[]; signedIn: boolean; uid: string | null; onStart: (p?: Partial<Draft>, to?: string) => void }) {
  const soon = isSoon(useArea().area);
  const { profile: me } = useSession();
  const onPlus = !!me?.plus_until && new Date(me.plus_until) > new Date();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const feedOffer = useFeedOffer(true, "help");
  useEffect(() => {
    if (!uid) { setRecent([]); return; }
    sb.from("jobs").select("id,title,extra_categories,details,skill_ids,included,excluded,price_cents,price_unit,unit_price_cents,unit_qty,suburb_id,address,notes,created_at,status,worker_id,job_types(category_id),suburbs(name),job_media(path,kind,sort)")
      .eq("customer_id", uid).neq("status", "awaiting_payment").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecent((data ?? []) as unknown as Recent[]));
  }, [uid]);
  // Each recent job shows its own first photo, so it's recognisable at a glance. The category icon only fills in when there's no photo.
  const [pics, setPics] = useState<Record<string, string>>({});
  useEffect(() => { if (recent?.length) mediaUrls(recent.map((r) => firstPhoto(r.job_media)).filter(Boolean) as string[]).then(setPics); }, [recent]);

  // Repeats: jobs that post themselves again.
  const [repeats, setRepeats] = useState<Repeat[]>([]);
  const [openRepeat, setOpenRepeat] = useState<Repeat | null>(null);
  const loadRepeats = () => { if (uid) rpc<Repeat[]>("my_repeats").then((r) => setRepeats(r ?? [])).catch(() => {}); else setRepeats([]); };
  useEffect(loadRepeats, [uid]);
  const [repPics, setRepPics] = useState<Record<string, string>>({});
  useEffect(() => { const ps = repeats.map((r) => r.photo).filter(Boolean) as string[]; if (ps.length) mediaUrls(ps).then(setRepPics); }, [repeats]);
  const toast = useToast();
  const skipNext = async (r: Repeat) => {
    const day = localDay(r.next_at), skipped = r.skips.includes(day);
    try { await rpc("repeat_skip", { p_id: r.id, p_date: day, p_skip: !skipped }); toast(skipped ? "It's back on." : `Skipped. Next one ${nextLabel(new Date(r.dates[1]))}.`); loadRepeats(); }
    catch (e) { toast(e instanceof Error ? e.message : "That didn't save. Try again."); }
  };

  const { owed, reload: reloadOwed } = useOwed(!!uid);
  const { invoices, paused } = useDueInvoices(!!uid);
  useEffect(() => { if (uid) claimGifts(); }, [uid]);
  const [paying, setPaying] = useState<OwedFee | null>(null);

  const again = (r: Recent) => onStart({ repeatWeeks: 0,
    categoryId: r.job_types?.category_id ?? null, extraCats: r.extra_categories ?? [], title: r.title ?? "", priceCents: r.price_unit && r.price_unit !== "fixed" && r.unit_price_cents != null ? r.unit_price_cents : r.price_cents, priceUnit: r.price_unit ?? "fixed", unitQty: Number(r.unit_qty ?? 1), suburbId: r.suburb_id, address: r.address, notes: r.notes,
    details: r.details, skills: r.skill_ids ?? [], included: r.included ?? [], excluded: r.excluded ?? [], reuse: [...r.job_media].sort((a, b) => a.sort - b.sort).map((m) => ({ path: m.path, kind: m.kind })),
    invited: r.worker_id && ["finished", "confirmed"].includes(r.status) ? [r.worker_id] : [],
  }, "/book/check");
  // "Post again" on the job-cancelled screen: open the job just cancelled, filled in.
  useEffect(() => {
    if (!recent?.length) return;
    let want = false;
    let key: string | null = null;
    try { key = sessionStorage.getItem("mm-again"); sessionStorage.removeItem("mm-again"); } catch { /* private mode */ }
    want = !!key;
    const r = want ? (recent.find((x) => x.id === key) ?? recent.find((x) => x.status === "cancelled")) : undefined;
    if (r) again(r);
  }, [recent]);

  return (
    <div className="app" style={{ background: "var(--ground)" }}>
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div className="hero-top" style={{ position: "relative", zIndex: 1 }}>
          <button className="brand" onClick={() => go("/")}><Logo /> Mahi Man</button>
          {signedIn ? <AlertsBell /> : <AreaPin />}
        </div>
        {signedIn ? <SetSide side="help" /> : <SideSwitch side="help" />}
        <img className="mascot" src="/mascot.png" alt="" style={{ top: "auto", bottom: 0, height: signedIn ? 142 : 160, right: -30 }} />
        <h1 className="mid" style={{ position: "relative", margin: "26px 0 10px" }}>Need a hand?</h1>
        <p className="lede" style={{ position: "relative", maxWidth: 200 }}>Get the help you need within minutes.</p>
        {!soon && <Available />}
      </section>

      <OwedBanner owed={owed} onPay={setPaying} />
      <InvoiceBanner invoices={invoices} />
      {paying && <FeePayScreen fee={paying} onBack={() => setPaying(null)} onPaid={() => { setPaying(null); reloadOwed(); }} />}
      {soon && <ComingSoon side="help" />}
      {/* In an area that isn't open yet you can't post, but your own jobs (live, repeats, recent) still show. */}
      <div className="post-body">
        {!soon && <button className="post-btn" onClick={() => (owed.length ? setPaying(owed[0]) : paused ? go(`/invoice/${paused.id}`) : onStart())}>
          <span>Post a job</span>
          {Icon.arrow("var(--lime)")}
        </button>}

        {signedIn && !onPlus && !soon && (
          <button className="plus-band" onClick={() => go("/plus")}>
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#f5c518" /><path d="M12 7.5v9M7.5 12h9" stroke="#14211c" strokeWidth="2.4" strokeLinecap="round" /></svg>
            <span><span className="pw">PLUS</span><b>Half fees, faster help</b><small>For our loyal customers</small></span>
            <span className="go">Try it</span>
          </button>
        )}

        {repeats.length > 0 && (
          <div className="stack" style={{ gap: 0, marginBottom: 4 }}>
            <span className="post-h">Repeats</span>
            {repeats.map((r) => {
              const skipped = r.skips.includes(localDay(r.next_at));
              return (
                <div key={r.id} className="recent-row">
                  <button className="rp-open" onClick={() => setOpenRepeat(r)}>
                    {r.photo && repPics[r.photo] ? <span className="sq pic" style={{ backgroundImage: `url("${repPics[r.photo]}")` }} /> : <span className="sq" />}
                    <span className="t">
                      <b>{r.title}</b>
                      <span>{REPEATS.find((x) => x.v === r.every_weeks)?.label}{r.worker_name ? `, ${r.worker_name.split(" ")[0]} first` : ""}</span>
                      <span className="rp-next">{Icon.repeat("#c99a06", 18)}{r.held ? "Waiting on a payment" : skipped ? `Skipped ${nextLabel(new Date(r.next_at))}` : `Next ${nextLabel(new Date(r.next_at))}`}</span>
                    </span>
                  </button>
                  <button className="btn stone small" onClick={() => skipNext(r)}>{skipped ? "Undo" : "Skip it"}</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Live jobs first, tappable, with what's happening. Finished ones below, with Post again. */}
        {(() => {
          const live = (recent ?? []).filter((r) => LIVE[r.status]);
          return live.length > 0 && (
            <div className="stack" style={{ gap: 0, marginBottom: 6 }}>
              <span className="post-h">Your live jobs</span>
              {live.map((r) => {
                const c = cats.find((x) => x.id === r.job_types?.category_id);
                const p = firstPhoto(r.job_media);
                return (
                  <button key={r.id} className="recent-row live" onClick={() => go(`/job/${r.id}`)}>
                    {p && pics[p] ? <span className="sq pic" style={{ backgroundImage: `url("${pics[p]}")` }} /> : <span className="sq"><CatIcon name={c?.icon} size={28} /></span>}
                    <span className="t">
                      <b>{r.title || r.details}</b>
                      <span className="live-st">{r.status === "searching" && <i className="live-dot" />}{LIVE[r.status]}</span>
                    </span>
                    <span className="btn primary small">View</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
        {recent && recent.some((r) => !LIVE[r.status]) ? (
          <div className="stack" style={{ gap: 0 }}>
            <span className="row between" style={{ alignItems: "baseline" }}><span className="post-h">Your recent jobs</span><button className="btn stone small" onClick={() => go("/jobs")}>All your jobs</button></span>
            {recent.filter((r) => !LIVE[r.status]).map((r) => {
              const c = cats.find((x) => x.id === r.job_types?.category_id);
              return (
                <div key={r.id} className="recent-row">
                  <button className="rp-open" onClick={() => go(`/job/${r.id}`)}>
                    {(() => { const p = firstPhoto(r.job_media); return p && pics[p]
                      ? <span className="sq pic" style={{ backgroundImage: `url("${pics[p]}")` }} />
                      : <span className="sq"><CatIcon name={c?.icon} size={28} /></span>; })()}
                    <span className="t">
                      <b>{r.title || r.details}</b>
                      <span>{money(r.price_cents)}, {r.suburbs?.name ?? ""}, {new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                    </span>
                  </button>
                  <button className="btn stone small" onClick={() => again(r)}>Post again</button>
                </div>
              );
            })}
          </div>
        ) : recent && !recent.length ? (
          <div className="stack" style={{ gap: 0 }}>
            {[["1", "Show the job", "Say it or snap it. We fill in the rest"], ["2", "Set your price", "What you'll pay for the work"], ["3", "Select who does it", "Pay them directly when it's done"]].map(([n, t, s]) => (
              <div key={n} className="how-row"><span className="n">{n}</span><span className="t"><b>{t}</b><span>{s}</span></span></div>
            ))}
          </div>
        ) : null}

        {feedOffer && <FeedOfferCard o={feedOffer} side="help" style={{ margin: "0 -16px", width: "calc(100% + 32px)", borderTop: "1px solid var(--line)" }} />}
        {!signedIn && <div className="legal-btns" style={{ margin: "18px 0 calc(var(--safe-bottom) + 18px)" }}>
          <button className="btn stone small" onClick={() => go("/privacy")}>Privacy</button>
          <button className="btn stone small" onClick={() => go("/terms")}>Terms</button>
          <button className="btn stone small" onClick={() => go("/support")}>{Icon.help("currentColor", 18)}Help</button>
        </div>}
      </div>
      <TabBar on="help" />
      {openRepeat && <RepeatScreen r={openRepeat} pic={openRepeat.photo ? repPics[openRepeat.photo] : undefined} onClose={() => setOpenRepeat(null)} onSaved={() => { setOpenRepeat(null); loadRepeats(); }} />}
    </div>
  );
}

interface Repeat {
  id: string; title: string; every_weeks: 1 | 2 | 4; next_at: string; price_cents: number; skips: string[]; worker_id: string | null;
  worker_name: string | null; worker_photo: string | null; photo: string | null; held: boolean; dates: string[];
}
// The day a repeat falls on, in Queensland time (the same day the server skips).
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });

// One repeat: how often, when, who first and the price; skip any of the next dates. Nothing changes until Save.
function RepeatScreen({ r, pic, onClose, onSaved }: { r: Repeat; pic?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [weeks, setWeeks] = useState<number>(r.every_weeks);
  const [next, setNext] = useState(new Date(r.next_at));
  const [worker, setWorker] = useState<string | null>(r.worker_id);
  const [price, setPrice] = useState(r.price_cents);
  const [skips, setSkips] = useState<string[]>(r.skips);
  const [pick, setPick] = useState<null | "weeks" | "day" | "time" | "who" | "price">(null);
  const [past, setPast] = useState<PastWorker[]>([]);
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc<PastWorker[]>("my_past_workers").then(setPast).catch(() => {}); }, []);
  const dates = [0, 1, 2].map((g) => { const t = new Date(next); t.setDate(t.getDate() + weeks * 7 * g); return t; });
  const who = past.find((p) => p.worker_id === worker) ?? (worker ? { full_name: r.worker_name ?? "", photo_path: r.worker_photo } as PastWorker : null);
  const ph = who ? avatarUrl(who.photo_path) : null;
  const days = Array.from({ length: weeks * 7 }, (_, i) => { const t = new Date(); t.setDate(t.getDate() + i + 1); t.setHours(next.getHours(), next.getMinutes(), 0, 0); return t; });
  const times = Array.from({ length: 29 }, (_, i) => { const t = new Date(next); t.setHours(6 + Math.floor(i / 2), (i % 2) * 30, 0, 0); return t; });
  const save = async () => {
    setBusy(true);
    try {
      await rpc("repeat_save", { p_id: r.id, p_weeks: weeks, p_next_at: next.toISOString(), p_worker: worker, p_price_cents: price, p_skips: skips });
      toast("Saved"); onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : "That didn't save. Try again."); } finally { setBusy(false); }
  };
  const stopIt = async () => {
    setBusy(true);
    try { await rpc("repeat_stop", { p_id: r.id }); toast("Stopped. It won't post again."); onSaved(); }
    catch (e) { toast(e instanceof Error ? e.message : "That didn't stop. Try again."); } finally { setBusy(false); }
  };
  return (
    <Screen title={r.title} onBack={onClose}>
      <div className="screen-body">
        {pic && <div className="rp-hero" style={{ backgroundImage: `url("${pic}")` }} />}
        <div className="rp-body">
          <button className="ck-method rp-on" onClick={() => setPick("weeks")}>{Icon.repeat("#c99a06")}<span className="k">Repeat</span><span className="v">{REPEATS.find((x) => x.v === weeks)?.label}</span>{Icon.down("var(--muted)")}</button>
          <button className="ck-method" onClick={() => setPick("day")}><span className="k">Time</span><span className="v">{next.toLocaleDateString("en-AU", { weekday: "long" })}, {fmtTime(next)}</span>{Icon.down("var(--muted)")}</button>
          <button className="ck-method ck-who2" onClick={() => setPick("who")}>
            {who ? <>{ph ? <i style={{ backgroundImage: `url("${ph}")` }} /> : <i className="no">{who.full_name.charAt(0)}</i>}<span className="v">{who.full_name} first<small>Then anyone after 10 minutes</small></span></>
              : <><span className="k">Who</span><span className="v">Anyone nearby</span></>}
            {Icon.down("var(--muted)")}
          </button>
          <button className="ck-method" onClick={() => setPick("price")}><span className="k">Price</span><span className="v">{money(price)}</span>{Icon.down("var(--muted)")}</button>
          <h2 className="rp-sec">Coming up</h2>
          {dates.map((t) => {
            const day = t.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" }), off = skips.includes(day);
            return (
              <div key={day} className={off ? "rp-up skip" : "rp-up"}>
                <span className="n">{t.getDate()}<small>{t.toLocaleDateString("en-AU", { month: "short" })}</small></span>
                <span className="d"><b>{t.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</b><span>{off ? "Skipped" : `Posts itself at ${fmtTime(t)}`}</span></span>
                <button className="btn stone small" onClick={() => setSkips(off ? skips.filter((x) => x !== day) : [...skips, day])}>{off ? "Undo" : "Skip"}</button>
              </div>
            );
          })}
          {stop
            ? <div className="rp-stopask"><span>Stop repeating this job?</span>
                <div className="ps-btns"><button className="btn stone" onClick={() => setStop(false)}>{Icon.back("currentColor")}Keep it</button>
                <button className="btn out" disabled={busy} onClick={stopIt}>{Icon.cancel("currentColor")}Stop it</button></div></div>
            : <button className="btn stone rp-stop" onClick={() => setStop(true)}>{Icon.cancel("currentColor")}Stop repeating</button>}
        </div>
      </div>
      <div className="bottombar"><span /><button className="btn primary" disabled={busy} onClick={save}>Save</button></div>
      {pick === "weeks" && <SearchPicker title="Repeat" value={[weeks]} options={REPEATS.filter((x) => x.v).map((x) => ({ id: x.v, label: x.label }))} onClose={() => setPick(null)} onChange={(v) => setWeeks(Number(v[0]))} />}
      {pick === "day" && <SearchPicker title="Next one" placeholder="Search days" value={[]} options={days.map((t, i) => ({ id: i, label: t.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }) }))}
        onClose={() => setPick(null)} onChange={(v) => { setNext(days[Number(v[0])]); window.setTimeout(() => setPick("time"), 0); }} />}
      {pick === "time" && <SearchPicker title="Start time" placeholder="Search times" value={[]} options={times.map((t, i) => ({ id: i, label: fmtTime(t) }))}
        onClose={() => setPick(null)} onChange={(v) => setNext(times[Number(v[0])])} />}
      {pick === "who" && <SearchPicker title="Ask first" placeholder="Search by name" value={[worker ?? "any"]}
        options={[{ id: "any", label: "Anyone nearby" }, ...past.map((p) => ({ id: p.worker_id, label: p.full_name, hint: p.jobs_for_me ? `Did ${p.jobs_for_me} job${p.jobs_for_me === 1 ? "" : "s"} for you` : undefined }))]}
        onClose={() => setPick(null)} onChange={(v) => setWorker(v[0] === "any" ? null : String(v[0]))} />}
      {pick === "price" && <SearchPicker title="Price" placeholder="Search prices" value={[price]} options={Array.from({ length: (SLIDER_MAX - LO) / 500 + 1 }, (_, i) => LO + i * 500).map((c) => ({ id: c, label: money(c) }))}
        onClose={() => setPick(null)} onChange={(v) => setPrice(Number(v[0]))} />}
    </Screen>
  );
}

// ---------- Step 1: Set your price ----------
const QUICK = [3000, 5000, 8000, 12000, 20000];
const LO = 2500, HI = 200000, SLIDER_MAX = 30000;

// Editing one thing from a step (where, when) comes back to that step; otherwise back to Check and post.
const RET = "mm-post-ret";
const retTo = (p: string) => { try { sessionStorage.setItem(RET, p); } catch { /* private mode */ } };
function stepOn(_from?: string, _trade?: boolean) {
  let to = "/book/check";
  try { to = sessionStorage.getItem(RET) || to; sessionStorage.removeItem(RET); } catch { /* private mode */ }
  go(to);
}
const nextLabel2 = () => "Done";
// Where a step goes next: back to the screen it was opened from, or on to the given one.
const after = (def: string) => { let to = def; try { to = sessionStorage.getItem(RET) || def; sessionStorage.removeItem(RET); } catch { /* private mode */ } go(to); };

// The posting steps (what, photo, price, then Check and post with the extras already filled in): a big question, one thing to do, Back and Next side by side. Tapping a choice moves on by itself.
function WalkShell({ n, title, children, onBack, onNext, next = "Next", busy = false, err }: { n: number; title: string; children: ReactNode; onBack: () => void; onNext: () => void; next?: string; busy?: boolean; err?: string }) {
  return (
    <div className="app wk">
      <div className="wk-head">
        <div className="wk-prog" aria-label={`Step ${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</div>
        <h1>{title}</h1>
      </div>
      <div className="wk-body">{children}{err && <p className="err" style={{ margin: "12px 0 0" }}>{err}</p>}</div>
      <div className="bottombar wk-bar">
        <button className="btn stone" onClick={onBack}>{Icon.back("currentColor")}Back</button>
        <button className="btn primary" disabled={busy} onClick={onNext}>{busy ? "One sec…" : next} {Icon.arrow("#fff")}</button>
      </div>
    </div>
  );
}

// Step 1: what needs doing, typed or said. Claude writes up the job and suggests a price.
function WalkWhat({ d, setD, cats, skillList, suggest }: {
  d: Draft; setD: (d: Draft) => void; cats: Category[]; skillList: { id: number; category_id: number; name: string }[]; suggest: (catId: number) => number | null;
}) {
  const { fill, filling } = useFill(d, setD, cats, skillList, suggest);
  const [text, setText] = useState(d.details);
  const [voice, setVoice] = useState(false);
  const [err, setErr] = useState("");
  const go2 = async (t: string) => {
    if (t.trim().length < 4) return setErr("Say what you need done.");
    setErr(""); await fill(t.trim()); go("/book/photo");
  };
  return (
    <WalkShell n={1} title="What do you need done?" onBack={() => history.back()} onNext={() => go2(text)} busy={filling} err={err}>
      <label className="wk-say">
        <textarea autoFocus value={text} rows={4} placeholder="Like: mow the back lawn and clear the rubbish" onChange={(e) => { setText(e.target.value); setErr(""); }} />
        {voiceSupported() && <button type="button" className="wk-mic" onClick={() => setVoice(true)} aria-label="Say it">{Icon.mic("#fff")}</button>}
      </label>
      {voice && <VoiceScreen jobName="Job" onBack={() => setVoice(false)} raw onDone={(t) => { setVoice(false); setText(t); go2(t); }} />}
    </WalkShell>
  );
}

function PriceStep({ value, catName, onChange }: { value: number; catName: string | null; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(Math.round(value / 100)));
  const [err, setErr] = useState("");
  const dollars = Number(text) || 0;
  const set = (cents: number) => { setErr(""); setText(String(Math.round(cents / 100))); onChange(cents); };
  const pct = Math.max(0, Math.min(100, ((Math.min(dollars * 100, SLIDER_MAX) - LO) / (SLIDER_MAX - LO)) * 100));
  const next = () => {
    const c = Math.round(dollars) * 100;
    if (c < LO) return setErr(`The lowest price is ${money(LO)}.`);
    if (c > HI) return setErr(`The highest price is ${money(HI)}.`);
    onChange(c); stepOn("price");
  };
  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero title="Set your price" sub="What will you pay?" onBack={() => history.back()} />
      <div className="price-body">
        <label htmlFor="amt" className="t15 muted">You pay</label>
        <div className="price-box">
          <span className="cur">$</span>
          <input id="amt" type="text" inputMode="numeric" pattern="[0-9]*" value={text} aria-label="Price in dollars"
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4); setText(v); setErr(""); if (v) onChange(Number(v) * 100); }} />
          <span className="hint">tap to type</span>
        </div>
        <span className="t14 light muted">{catName ? `Suggested for ${catName.toLowerCase()}. ` : ""}A fixed price. You pay your worker when the job's done.</span>
        <div className="price-slider">
          <input className="mm-range" type="range" min={LO / 100} max={SLIDER_MAX / 100} step={5} value={Math.min(Math.max(dollars, LO / 100), SLIDER_MAX / 100)} aria-label="Price"
            onChange={(e) => set(Number(e.target.value) * 100)}
            style={{ background: `linear-gradient(90deg, var(--emerald) ${pct}%, var(--stone-2) ${pct}%) center / 100% 10px no-repeat` }} />
          <div className="row between t13 light muted"><span>{money(LO)}</span><span>{money(SLIDER_MAX)}+</span></div>
        </div>
        <span className="t17 w5" style={{ marginTop: 14 }}>Quick pick</span>
        <div className="quick-grid">
          {QUICK.map((q) => (
            <button key={q} className={dollars * 100 === q ? "on" : ""} onClick={() => set(q)}>{money(q)}</button>
          ))}
        </div>
        <div className="cp-note" style={{ padding: "22px 0 0" }}>
          {Icon.clockLine("var(--muted)")}
          <span>Help is usually about $45 an hour. Fair prices get taken faster.</span>
        </div>
        {err && <p className="err" style={{ margin: "12px 0 0" }}>{err}</p>}
      </div>
      <div style={{ flex: 1 }} />
      <div className="bottombar">
        <span />
        <button className="btn primary" onClick={next}>{nextLabel2()} {Icon.arrow("#fff")}</button>
      </div>
    </div>
  );
}



// ---------- Step 1: What's the job ----------
// Without the AI: pick the category whose name and skills share the most words, and turn each sentence into a task.
function guessJob(text: string, cats: Category[], skills: { id: number; category_id: number; name: string }[]) {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  const score = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w) || words.has(w.replace(/s$/, ""))).length;
  let best: { id: number; n: number } | null = null;
  for (const c of cats) {
    const n = score(c.name) * 2 + skills.filter((k) => k.category_id === c.id).reduce((a, k) => a + score(k.name), 0);
    if (n > 0 && (!best || n > best.n)) best = { id: c.id, n };
  }
  const tidy = text.replace(/\s+/g, " ").trim();
  const details = tidy.charAt(0).toUpperCase() + tidy.slice(1) + (/[.!?]$/.test(tidy) ? "" : ".");
  const included = tidy.split(/(?<=[.!?])\s+|\s+and\s+(?=[a-z])/i).map((x) => x.replace(/[.!?]+$/, "").trim()).filter((x) => x.length > 3)
    .map((x) => (x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 60)).slice(0, 6);
  return { details, category_id: best?.id ?? null, skill_ids: [] as number[], included, excluded: [] as string[] };
}
// Said, typed or photographed in; the whole job out: its name, kind of work, what's included and not, and a suggested price.
function useFill(d: Draft, setD: (d: Draft) => void, cats: Category[], skillList: { id: number; category_id: number; name: string }[], suggest: (catId: number) => number | null) {
  const [filling, setFilling] = useState(false);
  const [filledFrom, setFilledFrom] = useState<"said" | "photos" | null>(null);
  const filled = useRef(false);
  // What they said, typed or photographed in; the whole job out. Claude does it when it's switched on; otherwise a simple match on the words.
  async function fill(text: string, images: string[] = []): Promise<boolean> {
    filled.current = true; setFilling(true);
    const payload = cats.map((c) => ({ id: c.id, name: c.name, skills: skillList.filter((k) => k.category_id === c.id).map((k) => ({ id: k.id, name: k.name })) }));
    let r: { ai: boolean; title?: string | null; details?: string; category_id?: number | null; extra_category_ids?: number[]; skill_ids?: number[]; included?: string[]; excluded?: string[] } = { ai: false };
    try { r = await api("fill_job", { text, images, categories: payload }); } catch { /* offline: the simple match below */ }
    if (!r.ai && !text.trim()) { setFilling(false); return false; }
    const out = r.ai ? r : { ...guessJob(text, cats, skillList), title: null, extra_category_ids: [] as number[] };
    const catId = out.category_id ?? d.categoryId;
    const sp = catId ? suggest(catId) : null;
    setD({
      ...d, details: out.details || text, categoryId: catId,
      extraCats: out.category_id ? (out.extra_category_ids ?? []) : d.extraCats ?? [],
      title: d.title?.trim() ? d.title : out.title ?? d.title ?? "",
      skills: (out.skill_ids ?? []).length ? out.skill_ids! : d.skills,
      included: (d.included ?? []).length ? d.included : out.included ?? [],
      excluded: (d.excluded ?? []).length ? d.excluded : out.excluded ?? [],
      ...(!d.priceSet && sp && catId !== d.categoryId ? { priceCents: sp } : {}),
    });
    if (r.ai) setFilledFrom(images.length && !text.trim() ? "photos" : "said");
    setFilling(false);
    return !!catId;
  }
  return { fill, filling, filledFrom, filled };
}


function DetailsStep({ d, setD, cats, skillList, suggest, driving = false, photoUrls, photoCount, addPhotos, err, setErr, bar }: {
  d: Draft; setD: (d: Draft) => void; cats: Category[]; skillList: { id: number; category_id: number; name: string; needs: string | null; trade: boolean }[]; suggest: (catId: number) => number | null; driving?: boolean;
  photoUrls: string[]; photoCount: number; addPhotos: (b: Blob[]) => Promise<void>;
  err: string; setErr: (s: string) => void; bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const detailsBox = useRef<HTMLTextAreaElement>(null);
  const [voice, setVoice] = useState(false);
  const [snap, setSnap] = useState(false);
  const [dictate, setDictate] = useState(false);
  const [pickCat, setPickCat] = useState(false);
  const [pickSkills, setPickSkills] = useState(false);
  const { fill, filling, filledFrom, filled } = useFill(d, setD, cats, skillList, suggest);
  // The job's kinds of work: the main one first, then any others (a backyard clean-up is garden and rubbish removal).
  const typeIds = [d.categoryId, ...(d.extraCats ?? [])].filter((x): x is number => x != null);
  const types = typeIds.map((id) => cats.find((c) => c.id === id)).filter(Boolean) as Category[];
  const setTypes = (ids: number[]) => {
    const main = ids[0] ?? null;
    const sp = main ? suggest(main) : null;
    setD({ ...d, categoryId: main, extraCats: ids.slice(1, 4), skills: (d.skills ?? []).filter((k) => skillList.some((x) => x.id === k && ids.includes(x.category_id))),
      ...(!d.priceSet && sp && main !== d.categoryId ? { priceCents: sp } : {}) });
    setErr("");
  };

  async function snapped(blobs: Blob[]) {
    setSnap(false);
    await addPhotos(blobs);
    const images = await Promise.all(blobs.slice(0, 6).map((b) => photoForReading(b, 1024).catch(() => "")));
    fill(d.details.trim(), images.filter(Boolean));
  }
  const catSkills = skillList.filter((k) => typeIds.includes(k.category_id));
  const chosen = catSkills.filter((k) => (d.skills ?? []).includes(k.id));
  const needs = [...new Set(chosen.map((k) => k.needs).filter(Boolean))] as string[];
  const next = () => {
    if (!d.categoryId) return setErr("Select the job type.");
    if (d.details.trim().length < 15) return setErr("Say what you want done.");
    if (!(d.included ?? []).filter((x) => x.trim()).length) return setErr("Add at least one task.");
    setErr("");
    setD({ ...d, included: (d.included ?? []).map((x) => x.trim()).filter(Boolean), excluded: (d.excluded ?? []).map((x) => x.trim()).filter(Boolean) });
    stepOn("details");
  };
  return (
    <div className="app">
      <StepHero title="What's the job?" sub="Be specific. This is what the worker is held to." onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <div className="fill-two">
            <button className="say" disabled={filling} onClick={() => {
              if (voiceSupported()) return setVoice(true);
              // Where the browser has no speech service (the iPhone app), the keyboard's own microphone does the same job.
              setDictate(true);
              detailsBox.current?.focus();
            }}>{Icon.mic("var(--lime)", 24)}<b>Just say it</b><span>Talk it through</span></button>
            <button className="snap" disabled={filling || photoCount >= MAX_PHOTOS} onClick={() => setSnap(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14211c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <b>Snap it</b><span>Take photos of the job</span></button>
          </div>
          {filling && <span className="fill-note">{Icon.spark("#8a6d00")}Filling it in…</span>}
          {!filling && filledFrom && <span className="fill-note">{Icon.spark("#8a6d00")}Filled from {filledFrom === "photos" ? "your photos" : "what you said"}. Tap anything to change it.</span>}
          {dictate && !filling && !filledFrom && <span className="t15 em" style={{ lineHeight: 1.4 }}>Tap the microphone on your keyboard and talk. We fill in the rest when you're done.</span>}
          {photoUrls.length > 0 && (
            <div className="fill-strip">
              {photoUrls.slice(0, 5).map((u) => <span key={u} style={{ backgroundImage: `url("${u}")` }} />)}
              {photoCount < MAX_PHOTOS && <button onClick={() => setSnap(true)} aria-label="Add photos">{Icon.plus("var(--emerald)")}</button>}
            </div>
          )}
          <label className="field job-name">
            <span className="k">Job</span>
            <input value={d.title ?? ""} maxLength={60} placeholder="Name it, like Backyard clean-up" onChange={(e) => setD({ ...d, title: e.target.value })} />
          </label>
          <label className="field" style={{ cursor: "text" }}>
            <textarea ref={detailsBox} value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} style={{ minHeight: 96 }}
              onBlur={() => { if (!filled.current && d.details.trim().length >= 20 && !d.categoryId && !(d.included ?? []).length) fill(d.details); }}
              placeholder="Or type it. For example: shower screen has build-up, needs a proper scrub. Benches and stovetop degreased." />
          </label>
        </div>

        <div className="sec">
          <h2>Job type</h2>
          <div className="type-tags">
            {types.map((c) => (
              <span key={c.id} className="type-tag">
                <CatIcon name={c.icon} size={22} color="var(--emerald)" />{c.name}
                <button onClick={() => setTypes(typeIds.filter((x) => x !== c.id))} aria-label={`Remove ${c.name}`}>{Icon.cross("var(--muted)")}</button>
              </span>
            ))}
            {types.length < 4 && (
              <button className={types.length ? "type-tag add" : "type-tag add first"} onClick={() => setPickCat(true)} aria-label="Add a job type">
                {Icon.plus("var(--emerald)")}{types.length ? null : <span>Select the job type</span>}
              </button>
            )}
          </div>
        </div>

        {catSkills.length > 0 && (
          <div className="sec">
            <h2>Skills needed <span className="h-opt">Optional</span></h2>
            <button className="cp-select" onClick={() => setPickSkills(true)}>
              <span className={chosen.length ? "" : "ph"}>{chosen.length ? chosen.map((k) => k.name).join(", ") : "Select any that apply"}</span>
              {Icon.down("var(--ink)")}
            </button>
            {chosen.some((k) => k.trade)
              ? <span className="t15 em" style={{ lineHeight: 1.4 }}>A trade job. Tradies come to you and send a fixed quote{needs.length ? `, and only those with a verified ${needs.map(lc).join(" and ")} can quote` : ""}.</span>
              : needs.length > 0 && <span className="t15 em" style={{ lineHeight: 1.4 }}>Only workers with a verified {needs.map(lc).join(" and ")} can take this job.</span>}
            {driving && <span className="t15 em" style={{ lineHeight: 1.4 }}>Only licensed drivers can take this job. Goods only, no passengers.</span>}
          </div>
        )}

        <div className="sec">
          <h2>What needs doing</h2>
          <TaskList items={d.included ?? []} onChange={(v) => { setD({ ...d, included: v }); setErr(""); }} addLabel="Add a task" placeholder="Like: Sweep the back porch" gold />
        </div>

        <div className="sec">
          <h2>Not included <span className="h-opt">Optional</span></h2>
          <TaskList items={d.excluded ?? []} onChange={(v) => setD({ ...d, excluded: v })} addLabel="Add" placeholder="Like: Inside the oven" />
        </div>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar(nextLabel2(), next, filling)}
      {pickCat && <SearchPicker title="Job type" multi placeholder="Search job types" value={typeIds}
        options={cats.map((c) => ({ id: c.id, label: c.name }))} onClose={() => setPickCat(false)}
        onChange={(v) => { const ids = v.map(Number); setTypes([...typeIds.filter((x) => ids.includes(x)), ...ids.filter((x) => !typeIds.includes(x))].slice(0, 4)); }} />}
      {pickSkills && <SearchPicker title="Skills needed" multi placeholder="Search skills" value={chosen.map((k) => k.id)}
        options={catSkills.map((k) => ({ id: k.id, label: k.name, hint: k.trade ? (k.needs ? `Trade job, quoted. ${k.needs} checked` : "Trade job, quoted by tradies") : k.needs ? `Only workers with a verified ${lc(k.needs)}` : undefined }))}
        onClose={() => setPickSkills(false)} onChange={(v) => setD({ ...d, skills: v.map(Number) })} />}
      {voice && <VoiceScreen jobName={types[0]?.name ?? "Job"} onBack={() => setVoice(false)}
        raw onDone={(text) => { setVoice(false); fill(d.details.trim() ? `${d.details.trim()} ${text}` : text); }} />}
      {snap && <JobCamera max={MAX_PHOTOS - photoCount} onBack={() => setSnap(false)} onDone={snapped} />}
    </div>
  );
}

// A list you change in place: tap a row to change its words, × removes it, the button adds a new row ready to type.
function TaskList({ items, onChange, addLabel, placeholder, gold = false }: { items: string[]; onChange: (v: string[]) => void; addLabel: string; placeholder: string; gold?: boolean }) {
  const [focus, setFocus] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (focus != null) refs.current[focus]?.focus(); }, [focus, items.length]);
  const set = (i: number, v: string) => onChange(items.map((x, n) => (n === i ? v : x)));
  const drop = (i: number) => onChange(items.filter((_, n) => n !== i));
  return (
    <div className="tasks">
      {items.map((x, i) => (
        <div key={i} className="task">
          <input ref={(el) => { refs.current[i] = el; }} value={x} maxLength={80} placeholder={placeholder} enterKeyHint="done"
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            onBlur={() => { setFocus(null); if (!x.trim()) drop(i); }} />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => drop(i)} aria-label={`Remove ${x || "this one"}`}>{Icon.cross("var(--muted)")}</button>
        </div>
      ))}
      {items.length < 12 && (
        <button className={gold ? "task-add gold" : "task-add"} onClick={() => { onChange([...items.filter((x) => x.trim()), ""]); setFocus(items.filter((x) => x.trim()).length); }}>
          {Icon.plus(gold ? "#14211c" : "var(--emerald)")}{addLabel}
        </button>
      )}
    </div>
  );
}

function PhotosStep({ photos, video, reused, reuseUrls, photoCount, addFiles, removeMedia, removeReused, err, setErr, bar }: {
  photos: (DraftItem & { url: string })[]; video: (DraftItem & { url: string }) | null;
  reused: Reused[]; reuseUrls: Record<string, string>; photoCount: number;
  addFiles: (f: FileList | null, kind: "photo" | "video") => Promise<void>; removeMedia: (id: string) => Promise<void>; removeReused: (p: string) => void;
  err: string; setErr: (s: string) => void; bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const photoIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);
  const reusedPhotos = reused.filter((r) => r.kind === "photo");
  const reusedVideo = reused.find((r) => r.kind === "video") ?? null;
  const next = () => {
    if (!photoCount) return setErr("Add at least one photo so workers can see the job.");
    setErr("");
    go("/book/check");
  };
  return (
    <div className="app">
      <StepHero title="Show the job" sub="Workers decide from what they see." onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2>Photos</h2>
            <span className="small muted">At least 1 photo</span>
          </div>
          <div className="media-grid">
            {reusedPhotos.map((r) => (
              <div key={r.path} className="m">
                {reuseUrls[r.path] ? <img src={reuseUrls[r.path]} alt="" /> : null}
                <button className="x" onClick={() => removeReused(r.path)} aria-label="Remove photo">{Icon.x("#fff", 16)}</button>
              </div>
            ))}
            {photos.map((p) => (
              <div key={p.id} className="m">
                <img src={p.url} alt="" />
                <button className="x" onClick={() => removeMedia(p.id)} aria-label="Remove photo">{Icon.x("#fff", 16)}</button>
              </div>
            ))}
            {photoCount < MAX_PHOTOS && (
              <button className="add" onClick={() => photoIn.current?.click()}>{Icon.camera("var(--emerald)")}Add photo</button>
            )}
          </div>
          <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
          {video || reusedVideo ? (
            <div className="media-grid">
              <div className="m">
                {video ? <video src={video.url} muted playsInline /> : reuseUrls[reusedVideo!.path] ? <video src={reuseUrls[reusedVideo!.path]} muted playsInline /> : null}
                <button className="x" onClick={() => (video ? removeMedia(video.id) : removeReused(reusedVideo!.path))} aria-label="Remove video">{Icon.x("#fff", 16)}</button>
              </div>
              <span className="small light muted" style={{ gridColumn: "span 2", alignSelf: "center" }}>Video added.</span>
            </div>
          ) : (
            <button className="wide-btn" onClick={() => videoIn.current?.click()}>
              {Icon.video("var(--emerald)")}
              <span className="t"><b>Add a video walk-through</b><span>Recommended. Up to 60 seconds.</span></span>
            </button>
          )}
          <input ref={videoIn} type="file" accept="video/*" hidden onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />
          <span className="small light muted">Show the worst of it.</span>
        </div>

        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar("Done", next)}
    </div>
  );
}

// What's included / not included: typed lines the worker is held to.
// ---------- Step 3: Where and when (and who, once you've used someone) ----------
const OPEN_AFTER: { id: string; label: string; v: number | null }[] = [
  { id: "10", label: "Open it to everyone after 10 minutes", v: 10 },
  { id: "15", label: "Open it to everyone after 15 minutes", v: 15 },
  { id: "30", label: "Open it to everyone after 30 minutes", v: 30 },
  { id: "60", label: "Open it to everyone after 1 hour", v: 60 },
  { id: "never", label: "Keep it just for them", v: null },
];

function WhereStep({ d, setD, suburbs, suburb, past, bar, trade }: {
  d: Draft; setD: (d: Draft) => void; suburbs: Suburb[]; suburb: Suburb | null; past: PastWorker[]; trade: boolean;
  bar: (label: string, onNext: () => void, disabled?: boolean, nextName?: string) => ReactNode;
}) {
  const { area } = useArea();
  const changeArea = useChangeArea();
  // Start on the suburb they're in now, if they haven't picked one.
  const here = useHere();
  useEffect(() => {
    if (!here || d.suburbId || !suburbs.length) return;
    const near = [...(suburbs as (Suburb & { lat: number; lng: number })[])].sort((a, b) => ((a.lat - here.lat) ** 2 + (a.lng - here.lng) ** 2) - ((b.lat - here.lat) ** 2 + (b.lng - here.lng) ** 2))[0];
    if (near) setD({ ...d, suburbId: near.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here?.lat, suburbs.length]);
  const [pick, setPick] = useState<null | "suburb" | "day" | "time" | "people" | "after">(null);
  const [err, setErr] = useState("");
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayKey = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const earliest = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const x = new Date(); x.setDate(x.getDate() + i);
    const nice = x.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    return { id: dayKey(x), label: i === 0 ? `Today, ${nice}` : i === 1 ? `Tomorrow, ${nice}` : nice };
  }), []);
  const [selDay, selTime] = d.startAt ? d.startAt.split("T") : ["", ""];
  const times = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (let m = 6 * 60; m <= 20 * 60; m += 30) {
      const hh = pad(Math.floor(m / 60)), mm = pad(m % 60);
      const at = selDay ? new Date(`${selDay}T${hh}:${mm}`) : null;
      const label = new Date(2000, 0, 1, m / 60, m % 60).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
      if (!at || at >= earliest) out.push({ id: `${hh}:${mm}`, label });
    }
    return out;
  }, [selDay, earliest]);
  const timeLabel = times.find((t) => t.id === selTime)?.label;
  const dayLabel = days.find((x) => x.id === selDay)?.label;
  const chosen = past.filter((p) => d.invited.includes(p.worker_id));
  const next = () => {
    if (d.address.trim().length < 3) return setErr("Add the street address.");
    if (!suburb) return setErr("Select the suburb.");
    if (!d.asap && (!selDay || !selTime)) return setErr("Select a day and a start time.");
    if (!d.asap && new Date(d.startAt) < earliest) return setErr("Select a time at least an hour from now.");
    setErr("");
    stepOn("where", trade);
  };
  return (
    <div className="app">
      <StepHero title="Where and when?" onBack={() => history.back()} />
      <div className="step-body">
        <div className="sec">
          <h2>Where</h2>
          <label className="field"><span className="k">Street address</span>
            <input value={d.address} onChange={(e) => { setD({ ...d, address: e.target.value }); setErr(""); }} placeholder="22 Boland Street" autoComplete="street-address" /></label>
          <button className="field sel" onClick={() => setPick("suburb")}>
            <span className="stack" style={{ gap: 2 }}><span className="k">Suburb</span><span className={suburb ? "v" : "v ph"}>{suburb?.name ?? "Select your suburb"}</span></span>
          </button>
          <label className="field" style={{ cursor: "text" }}><span className="k">Getting in <span className="h-opt" style={{ fontSize: 13, marginLeft: 2 }}>Optional</span></span>
            <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Gate code, parking, pets, where the key is" style={{ minHeight: 64 }} /></label>
          <span className="small light muted">Only the worker you choose sees your street address.</span>
        </div>

        <div className="sec">
          <h2>When</h2>
          <button className={`who-opt${d.asap ? " on" : ""}`} onClick={() => { setD({ ...d, asap: true }); setErr(""); }}>
            <span className="t"><b>As soon as possible</b><span>People who are free now tell you, and you choose</span></span>
            <span className="box">{d.asap && Icon.tick("var(--emerald)", 16)}</span>
          </button>
          <button className={`who-opt${!d.asap ? " on" : ""}`} onClick={() => { setD({ ...d, asap: false }); setErr(""); }}>
            <span className="t"><b>Select a day and time</b><span>Up to 5 days ahead</span></span>
            <span className="box">{!d.asap && Icon.tick("var(--emerald)", 16)}</span>
          </button>
          {!d.asap && (
            <div className="row" style={{ gap: 10 }}>
              <button className="field sel" style={{ flex: 1.2 }} onClick={() => setPick("day")}>
                <span className="stack" style={{ gap: 2 }}><span className="k">Day</span><span className={dayLabel ? "v" : "v ph"}>{dayLabel ?? "Select a day"}</span></span>
              </button>
              <button className="field sel" style={{ flex: 1 }} onClick={() => setPick(selDay ? "time" : "day")}>
                <span className="stack" style={{ gap: 2 }}><span className="k">Start</span><span className={timeLabel ? "v" : "v ph"}>{timeLabel ?? "Select a time"}</span></span>
              </button>
            </div>
          )}
        </div>

        {past.length > 0 && !trade && (
          <div className="sec">
            <h2>Who can take it?</h2>
            <button className="field sel" onClick={() => setPick("people")}>
              <span className="stack" style={{ gap: 2 }}>
                <span className="k">Send it to</span>
                <span className="v">{chosen.length ? chosen.map((p) => p.full_name).join(", ") : "Anyone nearby"}</span>
              </span>
            </button>
            {chosen.length > 0 && (
              <button className="field sel" onClick={() => setPick("after")}>
                <span className="stack" style={{ gap: 2 }}>
                  <span className="k">If they can't take it</span>
                  <span className="v">{OPEN_AFTER.find((o) => o.v === d.openAfter)?.label ?? OPEN_AFTER[0].label}</span>
                </span>
              </button>
            )}
            <span className="small light muted">Select someone you've used before, or leave it open to anyone nearby.</span>
          </div>
        )}
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      </div>
      {bar(nextLabel2(), next)}
      {changeArea.picker}
      {pick === "suburb" && <SearchPicker title="Suburb" placeholder={`Search ${area?.name ?? ""} suburbs`} value={d.suburbId ? [d.suburbId] : []}
        options={[...(changeArea.option ? [changeArea.option] : []), ...suburbs.map((s) => ({ id: s.id, label: s.name }))]} onChange={(v) => { setD({ ...d, suburbId: Number(v[0]) }); setErr(""); }} onClose={() => setPick(null)} />}
      {pick === "day" && <SearchPicker title="Day" placeholder="Search days" value={selDay ? [selDay] : []} options={days}
        onChange={(v) => { const t = selTime && new Date(`${v[0]}T${selTime}`) >= earliest ? selTime : ""; setD({ ...d, startAt: `${v[0]}T${t}` }); setErr(""); if (!t) setTimeout(() => setPick("time"), 0); }} onClose={() => setPick(null)} />}
      {pick === "time" && <SearchPicker title="Start time" placeholder="Search times" value={selTime ? [selTime] : []} options={times}
        onChange={(v) => { setD({ ...d, startAt: `${selDay}T${v[0]}` }); setErr(""); }} onClose={() => setPick(null)} />}
      {pick === "people" && (
        <SearchPicker title="People you've used" multi placeholder="Search by name" value={d.invited}
          options={past.map((p) => ({ id: p.worker_id, label: p.full_name, hint: p.jobs_for_me ? `Did ${p.jobs_for_me} job${p.jobs_for_me === 1 ? "" : "s"} for you` : "Saved from their code" }))}
          onClose={() => setPick(null)} onChange={(v) => setD({ ...d, invited: v.map(String) })} />
      )}
      {pick === "after" && (
        <SearchPicker title="If they can't take it" value={[OPEN_AFTER.find((o) => o.v === d.openAfter)?.id ?? "30"]}
          options={OPEN_AFTER.filter((o) => !d.asap || o.v != null).map((o) => ({ id: o.id, label: o.label }))}
          onClose={() => setPick(null)} onChange={(v) => setD({ ...d, openAfter: OPEN_AFTER.find((o) => o.id === v[0])?.v ?? null })} />
      )}
    </div>
  );
}


function videoSeconds(f: File): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration || 0); };
    v.onerror = () => res(0);
    v.src = URL.createObjectURL(f);
  });
}

const PAY_METHODS = [
  { id: "cash", label: "Pay by cash", short: "Cash", hint: "Have it ready when they finish" },
  { id: "bank", label: "Pay via bank transfer", short: "Bank transfer", hint: "Their PayID or account shows when the job's done" },
] as const;
