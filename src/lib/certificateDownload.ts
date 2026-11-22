// SINEVERSE — Sertifikat: render + unduh PNG (22 Nov 2026).
//
// ATM (Amati, Tiru, Modifikasi) dari dua referensi yang dikirim Arif:
//  - Completion: bingkai diagonal navy/mint, segel emas, CERTIFICATE OF
//    COMPLETION, 4 kotak syarat (Course/Exam/Practice/Project), pill
//    course, barcode verifikasi Code 39 (pengganti tanda tangan),
//    QR verifikasi kanan bawah (hanya mengodekan tautan; tanpa teks URL).
//  - Mentor: CERTIFICATE OF APPRECIATION, laurel, pill "SINEVERSE
//    Mentor", tanpa kotak syarat, tanpa QR di dalam dokumen, segel
//    berpusat navy, tanggal "Tangerang, ..." kiri bawah, barcode
//    verifikasi Code 39 di tengah bawah.
// Teks dokumen berbahasa Inggris persis seperti referensi; yang berubah
// hanya datanya (nama, course, serial SVS-CRS-... / SVS-MNT-...,
// tanggal terbit, tempat Tangerang pada sertifikat mentor).
//
// SATU fungsi render `renderCertificate(canvas, args)` menggambar ke
// canvas apa pun pada ukuran piksel berapa pun (semua koordinat ditulis
// dalam ruang dasar 1754x1240 lalu diskalakan): dipakai untuk pratinjau
// di dalam kartu sertifikat (CertificatesPage) dan untuk unduh PNG
// resolusi penuh 1754x1240 lewat `downloadCertificatePng`.
// Tidak ada dependensi baru: QR dari pustaka `qrcode` yang sudah
// terpasang, font Plus Jakarta Sans sudah dimuat via @fontsource.
import QRCode from 'qrcode'
import { appBaseUrl } from './supabase'
import type { Certificate } from './types'

export const CERT_WIDTH = 1754
export const CERT_HEIGHT = 1240

const NAVY = '#172438'
const NAVY_DARK = '#0E1A2B'
const TEAL = '#16865E'
const TEAL_LIGHT = '#1FA37C'
const MINT = '#A3E6C4'
const MINT_BG = '#DFF5EA'
const MINT_PILL = '#BFEED9'
const MINT_FRAME = '#63C7A5'
const GOLD = '#C9A227'
const GOLD_DARK = '#B8860B'
const MUTED = '#5A6472'
const FONT = '"Plus Jakarta Sans", sans-serif'

export interface RenderCertificateArgs {
  cert: Certificate
  ownerName: string
  courseTitle: string | null
  mentorName: string | null
}

