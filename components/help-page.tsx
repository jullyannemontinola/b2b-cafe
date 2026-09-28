import Link from "next/link"
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react"
import { TierBadge } from "@/components/tier-badge"
import { EVENT, NAV, organizerContactEmail } from "@/lib/copy"
import { cn } from "@/lib/utils"

// Help, one topic at a time. The topic lives in the URL (?topic=), so links,
// refresh and Back/Forward all land on the same section. Every answer
// describes what the app does today; nothing promises cancellation,
// rescheduling or quotas.

type Role = "participant" | "organizer"
type Topic = { id: string; title: string; body: () => React.ReactNode }

export function helpTopics(role: Role): Topic[] {
  return role === "organizer"
    ? [
        { id: "adding", title: "Adding approved participants", body: Adding },
        { id: "setup", title: "Account setup and invitations", body: Setup },
        { id: "monitoring", title: "Monitoring meetings", body: Monitoring },
        { id: "tables", title: "Tables and Premium tables", body: TablesHelp },
        { id: "faq", title: "Participant questions", body: Faq },
        { id: "event", title: "Event information", body: EventInfo },
        { id: "contact", title: "Participant support contact", body: () => <Contact role="organizer" /> },
      ]
    : [
        { id: "start", title: "Getting started", body: GettingStarted },
        { id: "requesting", title: "Requesting a meeting", body: Requesting },
        { id: "responding", title: "Responding to requests", body: Responding },
        { id: "schedule", title: NAV.schedule, body: Schedule },
        { id: "tiers", title: "B2B tiers", body: Tiers },
        { id: "faq", title: "Frequently asked questions", body: Faq },
        { id: "event", title: "Event information", body: EventInfo },
        { id: "contact", title: "Contact the organizers", body: () => <Contact role="participant" /> },
      ]
}

export function resolveTopic(role: Role, requested: unknown) {
  const topics = helpTopics(role)
  return topics.find((t) => t.id === requested) ?? topics[0]
}

