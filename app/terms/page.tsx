import Link from 'next/link'
import PublicFooter from '@/components/layout/PublicFooter'

// Public on purpose: carriers review this URL during A2P 10DLC vetting alongside
// the privacy policy. It must never require a login.
export const metadata = {
  title: 'Terms of Service — A&B Consulting Group',
  description:
    'Terms governing use of A&B Consulting Group services, the A&B Tracker application, and our SMS and WhatsApp messaging programs.',
}

const UPDATED = 'August 6, 2026'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-gray-900 mt-8 mb-2">{children}</h2>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
}

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          ← A&amp;B Tracker
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mt-4">Terms of Service</h1>
        <p className="text-xs text-gray-500 mt-1">Last updated: {UPDATED}</p>

        <P>
          These terms govern your use of the websites, applications, and services provided by A&amp;B
          Consulting Group (&ldquo;A&amp;B,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;), including abconsultingg.com, the A&amp;B Tracker application at
          app.abconsultingg.com, our client portal, and our SMS and WhatsApp messaging programs. By
          using our services you agree to these terms.
        </P>

        <H2>Use of Our Services</H2>
        <P>
          The A&amp;B Tracker and client portal are provided for use by A&amp;B personnel and
          authorized client contacts. Accounts are issued to named individuals and must not be
          shared. You are responsible for activity under your account and for keeping your
          credentials secure. You agree not to misuse the services, attempt to access data you are
          not authorized to see, interfere with their operation, or use them to violate any law.
        </P>

        <H2>Client Engagements</H2>
        <P>
          Marketing, advertising, and consulting work is governed by the separate written proposal,
          statement of work, or service agreement executed with each client. Where those documents
          conflict with these terms, the signed agreement controls for that engagement. Program
          pricing is tailored per engagement and is not published here.
        </P>

        <H2>Messaging Program Terms</H2>
        <P>
          <strong>Program description.</strong> A&amp;B sends transactional and service messages by SMS
          and WhatsApp — including project and work-order updates, assignment and status
          notifications, sales pipeline alerts, appointment reminders, and direct replies to your
          inquiries. Messages are sent from{' '}
          <span className="font-mono">+1 (708) 412-6025</span> or a short code or sender ID we
          control.
        </P>
        <P>
          <strong>Consent.</strong> You receive messages only after providing your mobile number and
          agreeing to be contacted — for example by submitting a form, requesting an assessment, or
          confirming with an A&amp;B representative. Consent is not a condition of purchasing any
          product or service.
        </P>
        <P>
          <strong>Message frequency.</strong> Frequency varies based on your activity, your projects,
          and the notifications you have enabled. Recurring messages may be sent.
        </P>
        <P>
          <strong>Cost.</strong> Message and data rates may apply. A&amp;B does not charge for the
          messages themselves; your mobile carrier&rsquo;s standard rates apply.
        </P>
        <P>
          <strong>Opting out.</strong> Reply <strong>STOP</strong> to any message to stop receiving
          messages. You will receive a single confirmation and no further messages unless you opt in
          again.
        </P>
        <P>
          <strong>Help.</strong> Reply <strong>HELP</strong> to any message, or contact{' '}
          <a href="mailto:info@abconsultingg.com" className="text-blue-700 hover:underline">
            info@abconsultingg.com
          </a>{' '}
          for assistance.
        </P>
        <P>
          <strong>Carriers and delivery.</strong> Delivery is subject to effective transmission by
          your mobile carrier and is not guaranteed. Carriers are not liable for delayed or
          undelivered messages.
        </P>
        <P>
          <strong>Privacy.</strong> We do not share your mobile information or messaging consent with
          third parties or affiliates for marketing or promotional purposes. See our{' '}
          <Link href="/privacy" className="text-blue-700 hover:underline">
            Privacy Policy
          </Link>
          .
        </P>

        <H2>Intellectual Property</H2>
        <P>
          The A&amp;B Tracker, our websites, and our underlying software, designs, and documentation
          remain our property. Deliverables produced for a client are owned as set out in that
          client&rsquo;s signed agreement. You may not copy, reverse engineer, or resell our software
          or platform.
        </P>

        <H2>Third-Party Services</H2>
        <P>
          Our services rely on third-party platforms — including messaging, email, advertising,
          analytics, hosting, and CRM providers. Their availability and terms are outside our
          control, and interruptions in those services may affect ours.
        </P>

        <H2>Disclaimers</H2>
        <P>
          Our services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
          without warranties of any kind, express or implied, to the fullest extent permitted by law.
          We do not warrant specific marketing results, rankings, lead volume, or revenue outcomes.
        </P>

        <H2>Limitation of Liability</H2>
        <P>
          To the fullest extent permitted by law, A&amp;B will not be liable for indirect, incidental,
          special, consequential, or punitive damages, or for lost profits, revenue, or data. Our
          total liability arising out of or relating to the services is limited to the amounts you
          paid to us for the services in the three months preceding the claim.
        </P>

        <H2>Termination</H2>
        <P>
          We may suspend or terminate access to the A&amp;B Tracker or portal at any time for
          violation of these terms, non-payment, or to protect our systems or clients. Engagement
          termination is governed by the applicable signed agreement.
        </P>

        <H2>Governing Law</H2>
        <P>
          These terms are governed by the laws of the State of Illinois, without regard to its
          conflict-of-laws rules. Any dispute will be brought in the state or federal courts located
          in Illinois.
        </P>

        <H2>Changes to These Terms</H2>
        <P>
          We may update these terms from time to time. When we do, we will revise the &ldquo;Last
          updated&rdquo; date above. Continued use of our services after a change constitutes
          acceptance.
        </P>

        <H2>Contact Us</H2>
        <P>
          A&amp;B Consulting Group
          <br />
          Burr Ridge, Illinois, United States
          <br />
          Email:{' '}
          <a href="mailto:info@abconsultingg.com" className="text-blue-700 hover:underline">
            info@abconsultingg.com
          </a>
        </P>
      </main>
      <PublicFooter />
    </div>
  )
}
