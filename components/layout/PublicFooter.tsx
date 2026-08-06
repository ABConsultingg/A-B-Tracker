import Link from 'next/link'

/**
 * Footer for publicly reachable pages (login, privacy, terms).
 *
 * The Privacy and Terms links must stay publicly accessible without a login:
 * carriers review both URLs as part of A2P 10DLC campaign vetting.
 */
export default function PublicFooter({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const text = tone === 'dark' ? 'rgba(255,255,255,0.65)' : '#6b7280'
  const link = tone === 'dark' ? 'rgba(255,255,255,0.9)' : '#374151'

  return (
    <footer className="w-full py-6 px-4" style={{ color: text }}>
      <div className="max-w-3xl mx-auto flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-4 text-sm">
          <Link href="/privacy" className="hover:underline" style={{ color: link }}>
            Privacy Policy
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:underline" style={{ color: link }}>
            Terms of Service
          </Link>
          <span aria-hidden>·</span>
          <a href="https://abconsultingg.com" className="hover:underline" style={{ color: link }}>
            abconsultingg.com
          </a>
        </div>
        <p className="text-xs">
          © {new Date().getFullYear()} A&amp;B Consulting Group · Burr Ridge, IL
        </p>
      </div>
    </footer>
  )
}