function verificationLink(cert: Certificate): string {
  // 024: QR di dalam PNG mengodekan URL verifikasi token
  // (?token=<hash>). Fallback ke URL serial hanya bila hash belum ada
  // (baris pra-024 yang belum di-backfill — setelah migrasi 024 semua
  // baris punya hash). appBaseUrl() sudah mencakup segmen
  // /sineverse-web/ dan rute hash (#/).
  if (cert.verification_token_hash) {
    return `${appBaseUrl()}#/sertifikat/verifikasi?token=${cert.verification_token_hash}`
  }
  return `${appBaseUrl()}#/sertifikat/verifikasi?serial=${cert.serial}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar QR.'))
    img.src = src
  })
}

/** Bagi teks menjadi baris-baris yang muat dalam maxWidth. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Lebar teks dengan spasi antar huruf (tracking) manual. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + tracking
  return w - tracking
}

/** Gambar teks ber-tracking, rata kiri/tengah/kanan pada posisi x. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right',
): void {
  const w = trackedWidth(ctx, text, tracking)
  const startX = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = startX
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tracking
  }
  ctx.textAlign = prevAlign
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** Garis tebal diagonal (pita) dari (x1,y1) ke (x2,y2). */
function stripe(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Bingkai + latar
// ---------------------------------------------------------------------------

/** Motif latar yang sangat samar: film strip kiri, kamera video kanan. */
function drawBackgroundMotifs(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  // Film strip: pita miring di kiri dengan bingkai film + lubang sprocket.
  ctx.translate(110, 600)
  ctx.rotate(-0.30)
  ctx.strokeStyle = 'rgba(140, 165, 195, 0.22)'
  ctx.fillStyle = 'rgba(190, 208, 226, 0.07)'
  ctx.lineWidth = 3
  roundRectPath(ctx, -280, -70, 620, 140, 12)
  ctx.fill()
  ctx.stroke()
  // Bingkai film di tengah pita.
  ctx.strokeStyle = 'rgba(140, 165, 195, 0.22)'
  ctx.lineWidth = 2.5
  for (let i = 0; i < 4; i++) {
    const x = -232 + i * 132
    roundRectPath(ctx, x, -34, 100, 68, 6)
    ctx.stroke()
  }
  // Lubang sprocket atas + bawah.
  ctx.fillStyle = 'rgba(140, 165, 195, 0.22)'
  for (let i = 0; i < 9; i++) {
    const x = -252 + i * 62
    roundRectPath(ctx, x, -58, 34, 16, 4)
    ctx.fill()
    roundRectPath(ctx, x, 42, 34, 16, 4)
    ctx.fill()
  }
  ctx.restore()

  // Kamera video: siluet geometris di kanan (badan + lensa + viewfinder).
  ctx.save()
  ctx.translate(1490, 810)
  ctx.fillStyle = 'rgba(140, 165, 195, 0.09)'
  ctx.strokeStyle = 'rgba(140, 165, 195, 0.14)'
  ctx.lineWidth = 3
  // Badan kamera.
  roundRectPath(ctx, -170, -95, 300, 190, 20)
  ctx.fill()
  ctx.stroke()
  // Laras lensa menonjol ke kanan.
  roundRectPath(ctx, 110, -48, 62, 96, 10)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(172, 0, 32, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(172, 0, 16, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(140, 165, 195, 0.14)'
  ctx.fill()
  // Viewfinder kiri atas + pegangan atas: menempel pada badan (tumpang
  // tindih ~15px) supaya tidak terlihat melayang terpisah.
  ctx.fillStyle = 'rgba(140, 165, 195, 0.09)'
  roundRectPath(ctx, -170, -112, 95, 42, 8)
  ctx.fill()
  ctx.stroke()
  roundRectPath(ctx, -45, -108, 115, 28, 8)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Sudut navy + pita diagonal mint/teal + bingkai tipis mint. */
function drawFrame(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.fillStyle = NAVY
  // Segitiga sudut: kiri atas, kanan atas, kiri bawah, kanan bawah.
  // Sudut bawah dibuat kecil seperti referensi supaya barcode, tanggal,
  // dan keterangan QR tidak tertutup navy.
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(760, 0)
  ctx.lineTo(0, 300)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(CERT_WIDTH, 0)
  ctx.lineTo(1010, 0)
  ctx.lineTo(CERT_WIDTH, 260)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, CERT_HEIGHT)
  ctx.lineTo(0, 1113)
  ctx.lineTo(280, CERT_HEIGHT)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(CERT_WIDTH, CERT_HEIGHT)
  ctx.lineTo(CERT_WIDTH, 1000)
  ctx.lineTo(1500, CERT_HEIGHT)
  ctx.closePath()
  ctx.fill()

  // Pita diagonal di dalam tiap sudut navy (mint lebar + teal tipis).
  // Pita kiri atas digeser supaya tidak memotong tagline merek;
  // pita kanan atas dimulai di bawah "Certificate No.".
  stripe(ctx, 700, 10, 240, 205, MINT, 34)
  stripe(ctx, 730, 30, 250, 195, TEAL_LIGHT, 20)
  stripe(ctx, 1340, 110, 1720, 248, MINT, 34)
  stripe(ctx, 1400, 110, CERT_WIDTH, 260, TEAL_LIGHT, 20)
  stripe(ctx, 0, 1157, 184, CERT_HEIGHT, MINT, 34)
  stripe(ctx, 0, 1195, 99, CERT_HEIGHT, TEAL_LIGHT, 20)
  stripe(ctx, CERT_WIDTH, 1062, 1566, CERT_HEIGHT, MINT, 34)
  stripe(ctx, CERT_WIDTH, 1110, 1616, CERT_HEIGHT, TEAL_LIGHT, 20)

  // Bingkai tipis mint di dalam.
  ctx.strokeStyle = MINT_FRAME
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, CERT_WIDTH - 80, CERT_HEIGHT - 80)
  ctx.restore()
}

/** Logo play-triangle SINEVERSE (kiri atas, di atas sudut navy). */
function drawBrand(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#2BB673'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(60, 40)
  ctx.lineTo(140, 80)
  ctx.lineTo(60, 120)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = MINT
  ctx.beginPath()
  ctx.moveTo(84, 62)
  ctx.lineTo(84, 98)
  ctx.lineTo(112, 80)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  ctx.font = `700 36px ${FONT}`
  ctx.fillText('S I N E V E R S E', 160, 88)
  ctx.font = `400 14px ${FONT}`
  drawTracked(ctx, 'LEARN. CREATE. COLLABORATE.', 162, 114, 1, 'left')
  ctx.restore()
}

/** "Certificate No. <serial>" kanan atas + garis bawah.
 *  Di referensi teks ini berwarna PUTIH di atas sudut navy. */
function drawCertNo(ctx: CanvasRenderingContext2D, serial: string): void {
  ctx.save()
  ctx.textAlign = 'right'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 22px ${FONT}`
  const serialW = ctx.measureText(serial).width
  ctx.font = `400 22px ${FONT}`
  const labelW = ctx.measureText('Certificate No. ').width
  ctx.fillText('Certificate No. ', 1670 - serialW, 84)
  ctx.font = `700 22px ${FONT}`
  ctx.fillText(serial, 1670, 84)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(1670 - labelW - serialW, 100)
  ctx.lineTo(1670, 100)
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Segel emas + laurel + tanda tangan
// ---------------------------------------------------------------------------

/** Roset bergerigi emas. */
function drawRosette(ctx: CanvasRenderingContext2D, cx: number, cy: number, rOuter: number): void {
  ctx.save()
  ctx.beginPath()
  const n = 28
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? rOuter : rOuter - 12
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  const grad = ctx.createRadialGradient(cx - 20, cy - 25, 10, cx, cy, rOuter)
  grad.addColorStop(0, '#F9DE7C')
  grad.addColorStop(0.55, '#E9B949')
  grad.addColorStop(1, '#C9930A')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = '#A87B0A'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

/** Dua pita navy di bawah segel. */
function drawRibbons(ctx: CanvasRenderingContext2D, cx: number, topY: number): void {
  ctx.save()
  const ribbons = [
    { x0: cx - 58, x1: cx - 8 },
    { x0: cx + 8, x1: cx + 58 },
  ]
  for (const rb of ribbons) {
    const midX = (rb.x0 + rb.x1) / 2
    const y1 = topY + 118
    ctx.fillStyle = NAVY
    ctx.beginPath()
    ctx.moveTo(rb.x0, topY)
    ctx.lineTo(rb.x1, topY)
    ctx.lineTo(rb.x1 - 6, y1)
    ctx.lineTo(midX, y1 - 24)
    ctx.lineTo(rb.x0 + 6, y1)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = MINT
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(midX, topY + 6)
    ctx.lineTo(midX, y1 - 28)
    ctx.stroke()
  }
  ctx.restore()
}

/** Daun runcing untuk laurel: bentuk lensa dari pangkal ke ujung. */
function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  wid: number,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0)
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * Cabang laurel di sepanjang busur: tangkai tipis + daun runcing yang
 * menempel bergantian di kiri/kanan tangkai dan mengarah ke ujung cabang
 * (seperti referensi), bukan rantai elips.
 */
function drawLaurelArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fromAngle: number,
  toAngle: number,
  leaves: number,
  color: string,
  leafLen: number,
  leafWid: number,
  stemWidth = 2,
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = stemWidth
  ctx.beginPath()
  ctx.arc(cx, cy, r, fromAngle, toAngle)
  ctx.stroke()
  const dir = toAngle > fromAngle ? 1 : -1
  for (let i = 0; i < leaves; i++) {
    const a = fromAngle + ((toAngle - fromAngle) * i) / (leaves - 1)
    const px = cx + Math.cos(a) * r
    const py = cy + Math.sin(a) * r
    // Arah daun: searah singgung busur, dimiringkan bergantian ±37°.
    const tangent = a + (Math.PI / 2) * dir
    const tilt = (i % 2 === 0 ? 0.65 : -0.65) * dir
    drawLeaf(ctx, px, py, tangent + tilt, leafLen, leafWid)
  }
  ctx.restore()
}

