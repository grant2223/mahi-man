import type { ReactNode } from "react";
import { go } from "../lib/router";
import { StepHero } from "./kit";

export const SUPPORT_EMAIL = "admin@findfitpeople.com";
const OPERATOR = "Find Fit People Pty";
const UPDATED = "7 November 2026";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app">
      <StepHero title={title} sub={`Last updated ${UPDATED}`} onBack={() => (history.length > 1 ? history.back() : go("/"))} />
      <div className="legal">{children}</div>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy">
      <p>More Mahi is run by {OPERATOR} ("we"). This policy explains what we collect, why, and what you can do about it. We follow the Australian Privacy Principles.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address and profile photo.</li>
        <li>ID check: a photo of your passport, national ID card or driver licence and a selfie. These are seen only by the More Mahi team, used only to confirm who you are, and deleted as soon as the check is decided. We keep the result (verified or not) and the ID type and country.</li>
        <li>Jobs: the job you book or take, the photos and video you add, your description, the address and suburb, times, prices and reviews.</li>
        <li>Messages you send through the app.</li>
        <li>Workers: ABN, suburb and travel distance, the job types you do, and an insurance certificate if you upload one.</li>
        <li>Basic technical information needed to run the app, such as sign-in times.</li>
      </ul>
      <p>We do not track you across other apps or websites and we do not sell your information.</p>
      <h2>Why we use it</h2>
      <p>To match jobs with nearby workers, show each side who they are dealing with, keep people safe, handle reports and disputes, and meet our legal obligations.</p>
      <h2>Who sees what</h2>
      <ul>
        <li>Workers who can take a job see its photos, video, description, suburb and the customer's first name, last initial, photo and whether they are ID verified. The street address is only shown to the worker who takes the job.</li>
        <li>Customers see their worker's first name, last initial, photo, rating and whether they are ID verified.</li>
        <li>Phone numbers and email addresses are never shown to the other person.</li>
      </ul>
      <h2>Voice input</h2>
      <p>If you use "Just say it", your phone's speech service turns your voice into text, and the text may be tidied up by an AI service before you see it. You can always edit it, or type instead.</p>
      <h2>Where it is stored</h2>
      <p>Your information is stored with our hosting provider, Supabase, in its Sydney, Australia region. Some service providers we use may process information outside Australia.</p>
      <h2>Keeping and deleting</h2>
      <p>You can delete your account at any time in Settings. This deletes your profile, photos, ID check, messages and reviews straight away. Jobs you finished stay in the other person's history without your name.</p>
      <h2>Your rights</h2>
      <p>You can ask to see or correct the information we hold about you, or complain about how we have handled it, by emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. If you're not happy with our answer you can contact the Office of the Australian Information Commissioner at oaic.gov.au.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use">
      <p>These terms apply when you use More Mahi, run by {OPERATOR}. By creating an account you agree to them.</p>
      <h2>What More Mahi is</h2>
      <p>More Mahi is a marketplace. We connect people who need a job done with independent local workers. We are not the worker's employer and we do not do the work ourselves. Each worker runs their own business under their own ABN and is responsible for their own tax, insurance and the quality of their work.</p>
      <h2>Bookings and prices</h2>
      <ul>
        <li>Every job has a fixed price that covers what is listed as included. Anything not included needs the customer's agreement in the app before it is done.</li>
        <li>During the Cairns pilot, the customer pays the worker directly by PayID or cash when the job is finished, never before.</li>
        <li>Customers can cancel free of charge before a worker arrives.</li>
      </ul>
      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over and give your real name and a real photo of yourself.</li>
        <li>Workers must verify their ID before taking jobs. Customers may be asked to verify too.</li>
        <li>Keep your password private. You are responsible for what happens on your account.</li>
      </ul>
      <h2>Behaviour</h2>
      <p>No abuse, harassment, threats, discrimination, sexual content, scams or illegal work. Don't ask for or share phone numbers to take jobs off the app. Report anything unsafe using Report in the app, or call 000 in an emergency. We review every report within 24 hours and can pause or remove accounts.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, we are not responsible for the work a worker does or for loss or damage that happens during a job. Nothing in these terms limits your rights under the Australian Consumer Law.</p>
      <h2>Changes and contact</h2>
      <p>We may update these terms and will tell you in the app when we do. These terms are governed by the laws of Queensland. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </Page>
  );
}

export function Support() {
  return (
    <Page title="Help">
      <h2>Something urgent or unsafe?</h2>
      <p>Call 000 in an emergency. Then use Report on the job or the person's profile in the app so we can act.</p>
      <h2>Contact us</h2>
      <p>Email <a href={`mailto:${SUPPORT_EMAIL}?subject=More%20Mahi%20help`}>{SUPPORT_EMAIL}</a>. We reply within one business day, and review reports within 24 hours.</p>
      <h2>Common questions</h2>
      <p><b className="w5">When do I pay?</b> When the job is finished, directly to your worker by PayID or cash. Never before.</p>
      <p><b className="w5">What if the job is bigger than booked?</b> Your worker asks for the extra in the app. Nothing extra is owed unless you approve it.</p>
      <p><b className="w5">How do I delete my account?</b> Settings, then Delete account.</p>
      <p><b className="w5">How do I become a worker?</b> Go to <a href="/work" onClick={(e) => { e.preventDefault(); go("/work"); }}>Work with More Mahi</a>. You'll need a photo, an ABN and your passport or national ID.</p>
    </Page>
  );
}
