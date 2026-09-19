import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { openPackageSheet } from '../components/PackageSheet.jsx'
import { openPlanSheet } from '../components/PlanSheet.jsx'

function EditClientSheet({ client, close, onUpdated }) {
  const toast = useUI(s => s.toast)
  const [name, setName] = useState(client.name || '')
  const [email, setEmail] = useState(client.email || '')
  const [phone, setPhone] = useState(client.phone || '')
  const [notes, setNotes] = useState(client.notes || '')
  const [status, setStatus] = useState(client.status || 'active')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return toast(t('El nombre es requerido'))
    try {
      setSaving(true)
      await api(`/api/trainer/clients/${client.clientId || client.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          status
        })
      })
      toast(t('Cliente actualizado'))
      onUpdated && onUpdated()
      close()
    } catch (e) {
      toast(e.message || t('Error al actualizar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <h3 style={{ marginBottom: 4 }}>{t('Editar Cliente')}</h3>
      <div className="dim small" style={{ marginBottom: 14 }}>@{client.username}</div>

      <label className="dim small">{t('Nombre Completo')}</label>
      <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 4, marginBottom: 10 }} />

      <label className="dim small">{t('Correo Electrónico')}</label>
      <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@correo.com" style={{ marginTop: 4, marginBottom: 10 }} />

      <label className="dim small">{t('Teléfono')}</label>
      <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 11..." style={{ marginTop: 4, marginBottom: 10 }} />

      <label className="dim small">{t('Estado de la Cuenta')}</label>
      <select className="input" value={status} onChange={e => setStatus(e.target.value)} style={{ marginTop: 4, marginBottom: 10 }}>
        <option value="active">{t('Activo')}</option>
        <option value="paused">{t('Pausado')}</option>
        <option value="pending_activation">{t('Pendiente de Activación')}</option>
        <option value="archived">{t('Archivado')}</option>
      </select>

      <label className="dim small">{t('Notas del Entrenador')}</label>
      <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Objetivos, lesiones, detalles..." style={{ marginTop: 4, marginBottom: 16 }} />

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? t('Guardando…') : t('Guardar Cambios')}
      </Button>
    </div>
  )
}

function ClientDetailSheet({ client, close, onUpdated }) {
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState(client.activationCode || null)

  const loadDetails = async () => {
    try {
      setLoading(true)
      const res = await api(`/api/trainer/clients/${client.clientId || client.id}`)
      setData(res)
      if (res.client.activationCode) setCode(res.client.activationCode)
    } catch (e) {
      toast(e.message || t('Error al cargar detalles'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDetails() }, [client.clientId, client.id])

  const regenCode = async () => {
    try {
      const res = await api(`/api/trainer/clients/${client.clientId || client.id}/code`, {
        method: 'POST',
        body: JSON.stringify({ clientId: client.clientId || client.id })
      })
      setCode(res.code)
      toast(t('Nuevo código generado: {0}', res.code))
      onUpdated && onUpdated()
    } catch (e) {
      toast(e.message || t('Error al generar código'))
    }
  }

  const openEdit = () => {
    useUI.getState().openSheet(c => (
      <EditClientSheet client={{ ...client, ...data?.client }} close={c} onUpdated={() => { loadDetails(); onUpdated && onUpdated() }} />
    ))
  }

  if (loading) return <div className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>{t('Cargando perfil…')}</div>

  const c = data?.client || client
  const pkgs = data?.packages || []
  const atts = data?.attendances || []

  return (
    <div style={{ padding: '4px 0' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{c.name}</h3>
          <div className="dim small" style={{ marginTop: 2 }}>@{c.username} • {c.email || t('Sin correo')}</div>
        </div>
        <Button size="sm" variant="tinted" icon="gear" onClick={openEdit}>
          {t('Editar')}
        </Button>
      </div>

      {/* Badge de Estado y Código */}
      <div className="card" style={{ background: 'var(--bg-card-sub, rgba(255,255,255,0.04))', marginBottom: 14 }}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{t('Estado')}</div>
            <span className={'tag ' + (c.status === 'active' ? 'acc' : '')} style={{ marginTop: 4 }}>
              {c.status === 'active' ? t('Activo') : c.status === 'paused' ? t('Pausado') : t('Pendiente de Activación')}
            </span>
          </div>
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{t('Código de Activación')}</div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <span className="tag" style={{ color: 'var(--amber, #f59e0b)', fontWeight: 700, letterSpacing: '.1em' }}>
                {code || '—'}
              </span>
              <button className="iconbtn" style={{ width: 26, height: 26, fontSize: 13 }} onClick={regenCode} title={t('Generar nuevo código')}>
                <Icon name="reset" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Membresía y Paquetes */}
      <h4 className="sec" style={{ marginTop: 12, marginBottom: 6 }}>{t('Paquetes y Membresía')}</h4>
      {pkgs.length === 0 ? (
        <div className="dim small" style={{ marginBottom: 12 }}>{t('No tiene paquetes asignados.')}</div>
      ) : (
        <div className="list" style={{ gap: 6, marginBottom: 14 }}>
          {pkgs.map(p => (
            <div key={p.id} className="card" style={{ padding: '8px 12px' }}>
              <div className="row between">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.name}</div>
                  <div className="dim small">{t('Vence: {0}', fmtDate(p.expiresAt ? p.expiresAt.slice(0, 10) : '—'))}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, color: p.remainingClasses > 3 ? 'var(--acc)' : 'var(--red)' }}>
                    {p.remainingClasses} / {p.totalClasses}
                  </span>
                  <div className="dim small">{t('clases')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historial de Asistencias */}
      <h4 className="sec" style={{ marginTop: 12, marginBottom: 6 }}>{t('Últimas Asistencias')}</h4>
      {atts.length === 0 ? (
        <div className="dim small" style={{ marginBottom: 12 }}>{t('Sin asistencias registradas aún.')}</div>
      ) : (
        <div className="list" style={{ gap: 4, maxHeight: 150, overflowY: 'auto', marginBottom: 14 }}>
          {atts.map(a => (
            <div key={a.id} className="row between" style={{ padding: '6px 2px', borderBottom: '1px solid var(--sep)', fontSize: '.85rem' }}>
              <span>📅 {fmtDate(a.date)}</span>
              <span className="dim">{a.note || t('Asistencia confirmada')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rutinas & Plan */}
      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <Button variant="tinted" style={{ flex: 1, justifyContent: 'center' }} icon="calendar" onClick={() => { close(); openPlanSheet(client, onUpdated) }}>
          {t('Plan y Rutinas')}
        </Button>
        <Button variant="primary" style={{ flex: 1, justifyContent: 'center' }} icon="tag" onClick={() => { close(); openPackageSheet(client, onUpdated) }}>
          {t('Asignar Paquete')}
        </Button>
      </div>
    </div>
  )
}

function CreateClientSheet({ close, onCreated }) {
  const toast = useUI(s => s.toast)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [totalClasses, setTotalClasses] = useState(10)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return toast(t('Ingresa el nombre del cliente'))
    try {
      setSaving(true)
      const res = await api('/api/trainer/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          totalClasses: +totalClasses || 10
        })
      })
      toast(t('Cliente creado con código de activación: {0}', res.client.activationCode))
      onCreated && onCreated(res.client)
      close()
    } catch (e) {
      toast(e.message || t('Error al crear cliente'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <h3 style={{ marginBottom: 4 }}>{t('Nuevo Cliente')}</h3>
      <div className="dim small" style={{ marginBottom: 14 }}>
        {t('Crea un nuevo perfil. Se generará un código para que el cliente active su cuenta.')}
      </div>

      <label className="dim small">{t('Nombre Completo')}</label>
      <input
        className="input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="ej. Juan Pérez"
        maxLength={50}
        autoFocus
        style={{ marginTop: 4, marginBottom: 12 }}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
      />

      <label className="dim small">{t('Correo Electrónico (opcional)')}</label>
      <input
        className="input"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="juan@ejemplo.com"
        style={{ marginTop: 4, marginBottom: 12 }}
      />

      <label className="dim small">{t('Paquete Inicial de Clases')}</label>
      <input
        className="input"
        type="number"
        min="0"
        max="200"
        value={totalClasses}
        onChange={e => setTotalClasses(Math.max(0, +e.target.value || 0))}
        style={{ marginTop: 4, marginBottom: 18 }}
      />

      <Button variant="primary" onClick={handleCreate} disabled={saving}>
        {saving ? t('Creando…') : t('Crear Cliente y Generar Código')}
      </Button>
    </div>
  )
}

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
      setClients(list || [])
    } catch (e) {
      toast(e.message || t('Error al cargar clientes'))
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
        toast(t('Asistencia ya registrada hoy para {0}', clientName))
      } else {
        toast(t('Asistencia registrada para {0} ({1} clases restantes)', clientName, res.remainingClasses))
      }

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
      toast(e.message || t('Error al registrar asistencia'))
    } finally {
      setCheckingIn(prev => ({ ...prev, [clientId]: false }))
    }
  }

  const openNewClient = () => {
    useUI.getState().openSheet(close => (
      <CreateClientSheet close={close} onCreated={loadData} />
    ))
  }

  const openClientDetails = (c) => {
    useUI.getState().openSheet(close => (
      <ClientDetailSheet client={c} close={close} onUpdated={loadData} />
    ))
  }

  const activeCount = clients.filter(c => c.status === 'active').length
  const pendingCount = clients.filter(c => c.status === 'pending_activation').length
  const expiringSoonCount = clients.filter(c => {
    const pkg = c.activePackage
    if (!pkg || pkg.status !== 'active') return false
    return pkg.remainingClasses <= 3
  }).length

  const signOut = useStore(s => s.signOut)
  const handleSignOut = () => {
    confirmSheet({
      title: t('¿Cerrar sesión?'),
      message: t('¿Deseas salir de tu cuenta de entrenador?'),
      confirmText: t('Cerrar sesión'),
      danger: true,
      onConfirm: async () => {
        await signOut()
        nav('/home')
      }
    })
  }

  return (
    <div className="narrow">
      <div className="hdr">
        <div>
          <h1>{t('Panel de Entrenador')}</h1>
          <div className="sub">{t('Gestión de clientes, paquetes y asistencias')}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="tinted" size="sm" icon="plus" onClick={openNewClient}>
            {t('Nuevo Cliente')}
          </Button>
          <button className="iconbtn" onClick={loadData} aria-label={t('Actualizar')} title={t('Actualizar')}>
            <Icon name="reset" />
          </button>
          <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Configuración')} title={t('Configuración')}>
            <Icon name="gear" />
          </button>
          <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={handleSignOut} aria-label={t('Cerrar sesión')} title={t('Cerrar sesión')}>
            <Icon name="signOut" />
          </button>
        </div>
      </div>

      {/* Métricas del Dashboard */}
      <div className="tiles" style={{ textAlign: 'left', marginBottom: 16 }}>
        <div className="tile">
          <div className="l">{t('Total')}</div>
          <div className="v" style={{ fontSize: '1.25rem' }}>{clients.length}</div>
        </div>
        <div className="tile">
          <div className="l">{t('Activos')}</div>
          <div className="v" style={{ fontSize: '1.25rem', color: 'var(--acc)' }}>{activeCount}</div>
        </div>
        <div className="tile">
          <div className="l">{t('Por Activar')}</div>
          <div className="v" style={{ fontSize: '1.25rem', color: pendingCount > 0 ? 'var(--amber, #f59e0b)' : 'var(--label-2)' }}>
            {pendingCount}
          </div>
        </div>
        <div className="tile">
          <div className="l">{t('Por Vencer')}</div>
          <div className="v" style={{ fontSize: '1.25rem', color: expiringSoonCount > 0 ? 'var(--red)' : 'var(--label-2)' }}>
            {expiringSoonCount}
          </div>
        </div>
      </div>

      {/* Lista de Clientes */}
      <div className="row between" style={{ marginBottom: 10, marginTop: 10 }}>
        <h3 style={{ margin: 0 }}>{t('Clientes Asignados')}</h3>
        <span className="small muted">{clients.length} {t('clientes')}</span>
      </div>

      {loading ? (
        <div className="muted small" style={{ textAlign: 'center', padding: '30px 0' }}>
          {t('Cargando clientes…')}
        </div>
      ) : clients.length === 0 ? (
        <div className="card empty" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div className="ico" style={{ fontSize: 32, marginBottom: 8, color: 'var(--acc)' }}>
            <Icon name="clipboard" />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('No tienes clientes asignados')}</div>
          <div className="dim small" style={{ marginBottom: 14 }}>{t('Crea tu primer cliente para comenzar.')}</div>
          <Button variant="primary" icon="plus" onClick={openNewClient}>
            {t('Agregar Cliente')}
          </Button>
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
                  <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => openClientDetails(c)}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                      {c.name}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className={'tag ' + (c.status === 'active' ? 'acc' : '')}>
                        {c.status === 'active' ? t('Activo') : c.status === 'paused' ? t('Pausado') : t('Pendiente')}
                      </span>
                      {c.activationCode && (
                        <span className="tag" style={{ color: 'var(--amber, #f59e0b)', borderColor: 'rgba(245, 158, 11, 0.3)', fontWeight: 700 }}>
                          {t('Código: {0}', c.activationCode)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botones de Acción Rápida */}
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
                      {t('Paquete')}
                    </Button>
                    <Button
                      variant={hasClasses ? 'primary' : 'ghost'}
                      size="sm"
                      disabled={!hasClasses || isProcessing || c.status !== 'active'}
                      onClick={() => handleCheckin(c.clientId, c.name)}
                      icon="check"
                    >
                      {isProcessing ? t('…') : hasClasses ? t('Asistencia') : t('0 clases')}
                    </Button>
                  </div>
                </div>

                {/* Detalle del Paquete Activo */}
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
                          {t('Vence {0}', fmtDate(pkg.expiresAt ? pkg.expiresAt.slice(0, 10) : '—'))}
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
                        <div className="dim" style={{ fontSize: '.7rem' }}>{t('clases restantes')}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="row between">
                      <span className="small muted">{t('Sin paquete activo')}</span>
                      <Button size="sm" variant="ghost" onClick={() => openPackageSheet(c, loadData)}>
                        {t('+ Asignar Paquete')}
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
