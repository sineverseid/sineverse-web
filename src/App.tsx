// SINEVERSE — routing (HashRouter: GitHub Pages has no server fallback,
// so BrowserRouter would 404 on refresh).
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import Layout from './components/Layout'
import ProtectedRoute, { RoleRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import HomePage from './pages/HomePage'

// Code-splitting: halaman dimuat sesuai rute yang dibuka, bukan
// semuanya di depan — bundle awal jadi kecil, muat ulang < 1 detik.
const AdminAcademyAnalyticsPage = lazy(() => import('./pages/AdminAcademyAnalyticsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage'))
const AdminAssignmentsPage = lazy(() => import('./pages/AdminAssignmentsPage'))
const AdminCertificatesPage = lazy(() => import('./pages/AdminCertificatesPage'))
const AdminDiscussionsPage = lazy(() => import('./pages/AdminDiscussionsPage'))
const AdminEnrollmentsPage = lazy(() => import('./pages/AdminEnrollmentsPage'))
const AdminEventsPage = lazy(() => import('./pages/AdminEventsPage'))
const AdminLibraryPage = lazy(() => import('./pages/AdminLibraryPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminQuizzesPage = lazy(() => import('./pages/AdminQuizzesPage'))
const AdminResourcesPage = lazy(() => import('./pages/AdminResourcesPage'))
const AdminSectionsPage = lazy(() => import('./pages/AdminSectionsPage'))
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'))
const AdminSinebotPage = lazy(() => import('./pages/AdminSinebotPage'))
const AdminTicketsPage = lazy(() => import('./pages/AdminTicketsPage'))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const AkademiPage = lazy(() => import('./pages/AkademiPage'))
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'))
const AssignmentPage = lazy(() => import('./pages/AssignmentPage'))
const CertificatesPage = lazy(() => import('./pages/CertificatesPage').then((m) => ({ default: m.CertificatesPage })))
const VerifyCertificatePage = lazy(() => import('./pages/CertificatesPage').then((m) => ({ default: m.VerifyCertificatePage })))
const CommunitiesPage = lazy(() => import('./pages/CommunitiesPage'))
const CommunityDetailPage = lazy(() => import('./pages/CommunityDetailPage'))
const CourseBuilderPage = lazy(() => import('./pages/CourseBuilderPage'))
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'))
const CrewFinderPage = lazy(() => import('./pages/CrewFinderPage'))
const DeadlinesPage = lazy(() => import('./pages/DeadlinesPage'))
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'))
const EventDetailPage = lazy(() => import('./pages/EventsPage').then((m) => ({ default: m.EventDetailPage })))
const EventsPage = lazy(() => import('./pages/EventsPage').then((m) => ({ default: m.EventsPage })))
const CompetitionDetailPage = lazy(() => import('./pages/CompetitionsPage').then((m) => ({ default: m.CompetitionDetailPage })))
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage').then((m) => ({ default: m.CompetitionsPage })))
const ExamPage = lazy(() => import('./pages/ExamsPage').then((m) => ({ default: m.ExamPage })))
const ExamsPage = lazy(() => import('./pages/ExamsPage').then((m) => ({ default: m.ExamsPage })))
const FilmDetailPage = lazy(() => import('./pages/FilmDetailPage'))
const FinalProjectDetailPage = lazy(() => import('./pages/FinalProjectDetailPage'))
const FinalProjectsPage = lazy(() => import('./pages/FinalProjectsPage'))
const GradebookPage = lazy(() => import('./pages/GradebookPage'))
const GradingQueuePage = lazy(() => import('./pages/GradingQueuePage'))
const GrowthPage = lazy(() => import('./pages/GrowthPage'))
const HelpCenterPage = lazy(() => import('./pages/HelpCenterPage'))
const IssueCourseCertificatePage = lazy(() => import('./pages/IssueCourseCertificatePage'))
const LessonDetailPage = lazy(() => import('./pages/LessonDetailPage'))
const LibraryDetailPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryDetailPage })))
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const MentorAnnouncementsPage = lazy(() => import('./pages/MentorAnnouncementsPage'))
const MentorMaterialsPage = lazy(() => import('./pages/MentorMaterialsPage'))
const MentorPage = lazy(() => import('./pages/MentorPage'))
const MentorQuizzesPage = lazy(() => import('./pages/MentorQuizzesPage'))
const MentorRubricsPage = lazy(() => import('./pages/MentorRubricsPage'))
const MentorVideosPage = lazy(() => import('./pages/MentorVideosPage'))
const MentorAnalyticsPage = lazy(() => import('./pages/MentorAnalyticsPage'))
const MentorCourseBuilderPage = lazy(() => import('./pages/MentorCourseBuilderPage'))
const MentorDiscussionsPage = lazy(() => import('./pages/MentorDiscussionsPage'))
  const MentorGroupPage = lazy(() => import('./pages/MentorGroupPage'))
