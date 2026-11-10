import { useEffect, useState } from "react";
import { rpc, sb } from "../lib/supabase";
import { useSession } from "../lib/session";
import { go } from "../lib/router";
import { money } from "../lib/format";
import { Icon, StepHero, useToast } from "./kit";
import { AuthScreen } from "./Auth";

// How Mahi Man works and what it costs, now in the pilot and once it launches. Numbers come from the live settings.
export function Pricing() {
  const { session } = useSession();
  const toast = useToast();
  const [cfg, setCfg] = useState({ pct: 12, max: 3000, boost: 500, plus: 999 });
  const [feeOn, setFeeOn] = useState(false);
  const [listed, setListed] = useState(false);
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    sb.from("settings").select("key,value").in("key", ["booking_fee_percent", "booking_fee_max_cents", "boost_cents", "plus_cents", "fee_mode"]).then(({ data }) => {
      setFeeOn((data ?? []).some((r) => r.key === "fee_mode" && r.value === "on_choose"));
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
      setCfg((c) => ({ pct: m.booking_fee_percent ?? c.pct, max: m.booking_fee_max_cents ?? c.max, boost: m.boost_cents ?? c.boost, plus: m.plus_cents ?? c.plus }));
    });
  }, []);
  useEffect(() => { if (session) rpc<boolean>("on_plus_list").then((v) => setListed(!!v)).catch(() => {}); }, [session?.user.id]);

  const join = async () => {
    try { await rpc("join_plus_list"); setListed(true); toast("You're on the Plus list"); }
    catch (e) { toast(e instanceof Error ? e.message : String(e)); }
  };
  const plusPrice = `$${(cfg.plus / 100).toFixed(2)}`;
  const Li = ({ b, s }: { b: string; s: string }) => <div className="price-li">{Icon.tick("var(--emerald)", 20)}<span><b>{b}</b>{s}</span></div>;

  return (
    <div className="app" style={{ background: "var(--card)" }}>
      <StepHero title="How it works" sub="What it costs now, and once we launch." onBack={() => (history.length > 1 ? history.back() : go("/"))} />

      <div className="cp-sec">
        <span className="cp-title">Right now: the pilot</span>
        {feeOn
          ? <Li b={`Booking fee: ${cfg.pct}%, up to ${money(cfg.max)}`} s="Charged to your saved card only when you choose a worker. Nobody chosen, nothing charged. If your worker drops out, you choose again with no new fee, and if the job never gets done it's refunded." />
          : <Li b="No booking fee" s="Post a job and pay your worker directly by bank transfer or cash when it's done." />}
        {feeOn && <Li b="Pay your worker directly" s="The job price goes straight to your worker by bank transfer or cash when it's done." />}
        <Li b="Urgent boost is free" s="Every worker in your category gets an alert and your job goes to the top." />
        <Li b="Workers keep 100%" s="Always. Now and after launch." />
      </div>

      <div className="cp-sec">
        <span className="cp-title">From launch</span>
        <Li b={feeOn ? "Pay for the job in the app" : `Booking fee: ${cfg.pct}%, up to ${money(cfg.max)}`} s={feeOn ? "Your money's held until you say the job's done, and refunds and problems are handled by us." : "Paid in the app with the job. Your money's held until you say the job's done, and refunds and problems are handled by us."} />
        <Li b={`Urgent boost: ${money(cfg.boost)}`} s="If nobody offers within 30 minutes, you get it back automatically." />
        <Li b="Workers still keep 100%" s="The fee is paid by the customer, never taken from the worker." />
      </div>

      <div className="cp-sec" id="plus">
        <span className="cp-title">Mahi Man Plus, {plusPrice} a month</span>
        <Li b="No booking fees, ever" s="Pays for itself after a couple of jobs." />
        <Li b="Priority on every job" s="Every Plus job is boosted: top of the list, and every worker in your category is told." />
        <Li b="Top-rated first" s="Your jobs reach workers rated 4.8 and up before anyone else." />
        <Li b="Favourites" s="Send a job straight to people you've used, before anyone else sees it." />
        <Li b="Fix-it guarantee" s="Not done as listed? We send someone to finish it, or you don't pay." />
        <Li b="Priority support" s="Your help requests go to the front of the queue." />
        <div className="row" style={{ marginTop: 12, gap: 12, alignItems: "center" }}>
          {listed
            ? <span className="t15 em w5">{Icon.tick("var(--emerald)", 20)} You're on the list. We'll tell you the day Plus opens.</span>
            : <><button className="btn primary" onClick={() => (session ? join() : setAuth(true))}>Get Plus first</button>
                <span className="small light muted" style={{ maxWidth: 160, lineHeight: 1.4 }}>Plus opens with in-app payments. Nothing to pay now.</span></>}
        </div>
      </div>

      <div className="cp-sec">
        <span className="cp-title">How we keep it fast</span>
        <Li b="Alerts the moment you post" s="Workers who are online nearby are told straight away, and you choose who comes." />
        <Li b="The search widens on its own" s="If nobody offers in 10 minutes, workers further out can see your job." />
        <Li b="Quick responders first" s="Workers who reply fast and turn up are shown first." />
      </div>

      <div className="cp-sec" style={{ paddingBottom: "calc(var(--safe-bottom) + 32px)" }}>
        <span className="cp-title">How we keep it good</span>
        <Li b="Verified people" s="ID checked by us." />
        <Li b="Ratings for each kind of job" s="See how someone rates for cleaning, not just overall, and who nearby has used them." />
        <Li b="Ticked off and photographed" s="Workers tick off everything that was included and add after photos before they can finish." />
        <Li b="A high bar" s="Workers whose ratings drop are taken offline until we've checked in with them." />
      </div>

      {auth && <AuthScreen title="Get Plus first" reason="Sign in and we'll tell you the day Plus opens." onBack={() => setAuth(false)}
        onDone={async () => { setAuth(false); await join(); }} />}
    </div>
  );
}
