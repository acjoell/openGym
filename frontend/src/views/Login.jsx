import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { authLogin, authActivate } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function Login() {
  const { setUser, pullState } = useStore()
  const toast = useUI(s => s.toast)

  const [roleChoice, setRoleChoice] = useState(null) // null | 'trainer' | 'client'
  const [clientTab, setClientTab] = useState('login') // 'login' | 'activate'

  // Form states
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [actCode, setActCode] = useState('')
  const [actUsername, setActUsername] = useState('')
  const [actPassword, setActPassword] = useState('')
  const [actPasswordConfirm, setActPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const userRef = useRef(null)
  const codeRef = useRef(null)

  useEffect(() => {
    if (roleChoice === 'trainer' || (roleChoice === 'client' && clientTab === 'login')) {
      setTimeout(() => userRef.current?.focus(), 150)
    } else if (roleChoice === 'client' && clientTab === 'activate') {
      setTimeout(() => codeRef.current?.focus(), 150)
    }
  }, [roleChoice, clientTab])

  const handleTrainerLogin = async (e) => {
    e?.preventDefault()
    const idf = username.trim()
    if (!idf || !password) {
      toast(t('Ingresa usuario y contraseña'))
      return
    }
    try {
      setLoading(true)
      const u = await authLogin(idf, password, 'trainer')
      setUser(u)
      await pullState()
      toast(t('¡Bienvenido, Entrenador {0}!', u.name))
    } catch (err) {
      toast(err.message || t('Error al iniciar sesión'))
    } finally {
      setLoading(false)
    }
  }

  const handleClientLogin = async (e) => {
    e?.preventDefault()
    const idf = username.trim()
    if (!idf || !password) {
      toast(t('Ingresa usuario y contraseña'))
      return
    }
    try {
      setLoading(true)
      const u = await authLogin(idf, password, 'client')
      setUser(u)
      await pullState()
      toast(t('¡Bienvenido, {0}!', u.name))
    } catch (err) {
      toast(err.message || t('Error al iniciar sesión'))
    } finally {
      setLoading(false)
    }
  }

  const handleClientActivate = async (e) => {
    e?.preventDefault()
    const c = actCode.trim().toUpperCase()
    const uName = actUsername.trim()
    if (!c) {
      toast(t('Ingresa el código de activación'))
      return
    }
    if (!actPassword || actPassword.length < 6) {
      toast(t('La contraseña debe tener al menos 6 caracteres'))
      return
    }
    if (actPassword !== actPasswordConfirm) {
      toast(t('Las contraseñas no coinciden'))
      return
    }
    try {
      setLoading(true)
      const u = await authActivate(c, uName, actPassword)
      setUser(u)
      await pullState()
      toast(t('¡Cuenta activada con éxito! Bienvenido, {0}', u.name))
    } catch (err) {
      toast(err.message || t('Error al activar la cuenta'))
    } finally {
      setLoading(false)
    }
  }

  const head = (
    <>
      <div style={{ fontSize: 50, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}>
        <Icon name="dumbbell" />
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.028em', margin: '8px 0 4px' }}>openGym</h1>
    </>
  )
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  return (
    <div className="narrow" style={wrap}>
      {head}

      {!roleChoice ? (
        <>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '8px 0 24px', letterSpacing: '-0.02em' }}>
            {t('¿Cómo quieres ingresar?')}
          </h2>

          <Button
            variant="primary"
            style={{ padding: '16px', fontSize: '1.05rem', justifyContent: 'center' }}
            onClick={() => { setRoleChoice('trainer'); setUsername(''); setPassword('') }}
          >
            🏋️ {t('Soy Entrenador')}
          </Button>

          <div style={{ height: 12 }} />

          <Button
            variant="tinted"
            style={{ padding: '16px', fontSize: '1.05rem', justifyContent: 'center' }}
            onClick={() => { setRoleChoice('client'); setClientTab('login'); setUsername(''); setPassword('') }}
          >
            👤 {t('Soy Cliente')}
          </Button>
        </>
      ) : roleChoice === 'trainer' ? (
        <form onSubmit={handleTrainerLogin} style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: 4, textAlign: 'center' }}>
            🏋️ {t('Acceso de Entrenador')}
          </div>
          <div className="muted small" style={{ marginBottom: 20, textAlign: 'center' }}>
            {t('Ingresa con tu usuario y contraseña')}
          </div>

          <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Usuario o Correo')}</label>
          <input
            ref={userRef}
            className="input"
            type="text"
            placeholder="ej. arvids"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />

          <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Contraseña')}</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', marginBottom: 18 }}
            required
          />

          <Button variant="primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
            {loading ? t('Iniciando sesión…') : t('Iniciar Sesión')}
          </Button>

          <div style={{ height: 16 }} />

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="btn ghost dim"
              style={{ fontSize: '.88rem' }}
              onClick={() => setRoleChoice(null)}
            >
              ← {t('Cambiar tipo de usuario')}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: 4, textAlign: 'center' }}>
            👤 {t('Acceso de Cliente')}
          </div>
          <div className="muted small" style={{ marginBottom: 16, textAlign: 'center' }}>
            {t('Accede a tus entrenamientos, rutinas y membresía')}
          </div>

          {/* Selector de Pestaña Cliente */}
          <div className="row" style={{ background: 'var(--bg-card-sub, rgba(255,255,255,0.06))', padding: 3, borderRadius: 10, marginBottom: 18 }}>
            <button
              type="button"
              className={'btn ' + (clientTab === 'login' ? 'primary' : 'ghost')}
              style={{ flex: 1, padding: '8px', fontSize: '.88rem', justifyContent: 'center' }}
              onClick={() => setClientTab('login')}
            >
              {t('Iniciar Sesión')}
            </button>
            <button
              type="button"
              className={'btn ' + (clientTab === 'activate' ? 'primary' : 'ghost')}
              style={{ flex: 1, padding: '8px', fontSize: '.88rem', justifyContent: 'center' }}
              onClick={() => setClientTab('activate')}
            >
              ✨ {t('Activar Cuenta')}
            </button>
          </div>

          {clientTab === 'login' ? (
            <form onSubmit={handleClientLogin}>
              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Usuario o Correo')}</label>
              <input
                ref={userRef}
                className="input"
                type="text"
                placeholder="ej. carloscliente"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
                autoCapitalize="none"
                autoCorrect="off"
                required
              />

              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Contraseña')}</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', marginBottom: 18 }}
                required
              />

              <Button variant="primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
                {loading ? t('Iniciando sesión…') : t('Iniciar Sesión')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleClientActivate}>
              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Código de Activación')}</label>
              <input
                ref={codeRef}
                className="input"
                type="text"
                placeholder="ej. B07419"
                maxLength={10}
                value={actCode}
                onChange={e => setActCode(e.target.value.toUpperCase())}
                style={{ width: '100%', marginBottom: 12, letterSpacing: '.18em', fontWeight: 700, textAlign: 'center', fontSize: '1.15rem' }}
                required
              />

              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Nombre de Usuario')}</label>
              <input
                className="input"
                type="text"
                placeholder="ej. carlos"
                value={actUsername}
                onChange={e => setActUsername(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
                autoCapitalize="none"
                autoCorrect="off"
              />

              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Nueva Contraseña (mínimo 6 caracteres)')}</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={actPassword}
                onChange={e => setActPassword(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
                required
              />

              <label className="dim small" style={{ display: 'block', marginBottom: 4 }}>{t('Confirmar Contraseña')}</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={actPasswordConfirm}
                onChange={e => setActPasswordConfirm(e.target.value)}
                style={{ width: '100%', marginBottom: 18 }}
                required
              />

              <Button variant="primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
                {loading ? t('Activando cuenta…') : t('Activar y Acceder')}
              </Button>
            </form>
          )}

          <div style={{ height: 16 }} />

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="btn ghost dim"
              style={{ fontSize: '.88rem' }}
              onClick={() => setRoleChoice(null)}
            >
              ← {t('Cambiar tipo de usuario')}
            </button>
          </div>
        </div>
      )}

      <div className="dim small" style={{ marginTop: 28, lineHeight: 1.5 }}>
        {t('Plataforma integral para entrenadores y clientes.')}<br />
        {t('Tus rutinas, métricas y membresía en un solo lugar.')}
      </div>
    </div>
  )
}
