// hooks/useGadsCampaignMarkup.ts
import { useState, useEffect, useCallback } from 'react'

type MarkupMap = Record<string, number>

export function useGadsCampaignMarkup(
  clientId: string,
  defaultMarkup: number,
  platform: 'google' | 'meta' = 'google'
) {
  const [overrides, setOverrides] = useState<MarkupMap>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!clientId) return
    setLoaded(false)
    fetch(`/api/reports/gads-markup?client_id=${clientId}&platform=${platform}`)
      .then(r => r.json())
      .then(data => { setOverrides(data.overrides ?? {}); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [clientId, platform])

  const getMarkup = useCallback(
    (campaignId: string) => overrides[campaignId] ?? defaultMarkup,
    [overrides, defaultMarkup]
  )

  const applyMarkup = useCallback(
    (campaignId: string, rawSpend: number) => rawSpend * (1 + getMarkup(campaignId) / 100),
    [getMarkup]
  )

  const saveMarkup = useCallback(
    async (campaignId: string, campaignName: string, markupPct: number) => {
      setSaving(prev => ({ ...prev, [campaignId]: true }))
      setOverrides(prev => ({ ...prev, [campaignId]: markupPct }))
      try {
        const res = await fetch('/api/reports/gads-markup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, platform, campaign_id: campaignId, campaign_name: campaignName, markup_pct: markupPct }),
        })
        if (!res.ok) throw new Error('Save failed')
      } catch {
        setOverrides(prev => { const n = { ...prev }; delete n[campaignId]; return n })
      } finally {
        setSaving(prev => ({ ...prev, [campaignId]: false }))
      }
    },
    [clientId, platform]
  )

  const clearMarkup = useCallback(
    async (campaignId: string) => {
      setOverrides(prev => { const n = { ...prev }; delete n[campaignId]; return n })
      await fetch(`/api/reports/gads-markup?client_id=${clientId}&platform=${platform}&campaign_id=${campaignId}`, { method: 'DELETE' })
    },
    [clientId, platform]
  )

  return { overrides, getMarkup, applyMarkup, saveMarkup, clearMarkup, saving, loaded }
}
