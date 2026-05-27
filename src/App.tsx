import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/Login'
import MisMaterias from './pages/MisMaterias'
import MateriaDetalle from './pages/MateriaDetalle'
import Dashboard from './pages/Dashboard'
import GradesPage from './pages/Grades'
import ReferralsPage from './pages/Referrals'
import AdminPage from './pages/Admin'
import EstadisticasProfesor from './pages/EstadisticasProfesor'
import Simulador from './pages/Simulador'
import AsistenciaProfesor from './pages/AsistenciaProfesor'
import AsistenciaEstudiante from './pages/AsistenciaEstudiante'
import PerfilPage from './pages/Perfil'
import ConsentModal from './components/ConsentModal'
import { consentService } from './services/consentService'
import { useGrades } from './context/GradesContext'
import { ConsentContext } from './context/ConsentContext'

// ─── Error Boundary ──────────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(err: Error): EBState {
    console.error('[ErrorBoundary]', err)
    return { hasError: true, message: err.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-usb-canvas flex items-center justify-center p-8">
          <div className="bg-white border border-usb-border rounded-3xl shadow-modal p-10 max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-extrabold text-usb-text">Ups, algo salió mal</h2>
            <p className="text-usb-muted text-sm">
              No pudimos cargar esta sección. Intenta recargar la página — si el problema continúa, contacta a soporte.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload() }}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              Recargar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Protected route wrapper ─────────────────────────────────────────────────
type AllowedRole = 'student' | 'professor' | 'admin'
function RequireRole({ role, children }: { role: AllowedRole; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) {
    const home = user.role === 'admin' ? '/admin' : user.role === 'professor' ? '/dashboard' : '/'
    return <Navigate to={home} replace />
  }
  return <>{children}</>
}

// ─── Role-based home redirect ────────────────────────────────────────────────
function RoleHome() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin')     return <Navigate to="/admin"     replace />
  if (user.role === 'professor') return <Navigate to="/dashboard" replace />
  return <Navigate to="/" replace />
}

// ─── Professor page components ───────────────────────────────────────────────
function ProfessorDashboard() {
  return <Dashboard />
}

function ProfessorGrades() {
  const navigate = useNavigate()
  const { courseId: urlCourseId } = useParams<{ courseId: string }>()
  const { user, logout } = useAuth()
  const { courseList, grades, lastSaved, selectedCourseId, setSelectedCourseId, updateGrade, updateComponents, updateCuts, refreshCourses } = useGrades()

  // Track whether the initial course-load has completed so we never bounce
  // back to /dashboard before courses arrive from the API.
  const [coursesReady, setCoursesReady] = useState(() => courseList.length > 0)

  useEffect(() => {
    if (user?.professorId) {
      void refreshCourses(user.professorId).then(() => setCoursesReady(true))
    } else {
      setCoursesReady(true)
    }
  }, [user?.professorId, refreshCourses])

  // Sync URL param → selectedCourseId whenever they diverge
  useEffect(() => {
    if (urlCourseId && urlCourseId !== selectedCourseId) {
      setSelectedCourseId(urlCourseId)
    }
  }, [urlCourseId, selectedCourseId, setSelectedCourseId])

  const myCourses = courseList.filter(c => c.professorId === user?.professorId)
  // Prefer the URL param, then the context selection, then the first course
  const activeCourse =
    myCourses.find(c => c.id === urlCourseId) ??
    myCourses.find(c => c.id === selectedCourseId) ??
    myCourses[0] ??
    null

  // Show a spinner while we wait for the initial fetch to complete
  if (!coursesReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas-warm)' }}>
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--green-light)', borderTopColor: 'var(--green-accent)' }}
        />
      </div>
    )
  }

  if (!activeCourse) return <Navigate to="/dashboard" replace />

  return (
    <GradesPage
      course={activeCourse}
      grades={grades}
      lastSaved={lastSaved}
      onUpdateGrade={updateGrade}
      onUpdateComponents={(id, comps) => {
        updateComponents(id, comps)
        setSelectedCourseId(id)
      }}
      onUpdateCuts={(id, cuts) => {
        updateCuts(id, cuts)
        setSelectedCourseId(id)
      }}
      onBack={() => { setSelectedCourseId(null); navigate('/dashboard') }}
      onLogout={logout}
    />
  )
}

