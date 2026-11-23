import { useEffect, useMemo, useState } from "react";
import { sb, type Category } from "../lib/supabase";
import { go } from "../lib/router";
import { CAT_GROUPS, CAT_PHOTO, UNS } from "../lib/catPhotos";
import { CatIcon, Icon, Logo } from "./kit";
import { LdLinks, SiteFooter } from "./Landing";

/* mahiman.app/services: every kind of work on Mahi Man, with a photo and what it covers.
   Built from the live categories and skills, so a new skill added in Admin shows here straight away. */

type Skill = { id: number; category_id: number; name: string };
const slug = (g: string) => g.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "");
const nav = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); go(to); };

export function ServicesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    sb.from("categories").select("*").eq("active", true).order("sort").then(({ data }) => setCats((data ?? []) as Category[]));
    sb.from("skills").select("id,category_id,name").eq("active", true).eq("kind", "skill").order("sort").then(({ data }) => setSkills((data ?? []) as Skill[]));
  }, []);

  // Search matches the kind of work or any skill under it.
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return cats.filter((c) => !t || c.name.toLowerCase().includes(t) || skills.some((s) => s.category_id === c.id && s.name.toLowerCase().includes(t)));
  }, [cats, skills, q]);
  const grouped = CAT_GROUPS.map(([g, keys]) => [g, keys.map((k) => shown.find((c) => c.icon === k)).filter(Boolean) as Category[]] as const);
  const rest = shown.filter((c) => !CAT_GROUPS.some(([, keys]) => keys.includes(c.icon ?? "")));

  return (
    <div className="ld sv">
      <header className="ld-nav"><div className="ld-wrap ld-nav-in">
        <a className="brand" href="/" onClick={nav("/")}><Logo /> Mahi Man</a>
        <LdLinks />
      </div></header>

      <section className="sv-hero">
        <div className="ld-wrap">
          <h1>Get help with anything.</h1>
          <p>{cats.length || "All"} kinds of work, done by locals. Find yours, then post it free.</p>
          <label className="sv-search">
            {Icon.search("var(--muted)")}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, like lawn, logo or haircut" />
          </label>
          <div className="sv-jump">
            {CAT_GROUPS.map(([g]) => <a key={g} href={`#${slug(g)}`} onClick={(e) => { e.preventDefault(); document.getElementById(slug(g))?.scrollIntoView({ behavior: "smooth" }); }}>{g}</a>)}
          </div>
        </div>
      </section>

      <div className="sv-body">
        {[...grouped, ["Something else?", rest] as const].filter(([, list]) => list.length).map(([g, list], i) => (
          <section key={g} id={slug(g)} className={i % 2 ? "sv-group alt" : "sv-group"}>
            <div className="ld-wrap">
              <div className="sv-gh"><h2>{g}</h2>{g !== "Something else?" && <span>{list.length} services</span>}</div>
              <div className="sv-grid">
                {list.map((c) => <Card key={c.id} c={c} skills={skills.filter((s) => s.category_id === c.id)} />)}
              </div>
            </div>
          </section>
        ))}
        <div className="ld-wrap sv-end">
          {!shown.length && (
            <div className="sv-none">
              <b>Not listed? Post it anyway.</b>
              <span>Say what you need and we'll match the right people.</span>
            </div>
          )}
          <div className="sv-cta">
            <a className="btn primary" href="/post" onClick={nav("/post")}>Post a job, free {Icon.arrow("#fff")}</a>
            <a className="btn stone" href="/business" onClick={nav("/business")}>For business {Icon.arrow("currentColor")}</a>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function Card({ c, skills }: { c: Category; skills: Skill[] }) {
  const id = CAT_PHOTO[c.icon ?? ""];
  const [ok, setOk] = useState(true);
  const top = skills.slice(0, 4).map((s) => s.name);
  const more = skills.length - top.length;
  return (
    <a className="sv-card" href="/post" onClick={nav("/post")}>
      {id && ok ? <img src={UNS(id, 700)} alt={c.name} loading="lazy" onError={() => setOk(false)} />
        : <span className="sv-noimg"><CatIcon name={c.icon} size={40} color="var(--emerald)" /></span>}
      <b>{c.name}</b>
      {top.length > 0 && <span>{top.join(", ")}{more > 0 ? `, and ${more} more` : ""}</span>}
    </a>
  );
}