export function HelpPage({ role, topic }: { role: Role; topic: unknown }) {
  const topics = helpTopics(role)
  const current = resolveTopic(role, topic)
  const base = role === "organizer" ? "/admin/help" : "/help"
  const links = (
    <ul className="space-y-0.5">
      {topics.map((t) => {
        const active = t.id === current.id
        return (
          <li key={t.id}>
            <Link
              href={`${base}?topic=${t.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                active ? "bg-secondary font-bold text-primary" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.title}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
      {/* Scrolls on its own on short screens so no topic is ever out of reach. */}
      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
        <h1 className="text-2xl leading-tight">{NAV.help}</h1>
        <nav aria-label="Help topics" className="mt-4 hidden border-l border-border pl-2 lg:block">
          {links}
        </nav>
        {/* key: remount closed after choosing a topic */}
        <details key={current.id} className="group mt-4 rounded-xl border border-border bg-card lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-muted-foreground">Help topics: </span>
              <span className="font-bold">{current.title}</span>
            </span>
            <ChevronDownIcon aria-hidden className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <nav aria-label="Help topics" className="border-t border-border p-2">
            {links}
          </nav>
        </details>
      </aside>

      <article aria-labelledby="topic-title" className="mt-8 max-w-2xl lg:mt-0">
        <h2 id="topic-title" className="text-2xl leading-tight">
          {current.title}
        </h2>
        <div className="mt-5 space-y-3 text-[15px] leading-relaxed [&>h3]:mt-8">
          <current.body />
        </div>
      </article>
    </div>
  )
}

/* ---------- shared bits ---------- */

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2.5 pl-5 marker:font-bold marker:text-primary">{children}</ol>
}
function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base">{children}</h3>
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}
function EventLink() {
  return (
    <a href={EVENT.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
      B2B Café event page <ExternalLinkIcon aria-hidden className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
const Term = ({ children }: { children: React.ReactNode }) => <strong className="font-bold">{children}</strong>

/* ---------- participant topics ---------- */

function GettingStarted() {
  return (
    <Steps>
      <li>
        <Term>Sign in</Term> with the account created for your approved organization. The organizers email a link to set your password.
      </li>
      <li>
        <Term>Browse participants</Term> in <A href="/companies">{NAV.participants}</A>, grouped by B2B tier. Search by organization name.
      </li>
      <li>
        <Term>Review an organization’s details</Term>: what it offers, what it wants to discuss and its contact person.
      </li>
      <li>
        <Term>Request an available meeting time</Term> from the organization’s page. See <A href="/help?topic=requesting">Requesting a meeting</A>.
      </li>
      <li>
        <Term>Check <A href="/inbox">{NAV.requests}</A></Term> for responses and alternative times. See <A href="/help?topic=responding">Responding to requests</A>.
      </li>
      <li>
        <Term>Find confirmed meetings</Term> and their tables in <A href="/agenda">{NAV.schedule}</A>.
      </li>
    </Steps>
  )
}

function Requesting() {
  return (
    <>
      <Steps>
        <li>
          Open an organization from <A href="/companies">{NAV.participants}</A>.
        </li>
        <li>Under Request a meeting, choose a day, then an available time. Meetings are 30 minutes, in Philippine time (UTC+8).</li>
        <li>Add a message if you like (optional, up to 1,000 characters).</li>
        <li>Select Send request. The request appears in {NAV.requests} under Outgoing.</li>
      </Steps>
      <H>Sending a request doesn’t reserve the time</H>
      <Muted>
        The meeting is confirmed only when the other organization accepts and a table is assigned. Until then, either of you can still confirm
        other meetings at that time.
      </Muted>
      <H>Why a time is unavailable</H>
      <Muted>Each unavailable time shows its reason:</Muted>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>You have a meeting: you already have a confirmed meeting then.</li>
        <li>They have a meeting: the other organization does.</li>
        <li>No tables available: every shared table is booked then.</li>
        <li>Dedicated table booked, or no dedicated table set up: the Premium organization’s table can’t be used then.</li>
        <li>Time has passed.</li>
      </ul>
      <Muted>Pending requests don’t block times. Availability is checked again when a meeting is confirmed.</Muted>
      <H>Where the meeting takes place</H>
      <Muted>
        Tables are assigned automatically when a meeting is confirmed. A meeting with a Premium organization uses that organization’s
        dedicated table, whoever sent the request, and times show “Dedicated table”.
        If both organizations are Premium, the organization that received the first request hosts. Other meetings use a shared table, and
        each time shows how many are free. The exact table appears once the meeting is confirmed.
      </Muted>
      <H>One request per organization</H>
      <Muted>
        You can have one meeting request with each organization. If one already exists, the organization’s page links to it instead of
        showing times.
      </Muted>
    </>
  )
}

function Responding() {
  return (
    <>
      <p>
        When a request shows <Term>Your response needed</Term> or <Term>Alternative time suggested</Term>, open it in{" "}
        <A href="/inbox">{NAV.requests}</A> and choose one:
      </p>
      <dl className="space-y-3">
        <div>
          <dt className="font-bold">Confirm meeting</dt>
          <dd className="text-muted-foreground">
            Books the time and assigns a table. If either organization already has a confirmed meeting then, or no table is free, you’ll be
            asked to suggest another time.
          </dd>
        </div>
        <div>
          <dt className="font-bold">Suggest another time</dt>
          <dd className="text-muted-foreground">Choose another available time. The other organization will need to confirm it.</dd>
        </div>
        <div>
          <dt className="font-bold">Decline request</dt>
          <dd className="text-muted-foreground">Closes the request. Neither organization can send the other a new one.</dd>
        </div>
      </dl>
      <H>Taking turns</H>
      <Muted>
        Only the organization that received the latest time can respond. After you send a request or suggest a time, it shows “Awaiting” and
        their name until they respond.
      </Muted>
      <H>New activity</H>
      <Muted>Requests with new activity are marked New, and the count appears next to {NAV.requests} in the main navigation.</Muted>
    </>
  )
}

function Schedule() {
  return (
    <>
      <p>
        <A href="/agenda">{NAV.schedule}</A> shows your meetings in Philippine time (UTC+8). Choose a day or both, and switch between List and
        Calendar.
      </p>
      <H>List</H>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Confirmed meetings, with time and table.</li>
        <li>Awaiting response: requests that aren’t confirmed yet. These times aren’t reserved.</li>
        <li>Past meetings.</li>
      </ul>
      <H>Calendar</H>
      <Muted>
        Confirmed meetings are solid blue blocks. Select one to see its time, table, location and the other organization’s details. Turn on
        Show pending requests to add dashed blocks for requests awaiting a response. Pending requests are not confirmed bookings and may overlap.
      </Muted>
    </>
  )
}

function Tiers() {
  const rows = [
    ["premium", "Listed first, with larger cards."],
    ["access", "Listed second."],
    ["matching_pool", "Listed third, with compact cards."],
  ] as const
  return (
    <>
      <p>Each badge shows the organization’s B2B Café participation tier.</p>
      <dl className="divide-y divide-border border-y border-border">
        {rows.map(([tier, text]) => (
          <div key={tier} className="grid gap-2 py-3 sm:grid-cols-[11rem_1fr] sm:items-center">
            <dt>
              <TierBadge tier={tier} />
            </dt>
            <dd className="text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
      <Muted>
        In this platform, tiers only affect how prominently organizations are listed. They don’t change who you can request, which times are
        available or how meetings are confirmed. Participation packages are described on the <EventLink />.
      </Muted>
    </>
  )
}

function Faq() {
  const contact = organizerContactEmail()
  const items: [string, React.ReactNode][] = [
    [
      "How do I get an account?",
      "Accounts are created by the B2B Café organizers for organizations approved to take part. The contact person receives an email with a link to set a password. There’s one account per organization.",
    ],
    [
      "Can I register for the event here?",
      <>
        No. This platform is only for scheduling meetings between approved participants. Register through the{" "}
        <a href={EVENT.registrationUrl} target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-4 hover:underline">
          event registration form<span className="sr-only"> (opens in a new tab)</span>
        </a>
        . The organizers review registrations, and approved participants receive instructions to access this platform.
      </>,
    ],
    ["What do the B2B tier badges mean?", "They show each organization’s participation tier. Tiers only change how prominently organizations are listed."],
    ["Does sending a request reserve the time?", "No. The meeting is confirmed only when the other organization accepts and a table is assigned."],
    ["How do I suggest another time?", "Open the request in Meeting requests. When your response is needed, select Suggest another time, choose an available time and send it."],
    ["Where can I check my confirmed meeting and table?", "In My schedule, and on the meeting request itself."],
    [
      "Why is a time unavailable?",
      "You or the other organization already has a confirmed meeting then, no table is available, or the time has passed. The reason is shown on each time.",
    ],
    ["Which timezone is used?", "Philippine time (UTC+8), everywhere in B2B Café."],
    ["Why am I awaiting another organization’s response?", "Organizations take turns. After you send a request or suggest a time, only the other organization can respond."],
    ["What should I do if my organization’s details are incorrect?", "Participants can’t edit their own details. Contact the B2B Café organizers to update them."],
    [
      "Who can help with access or scheduling problems?",
      contact ? (
        <>
          The B2B Café organizers, at{" "}
          <a href={`mailto:${contact}`} className="font-semibold text-primary hover:underline">
            {contact}
          </a>
          .
        </>
      ) : (
        <>
          The B2B Café organizers, through the <EventLink />.
        </>
      ),
    ],
  ]
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map(([q, a]) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 font-semibold focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <p className="pb-4 text-muted-foreground">{a}</p>
        </details>
      ))}
    </div>
  )
}

function EventInfo() {
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Event</dt>
        <dd className="font-semibold">
          {EVENT.name} at the {EVENT.hostEvents}
        </dd>
        <dt className="text-muted-foreground">Dates</dt>
        <dd className="font-semibold">{EVENT.dates}</dd>
        <dt className="text-muted-foreground">Venue</dt>
        <dd className="font-semibold">{EVENT.venue}</dd>
        <dt className="text-muted-foreground">Timezone</dt>
        <dd className="font-semibold">Philippine time (UTC+8)</dd>
        <dt className="text-muted-foreground">Official page</dt>
        <dd>
          <EventLink />
        </dd>
      </dl>
      <Muted>Registration, participation packages and other published event details are on the official event page.</Muted>
    </>
  )
}

function Contact({ role }: { role: Role }) {
  const contact = organizerContactEmail()
  if (contact)
    return (
      <p>
        {role === "organizer" ? "Participants are asked to email " : "For help with your account, organization details or meetings, email "}
        <a href={`mailto:${contact}`} className="font-semibold text-primary underline-offset-4 hover:underline">
          {contact}
        </a>
        .
      </p>
    )
  return role === "organizer" ? (
    <p className="rounded-xl bg-pending-surface px-4 py-3 text-sm text-pending">
      No support contact is configured, so participants are pointed to the official event page only. Set{" "}
      <code className="font-semibold">ORGANIZER_CONTACT_EMAIL</code> in the deployment environment to show a direct address.
    </p>
  ) : (
    <p>
      For access, account or scheduling problems, contact the B2B Café organizers through the <EventLink />.
    </p>
  )
}

/* ---------- organizer topics ---------- */

function TablesHelp() {
  return (
    <>
      <dl className="space-y-3">
        <div>
          <dt className="font-bold">Shared tables</dt>
          <dd className="text-muted-foreground">Host meetings between non-Premium organizations. You set how many there are for each day.</dd>
        </div>
        <div>
          <dt className="font-bold">Dedicated tables</dt>
          <dd className="text-muted-foreground">
            One per Premium organization per day, created automatically when a Premium organization is added or upgraded. Only meetings involving that organization use it, and it never counts towards shared capacity.
          </dd>
        </div>
      </dl>
      <H>Which table a meeting gets</H>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Neither organization Premium: the lowest-numbered free shared table.</li>
        <li>One Premium organization: its dedicated table, whichever organization sent the request or confirmed it.</li>
        <li>Both Premium: the dedicated table of the organization that received the first request, even after suggested times.</li>
      </ul>
      <Muted>
        The table is assigned automatically when the meeting is confirmed; no organizer step is needed. Meetings with a Premium organization
        never use shared tables, so they can be booked even with 0 shared tables. If the needed table isn’t available, the meeting can’t be
        confirmed; it’s never moved to another table.
      </Muted>
      <H>Changing shared tables</H>
      <Steps>
        <li>
          Open <A href="/admin/tables">{NAV.tables}</A>. Each event day has its own row.
        </li>
        <li>Enter that day’s number of shared tables (0 or more) and select Save. The other day doesn’t change.</li>
        <li>For a reduction, review which tables will be switched off, then confirm.</li>
      </Steps>
      <Muted>
        Only tables without confirmed meetings can be switched off. If that isn’t enough, nothing changes and the blocking meetings are listed.
        Tables are never renumbered or deleted. The number you set is the capacity you declare; check separately that the venue can fit it.
      </Muted>
      <H>Assumption</H>
      <Muted>Premium organizations are assumed to attend both event days, so each has a dedicated table on each day.</Muted>
      <H>Table review for existing meetings</H>
      <Muted>
        Meetings confirmed before these rules, or before an organization became Premium, may sit on a shared table. {NAV.tables} lists them
        with the proposed dedicated table. Nothing moves until you apply it; the time stays the same, and both organizations see the new table
        on their meeting request.
      </Muted>
    </>
  )
}

function Adding() {
  return (
    <>
      <Muted>Only register organizations the event team has already approved.</Muted>
      <Steps>
        <li>
          Open <A href="/admin/companies/new">Add approved participant</A>.
        </li>
        <li>Enter the organization details, B2B tier and logo (PNG, JPEG or WebP, up to 5 MB).</li>
        <li>Enter the contact person. Their details are shown to other participants.</li>
        <li>Check the login email. It starts as the business email; change it if the contact signs in with another address.</li>
        <li>Select Add participant and send setup email.</li>
      </Steps>
      <Muted>
        Duplicate organization names and login emails already in use are refused. The login email can’t be changed after registration.
      </Muted>
    </>
  )
}

function Setup() {
  return (
    <>
      <p>
        Every participant you add is approved to take part. Saving creates its login and emails a setup link; the contact sets their own
        password (you never see it) and can then sign in and schedule.
      </p>
      <H>Account status</H>
      <dl className="space-y-2">
        {[
          ["Setup incomplete", "The login wasn’t created. Retry account setup."],
          ["Setup email not sent", "The login exists but no email went out. Retry account setup."],
          ["Invitation sent", "The email provider accepted the setup email. Waiting for the contact to set a password."],
          ["Invitation failed", "The email wasn’t accepted. The error is shown on the participant’s page."],
          ["Account active", "The contact has set a password and can sign in."],
        ].map(([term, text]) => (
          <div key={term}>
            <dt className="font-bold">{term}</dt>
            <dd className="text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
      <H>When setup fails or a link expires</H>
      <Steps>
        <li>
          Open the participant from <A href="/admin/companies?account=awaiting">{NAV.participants}</A> (filter: Awaiting setup) or from Needs
          attention on the Dashboard.
        </li>
        <li>Read the error under Account.</li>
        <li>Select Retry account setup, or Resend setup email if the link expired (links work once and expire after 24 hours).</li>
      </Steps>
      <Muted>If the login email already belongs to another account, setup can’t continue with that address.</Muted>
      <H>Changing a Premium organization’s tier</H>
      <Muted>
        A Premium organization that hosts upcoming confirmed meetings on its dedicated table can’t be moved to another tier; the message lists
        those meetings so you can resolve them first.
      </Muted>
    </>
  )
}

function Monitoring() {
  return (
    <>
      <p>Organizer accounts can see everything but never take part in meetings.</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li>
          <A href="/admin">{NAV.dashboard}</A>: participant readiness by tier, what needs attention, table use per day against capacity, and
          upcoming meetings.
        </li>
        <li>
          <A href="/admin/meetings">{NAV.meetings}</A> › Confirmed meetings: filter by day, table, status and organization.
        </li>
        <li>
          <A href="/admin/meetings?view=negotiations">{NAV.meetings}</A> › Meeting requests: every request, who it’s awaiting, and its full
          history (read-only).
        </li>
      </ul>
    </>
  )
}