// ─── Student consent gate ────────────────────────────────────────────────────
function StudentConsentGate({ onPendingChange }: { onPendingChange: (v: boolean) => void }) {
  const { user, logout } = useAuth()
  const [needsConsent, setNeedsConsent] = useState(false)
  const [termsVersion, setTermsVersion] = useState<string | undefined>(undefined)

  const checkConsent = useCallback(async () => {
    if (!user || user.role !== 'student') {
      setNeedsConsent(false)
      onPendingChange(false)
      return
    }
    try {
      const status = await consentService.getMine()
      setTermsVersion(status.current_terms_version)
      const pending = !status.has_accepted
      setNeedsConsent(pending)
      onPendingChange(pending)
    } catch {
      // Si falla la consulta no bloqueamos la UI
      setNeedsConsent(false)
      onPendingChange(false)
    }
  }, [user, onPendingChange])

  useEffect(() => { void checkConsent() }, [checkConsent])

  const handleAccept = async () => {
    await consentService.accept()
    setNeedsConsent(false)
    onPendingChange(false)
  }

  if (!user || user.role !== 'student') return null

  return (
    <ConsentModal
      open={needsConsent}
      termsVersion={termsVersion}
      onAccept={handleAccept}
      onLogout={logout}
    />
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  const { user } = useAuth()
  const location = useLocation()
  const [consentPending, setConsentPending] = useState(false)

  return (
    <ErrorBoundary>
      <ConsentContext.Provider value={{ consentPending }}>
      <StudentConsentGate onPendingChange={setConsentPending} />
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ minHeight: '100vh' }}
        >
          <Routes location={location}>
            {/* Public */}
            <Route
              path="/login"
              element={user ? <RoleHome /> : <LoginPage />}
            />

            {/* Admin */}
            <Route path="/admin" element={
              <RequireRole role="admin"><AdminPage /></RequireRole>
            } />

            {/* Student */}
            <Route path="/" element={
              <RequireRole role="student"><MisMaterias /></RequireRole>
            } />
            <Route path="/mis-materias" element={<Navigate to="/" replace />} />
            <Route path="/prediccion" element={<Navigate to="/mis-materias" replace />} />
            <Route path="/materia/:courseId" element={
              <RequireRole role="student"><MateriaDetalle /></RequireRole>
            } />
            <Route path="/materia/:courseId/simulador" element={
              <RequireRole role="student"><Simulador /></RequireRole>
            } />

            {/* Professor */}
            <Route path="/dashboard" element={
              <RequireRole role="professor"><Dashboard /></RequireRole>
            } />
            <Route path="/grades/:courseId" element={
              <RequireRole role="professor"><ProfessorGrades /></RequireRole>
            } />
            <Route path="/referrals/:courseId" element={
              <RequireRole role="professor"><ReferralsPage /></RequireRole>
            } />
            {/* Legacy redirects */}
            <Route path="/grades"       element={<Navigate to="/dashboard" replace />} />
            {/* Asistencias con QR */}
            <Route path="/materia/:courseId/asistencia" element={
              <RequireRole role="professor"><AsistenciaProfesor /></RequireRole>
            } />
            <Route path="/asistencia/:sessionId/:token" element={<AsistenciaEstudiante />} />
            <Route path="/asistencia" element={<AsistenciaEstudiante />} />
            <Route path="/estadisticas" element={<Navigate to="/dashboard" replace />} />
            <Route path="/perfil" element={<PerfilPage />} />

            {/* Catch-all */}
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
      </ConsentContext.Provider>
    </ErrorBoundary>
  )
}
