// SINEVERSE — routing (HashRouter: GitHub Pages has no server fallback,
// so BrowserRouter would 404 on refresh).
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute, { RoleRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AdminDiscussionsPage from './pages/AdminDiscussionsPage'
import AdminPage from './pages/AdminPage'
import AkademiPage from './pages/AkademiPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AssignmentPage from './pages/AssignmentPage'
import { CertificatesPage, VerifyCertificatePage } from './pages/CertificatesPage'
import CommunitiesPage from './pages/CommunitiesPage'
import CommunityDetailPage from './pages/CommunityDetailPage'
import CourseBuilderPage from './pages/CourseBuilderPage'
import CourseDetailPage from './pages/CourseDetailPage'
import CrewFinderPage from './pages/CrewFinderPage'
import EditProfilePage from './pages/EditProfilePage'
import { EventDetailPage, EventsPage } from './pages/EventsPage'
import { CompetitionDetailPage, CompetitionsPage } from './pages/CompetitionsPage'
import { ExamPage, ExamsPage } from './pages/ExamsPage'
import FilmDetailPage from './pages/FilmDetailPage'
import GradebookPage from './pages/GradebookPage'
import GradingQueuePage from './pages/GradingQueuePage'
import HomePage from './pages/HomePage'
import LessonDetailPage from './pages/LessonDetailPage'
import { LibraryDetailPage, LibraryPage } from './pages/LibraryPage'
import LoginPage from './pages/LoginPage'
import MentorPage from './pages/MentorPage'
import ModerationPage from './pages/ModerationPage'
import NotificationPrefsPage from './pages/NotificationPrefsPage'
import NotificationsPage from './pages/NotificationsPage'
import OfficeHoursPage from './pages/OfficeHoursPage'
import PortfolioPage from './pages/PortfolioPage'
import ProfilePage from './pages/ProfilePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectsPage from './pages/ProjectsPage'
import QuizPage from './pages/QuizPage'
import RegisterPage from './pages/RegisterPage'
import RpsEditorPage from './pages/RpsEditorPage'
import RpsPage from './pages/RpsPage'
import SchoolsPage from './pages/SchoolsPage'
import ShowcasePage from './pages/ShowcasePage'

function NotFoundPage() {
  return (
    <div className="page">
      <h1>Halaman tidak ditemukan</h1>
      <p className="muted">Alamat yang kamu buka tidak ada di SINEVERSE.</p>
      <Link to="/" className="btn btn-primary">
        Kembali ke Beranda
      </Link>
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="akademi" element={<AkademiPage />} />
            <Route path="course/:id" element={<CourseDetailPage />} />
            <Route path="lesson/:id" element={<LessonDetailPage />} />
            <Route path="rps" element={<RpsPage />} />
            <Route path="pengumuman" element={<AnnouncementsPage />} />
            {/* Showcase / Library / Events / Competitions: public read */}
            <Route path="showcase" element={<ShowcasePage />} />
            <Route path="showcase/:id" element={<FilmDetailPage />} />
            <Route path="pustaka" element={<LibraryPage />} />
            <Route path="pustaka/:id" element={<LibraryDetailPage />} />
            <Route path="acara" element={<EventsPage />} />
            <Route path="acara/:id" element={<EventDetailPage />} />
            <Route path="kompetisi" element={<CompetitionsPage />} />
            <Route path="kompetisi/:id" element={<CompetitionDetailPage />} />
            <Route path="sertifikat/verifikasi" element={<VerifyCertificatePage />} />
            {/* Assessment (Fase B) */}
            <Route path="kuis/:id" element={<Protected><QuizPage /></Protected>} />
            <Route path="tugas/:id" element={<Protected><AssignmentPage /></Protected>} />
            <Route path="ujian" element={<Protected><ExamsPage /></Protected>} />
            <Route path="ujian/:id" element={<Protected><ExamPage /></Protected>} />
            {/* Notifications (Fase B) */}
            <Route path="notifikasi" element={<Protected><NotificationsPage /></Protected>} />
            <Route path="notifikasi/pengaturan" element={<Protected><NotificationPrefsPage /></Protected>} />
            {/* Community / Schools / Clubs (Fase C) */}
            <Route path="komunitas" element={<Protected><CommunitiesPage /></Protected>} />
            <Route path="komunitas/:id" element={<Protected><CommunityDetailPage /></Protected>} />
            <Route path="sekolah" element={<Protected><SchoolsPage /></Protected>} />
            {/* Projects / Crew Finder (Fase C) */}
            <Route path="proyek" element={<Protected><ProjectsPage /></Protected>} />
            <Route path="proyek/:id" element={<Protected><ProjectDetailPage /></Protected>} />
            <Route path="kru" element={<Protected><CrewFinderPage /></Protected>} />
            {/* Portfolio (Fase C) */}
            <Route path="portofolio" element={<Protected><PortfolioPage /></Protected>} />
            <Route path="portofolio/:userId" element={<Protected><PortfolioPage /></Protected>} />
            {/* Certificates (Fase D) */}
            <Route path="sertifikat" element={<Protected><CertificatesPage /></Protected>} />
            {/* Office hours (Fase D) */}
            <Route path="jam-kantor" element={<Protected><OfficeHoursPage /></Protected>} />
            {/* Existing protected pages */}
            <Route path="nilai" element={<Protected><GradebookPage /></Protected>} />
            <Route path="profil" element={<Protected><ProfilePage /></Protected>} />
            <Route path="profil/edit" element={<Protected><EditProfilePage /></Protected>} />
            {/* Mentor Workspace (Fase D) */}
            <Route
              path="mentor"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/course/:id"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <CourseBuilderPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/penilaian"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <GradingQueuePage />
                </RoleRoute>
              }
            />
            {/* Admin Panel (Fase D) */}
            <Route
              path="admin"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/moderasi"
              element={
                <RoleRoute roles={['admin']}>
                  <ModerationPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/rps"
              element={
                <RoleRoute roles={['admin']}>
                  <RpsEditorPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/diskusi-mentor"
              element={
                <RoleRoute roles={['admin', 'mentor']}>
                  <AdminDiscussionsPage />
                </RoleRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
