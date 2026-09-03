import type { Metadata } from "next";
import LegalPage, { Clause } from "@/components/LegalPage";
import { COMPANY, CONTACT, PRODUCT, PROCESSORS, STATE } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy" };

/**
 * Written from what the software actually does, not from a template.
 *
 * Every claim here was checked against the code: what the tables hold, what
 * the storage bucket holds, which third parties get called, what the crash
 * reporter sends. A policy that flatters the product is a written record of a
 * promise it does not keep.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      intro={`What ${PRODUCT} collects, why, who else can see it, and how to delete it.`}
    >
      <Clause n={1} title="Who is responsible">
        <p>
          {PRODUCT} is run by {COMPANY}
          {STATE ? `, registered in ${STATE}` : ""}. We decide what is
          collected and why, which makes us the data controller. Write to us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Clause>

      <Clause n={2} title="What we collect">
        <p>
          <strong>Your account.</strong> An email address, and a password we
          never see in readable form. If you sign in with Google, Google tells
          us your email address and nothing else.
        </p>
        <p>
          <strong>What you put in.</strong> Your world&apos;s name, the search
          terms you have researched, the parts of the world you watch, the
          images and notes on your research boards, the designs you upload to a
          drop, and anything you type to your customer or in the Creative Room.
        </p>
        <p>
          <strong>What we fetch for you.</strong> Public information about Etsy
          shops you ask us to follow, and — only if you connect Pinterest — the
          pins on the boards you point us at. Pins are copied into your account
          so they keep working if you later delete them on Pinterest.
        </p>
        <p>
          <strong>What the software records about itself.</strong> Each time an
          AI feature runs, we store which feature, which model, how many tokens
          it used, how long it took and what it cost, against your account. It
          is how we know what the service costs to run. It does not contain
          what you wrote or what came back.
        </p>
        <p>
          <strong>Sign-up protection.</strong> When an account is created we
          check the network address it came from, to stop one person creating
          hundreds of accounts. It is used for that and nothing else.
        </p>
        <p>
          <strong>Crashes.</strong> If the app breaks in your browser it sends
          us the error message and where it happened, so we can fix it. These
          go to our server logs, not to any analytics company.
        </p>
      </Clause>

      <Clause n={3} title="What we do not collect">
        <p>
          We do not use advertising trackers, analytics pixels or third-party
          cookies. There is no advertising on {PRODUCT} and we do not build
          profiles of you for anybody.
        </p>
        <p>
          We never ask for and never hold your Etsy password or your Etsy
          account. Everything we read about Etsy is the public shop information
          anybody can see, read through Etsy&apos;s official API.
        </p>
        <p>
          We do not take payment card details. If you pay for {PRODUCT}, a
          payment provider handles that and we never see your card number.
        </p>
      </Clause>

      <Clause n={4} title="Your work is not training data">
        <p>
          Your worlds, boards, uploads and conversations are never used to
          train AI models — not ours, not anyone&apos;s. We send what is needed
          to Anthropic to produce your result, under commercial terms that
          forbid training on it.
        </p>
        <p>
          We do not read your worlds to build anything for other customers,
          and we do not sell your data to anyone.
        </p>
      </Clause>

      <Clause n={5} title="Who else we share it with">
        <p>
          These companies process data on our behalf so the product can work.
          Each is bound to use it only for that.
        </p>
        <ul>
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.does} ({p.where})
            </li>
          ))}
        </ul>
        <p>
          Both Pinterest and Google are only involved if you choose to use
          them. If you never connect Pinterest, we never contact Pinterest.
        </p>
        <p>
          We may also share information if the law requires it, or to protect
          someone&apos;s safety. If that happens we will tell you, unless we
          are legally prevented from doing so.
        </p>
      </Clause>

      <Clause n={6} title="Other people&apos;s shops">
        <p>
          {PRODUCT} reads public Etsy shops so you can study what already sells
          in your world. That information is about a business, is published by
          Etsy for anyone to see, and we only ever store what their public
          listings show — titles, pictures, prices, view and favourite counts,
          and public reviews.
        </p>
        <p>
          Reviews are written by real people. We use them to understand who
          buys in a market. We do not store reviewer names or any contact
          details, and we never use reviews to identify or contact anyone.
        </p>
      </Clause>

      <Clause n={7} title="Where it is stored and how it is protected">
        <p>
          Everything is stored in the United States. Only your account can
          read your world. That rule is enforced by the database itself rather
          than only by the app, so a bug in the app cannot expose your work to
          another customer. Uploaded images are stored privately and are shown
          to you through links that expire.
        </p>
        <p>
          No system is completely secure. If your data is ever exposed, we
          will tell you as soon as we know.
        </p>
      </Clause>

      <Clause n={8} title="How long we keep it">
        <p>
          Your work stays until you delete it or ask us to. Delete a world and
          everything under it goes with it, including the uploaded files.
        </p>
        <p>
          Two things are kept after you delete a world. Cost records — which
          feature ran, which model, how many tokens, what it cost — are kept
          for our accounting, and contain none of your content. Server and
          crash logs are deleted automatically after about thirty days.
        </p>
      </Clause>

      <Clause n={9} title="Deleting your data">
        <p>
          You can delete your own data at any time, from inside the app,
          without asking us. Deleting a world removes everything in it —
          keywords, boards, uploads, drops and conversations — including the
          image files.
        </p>
        <p>
          That is the fastest way to do it and it needs nothing from us.
        </p>
        <p>
          If you are in the UK or EU, data protection law also gives you the
          right to ask for a copy of what we hold, to have it corrected, or to
          have it deleted, and to complain to your data protection authority.
          Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond
          within one month. Our basis for processing is performing the contract
          you signed up for, and our legitimate interest in keeping the service
          working and unabused.
        </p>
        <p>
          We do not sell or share personal information as US state privacy laws
          define those terms, so there is nothing to opt out of.
        </p>
      </Clause>

      <Clause n={10} title="Children">
        <p>
          {PRODUCT} is a business tool and is not for anyone under 18. We do
          not knowingly collect anything from children. If you believe a child
          has an account, tell us and we will remove it.
        </p>
      </Clause>

      <Clause n={11} title="Changes">
        <p>
          If we change this in a way that matters, we will email you before it
          takes effect rather than quietly changing the date at the top.
        </p>
      </Clause>
    </LegalPage>
  );
}
