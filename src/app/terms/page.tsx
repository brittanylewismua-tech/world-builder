import type { Metadata } from "next";
import LegalPage, { Clause } from "@/components/LegalPage";
import { COMPANY, CONTACT, PRODUCT, STATE, SUITE } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms" };

/**
 * The two clauses that actually matter here are 6 and 7.
 *
 * This is a research tool sold to people trying to make money, which puts it
 * one careless sentence away from being an earnings claim. It never promises
 * sales, and it says plainly that the AI is sometimes wrong — because it is,
 * and a customer who learns that from an unpleasant surprise rather than from
 * this page is right to be angry.
 */
export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      intro={`The agreement between you and ${COMPANY} for using ${PRODUCT}. If anything here is unclear, tell us and we will reword it.`}
    >
      <Clause n={1} title="Who this is between">
        <p>
          {PRODUCT} is operated by {COMPANY}
          {STATE ? `, registered in ${STATE}` : ""}. Using it means you accept
          these terms. If you are using it for a business, you are agreeing on
          that business&apos;s behalf.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <p>
          You need an access code to join while {PRODUCT} is in early access.
          Keep your password to yourself; you are responsible for what happens
          under your account. Tell us at{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> if you think somebody
          else is in it.
        </p>
        <p>
          One account is for one person or one business. Sharing a login so
          several people can use it on one subscription will close the
          account.
        </p>
        <p>You must be 18 or over.</p>
      </Clause>

      <Clause n={3} title="What you pay">
        <p>
          Some access to {PRODUCT} is paid, either on its own or as part of
          something else you have bought from {SUITE}. The price, the billing
          period and what is included are whatever you were shown when you
          signed up.
        </p>
        <p>
          Subscriptions renew automatically until you cancel. You can cancel
          any time and you keep access until the end of the period you have
          already paid for. We do not give partial refunds for time you have
          not used, except where the law says we must.
        </p>
        <p>
          If we change the price, we will tell you at least 30 days before it
          affects you, and you can cancel before it does.
        </p>
        <p>
          Where access comes bundled with a program or membership, it ends when
          that ends.
        </p>
      </Clause>

      <Clause n={4} title="Your work stays yours">
        <p>
          Everything you put in — your world, your keywords, your boards, your
          uploads, your conversations — belongs to you. We claim no ownership
          of it and no right to sell it.
        </p>
        <p>
          We need your permission to store it, show it back to you, and send
          the necessary parts to the AI models that produce your results. That
          permission is limited to running the service for you and ends when
          you delete the work.
        </p>
        <p>
          Anything the AI writes for you — a brief, a paper, a pattern — is
          yours to use however you like, including commercially.
        </p>
      </Clause>

      <Clause n={5} title="What you upload">
        <p>
          Only upload things you have the right to upload. Reference images
          collected for research are normally fine. Selling someone
          else&apos;s design as your own is not, and you are responsible for
          that, not us.
        </p>
        <p>
          Do not use {PRODUCT} to copy another seller&apos;s designs. It is
          built to show you what is <em>working</em>, not to reproduce it.
          Copying someone breaks these terms, and it can get your Etsy shop
          closed.
        </p>
        <p>
          We can remove content that breaks these terms or the law, and we will
          tell you why.
        </p>
      </Clause>

      <Clause n={6} title="No promises about your sales">
        <p>
          <strong>
            {PRODUCT} does not promise you will sell anything, or earn
            anything.
          </strong>{" "}
          It is a research tool. What you make of the research, what you make,
          how you price it, how you list it and how the market responds are all
          outside our control and outside our promises.
        </p>
        <p>
          Nothing in this product is a prediction of demand. Sales figures we
          show you about other people&apos;s shops are estimates or public
          counts published by Etsy, not guarantees about anything you do.
        </p>
      </Clause>

      <Clause n={7} title="The AI gets things wrong">
        <p>
          {PRODUCT} uses AI to read designs, write research and hold
          conversations. It gets things wrong. It can misread a picture, draw a
          confident conclusion from a small sample, or describe a trend that
          has already passed.
        </p>
        <p>
          The customer you talk to is a simulation built from research. It is
          not a real person, not a survey, and not evidence about a market.
          Use it to think through ideas, not as proof of anything.
        </p>
        <p>
          Check anything important before you act on it. Treat what you read
          here as a useful opinion, not as fact.
        </p>
      </Clause>

      <Clause n={8} title="Fair use of the service">
        <p>
          Every AI feature has a limit on how often it can run, because each
          run costs us money. The limits are set high enough that normal heavy
          use will not reach them.
        </p>
        <p>
          Do not try to get around them — with extra accounts, automated
          requests, or by calling our interfaces directly. Do not resell access
          or rebuild the product from its outputs.
        </p>
      </Clause>

      <Clause n={9} title="Other people's services">
        <p>
          {PRODUCT} reads public information from Etsy through their official
          API, and from Pinterest if you connect it. We are not affiliated with
          Etsy or Pinterest, and neither endorses us.
        </p>
        <p>
          Those services can change or withdraw access at any time. If they
          do, the features that depend on them may stop working, and we cannot
          guarantee otherwise.
        </p>
      </Clause>

      <Clause n={10} title="Early access">
        <p>
          {PRODUCT} is new and still being built. Features will change, some
          will be removed, and there will be bugs. We will not delete your
          work without warning, but the product may look different from one
          month to the next.
        </p>
      </Clause>

      <Clause n={11} title="Cancelling">
        <p>
          You can cancel at any time, in the app or by emailing us. You can
          delete your worlds whenever you want.
        </p>
        <p>
          We can close an account that breaks these terms. Unless it is
          something serious, we will warn you first and give you a chance to
          fix it, and we will let you take your work with you.
        </p>
      </Clause>

      <Clause n={12} title="What we are liable for">
        <p>
          {PRODUCT} is provided as it is. We do not warrant that it will always
          be available, always be accurate, or fit any particular purpose of
          yours.
        </p>
        <p>
          We are not liable for lost profits, lost sales, or business decisions
          you made after reading something here. Where liability cannot be
          excluded, it is limited to what you paid us in the twelve months
          before the problem.
        </p>
        <p>
          None of this limits liability for our own fraud, or for anything the
          law does not let us limit.
        </p>
      </Clause>

      <Clause n={13} title="Changes to these terms">
        <p>
          If we change these in a way that affects you, we will email you at
          least 30 days beforehand. Carrying on using {PRODUCT} after that
          means you accept the new version.
        </p>
      </Clause>

      <Clause n={14} title="Law">
        <p>
          {STATE
            ? `These terms are governed by the laws of ${STATE}, and any dispute goes to the courts there.`
            : `These terms are governed by the laws of the state in which ${COMPANY} is registered, and any dispute goes to the courts there.`}{" "}
          If you are a consumer somewhere with stronger protections, you keep
          those.
        </p>
      </Clause>
    </LegalPage>
  );
}
