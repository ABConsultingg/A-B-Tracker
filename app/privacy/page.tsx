import Link from 'next/link'
import PublicFooter from '@/components/layout/PublicFooter'

// Public on purpose: carriers fetch this URL during A2P 10DLC vetting, and it is
// referenced from SMS/WhatsApp consent language. It must never require a login.
export const metadata = {
  title: 'Privacy Policy — A&B Consulting Group',
  description:
    'How A&B Consulting Group collects, uses, and protects personal information, including mobile messaging data.',
}

const UPDATED = 'August 6, 2026'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-gray-900 mt-8 mb-2">{children}</h2>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          ← A&amp;B Tracker
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mt-4">Privacy Policy</h1>
        <p className="text-xs text-gray-500 mt-1">Last updated: {UPDATED}</p>

        <P>
          A&amp;B Consulting Group (&ldquo;A&amp;B,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) is a digital marketing and AI business solutions agency based in Burr
          Ridge, Illinois. This policy explains what personal information we collect, how we use it,
          who we share it with, and the choices you have. It applies to abconsultingg.com, the A&amp;B
          Tracker application at app.abconsultingg.com, our client portal, and our SMS and WhatsApp
          messaging programs.
        </P>

        {/* Required verbatim for A2P 10DLC campaign approval. Do not reword. */}
        <div
          className="rounded-lg border p-4 my-6"
          style={{ background: '#f0f7ff', borderColor: '#bfdbfe' }}
        >
          <h2 className="text-sm font-bold text-gray-900 mb-1">Mobile Information</h2>
          <p className="text-sm text-gray-800 leading-relaxed font-medium">
            We do not share your mobile information or messaging consent with third parties or
            affiliates for marketing or promotional purposes.
          </p>
          <p className="text-sm text-gray-700 leading-relaxed mt-2">
            Mobile phone numbers and messaging consent are collected and used solely to deliver the
            messages you have asked to receive and to support our business relationship with you.
            Text messaging originator opt-in data and consent are never sold, rented, or shared for
            marketing or promotional purposes.
          </p>
        </div>

        <H2>Information We Collect</H2>
        <P>
          <strong>Information you give us.</strong> Your name, business name, job title, email
          address, mailing address, mobile or landline phone number, website, industry, and the
          contents of messages, forms, or assessment requests you submit.
        </P>
        <P>
          <strong>Information from our services.</strong> If you are a client or an authorized user
          of the A&amp;B Tracker, we store records related to your projects — work orders, approvals,
          notes, deliverables, invoices, and communications — along with basic account information.
        </P>
        <P>
          <strong>Information collected automatically.</strong> When you visit our sites we may
          collect IP address, browser and device type, pages viewed, referring page, and time on
          page. We use this to operate and improve our services and to protect against abuse.
        </P>
        <P>
          <strong>Call and message records.</strong> If you call or message a phone number we manage
          on our own or a client&rsquo;s behalf, we may retain the number you called from, the time
          and duration, and a summary or transcript of the conversation for quality, follow-up, and
          record-keeping.
        </P>

        <H2>How We Use Information</H2>
        <P>
          We use personal information to provide and improve our services; respond to inquiries and
          prepare proposals or marketing assessments; deliver the SMS, WhatsApp, and email
          notifications you have consented to; operate client projects and reporting; process
          billing; secure our systems; and meet legal obligations.
        </P>

        <H2>SMS and WhatsApp Messaging</H2>
        <P>
          We send transactional and service messages — such as project updates, assignment and status
          notifications, appointment reminders, and replies to your inquiries — to people who have
          provided their number and consented to receive them. Consent is not a condition of any
          purchase.
        </P>
        <P>
          Message frequency varies with your activity and project. Message and data rates may apply.
          Reply <strong>STOP</strong> to any message to opt out, or <strong>HELP</strong> for
          assistance. Opting out of messages does not remove you from email or affect your service.
          Carriers are not liable for delayed or undelivered messages. See our{' '}
          <Link href="/terms" className="text-blue-700 hover:underline">
            Terms of Service
          </Link>{' '}
          for the full messaging terms.
        </P>

        <H2>How We Share Information</H2>
        <P>
          We do not sell your personal information, and — as stated above — we do not share mobile
          information or messaging consent with third parties or affiliates for marketing or
          promotional purposes. We share information only in these limited circumstances:
        </P>
        <ul className="text-sm text-gray-700 leading-relaxed mb-3 list-disc pl-6 space-y-1">
          <li>
            <strong>Service providers</strong> that operate our infrastructure under contract and may
            process data only on our instructions — for example messaging, email, hosting, database,
            analytics, and CRM providers.
          </li>
          <li>
            <strong>At your direction</strong>, such as when we coordinate with a vendor or partner on
            your project.
          </li>
          <li>
            <strong>Legal and safety reasons</strong>, when required by law or to protect our rights,
            our clients, or the public.
          </li>
          <li>
            <strong>Business transfers</strong>, if we are involved in a merger, acquisition, or sale
            of assets, subject to this policy.
          </li>
        </ul>

        <H2>Data Retention</H2>
        <P>
          We keep personal information for as long as needed to provide our services and to satisfy
          legal, accounting, or reporting requirements. Client project records are generally retained
          for the life of the engagement and a reasonable period afterward. You may request deletion
          as described below.
        </P>

        <H2>Security</H2>
        <P>
          We use access controls, encryption in transit, role-based permissions, and reputable
          infrastructure providers to protect personal information. No method of transmission or
          storage is completely secure, so we cannot guarantee absolute security.
        </P>

        <H2>Your Choices and Rights</H2>
        <P>
          You may request access to, correction of, or deletion of your personal information;
          withdraw messaging consent at any time by replying STOP; and unsubscribe from marketing
          email using the link in any message. Depending on where you live, you may have additional
          rights under applicable law. To exercise any of these, email{' '}
          <a href="mailto:info@abconsultingg.com" className="text-blue-700 hover:underline">
            info@abconsultingg.com
          </a>
          .
        </P>

        <H2>Children&rsquo;s Privacy</H2>
        <P>
          Our services are intended for businesses and are not directed to children under 13, and we
          do not knowingly collect their personal information.
        </P>

        <H2>Changes to This Policy</H2>
        <P>
          We may update this policy from time to time. When we do, we will revise the &ldquo;Last
          updated&rdquo; date above, and material changes will be communicated where appropriate.
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
          <br />
          Web:{' '}
          <a href="https://abconsultingg.com" className="text-blue-700 hover:underline">
            abconsultingg.com
          </a>
        </P>
      </main>
      <PublicFooter />
    </div>
  )
}
