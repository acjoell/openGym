import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { openPackageSheet } from '../components/PackageSheet.jsx'
import { openPlanSheet } from '../components/PlanSheet.jsx'

export default function TrainerDashboard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [checkingIn, setCheckingIn] = useState({})

  const loadData = async () => {
    try {
      setLoading(true)
      const { clients: list } = await api('/api/trainer/clients')
      
      // Load active packages in parallel for each client
      const enriched = await Promise.all(
        list.map(async client => {
          try {
            const data = await api('/api/trainer/packages?clientId=' + encodeURIComponent(client.clientId))
            return { ...client, activePackage: data.activePackage || null, packages: data.packages || [] }
          } catch {
            return { ...client, activePackage: null, packages: [] }
          }
        })
      )
      setClients(enriched)
    } catch (e) {
      toast(e.message || t('Failed to load clients'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role !== 'trainer') {
      nav('/home')
      return
    }
    loadData()
  }, [user])

  const handleCheckin = async (clientId, clientName) => {
    if (checkingIn[clientId]) return
    setCheckingIn(prev => ({ ...prev, [clientId]: true }))
    try {
      const res = await api('/api/trainer/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify({ clientId })
      })

      if (res.alreadyProcessed) {
        toast(t('Attendance already recorded today for {0}', clientName))
      } else {
        toast(t('Attendance recorded for {0} ({1} classes remaining)', clientName, res.remainingClasses))
      }

      // Local optimistic update
      setClients(prev => prev.map(c => {
        if (c.clientId !== clientId) return c
        if (!c.activePackage) return c
        return {
          ...c,
          activePackage: {
            ...c.activePackage,
            remainingClasses: res.remainingClasses,
            status: res.packageStatus
          }
        }
      }))
    } catch (e) {
      toast(e.message || t('Check-in failed'))
    } finally {
      setCheckingIn(prev => ({ ...prev, [clientId]: false }))
    }
  }

  const activeCount = clients.filter(c => c.status === 'active').length
  const expiringSoonCount = clients.filter(c => {
    const pkg = c.activePackage
    if (!pkg || pkg.status !== 'active') return false
    return pkg.remainingClasses <= 3
  }).length

  return (
    <div className="narrow">
      <div className="hdr">
        <div>
          <h1>{t('Trainer Dashboard')}</h1>
          <div className="sub">{t('Manage clients, packages & attendance')}</div>
        </div>
        <button className="iconbtn" onClick={loadData} aria-label={t('Refresh')} title={t('Refresh')}>
          <Icon name="reset" />
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="tiles" style={{ textAlign: 'left', marginBottom: 16 }}>
        <div className="tile">
          <div className="l">{t('Total Clients')}</div>
          <div className="v" style={{ fontSize: '1.25rem' }}>{clients.length}</div>
        </div>
        <div className="tile">
          <div className="l">{t('Active Clients')}</div>
          <div className="v" style={{ fontSize: '1.25rem', color: 'var(--acc)' }}>{activeCount}</div>
        </div>
        <div className="tile">
          <div className="l">{t('Low / Expiring')}</div>
          <div className="v" style={{ fontSize: '1.25rem', color: expiringSoonCount > 0 ? 'var(--red)' : 'var(--label-2)' }}>
            {expiringSoonCount}
          </div>
        </div>
      </div>

      {/* Client List */}
      <div className="row between" style={{ marginBottom: 10, marginTop: 10 }}>
        <h3 style={{ margin: 0 }}>{t('Clients')}</h3>
        <span className="small muted">{clients.length} {t('assigned')}</span>
      </div>

      {loading ? (
        <div className="muted small" style={{ textAlign: 'center', padding: '30px 0' }}>
          {t('Loading clients…')}
        </div>
      ) : clients.length === 0 ? (
        <div className="card empty" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div className="ico" style={{ fontSize: 32, marginBottom: 8, color: 'var(--acc)' }}>
            <Icon name="clipboard" />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('No clients assigned yet')}</div>
          <div className="dim small">{t('Assign clients using your invite code or client ID.')}</div>
        </div>
      ) : (
        <div className="list" style={{ gap: 12 }}>
          {clients.map(c => {
            const pkg = c.activePackage
            const hasClasses = pkg && pkg.status === 'active' && pkg.remainingClasses > 0
            const isLow = pkg && pkg.remainingClasses <= 3
            const isProcessing = checkingIn[c.clientId]

            return (
              <div key={c.clientId} className="card" style={{ padding: 14 }}>
                <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                      {c.name}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <span className={'tag ' + (c.status === 'active' ? 'acc' : '')}>
                        {c.status === 'active' ? t('Active') : c.status === 'paused' ? t('Paused') : t('Archived')}
                      </span>
                      {c.userDisabled && <span className="tag" style={{ color: 'var(--red)' }}>{t('Disabled')}</span>}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      variant="tinted"
                      size="sm"
                      onClick={() => openPlanSheet(c, loadData)}
                      icon="calendar"
                    >
                      {t('Plan')}
                    </Button>
                    <Button
                      variant="tinted"
                      size="sm"
                      onClick={() => openPackageSheet(c, loadData)}
                      icon="tag"
                    >
                      {t('Package')}
                    </Button>
                    <Button
                      variant={hasClasses ? 'primary' : 'ghost'}
                      size="sm"
                      disabled={!hasClasses || isProcessing || c.status !== 'active'}
                      onClick={() => handleCheckin(c.clientId, c.name)}
                      icon="check"
                    >
                      {isProcessing ? t('Saving…') : hasClasses ? t('Check-in') : t('No classes')}
                    </Button>
                  </div>
                </div>

                {/* Active Package Details */}
                <div style={{
                  background: 'var(--bg-card-sub, rgba(255,255,255,0.04))',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginTop: 8
                }}>
                  {pkg && pkg.status === 'active' ? (
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <div>
                        <div className="small" style={{ fontWeight: 600 }}>{pkg.name}</div>
                        <div className="dim" style={{ fontSize: '.75rem', marginTop: 2 }}>
                          {t('Expires {0}', fmtDate(pkg.expiresAt ? pkg.expiresAt.slice(0, 10) : '—'))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: isLow ? 'var(--red)' : 'var(--acc)'
                        }}>
                          {pkg.remainingClasses} / {pkg.totalClasses}
                        </span>
                        <div className="dim" style={{ fontSize: '.7rem' }}>{t('classes left')}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="row between">
                      <span className="small muted">{t('No active package')}</span>
                      <Button size="sm" variant="ghost" onClick={() => openPackageSheet(c, loadData)}>
                        {t('+ Assign Package')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