/**
 * Karangan bunga (wreath) di dalam segel: dua cabang padat yang simetris,
 * mengikuti referensi — daun besar, rapat, berjarak merata, mengapit isi
 * segel. Cabang berhenti di ~9:30 dan ~2:30: bagian bawah lingkaran
 * sengaja kosong lebar supaya daun TIDAK menyentuh teks di bawahnya
 * ("SINEVERSE" / "APPRECIATION") — daun paling bawah harus bersih dari
 * semua huruf.
 */
function drawSealWreath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
): void {
  // Cabang berhenti di ~9:30 dan ~2:30: bagian bawah lingkaran tetap
  // kosong seperti referensi (teks di bawah tidak tertutup daun).
  drawLaurelArc(ctx, cx, cy, 64, Math.PI * 0.88, Math.PI * 1.13, 10, color, 26, 8)
  drawLaurelArc(ctx, cx, cy, 64, Math.PI * 0.12, -Math.PI * 0.13, 10, color, 26, 8)
}

/** Segel emas kanan atas; variant 'mentor' memakai lingkaran tengah navy. */
function drawSeal(ctx: CanvasRenderingContext2D, variant: 'completion' | 'mentor'): void {
  const cx = 1505
  const cy = 262
  drawRibbons(ctx, cx, 356)
  drawRosette(ctx, cx, cy, 112)

  ctx.save()
  if (variant === 'completion') {
    const grad = ctx.createRadialGradient(cx - 15, cy - 20, 8, cx, cy, 92)
    grad.addColorStop(0, '#F9DE7C')
    grad.addColorStop(1, '#E9B949')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, 92, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = GOLD_DARK
    ctx.lineWidth = 2
    ctx.stroke()
    // Cincin tipis di dalam lingkaran (seperti referensi).
    ctx.strokeStyle = GOLD_DARK
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 80, 0, Math.PI * 2)
    ctx.stroke()
    // Karangan bunga laurel padat di dalam lingkaran, mengapit segitiga play
    // (seperti referensi: dua cabang simetris, daun besar dan rapat).
    drawSealWreath(ctx, cx, cy, GOLD_DARK)
    // Segitiga play: outline tebal + segitiga kecil terisi di dalam
    // (seperti referensi), bukan segitiga padat.
    ctx.strokeStyle = NAVY
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - 20, cy - 40)
    ctx.lineTo(cx - 20, cy + 8)
    ctx.lineTo(cx + 26, cy - 16)
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = NAVY
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy - 28)
    ctx.lineTo(cx - 12, cy - 4)
    ctx.lineTo(cx + 11, cy - 16)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = `700 17px ${FONT}`
    ctx.fillText('SINEVERSE', cx, cy + 44)
  } else {
    const grad = ctx.createRadialGradient(cx - 15, cy - 20, 8, cx, cy, 92)
    grad.addColorStop(0, '#22344F')
    grad.addColorStop(1, NAVY_DARK)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, 92, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.stroke()
    // Cincin tipis di dalam lingkaran navy (seperti referensi).
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 80, 0, Math.PI * 2)
    ctx.stroke()
    // Segitiga play emas di atas: outline tebal + segitiga kecil terisi
    // di dalam (seperti referensi).
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - 15, cy - 66)
    ctx.lineTo(cx + 15, cy - 66)
    ctx.lineTo(cx, cy - 36)
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.moveTo(cx - 8, cy - 61)
    ctx.lineTo(cx + 8, cy - 61)
    ctx.lineTo(cx, cy - 46)
    ctx.closePath()
    ctx.fill()
    // Karangan bunga laurel emas padat di dalam lingkaran (seperti
    // referensi: dua cabang simetris, daun besar dan rapat).
    drawSealWreath(ctx, cx, cy, GOLD)
    // Teks diperkecil + dinaikkan supaya "APPRECIATION" tidak lagi
    // menempel tepi lingkaran navy (dulu 17px di cy+48, tali busur
    // di titik itu hanya ~147px sementara teks ~160px).
    ctx.fillStyle = '#F6D365'
    ctx.textAlign = 'center'
    ctx.font = `700 17px ${FONT}`
    ctx.fillText('SINEVERSE', cx, cy - 2)
    // Garis tipis emas antara SINEVERSE dan MENTOR (seperti referensi).
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 38, cy + 8)
    ctx.lineTo(cx + 38, cy + 8)
    ctx.stroke()
    ctx.font = `700 16px ${FONT}`
    ctx.fillText('MENTOR', cx, cy + 22)
    ctx.font = `700 13px ${FONT}`
    ctx.fillText('APPRECIATION', cx, cy + 44)
    // Bintang emas kecil.
    drawStar(ctx, cx, cy + 64, 7, GOLD)
  }
  ctx.restore()
}

