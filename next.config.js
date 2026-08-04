/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['app.abconsultingg.com', 'localhost:3000'] }
  },
  // /dashboard/leads was replaced by /pipeline. Kept as a temporary (307)
  // redirect rather than permanent so browsers don't cache it indefinitely.
  async redirects() {
    return [
      { source: '/dashboard/leads', destination: '/pipeline', permanent: false },
      { source: '/dashboard/leads/:path*', destination: '/pipeline', permanent: false },
    ]
  },
  // Force /login to be dynamic so Server Actions work
  async headers() {
    return [
      {
        source: '/login',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ]
  },
}
module.exports = nextConfig