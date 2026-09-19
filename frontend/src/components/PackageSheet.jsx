import { useState } from 'react'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { useUI } from '../store/useUI.js'
import { Button } from '../components/ui.jsx'

function defaultExpiry() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function PackageSheet({ client, close, onUpdated }) {
  const toast = useUI(s => s.toast)
  const pkg = client.activePackage
  const [name, setName] = useState('Paquete 10 Clases')
  const [totalClasses, setTotalClasses] = useState(10)
  const [expiresAt, setExpiresAt] = useState(defaultExpiry())
  const [forceReplace, setForceReplace] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return toast(t('Enter a package name'))
    if (totalClasses <= 0) return toast(t('Classes must be greater than 0'))
    if (!expiresAt) return toast(t('Select an expiration date'))

    try {
      setSaving(true)
      await api('/api/trainer/packages/create', {
        method: 'POST',
        body: JSON.stringify({
          clientId: client.clientId,
          name: name.trim(),
          totalClasses,
          expiresAt: new Date(expiresAt + 'T23:59:59').toISOString(),
          forceReplace
        })
      })
      toast(t('Package assigned successfully'))
      onUpdated && onUpdated()
      close()
    } catch (e) {
      toast(e.message || t('Failed to create package'))
    } finally {
      setSaving(false)
    }
  }

  const handleCancelCurrent = async () => {
    if (!pkg) return
    try {
      setSaving(true)
      await api('/api/trainer/packages/cancel', {
        method: 'POST',
        body: JSON.stringify({ packageId: pkg.id })
      })
      toast(t('Current package cancelled'))
      onUpdated && onUpdated()
      close()
    } catch (e) {
      toast(e.message || t('Failed to cancel package'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <h3 style={{ marginBottom: 4 }}>{t('Manage Package')}</h3>
      <div className="muted small" style={{ marginBottom: 16 }}>
        {client.name}
      </div>

      {/* Current package status */}
      {pkg && pkg.status === 'active' ? (
        <div className="card" style={{ marginBottom: 18, background: 'var(--bg-card-sub, rgba(255,255,255,0.04))' }}>
          <div className="row between">
            <div>
              <div style={{ fontWeight: 600 }}>{pkg.name}</div>
              <div className="dim small">
                {t('Expires {0}', fmtDate(pkg.expiresAt ? pkg.expiresAt.slice(0, 10) : '—'))}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="accent" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {pkg.remainingClasses} / {pkg.totalClasses}
              </span>
              <div className="dim small">{t('classes left')}</div>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <Button variant="danger" size="sm" onClick={handleCancelCurrent} disabled={saving}>
            {t('Cancel this package')}
          </Button>
        </div>
      ) : (
        <div className="dim small" style={{ marginBottom: 14 }}>
          {t('Client does not have an active package.')}
        </div>
      )}

      {/* New package form */}
      <h4 className="sec" style={{ marginTop: 12, marginBottom: 8 }}>{t('New Package')}</h4>

      <label className="dim small">{t('Package Name')}</label>
      <input
        className="input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. 10 Classes"
        maxLength={50}
        style={{ marginTop: 4, marginBottom: 12 }}
      />

      <label className="dim small">{t('Total Classes')}</label>
      <div className="row" style={{ gap: 8, marginTop: 4, marginBottom: 12 }}>
        <button
          className="btn"
          style={{ width: 44, padding: 0 }}
          onClick={() => setTotalClasses(c => Math.max(1, c - 1))}
        >-</button>
        <input
          className="input"
          type="number"
          min="1"
          max="500"
          value={totalClasses}
          onChange={e => setTotalClasses(Math.max(1, +e.target.value || 1))}
          style={{ textAlign: 'center', fontWeight: 600 }}
        />
        <button
          className="btn"
          style={{ width: 44, padding: 0 }}
          onClick={() => setTotalClasses(c => c + 1)}
        >+</button>
      </div>

      <label className="dim small">{t('Expiration Date')}</label>
      <input
        className="input"
        type="date"
        value={expiresAt}
        onChange={e => setExpiresAt(e.target.value)}
        style={{ marginTop: 4, marginBottom: 16 }}
      />

      {pkg && pkg.status === 'active' && (
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            id="forceReplace"
            checked={forceReplace}
            onChange={e => setForceReplace(e.target.checked)}
          />
          <label htmlFor="forceReplace" className="small" style={{ cursor: 'pointer' }}>
            {t('Replace current active package')}
          </label>
        </div>
      )}

      <Button variant="primary" onClick={handleCreate} disabled={saving}>
        {saving ? t('Saving…') : t('Assign Package')}
      </Button>
    </div>
  )
}

export function openPackageSheet(client, onUpdated) {
  useUI.getState().openSheet(close => (
    <PackageSheet client={client} close={close} onUpdated={onUpdated} />
  ))
}