/** Bintang 5 sudut. */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.45
    const x = cx + Math.cos(a) * rad
    const y = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Cabang laurel besar mengapit judul (sertifikat mentor): ranting
 *  laurel asli — daun runcing di sepanjang tangkai — seperti referensi. */
function drawTitleLaurel(ctx: CanvasRenderingContext2D, mirror: boolean): void {
  const arcCx = mirror ? 1235 : 520
  const arcCy = 262
  const r = 115
  if (mirror) {
    drawLaurelArc(ctx, arcCx, arcCy, r, -Math.PI * 0.42, Math.PI * 0.42, 9, TEAL, 36, 7.5)
  } else {
    drawLaurelArc(ctx, arcCx, arcCy, r, Math.PI * 0.58, Math.PI * 1.42, 9, TEAL, 36, 7.5)
  }
}

/**
 * Barcode Code 39 (tanpa dependensi baru): mengodekan serial sertifikat
 * (huruf besar + angka + tanda hubung) agar bisa dipindai. Pola 9 elemen
 * per karakter (5 bar, 4 spasi; 3 lebar + 6 sempit), rasio lebar 3:1,
 * diawali dan diakhiri karakter start/stop '*'. Elemen genap = bar.
 */
const CODE39: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '*': '010010100',
  $: '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
}

/**
 * Gambar barcode Code 39 dari `text` (serial sertifikat), rata tengah di
 * cx: label "Verification Code" di atas, bar di tengah, serial terbaca
 * manusia di bawah bar. Mengembalikan baseline bawah (serial).
 */
function drawBarcode(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  topY: number,
  barHeight: number,
): number {
  const narrow = 1.1
  const wide = narrow * 3
  const data = `*${text.toUpperCase()}*`
  let total = 0
  for (const ch of data) {
    const pat = CODE39[ch]
    if (!pat) continue
    for (let i = 0; i < 9; i++) total += pat[i] === '1' ? wide : narrow
    total += narrow
  }
  total -= narrow

  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = MUTED
  ctx.font = `400 16px ${FONT}`
  ctx.fillText('Verification Code', cx, topY + 16)

  ctx.fillStyle = NAVY
  let x = cx - total / 2
  const barTop = topY + 28
  for (const ch of data) {
    const pat = CODE39[ch]
    if (!pat) continue
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === '1' ? wide : narrow
      if (i % 2 === 0) ctx.fillRect(x, barTop, w, barHeight)
      x += w
    }
    x += narrow
  }

  ctx.font = `700 20px ${FONT}`
  ctx.fillText(text, cx, barTop + barHeight + 28)
  ctx.restore()
  return barTop + barHeight + 28
}

// ---------------------------------------------------------------------------
// Ikon kotak syarat (completion)
// ---------------------------------------------------------------------------