const MentorStudentsPage = lazy(() => import('./pages/MentorStudentsPage'))
const MentorsPage = lazy(() => import('./pages/MentorsPage'))
const ModerationPage = lazy(() => import('./pages/ModerationPage'))
const NotificationPrefsPage = lazy(() => import('./pages/NotificationPrefsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const OfficeHoursPage = lazy(() => import('./pages/OfficeHoursPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const QuizPage = lazy(() => import('./pages/QuizPage'))
const RpsEditorPage = lazy(() => import('./pages/RpsEditorPage'))
const RpsPage = lazy(() => import('./pages/RpsPage'))
const SchoolsPage = lazy(() => import('./pages/SchoolsPage'))
const ShowcasePage = lazy(() => import('./pages/ShowcasePage'))
// Halaman perkenalan fitur (publik, untuk guest): named export dari
// FeatureIntroPage, pola lazy yang sama seperti CertificatesPage.
const IntroAcademyPage = lazy(() => import('./pages/FeatureIntroPage').then((m) => ({ default: m.IntroAcademyPage })))
const IntroCommunityPage = lazy(() => import('./pages/FeatureIntroPage').then((m) => ({ default: m.IntroCommunityPage })))
const IntroProjectsPage = lazy(() => import('./pages/FeatureIntroPage').then((m) => ({ default: m.IntroProjectsPage })))
const IntroShowcasePage = lazy(() => import('./pages/FeatureIntroPage').then((m) => ({ default: m.IntroShowcasePage })))

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
        <Suspense fallback={<div className="page"><p className="muted">Memuat halaman…</p></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="tentang" element={<AboutPage section="tentang" />} />
            <Route path="privasi" element={<AboutPage section="privasi" />} />
            <Route path="syarat" element={<AboutPage section="syarat" />} />
            {/* Pusat Bantuan / SINEBOT (Tahap 2) — publik, bukan Protected. */}
            <Route path="bantuan" element={<HelpCenterPage />} />
            {/* Halaman perkenalan fitur (publik) — tepat di atas rute fitur. */}
            <Route path="akademi/perkenalan" element={<IntroAcademyPage />} />
            <Route path="akademi" element={<AkademiPage />} />
            <Route path="course/:id" element={<CourseDetailPage />} />
            <Route path="lesson/:id" element={<LessonDetailPage />} />
            {/* RPS — kini dijangkau dari Admin Panel (Editor RPS) dan
                Mentor Workspace (tautan di Overview), bukan menu utama. */}
            <Route path="rps" element={<RpsPage />} />
            <Route path="pengumuman" element={<AnnouncementsPage />} />
            {/* Showcase / Library / Events / Competitions: public read */}
            <Route path="showcase/perkenalan" element={<IntroShowcasePage />} />
            <Route path="showcase" element={<ShowcasePage />} />
            <Route path="showcase/:id" element={<FilmDetailPage />} />
            <Route path="pustaka" element={<LibraryPage />} />
            <Route path="pustaka/:id" element={<LibraryDetailPage />} />
            <Route path="acara" element={<EventsPage />} />
            <Route path="acara/:id" element={<EventDetailPage />} />
            <Route path="growth" element={<Protected><GrowthPage /></Protected>} />
            {/* Kompetisi & Sertifikat kini tab di dalam halaman Events (/acara);
                rute lama tetap ada agar tautan/bookmark lama tidak putus. */}
            <Route path="kompetisi" element={<CompetitionsPage />} />
            <Route path="kompetisi/:id" element={<CompetitionDetailPage />} />
            <Route path="sertifikat/verifikasi" element={<VerifyCertificatePage />} />
            {/* Assessment (Fase B) */}
            <Route path="kuis/:id" element={<Protected><QuizPage /></Protected>} />
            <Route path="tugas/:id" element={<Protected><AssignmentPage /></Protected>} />
            <Route path="ujian" element={<Protected><ExamsPage /></Protected>} />
            <Route path="ujian/:id" element={<Protected><ExamPage /></Protected>} />
            {/* Notifications (Fase B) — kini lonceng di header, bukan menu utama. */}
            <Route path="notifikasi" element={<Protected><NotificationsPage /></Protected>} />
            <Route path="notifikasi/pengaturan" element={<Protected><NotificationPrefsPage /></Protected>} />
            {/* Community / Schools / Clubs (Fase C) */}
            <Route path="komunitas/perkenalan" element={<IntroCommunityPage />} />
            <Route path="komunitas" element={<Protected><CommunitiesPage /></Protected>} />
            <Route path="komunitas/:id" element={<Protected><CommunityDetailPage /></Protected>} />
            {/* Mentor Community (Fase 1, migrasi 060/061) — grup resmi admin +
            mentor; RoleRoute menampilkan "Akses terbatas" di tempat
            untuk peran lain (siswa/mentor pending). */}
            <Route
              path="komunitas-mentor"
              element={
              <RoleRoute roles={['mentor', 'admin']}>
                <MentorGroupPage />
              </RoleRoute>
              }
              />
            <Route path="sekolah" element={<Protected><SchoolsPage /></Protected>} />
            {/* Projects / Crew Finder (Fase C) */}
            <Route path="proyek/perkenalan" element={<IntroProjectsPage />} />
            <Route path="proyek" element={<Protected><ProjectsPage /></Protected>} />
            <Route path="proyek/:id" element={<Protected><ProjectDetailPage /></Protected>} />
            <Route path="proyek-akhir" element={<FinalProjectsPage />} />
            <Route path="proyek-akhir/:id" element={<Protected><FinalProjectDetailPage /></Protected>} />
            <Route path="kru" element={<Protected><CrewFinderPage /></Protected>} />
            {/* Portfolio (Fase C) */}
            <Route path="portofolio" element={<Protected><PortfolioPage /></Protected>} />
            <Route path="portofolio/:userId" element={<Protected><PortfolioPage /></Protected>} />
            {/* Direktori Mentor (SINEVERSE Mentors) */}
            <Route path="mentors" element={<Protected><MentorsPage /></Protected>} />
            {/* Certificates (Fase D) — kini tab "Sertifikat Saya" di /acara;
                rute tetap ada agar tautan lama tidak putus. */}
            <Route path="sertifikat" element={<Protected><CertificatesPage /></Protected>} />
            {/* Office hours (Fase D) */}
            <Route path="jam-kantor" element={<Protected><OfficeHoursPage /></Protected>} />
            {/* Nilai / Tenggat / Ujian — kini dijangkau dari Academy & Growth,
                bukan menu utama; rute tetap ada. */}
            <Route path="nilai" element={<Protected><GradebookPage /></Protected>} />
            <Route path="tenggat" element={<Protected><DeadlinesPage /></Protected>} />
            {/* Profil — kini dijangkau dari header & Portofolio, bukan menu utama;
                rute tetap ada. */}
            <Route path="profil" element={<Protected><ProfilePage /></Protected>} />
            <Route path="profil/edit" element={<Protected><EditProfilePage /></Protected>} />
            {/* Mentor Workspace (Fase D) — hanya mentor & admin. Siswa tidak
                bisa mendaftar sebagai mentor dari akun siswa (24 Nov 2026):
                pendaftaran mentor hanya lewat formulir pendaftaran
                (/register?role=mentor). */}
            <Route
              path="mentor"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/course-builder"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorCourseBuilderPage />
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
            <Route
              path="mentor/diskusi"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorDiscussionsPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/siswa"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorStudentsPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/analitik"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorAnalyticsPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/materi"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorMaterialsPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/video"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorVideosPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/kuis"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorQuizzesPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/rubrik"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorRubricsPage />
                </RoleRoute>
              }
            />
            <Route
              path="mentor/pengumuman"
              element={
                <RoleRoute roles={['mentor', 'admin']}>
                  <MentorAnnouncementsPage />
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
              path="admin/tiket"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminTicketsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/sinebot"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminSinebotPage />
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
            <Route
              path="admin/pengguna"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminUsersPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/acara"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminEventsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/pustaka"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminLibraryPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/pengaturan"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminSettingsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/sections"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminSectionsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/enrollment"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminEnrollmentsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/tugas"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminAssignmentsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/kuis"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminQuizzesPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/sertifikat"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminCertificatesPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/sertifikat/terbitkan"
              element={
                <RoleRoute roles={['admin', 'mentor']}>
                  <IssueCourseCertificatePage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/materi"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminResourcesPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/analitik"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminAnalyticsPage />
                </RoleRoute>
              }
            />
            <Route
              path="admin/analitik-akademi"
              element={
                <RoleRoute roles={['admin']}>
                  <AdminAcademyAnalyticsPage />
                </RoleRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  )
}
