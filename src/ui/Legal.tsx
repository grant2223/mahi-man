import type { ReactNode } from "react";
import { go } from "../lib/router";
import { StepHero } from "./kit";

export const SUPPORT_EMAIL = "hello@mahiman.app";
const UPDATED = "11 November 2026";

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
      <p>This policy explains how Mahi Man ("we") handles your information: what we collect, why, and what you can do about it. We follow the Australian Privacy Principles.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address and profile photo.</li>
        <li>ID check: a photo of your passport, national ID card or driver licence and a selfie. These are seen only by the Mahi Man team, used only to confirm who you are, and deleted as soon as the check is decided. We keep the result (verified or not) and the ID type and country.</li>
        <li>Jobs: the job you book or take, the photos and video you add, your description, the address and suburb, times, prices and reviews. A review is whether you'd recommend the other person, a rating for each thing that matters (for workers: on time, prepared, quality, communication and friendliness; for customers: job description, prepared, paid on completion and respect), and an optional comment.</li>
        <li>Messages you send through the app.</li>
        <li>Workers: PayID or bank account (shown to a customer only once their job is done), ABN if you give one, suburb and travel distance, the job types you do with your skills, experience and gear, and any licences or certificates you add (a photo, the number and the expiry date). These are checked by the Mahi Man team and only "verified" is shown to customers.</li>
        <li>Payments: if you add a card, it is collected and stored by our payment provider, Stripe. We never see or keep your full card number. We keep the card type, last 4 digits and expiry so you can see which card is saved, plus a record of fees charged and refunded.</li>
        <li>Location when you open the app: your phone's location is used on your phone to open on your area and the jobs near you. It isn't sent to us.</li>
        <li>Location on the way to a job: when a worker taps "I'm on my way", their phone's location is shared with that job's customer until they enter the start code. It is never collected at any other time, and the trip is deleted when it ends. We keep where and when the trip started, and where the worker was when they tapped "I'm here", so we can settle a late arrival or a customer who wasn't home.</li>
        <li>Trade jobs: the budget a customer sets; each tradie's price, what it includes and when they can come; a tradie's business name if they give one; their plan, invoices, payments and how many jobs they have left.</li>
        <li>Local offers: which partner offers you see, open and use (call, get directions or copy the code), counted once a day. Partners only ever see totals, never who you are.</li>
        <li>Partners: the business name, ABN, contact name, email, phone and offer a business sends us when it applies, and its invoices.</li>
        <li>Reliability and cancellations: when a job is cancelled, who cancelled, when, and any fee; a worker's strikes and their "Turns up" score; and any credit a customer has.</li>
        <li>Basic technical information needed to run the app, such as sign-in times.</li>
      </ul>
      <p>We do not track you across other apps or websites and we do not sell your information.</p>
      <h2>Why we use it</h2>
      <p>To match jobs with nearby workers, show each side who they are dealing with, keep people safe, handle reports and disputes, and meet our legal obligations.</p>
      <h2>Who sees what</h2>
      <ul>
        <li>Workers who can take a job see its photos, video, description, suburb and the customer's first name, last initial, photo, whether they are ID verified, and their average ratings and how many workers recommend them. The street address is only shown to the worker who takes the job.</li>
        <li>Customers see their worker's first name, last initial, photo, average ratings, how many customers recommend them, their "Turns up" score, skills, experience, gear, verified licences and whether they are ID verified. While the worker is on the way to their job, the customer also sees the worker's location on a map.</li>
        <li>On trade jobs, tradies who can take the job also see the customer's budget, and the customer sees each tradie's price, what it includes, when they can come and their business name. A customer and a tradie who sent a price can message each other before the customer chooses.</li>
        <li>A tradie's plan, invoices and jobs left are only shown to that tradie and the Mahi Man team.</li>
        <li>A worker's strikes are only shown to that worker and the Mahi Man team.</li>
        <li>Phone numbers and email addresses are never shown to the other person.</li>
      </ul>
      <h2>Voice input</h2>
      <p>If you use "Just say it", your phone's speech service turns your voice into text, and the text may be tidied up by an AI service before you see it. You can always edit it, or type instead.</p>
      <h2>Where it is stored</h2>
      <p>Your information is stored with our hosting provider, Supabase, in its Sydney, Australia region. Cards and payments are handled by Stripe. Maps are shown with Apple Maps, and directions open in your phone's maps app. Some service providers we use may process information outside Australia.</p>
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
      <p>These terms apply when you use Mahi Man ("we"). By creating an account you agree to them.</p>
      <h2>What Mahi Man is</h2>
      <p>Mahi Man is a marketplace. We connect people who need a job done with independent local workers. We are not the worker's employer and we do not do the work ourselves. Each worker runs their own business under their own ABN and is responsible for their own tax, insurance and the quality of their work.</p>
      <h2>Bookings and prices</h2>
      <ul>
        <li>Every job has a fixed price that covers what is listed as included. Anything not included needs the customer's agreement in the app before it is done.</li>
        <li>During the pilot, the customer pays the worker directly by bank transfer or cash when the job is finished, never before.</li>
      </ul>
      <h2>Cancelling</h2>
      <ul>
        <li>Customers can cancel free of charge until their worker is on the way. Once the worker is on the way, a cancellation fee applies (shown in the app before you cancel, currently $20), and all of it goes to the worker for their time.</li>
        <li>A worker is on the way from when they tap "I'm on my way". For a job booked for later, this only counts from 60 minutes before the start time.</li>
        <li>Cancelling is free for the customer if the worker is more than 15 minutes past the arrival time they gave, if the worker hasn't moved, or if the worker changed their arrival time and the customer doesn't accept the new time.</li>
        <li>If the customer isn't there or the worker can't get in, the worker waits 15 minutes and can then cancel. The customer pays the cancellation fee to the worker.</li>
        <li>During the pilot, a customer pays a cancellation fee directly to the worker, and can't post another job until it's marked paid. Once card payments start, it's charged to the customer's saved card.</li>
        <li>After 3 late cancellations in 30 days, a customer pays for their next jobs upfront in the app.</li>
        <li>Workers can cancel free of charge more than 2 hours before the start. Within 2 hours it costs the worker $10, and once they're on the way or if they don't turn up, $20. The fee goes to the customer as credit against Mahi Man fees.</li>
        <li>A worker can change their arrival time once per job, before it passes. Their first emergency in 90 days, told to us when they cancel, has no fee.</li>
        <li>A worker gets a strike for cancelling within 2 hours, cancelling on the way, not turning up, or arriving more than 15 minutes after their arrival time. 3 strikes in 30 days takes them offline for 7 days, and 5 in 90 days means we review their account. Strikes last 90 days.</li>
        <li>Storms, emergencies and safety problems are handled through Get help, with no cancellation fee for either side.</li>
        <li>The amounts and times above can change. The app always shows what applies before you cancel.</li>
      </ul>
      <h2>Booking fee</h2>
      <ul>
        <li>When a booking fee applies, it is shown before you post the job. You add a card when you post, and nothing is charged then.</li>
        <li>The fee is charged to your card only when you choose a worker. If nobody is chosen, nothing is charged.</li>
        <li>If the worker you chose cancels or doesn't turn up, your job is reopened and you choose someone else with no new fee.</li>
        <li>If you cancel before your worker is on the way, or the job is never done, the fee is refunded to your card automatically. We can also refund it when we decide a dispute.</li>
        <li>If you cancel once your worker is on the way, the booking fee is not refunded.</li>
        <li>Plus members don't pay booking fees. You get a receipt by email for every fee and every refund.</li>
        <li>By saving a card you allow us to charge the booking fee shown on each job when you choose a worker, and any cancellation fee that applies under Cancelling. You can remove a saved card at any time in Settings.</li>
      </ul>
      <h2>Trade jobs</h2>
      <ul>
        <li>A job that needs a trade licence, such as electrical, plumbing or gas work, is a trade job. Only tradies whose licence and public liability insurance we have checked can see it.</li>
        <li>The customer sets a budget instead of a price. Up to 2 tradies each send a fixed price, what it includes and when they can come. The price the customer chooses becomes the job's fixed price, and the customer pays the tradie directly. Customers pay Mahi Man nothing for trade jobs.</li>
        <li>Tradies pay Mahi Man for trade jobs upfront, one at a time or on a monthly plan. Sending a price uses one job. The job is given back if the customer doesn't reply within 48 hours or cancels before choosing. It is not given back if the customer chooses the other tradie, says no, or the tradie withdraws their price.</li>
        <li>Monthly plans renew each month until stopped, with no contract. Unused jobs roll over for one month. Until card payments start, plans and jobs are paid by invoice and added once paid. Prices include GST where it applies and can change with notice in the app.</li>
        <li>Once a customer chooses a tradie, the job follows the same rules as every other job, including Cancelling.</li>
      </ul>
      <h2>Local offers</h2>
      <ul>
        <li>Offers in the app come from local partner businesses, which pay Mahi Man to show them. Each offer is the partner's own, on its own terms; the partner, not Mahi Man, is responsible for honouring it.</li>
        <li>Partners pay monthly, by invoice until card payments start, with no contract. An offer goes live once the first month is paid and is taken down if a month isn't paid. Prices are shown on the Partner with us page, plus GST.</li>
        <li>We can decline or remove any offer, for example if it is misleading or not honoured.</li>
      </ul>
      <h2>Licences and live location</h2>
      <ul>
        <li>Some skills need a licence or certificate, such as an electrical licence or an RSA. Only workers whose licence we have checked and is in date can take those jobs. Workers must keep their licences current and tell us if one is suspended or cancelled.</li>
        <li>A worker's location is shared with the customer only between tapping "I'm on my way" and entering the start code.</li>
      </ul>
      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over and give your real name and a real photo of yourself.</li>
        <li>Workers must verify their ID before taking jobs. Customers may be asked to verify too.</li>
        <li>Keep access to your email and Apple ID secure, and never share a sign-in code. You are responsible for what happens on your account.</li>
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

