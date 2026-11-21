// SINEVERSE — honest empty state shown when a feature's table does not
// exist yet because migrations 003–008 have not been applied live.
import { missingMigrationMessage } from '../lib/guarded'

export default function MigrationNotice({ migration }: { migration: string }) {
  return (
    <p className="empty" role="status">
      {missingMigrationMessage(migration)}
    </p>
  )
}
