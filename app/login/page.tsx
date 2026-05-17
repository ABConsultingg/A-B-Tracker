export const dynamic = 'force-dynamic'

import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #1a2b4a 0%, #2d4a7c 100%)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl"
               style={{ background: '#1a2b4a', color: '#d99e2b' }}>A</div>
          <div>
            <h1 className="font-bold text-xl text-gray-900">A&amp;B Tracker</h1>
            <p className="text-sm text-gray-500">Work Order Management</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}