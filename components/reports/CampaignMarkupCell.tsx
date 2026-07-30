// components/reports/CampaignMarkupCell.tsx
'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  campaignId: string
  campaignName: string
  currentMarkup: number      // effective markup (override or default)
  defaultMarkup: number      // client-level fallback
  isOverride: boolean        // true if this campaign has a saved override
  isSaving: boolean
  onSave: (campaignId: string, campaignName: string, pct: number) => void
  onClear: (campaignId: string) => void
}

export function CampaignMarkupCell({
  campaignId,
  campaignName,
  currentMarkup,
  defaultMarkup,
  isOverride,
  isSaving,
  onSave,
  onClear,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(currentMarkup))
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep draft in sync when override loads
  useEffect(() => {
    if (!editing) setDraft(String(currentMarkup))
  }, [currentMarkup, editing])

  function startEdit() {
    setDraft(String(currentMarkup))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    const pct = parseFloat(draft)
    if (isNaN(pct) || pct < 0) {
      setDraft(String(currentMarkup))
      setEditing(false)
      return
    }
    setEditing(false)
    if (pct === defaultMarkup && isOverride) {
      // Removing override — matches default, so clear it
      onClear(campaignId)
    } else {
      onSave(campaignId, campaignName, pct)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') {
      setDraft(String(currentMarkup))
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={500}
          step={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{
            width: 56,
            padding: '2px 6px',
            border: '1px solid var(--brand-accent, #6366f1)',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'inherit',
            textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
      </div>
    )
  }

  return (
    <div
      onClick={startEdit}
      title={isOverride ? `Click to edit (default is ${defaultMarkup}%)` : 'Click to override markup'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 13,
        background: isOverride ? 'var(--brand-accent-faint, rgba(99,102,241,0.08))' : 'transparent',
        border: isOverride ? '1px solid var(--brand-accent-dim, rgba(99,102,241,0.25))' : '1px solid transparent',
        color: isOverride ? 'var(--brand-accent, #6366f1)' : 'var(--text-muted)',
        fontWeight: isOverride ? 600 : 400,
        transition: 'background 0.15s',
      }}
    >
      {isSaving ? '…' : `${currentMarkup}%`}
      {isOverride && (
        <span
          onClick={e => { e.stopPropagation(); onClear(campaignId) }}
          title="Reset to default"
          style={{ fontSize: 10, opacity: 0.6, lineHeight: 1, marginLeft: 2 }}
        >
          ✕
        </span>
      )}
    </div>
  )
}
