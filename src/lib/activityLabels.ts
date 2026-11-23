// SINEVERSE — Label Bahasa Indonesia untuk kunci event audit log / log
// aktivitas (LB8). Kunci mentah seperti "mentor_application.approved"
// tidak bisa dibaca admin; petakan ke kalimat yang bisa dibaca manusia.
// Kunci yang belum dikenal diubah menjadi kata yang bisa dibaca
// (garis bawah/titik diganti spasi) supaya tidak pernah tampil mentah.

const LABELS: Record<string, string> = {
  'user.registered': 'Pengguna baru mendaftar',
  'mentor_application.approved': 'Lamaran mentor disetujui',
  'mentor_application.rejected': 'Lamaran mentor ditolak',
  'mentor_application.revision_required': 'Lamaran mentor diminta revisi',
  'school_submission.approved': 'Pengajuan sekolah disetujui',
  'school_submission.rejected': 'Pengajuan sekolah ditolak',
  'school.verified': 'Sekolah diverifikasi',
  'school.unverified': 'Verifikasi sekolah dibatalkan',
  'course_claim.approved': 'Klaim mengampu disetujui',
  'course_claim.rejected': 'Klaim mengampu ditolak',
  'course.mentor_assigned': 'Mentor ditetapkan untuk course',
  'community_proposal.approved': 'Usulan komunitas disetujui dan komunitas dibuat',
  'community_proposal.rejected': 'Usulan komunitas ditolak',
  'community.deleted': 'Komunitas dihapus',
  'discussion_report.resolved': 'Laporan diskusi diselesaikan',
  'discussion_report.dismissed': 'Laporan diskusi ditolak',
  'moderation_report.resolved': 'Laporan moderasi diselesaikan',
  'moderation_report.dismissed': 'Laporan moderasi ditolak',
  'rps.updated': 'RPS diperbarui',
  'certificate.revoked': 'Sertifikat dicabut',
  'certificate.reactivated': 'Sertifikat diaktifkan kembali',
  'certificate.issued': 'Sertifikat diterbitkan',
}

/** Ubah kunci event mentah menjadi label Bahasa Indonesia. */
export function activityLabel(action: string): string {
  const known = LABELS[action]
  if (known) return known
  // Fallback: "something_happened.now" -> "Something happened now".
  const humanized = action.replace(/[._]+/g, ' ').trim()
  if (!humanized) return action
  return humanized.charAt(0).toUpperCase() + humanized.slice(1)
}
