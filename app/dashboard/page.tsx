import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export default async function DashboardPage() {
  const cookieStore = cookies()
  const allCookies = cookieStore.getAll()
  const supabase = createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  const start = Date.now()
  let workOrders = null
  let queryError = null
  if (user) {
    const result = await supabase.from('work_orders').select('id, title, stage').limit(10)
    workOrders = result.data
    queryError = result.error
  }
  const elapsed = Date.now() - start

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 14 }}>
      <h1>Dashboard Diagnostic</h1>
      <h2>Auth</h2>
      <p>User: {user?.email || 'NOT LOGGED IN'}</p>
      <p>Auth error: {authError ? JSON.stringify(authError) : 'none'}</p>
      <h2>Cookies sent ({allCookies.length})</h2>
      <pre style={{ background: '#f5f5f5', padding: 10 }}>
        {allCookies.map(c => c.name + ' (' + c.value.length + ' chars)').join('\n')}
      </pre>
      <h2>Data query</h2>
      <p>Time: {elapsed}ms</p>
      <p>Error: {queryError ? JSON.stringify(queryError) : 'none'}</p>
      <p>Rows: {workOrders?.length || 0}</p>
    </div>
  )
}