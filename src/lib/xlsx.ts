// SINEVERSE — penulis file .xlsx minimal TANPA dependensi (D25, Grade Book).
//
// Latar: tombol "Download Excel" ala Mentari harus menghasilkan file .xlsx
// ASLI (bukan CSV yang diganti ekstensi). Menambah dependensi `xlsx`
// (SheetJS) akan menarik package-lock ribuan baris; sebagai gantinya file
// ini membangun .xlsx dari nol: sebuah .xlsx hanyalah arsip ZIP berisi XML.
// Entri ZIP ditulis dengan metode STORED (tanpa kompresi) sehingga tidak
// butuh pustaka deflate — hanya CRC32 (diimplementasikan di sini, ~15 baris)
// dan header ZIP. Excel / LibreOffice membuka file hasil tulisan ini
// (terverifikasi: `soffice --headless --convert-to csv` membaca kembali
// isinya dengan benar — lihat LAPORAN §10.7).
//
// Batasan yang disadari: satu sheet, string via inlineStr (tanpa
// sharedStrings), gaya minimal (header tebal + latar abu-abu). Cukup untuk
// Grade Book; bukan pengganti SheetJS untuk spreadsheet kompleks.

export type XlsxCell = string | number | null

// --- CRC32 (polinomial standar 0xEDB88320) ---------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// --- ZIP (entri STORED) -----------------------------------------------------
interface ZipPart {
  name: string
  data: Uint8Array<ArrayBuffer>
}

function buildZip(parts: ZipPart[]): Blob {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  const enc = new TextEncoder()
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff])
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
  const concat = (...arrs: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> => {
    const total = arrs.reduce((a, b) => a + b.length, 0)
    const out = new Uint8Array(total)
    let p = 0
    for (const a of arrs) {
      out.set(a, p)
      p += a.length
    }
    return out
  }

  for (const part of parts) {
    const nameBytes = enc.encode(part.name)
    const crc = crc32(part.data)
    // Local file header: tanda, versi, flag bit 11 (nama UTF-8), metode 0
    // (STORED), waktu/tanggal 0, CRC, ukuran, nama.
    const local = concat(
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(part.data.length),
      u32(part.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    )
    chunks.push(local, part.data)
    // Central directory: offset header lokal dicatat untuk entri ini.
    central.push(
      concat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(part.data.length),
        u32(part.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ),
    )
    offset += local.length + part.data.length
  }

  const cdStart = offset
  let cdSize = 0
  for (const c of central) cdSize += c.length
  const eocd = concat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(parts.length),
    u16(parts.length),
    u32(cdSize),
    u32(cdStart),
    u16(0),
  )
  return new Blob([...chunks, ...central, eocd], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// --- XML --------------------------------------------------------------------
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colName(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA.
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

// Gaya minimal: xf 0 = bawaan, xf 1 = header (tebal + latar abu-abu muda).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF3"/><bgColor rgb="FFE8EDF3"/></patternFill></fill></fills><borders><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

function sheetXml(rows: XlsxCell[][]): string {
  const rowXml = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null || cell === undefined) return ''
          const ref = `${colName(c)}${r + 1}`
          if (typeof cell === 'number') {
            return `<c r="${ref}"><v>${cell}</v></c>`
          }
          return `<c r="${ref}" t="inlineStr" s="${r === 0 ? 1 : 0}"><is><t>${xmlEscape(cell)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`
}

/** Bangun Blob .xlsx dari satu sheet. Baris pertama dianggap header. */
export function buildXlsx(sheetName: string, rows: XlsxCell[][]): Blob {
  const enc = new TextEncoder()
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  return buildZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml(rows)) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
  ])
}

/** Unduh file .xlsx lewat anchor sementara (pola unduhan standar browser). */
export function downloadXlsx(
  filename: string,
  sheetName: string,
  rows: XlsxCell[][],
): void {
  const blob = buildXlsx(sheetName, rows)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
