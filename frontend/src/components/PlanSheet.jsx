import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { DAYN, uid } from '../lib/format.js'
import { useUI } from '../store/useUI.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { starterRoutines } from '../lib/starter.js'

export function PlanSheet({ client, close, onUpdated }) {
  const toast = useUI(s => s.toast)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [routines, setRoutines] = useState([])
  const [week, setWeek] = useState({})
  const [editingRoutine, setEditingRoutine] = useState(null)

  useEffect(() => {
    api('/api/trainer/client/plan?clientId=' + encodeURIComponent(client.clientId))
      .then(d => {
        setRoutines(d.routines || [])
        setWeek(d.week || {})
      })
      .catch(e => toast(e.message || t('Failed to load plan')))
      .finally(() => setLoading(false))
  }, [client.clientId])

  const handleSave = async () => {
    try {
      setSaving(true)
      await api('/api/trainer/client/plan', {
        method: 'PUT',
        body: JSON.stringify({
          clientId: client.clientId,
          routines,
          week
        })
      })
      toast(t('Plan updated for {0}', client.name))
      onUpdated && onUpdated()
      close()
    } catch (e) {
      toast(e.message || t('Failed to save plan'))
    } finally {
      setSaving(false)
    }
  }

  const loadStarter = () => {
    const [push, pull, legs] = starterRoutines()
    const nextR = [...routines, push, pull, legs]
    setRoutines(nextR)
    setWeek(w => ({ ...w, 1: push.id, 3: pull.id, 5: legs.id }))
    toast(t('Starter plan loaded (Mon Push · Wed Pull · Fri Legs)'))
  }

  const addRoutine = () => {
    const r = { id: uid(), name: t('New Routine'), emoji: 'dumbbell', ex: [] }
    setRoutines(prev => [...prev, r])
    setEditingRoutine(r.id)
  }

  const updateRoutineName = (id, name) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, name } : r))
  }

  const removeRoutine = id => {
    setRoutines(prev => prev.filter(r => r.id !== id))
    setWeek(w => {
      const nextW = { ...w }
      Object.keys(nextW).forEach(day => {
        if (nextW[day] === id) delete nextW[day]
      })
      return nextW
    })
  }

  const setDayRoutine = (day, routineId) => {
    setWeek(w => {
      const next = { ...w }
      if (!routineId) delete next[day]
      else next[day] = routineId
      return next
    })
  }

  if (loading) {
    return <div className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>{t('Loading plan…')}</div>
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <h3 style={{ marginBottom: 4 }}>{t('Client Plan')}</h3>
      <div className="muted small" style={{ marginBottom: 14 }}>{client.name}</div>

      {/* Week Schedule Assignment */}
      <h4 className="sec" style={{ marginTop: 6, marginBottom: 8 }}>{t('Weekly Schedule')}</h4>
      <div className="list" style={{ gap: 6, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const assignedId = week[d] || ''
          return (
            <div key={d} className="row between" style={{ padding: '6px 2px', borderBottom: '1px solid var(--sep)' }}>
              <span className="small" style={{ fontWeight: 600 }}>{t(DAYN[d])}</span>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 140, padding: '4px 8px', fontSize: '.85rem' }}
                value={assignedId}
                onChange={e => setDayRoutine(d, e.target.value)}
              >
                <option value="">{t('Rest')}</option>
                {routines.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Routines List */}
      <div className="row between" style={{ marginBottom: 8 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <div className="row" style={{ gap: 6 }}>
          {!routines.length && (
            <Button size="sm" variant="ghost" onClick={loadStarter}>
              {t('Load Starter Plan')}
            </Button>
          )}
          <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>
            {t('New')}
          </Button>
        </div>
      </div>

      {routines.length === 0 ? (
        <div className="dim small" style={{ textAlign: 'center', padding: '16px 0', marginBottom: 16 }}>
          {t('No routines yet. Create one or load the starter plan.')}
        </div>
      ) : (
        <div className="list" style={{ gap: 8, marginBottom: 18 }}>
          {routines.map(r => (
            <div key={r.id} className="card" style={{ padding: '10px 12px' }}>
              <div className="row between">
                <input
                  className="input"
                  style={{ fontWeight: 600, border: 'none', background: 'transparent', padding: '2px 0' }}
                  value={r.name}
                  onChange={e => updateRoutineName(r.id, e.target.value)}
                  placeholder="Routine name"
                />
                <button
                  className="iconbtn"
                  style={{ width: 28, height: 28, color: 'var(--red)', fontSize: 14 }}
                  onClick={() => removeRoutine(r.id)}
                  aria-label="Delete"
                >
                  <Icon name="trash" />
                </button>
              </div>
              <div className="dim small" style={{ marginTop: 4 }}>
                {r.ex?.length || 0} {t('exercises configured')}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? t('Saving…') : t('Save Plan')}
      </Button>
    </div>
  )
}

export function openPlanSheet(client, onUpdated) {
  useUI.getState().openSheet(close => (
    <PlanSheet client={client} close={close} onUpdated={onUpdated} />
  ))
}
