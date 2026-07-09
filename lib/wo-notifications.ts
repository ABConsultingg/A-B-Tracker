export type WoNotificationEvent =
  | { event: 'wo_created';      woId: string }
  | { event: 'wo_assigned';     woId: string; newOwner?: string; addedAssignees?: string[] }
  | { event: 'stage_changed';   woId: string; newStage: string; oldStage: string }
  | { event: 'client_approved'; woId: string }
  | { event: 'client_revision'; woId: string };

export async function notifyWO(payload: WoNotificationEvent): Promise<void> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    await fetch(`${base}/api/notifications/wo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[notifyWO] failed:', err);
  }
}
