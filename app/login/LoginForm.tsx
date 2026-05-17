'use client'

import { useState } from 'react'
import { loginAction } from './actions'

export default function LoginForm() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await loginAction(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
        <input name="email" type="email" required autoComplete="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
        <input name="password" type="password" required autoComplete="current-password"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
        style={{ background: '#1a2b4a' }}>
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}