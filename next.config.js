/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['app.abconsultingg.com', 'localhost:3000'] }
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