function drawIconCourse(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save()
  ctx.fillStyle = TEAL
  roundRectPath(ctx, cx - 30 * s, cy - 30 * s, 60 * s, 60 * s, 12 * s)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.moveTo(cx - 10 * s, cy - 14 * s)
  ctx.lineTo(cx - 10 * s, cy + 14 * s)
  ctx.lineTo(cx + 16 * s, cy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawIconExam(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 3 * s
  roundRectPath(ctx, cx - 22 * s, cy - 24 * s, 44 * s, 54 * s, 6 * s)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = TEAL
  roundRectPath(ctx, cx - 10 * s, cy - 31 * s, 20 * s, 12 * s, 4 * s)
  ctx.fill()
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 3.5 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - 12 * s, cy - 4 * s)
  ctx.lineTo(cx - 2 * s, cy + 6 * s)
  ctx.lineTo(cx + 14 * s, cy - 14 * s)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 12 * s, cy + 14 * s)
  ctx.lineTo(cx + 12 * s, cy + 14 * s)
  ctx.stroke()
  ctx.restore()
}

function drawIconPractice(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save()
  ctx.fillStyle = TEAL
  roundRectPath(ctx, cx - 26 * s, cy - 12 * s, 52 * s, 36 * s, 5 * s)
  ctx.fill()
  ctx.save()
  ctx.translate(cx, cy - 20 * s)
  ctx.rotate(-0.12)
  ctx.fillStyle = NAVY
  roundRectPath(ctx, -26 * s, -8 * s, 52 * s, 16 * s, 4 * s)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.translate((-19 + i * 16) * s, 0)
    ctx.rotate(0.5)
    ctx.fillRect(-3.5 * s, -8 * s, 7 * s, 16 * s)
    ctx.restore()
  }
  ctx.restore()
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(cx - 12 * s, cy + 6 * s, 3 * s, 0, Math.PI * 2)
  ctx.arc(cx + 12 * s, cy + 6 * s, 3 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawIconProject(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save()
  ctx.fillStyle = TEAL
  ctx.beginPath()
  ctx.moveTo(cx - 20 * s, cy - 26 * s)
  ctx.lineTo(cx + 20 * s, cy - 26 * s)
  ctx.quadraticCurveTo(cx + 18 * s, cy + 2 * s, cx, cy + 6 * s)
  ctx.quadraticCurveTo(cx - 18 * s, cy + 2 * s, cx - 20 * s, cy - 26 * s)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 4 * s
  ctx.beginPath()
  ctx.arc(cx - 22 * s, cy - 14 * s, 9 * s, Math.PI * 0.5, Math.PI * 1.5, true)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + 22 * s, cy - 14 * s, 9 * s, -Math.PI * 0.5, Math.PI * 0.5)
  ctx.stroke()
  ctx.fillRect(cx - 3 * s, cy + 6 * s, 6 * s, 12 * s)
  ctx.fillRect(cx - 14 * s, cy + 18 * s, 28 * s, 6 * s)
  ctx.restore()
}

/** Empat kotak syarat: Course/Exam/Practice/Project. */
function drawRequirementBoxes(ctx: CanvasRenderingContext2D, y: number, boxH: number): void {
  const boxes = [
    { label: 'Course', sub: 'Completed', icon: drawIconCourse },
    { label: 'Exam', sub: 'Passed', icon: drawIconExam },
    { label: 'Practice', sub: 'Completed', icon: drawIconPractice },
    { label: 'Project', sub: 'Submitted', icon: drawIconProject },
  ]
  const boxW = 240
  const gap = 30
  const x0 = (CERT_WIDTH - (boxes.length * boxW + (boxes.length - 1) * gap)) / 2
  boxes.forEach((b, i) => {
    const x = x0 + i * (boxW + gap)
    const cx = x + boxW / 2
    ctx.save()
    ctx.fillStyle = MINT_BG
    ctx.strokeStyle = '#BFE8D4'
    ctx.lineWidth = 1.5
    roundRectPath(ctx, x, y, boxW, boxH, 24)
    ctx.fill()
    ctx.stroke()
    b.icon(ctx, cx, y + boxH * 0.35, 1)
    ctx.fillStyle = NAVY
    ctx.textAlign = 'center'
    ctx.font = `700 26px ${FONT}`
    ctx.fillText(b.label, cx, y + boxH * 0.74)
    ctx.fillStyle = MUTED
    ctx.font = `400 22px ${FONT}`
    ctx.fillText(b.sub, cx, y + boxH * 0.91)
    ctx.restore()
  })
  // Pembatas tipis antar kotak seperti referensi.
  ctx.save()
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 2
  for (let i = 1; i < boxes.length; i++) {
    const x = x0 + i * (boxW + gap) - gap / 2
    ctx.beginPath()
    ctx.moveTo(x, y + 30)
    ctx.lineTo(x, y + boxH - 30)
    ctx.stroke()
  }
  ctx.restore()
}

