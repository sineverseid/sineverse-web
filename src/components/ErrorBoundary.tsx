// SINEVERSE — ErrorBoundary: penangkap error render agar satu halaman yang
// crash tidak mengosongkan seluruh aplikasi (layar putih tanpa pesan).
// Dipasang di sekeliling <Suspense> di App.tsx — posisinya DI ATAS Suspense
// supaya gagal muat chunk lazy (mis. modul gagal di-fetch) juga tertangkap.
// Fallback menampilkan pesan error apa adanya + tombol muat ulang, sehingga
// penyebab bisa dibaca langsung dari layar.
import { Component } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Tetap tercatat di console untuk diagnosis lanjutan.
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary menangkap error render:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page">
        <h1>Terjadi kesalahan</h1>
        <p className="error-box">
          Halaman ini gagal dimuat: {error.message || 'Kesalahan tidak diketahui.'}
        </p>
        <p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Muat Ulang Halaman
          </button>
        </p>
        <p className="muted">Bila terus gagal, tutup tab lalu buka kembali tautan SINEVERSE.</p>
      </div>
    )
  }
}