// Where Stripe sends a worker after payout setup started in the app.
export function PayoutsDone() {
  return (
    <Page title="Payouts set up">
      <p>Thanks, your payout details are saved with Stripe.</p>
      <p>Go back to the Mahi Man app to keep going. If anything still needs doing, it'll show there.</p>
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
      <p><b className="w5">When do I pay?</b> When the job is finished, directly to your worker by bank transfer or cash. Never before.</p>
      <p><b className="w5">What if the job is bigger than booked?</b> Your worker asks for the extra in the app. Nothing extra is owed unless you approve it.</p>
      <p><b className="w5">How do I become a worker?</b> Go to <a href="/work" onClick={(e) => { e.preventDefault(); go("/work"); }}>Work with Mahi Man</a>. You'll need a photo, your passport or national ID, and your PayID or bank account.</p>
      <h2 id="delete">Delete your account</h2>
      <p>In the app: Settings, then Delete account. It's deleted straight away.</p>
      <p>Can't get into the app? Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20Mahi%20Man%20account`}>{SUPPORT_EMAIL}</a> from the email address you signed up with and we'll delete it within 7 days.</p>
      <p>Deleting removes your profile, photos, ID check, messages and reviews. Jobs you finished stay in the other person's history without your name, and records of fees and payments are kept as long as the law requires.</p>
    </Page>
  );
}