/** Gambar satu baris kaya (segmen tebal/normal) rata tengah. */
function drawRichLine(
  ctx: CanvasRenderingContext2D,
  segments: { text: string; bold: boolean }[],
  cx: number,
  y: number,
  fontSize: number,
): void {
  const widths = segments.map((seg) => {
    ctx.font = `${seg.bold ? 700 : 400} ${fontSize}px ${FONT}`
    return ctx.measureText(seg.text).width
  })
  const total = widths.reduce((a, b) => a + b, 0)
  let x = cx - total / 2
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  segments.forEach((seg, i) => {
    ctx.font = `${seg.bold ? 700 : 400} ${fontSize}px ${FONT}`
    ctx.fillText(seg.text, x, y)
    x += widths[i]
  })
  ctx.textAlign = prevAlign
}

/**
 * Offset tengah-TINTA sebuah baris teks pada font aktif: canvas
 * memusatkan lebar advance (termasuk side bearing), sementara mata
 * menilai tengah dari tinta yang terlihat. Untuk "Rizky Pratama" pada
 * Plus Jakarta Sans 700, bearing kiri "R" (~7px) jauh lebih besar dari
 * bearing kanan "a" (~1px), sehingga tinta bergeser +3px ke kanan walau
 * advance-nya sudah tepat di tengah. Diukur lewat canvas lepas layar
 * supaya hasilnya benar pada font apa pun; gagal ukur → 0 (kembali ke
 * pemusatan advance).
 */
function inkCenterOffset(ctx: CanvasRenderingContext2D, text: string): number {
  try {
    const m = document.createElement('canvas').getContext('2d')
    if (!m) return 0
    const W = 1600
    const H = 220
    m.canvas.width = W
    m.canvas.height = H
    m.font = ctx.font
    m.textAlign = 'center'
    m.textBaseline = 'alphabetic'
    m.fillStyle = '#000'
    m.fillText(text, W / 2, 140)
    const data = m.getImageData(0, 0, W, H).data
    let lo = W
    let hi = -1
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        const x = (i / 4) % W
        if (x < lo) lo = x
        if (x > hi) hi = x
      }
    }
    if (hi < 0) return 0
    return (lo + hi) / 2 - W / 2
  } catch {
    return 0
  }
}

/** Nama penerima (mengecil bila panjang), mengembalikan baseline
 *  BARIS TERAKHIR (bukan bawah kotak font) supaya garis teal di bawah
 *  nama bisa duduk rapat seperti referensi (~52px di bawah baseline).
 *  Tiap baris dipusatkan pada TINTA-nya (bukan advance), supaya nama
 *  benar-benar di tengah secara visual apa pun font-nya. */
function drawRecipientName(ctx: CanvasRenderingContext2D, ownerName: string, startY: number): number {
  ctx.save()
  ctx.fillStyle = NAVY
  ctx.textAlign = 'center'
  let size = 96
  let lines: string[] = [ownerName]
  for (const s of [96, 84, 72, 60]) {
    ctx.font = `700 ${s}px ${FONT}`
    lines = wrapText(ctx, ownerName, 1250)
    size = s
    if (lines.length <= 2) break
  }
  let y = startY
  let lastBaseline = startY
  for (const line of lines) {
    const offset = inkCenterOffset(ctx, line)
    ctx.fillText(line, CERT_WIDTH / 2 - offset, y)
    lastBaseline = y
    y += size + 8
  }
  ctx.restore()
  return lastBaseline
}

// ---------------------------------------------------------------------------
// Render utama
// ---------------------------------------------------------------------------

function formatDateEn(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

async function ensureFonts(): Promise<void> {
  try {
    await document.fonts.ready
    await Promise.all(
      [
        '700 108px "Plus Jakarta Sans"',
        '700 96px "Plus Jakarta Sans"',
        '700 40px "Plus Jakarta Sans"',
        '700 38px "Plus Jakarta Sans"',
        '700 36px "Plus Jakarta Sans"',
        '700 28px "Plus Jakarta Sans"',
        '700 26px "Plus Jakarta Sans"',
        '700 24px "Plus Jakarta Sans"',
        '700 22px "Plus Jakarta Sans"',
        '700 20px "Plus Jakarta Sans"',
        '700 18px "Plus Jakarta Sans"',
        '700 17px "Plus Jakarta Sans"',
        '400 34px "Plus Jakarta Sans"',
        '400 30px "Plus Jakarta Sans"',
        '400 28px "Plus Jakarta Sans"',
        '400 22px "Plus Jakarta Sans"',
        '400 20px "Plus Jakarta Sans"',
        '400 18px "Plus Jakarta Sans"',
        '400 16px "Plus Jakarta Sans"',
        '400 14px "Plus Jakarta Sans"',
        'italic 700 32px "Plus Jakarta Sans"',
        'italic 400 26px "Plus Jakarta Sans"',
      ].map((f) => document.fonts.load(f).catch(() => undefined)),
    )
  } catch {
    // Font gagal dimuat: lanjut dengan sans-serif fallback.
  }
}

/**
 * Gambar sertifikat ke canvas apa pun (pratinjau di kartu maupun PNG
 * resolusi penuh). Semua koordinat ditulis dalam ruang dasar 1754x1240
 * lalu diskalakan ke ukuran canvas. `cert.type === 'mentor'` memakai
 * desain apresiasi; jenis lain memakai desain completion.
 */
export async function renderCertificate(
  canvas: HTMLCanvasElement,
  args: RenderCertificateArgs,
): Promise<void> {
  const { cert, ownerName, courseTitle } = args
  const isMentor = cert.type === 'mentor'

  await ensureFonts()

  // QR hanya untuk completion; bila gagal, sertifikat tetap digambar
  // tanpa QR.
  let qrImg: HTMLImageElement | null = null
  if (!isMentor) {
    try {
      const dataUrl = await QRCode.toDataURL(verificationLink(cert), { width: 220, margin: 1 })
      qrImg = await loadImage(dataUrl)
    } catch {
      qrImg = null
    }
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak didukung di browser ini.')
  const s = canvas.width / CERT_WIDTH
  ctx.save()
  ctx.scale(s, s)

  // Latar + bingkai + merek + nomor + segel (sama untuk kedua desain).
  ctx.fillStyle = '#FDFEFF'
  ctx.fillRect(0, 0, CERT_WIDTH, CERT_HEIGHT)
  drawBackgroundMotifs(ctx)
  drawFrame(ctx)
  drawBrand(ctx)
  drawCertNo(ctx, cert.serial)
  drawSeal(ctx, isMentor ? 'mentor' : 'completion')

  const cx = CERT_WIDTH / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = NAVY

  if (!isMentor) {
    // ---- CERTIFICATE OF COMPLETION ----
    ctx.font = `700 108px ${FONT}`
    ctx.fillText('CERTIFICATE', cx, 230)
    ctx.font = `700 38px ${FONT}`
    drawTracked(ctx, 'OF COMPLETION', cx, 292, 16, 'center')
    const subW = trackedWidth(ctx, 'OF COMPLETION', 16)
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - subW / 2 - 150, 280)
    ctx.lineTo(cx - subW / 2 - 30, 280)
    ctx.moveTo(cx + subW / 2 + 30, 280)
    ctx.lineTo(cx + subW / 2 + 150, 280)
    ctx.stroke()

    ctx.fillStyle = NAVY
    ctx.font = `400 34px ${FONT}`
    ctx.fillText('This certificate is proudly presented to', cx, 372)

    const nameBase = drawRecipientName(ctx, ownerName, 470)

    // Alur vertikal mengikuti baseline nama (nama 2 baris menggeser
    // semua ke bawah); bila barcode akan keluar bingkai, rapatkan.
    // Proporsi mengikuti referensi: garis teal ~52px di bawah baseline
    // nama, baris syarat ~60px di bawah garis, kotak ~54px di bawahnya.
    let boxH = 165
    let ruleY = nameBase + 52
    let reqY = ruleY + 60
    let boxesY = reqY + 54
    let pillY = boxesY + boxH + 28
    let givenY = pillY + 72 + 42
    let barcodeTop = givenY + 10
    let barH = 64
    let keepY = givenY + 70
    if (barcodeTop + 28 + barH + 28 > 1196) {
      boxH = 150
      ruleY = nameBase + 48
      reqY = ruleY + 56
      boxesY = reqY + 48
      pillY = boxesY + boxH + 22
      givenY = pillY + 72 + 34
      barcodeTop = givenY + 8
      barH = 56
      keepY = givenY + 62
    }

    ctx.strokeStyle = TEAL
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 480, ruleY)
    ctx.lineTo(cx + 480, ruleY)
    ctx.stroke()

    ctx.fillStyle = NAVY
    drawRichLine(
      ctx,
      [
        { text: 'for successfully completing the ', bold: false },
        { text: 'SINEVERSE', bold: true },
        { text: ' program as a member, by fulfilling all requirements:', bold: false },
      ],
      cx,
      reqY,
      28,
    )

    drawRequirementBoxes(ctx, boxesY, boxH)

    // Pill course.
    const pillText = courseTitle ?? 'SINEVERSE'
    ctx.font = `700 38px ${FONT}`
    const pillW = ctx.measureText(pillText).width + 100
    ctx.fillStyle = MINT_PILL
    roundRectPath(ctx, cx - pillW / 2, pillY, pillW, 72, 36)
    ctx.fill()
    ctx.fillStyle = NAVY
    ctx.fillText(pillText, cx, pillY + 48)

    ctx.font = `400 30px ${FONT}`
    ctx.fillText(`Given on ${formatDateEn(cert.issued_at)}`, cx, givenY)

    // Bawah: barcode verifikasi kiri, slogan tengah, QR kanan.
    // (Tidak ada tanda tangan: barcode Code 39 mengodekan serial.)
    drawBarcode(ctx, cert.serial, 270, barcodeTop, barH)

    ctx.fillStyle = NAVY
    ctx.font = `700 24px ${FONT}`
    drawTracked(ctx, 'KEEP LEARNING. KEEP CREATING.', cx, keepY, 6, 'center')
    const keepW = trackedWidth(ctx, 'KEEP LEARNING. KEEP CREATING.', 6)
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - keepW / 2 - 130, keepY - 8)
    ctx.lineTo(cx - keepW / 2 - 30, keepY - 8)
    ctx.moveTo(cx + keepW / 2 + 30, keepY - 8)
    ctx.lineTo(cx + keepW / 2 + 130, keepY - 8)
    ctx.stroke()

    if (qrImg) {
      ctx.drawImage(qrImg, 1400, 920, 140, 140)
    }
    ctx.fillStyle = NAVY
    ctx.font = `700 20px ${FONT}`
    ctx.fillText('Verify Certificate', 1470, 1100)
    ctx.font = `700 18px ${FONT}`
    ctx.fillText(cert.serial, 1470, 1126)
  } else {
    // ---- CERTIFICATE OF APPRECIATION (mentor) ----
    drawTitleLaurel(ctx, false)
    drawTitleLaurel(ctx, true)
    ctx.font = `700 108px ${FONT}`
    ctx.fillText('CERTIFICATE', cx, 230)
    ctx.font = `700 38px ${FONT}`
    drawTracked(ctx, 'OF APPRECIATION', cx, 292, 14, 'center')
    const subW = trackedWidth(ctx, 'OF APPRECIATION', 14)
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - subW / 2 - 150, 280)
    ctx.lineTo(cx - subW / 2 - 30, 280)
    ctx.moveTo(cx + subW / 2 + 30, 280)
    ctx.lineTo(cx + subW / 2 + 150, 280)
    ctx.stroke()

    ctx.fillStyle = NAVY
    ctx.font = `400 34px ${FONT}`
    ctx.fillText('This certificate is proudly presented to', cx, 372)

    const nameBase = drawRecipientName(ctx, ownerName, 470)

    // Garis teal rapat di bawah baseline nama seperti referensi (~52px).
    const ruleY = nameBase + 52
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 480, ruleY)
    ctx.lineTo(cx + 480, ruleY)
    ctx.stroke()

    // Pill "SINEVERSE Mentor" + garis teal di sampingnya.
    ctx.font = `700 36px ${FONT}`
    const pillText = 'SINEVERSE Mentor'
    const pillW = ctx.measureText(pillText).width + 100
    const pillY = ruleY + 60
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - pillW / 2 - 170, pillY + 36)
    ctx.lineTo(cx - pillW / 2 - 30, pillY + 36)
    ctx.moveTo(cx + pillW / 2 + 30, pillY + 36)
    ctx.lineTo(cx + pillW / 2 + 170, pillY + 36)
    ctx.stroke()
    ctx.fillStyle = MINT_PILL
    roundRectPath(ctx, cx - pillW / 2, pillY, pillW, 72, 36)
    ctx.fill()
    ctx.fillStyle = NAVY
    ctx.fillText(pillText, cx, pillY + 48)

    // Isi: apresiasi + kalimat italic. Lebar 1080 supaya barisnya pecah
    // seperti referensi (3 baris, "SINEVERSE." sendiri di baris terakhir).
    ctx.font = `400 30px ${FONT}`
    const body =
      'In sincere appreciation for your dedication, expertise, and valuable contribution in guiding and inspiring our community throughout the learning journey at SINEVERSE.'
    const bodyLines = wrapText(ctx, body, 1080)
    let y = pillY + 72 + 92
    for (const line of bodyLines) {
      ctx.fillText(line, cx, y)
      y += 44
    }
    y += 12
    ctx.font = `italic 700 32px ${FONT}`
    const italicLines = wrapText(ctx, 'Together, we learn more, create more, and grow together.', 1150)
    for (const line of italicLines) {
      ctx.fillText(line, cx, y)
      y += 46
    }
    if (cert.note) {
      y += 6
      ctx.fillStyle = MUTED
      ctx.font = `italic 400 26px ${FONT}`
      const noteLines = wrapText(ctx, cert.note, 1000)
      for (const line of noteLines) {
        ctx.fillText(line, cx, y)
        y += 36
      }
    }

    // Bawah: tanggal kiri, barcode verifikasi tengah, slogan kanan.
    // (Tidak ada tanda tangan: barcode Code 39 mengodekan serial.)
    ctx.textAlign = 'left'
    ctx.fillStyle = NAVY
    ctx.font = `400 28px ${FONT}`
    ctx.fillText(`Tangerang, ${formatDateEn(cert.issued_at)}`, 150, 1059)
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(150, 1077)
    ctx.lineTo(480, 1077)
    ctx.stroke()

    const bcTop = Math.min(Math.max(1032, y + 4), 1084)
    drawBarcode(ctx, cert.serial, cx, bcTop, 56)

    ctx.fillStyle = NAVY
    ctx.font = `700 22px ${FONT}`
    drawTracked(ctx, 'INSPIRE • MENTOR • EMPOWER', 1550, 1059, 4, 'right')
  }

  ctx.restore()
}

/** Unduh sertifikat sebagai PNG resolusi penuh (1754x1240). */
export async function downloadCertificatePng(args: RenderCertificateArgs): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = CERT_WIDTH
  canvas.height = CERT_HEIGHT
  await renderCertificate(canvas, args)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Gagal membuat file PNG.')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Sertifikat-${args.cert.serial}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
