/**
 * QR Code generator — pure TypeScript, zero dependencies, no network.
 *
 * Ported from "QRCode for JavaScript" by Kazuhiko Arase (MIT License)
 * https://github.com/kazuhikoarase/qrcode-generator
 *
 * Returns an SVG string that can be set as innerHTML or used in an <img> data URI.
 */

// ─── GF(256) Math ────────────────────────────────────────────────────────────
const EXP_TABLE = new Array<number>(256)
const LOG_TABLE = new Array<number>(256)
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i
for (let i = 8; i < 256; i++)
  EXP_TABLE[i] = EXP_TABLE[i-4] ^ EXP_TABLE[i-5] ^ EXP_TABLE[i-6] ^ EXP_TABLE[i-8]
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i

function gexp(n: number) {
  while (n < 0)   n += 255
  while (n >= 256) n -= 255
  return EXP_TABLE[n]
}
function glog(n: number) {
  if (n < 1) throw new Error('glog(' + n + ')')
  return LOG_TABLE[n]
}

// ─── Polynomial ──────────────────────────────────────────────────────────────
class QRPolynomial {
  num: number[]
  constructor(num: number[], shift: number) {
    let offset = 0
    while (offset < num.length && num[offset] === 0) offset++
    this.num = new Array(num.length - offset + shift)
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]
  }
  get(index: number) { return this.num[index] }
  getLength() { return this.num.length }
  multiply(e: QRPolynomial) {
    const num = new Array<number>(this.getLength() + e.getLength() - 1).fill(0)
    for (let i = 0; i < this.getLength(); i++)
      for (let j = 0; j < e.getLength(); j++)
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)))
    return new QRPolynomial(num, 0)
  }
  mod(e: QRPolynomial): QRPolynomial {
    if (this.getLength() - e.getLength() < 0) return this
    const ratio = glog(this.get(0)) - glog(e.get(0))
    const num = [...this.num]
    for (let x = 0; x < e.getLength(); x++) num[x] ^= gexp(glog(e.get(x)) + ratio)
    return new QRPolynomial(num, 0).mod(e)
  }
}

// ─── RS Block table ──────────────────────────────────────────────────────────
const RS_BLOCK_TABLE = [
  [1,26,19],[1,26,16],[1,26,13],[1,26,9],
  [1,44,34],[1,44,28],[1,44,22],[1,44,16],
  [1,70,55],[1,70,44],[2,35,17],[2,35,13],
  [1,100,80],[2,50,32],[2,50,24],[4,25,9],
  [1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],
  [2,86,68],[4,43,27],[4,43,19],[4,43,15],
  [2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],
  [2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],
  [2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],
  [2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],
  [4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],
  [2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],
  [4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],
  [3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],
  [5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],
  [5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],
  [1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],
  [5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],
  [3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],
  [3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],
  [4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],
  [2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],
  [4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],
  [6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],
  [8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],
  [10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],
  [8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],
  [3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],
  [7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],
  [5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],
  [13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],
  [17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],
  [17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],
  [13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],
  [12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],
  [6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],
  [17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],
  [4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],
  [20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],
  [19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16],
]

// Error correction levels: L=0, M=1, Q=2, H=3
function getRSBlocks(typeNumber: number, ecLevel: number) {
  const table = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + ecLevel]
  const list: { totalCount: number; dataCount: number }[] = []
  for (let i = 0; i < table.length / 3; i++) {
    for (let j = 0; j < table[i * 3]; j++)
      list.push({ totalCount: table[i * 3 + 1], dataCount: table[i * 3 + 2] })
  }
  return list
}

// ─── Alignment pattern positions ─────────────────────────────────────────────
const PATTERN_POSITION_TABLE = [
  [], [6,18], [6,22], [6,26], [6,30], [6,34],
  [6,22,38], [6,24,42], [6,26,46], [6,28,50], [6,30,54],
  [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74],
  [6,30,54,78], [6,30,56,82], [6,30,58,86], [6,34,62,90],
  [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106],
  [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118],
  [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130],
  [6,30,56,82,108,134], [6,34,60,86,112,138], [6,30,58,86,114,142],
  [6,34,62,90,118,146], [6,30,54,78,102,126,150], [6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158], [6,32,58,84,110,136,162],
  [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
]

const G15 = (1<<10)|(1<<8)|(1<<5)|(1<<4)|(1<<2)|(1<<1)|(1<<0)
const G18 = (1<<12)|(1<<11)|(1<<10)|(1<<9)|(1<<8)|(1<<5)|(1<<2)|(1<<0)
const G15_MASK = (1<<14)|(1<<12)|(1<<10)|(1<<4)|(1<<1)

function getBCHDigit(d: number) { let n = 0; while (d) { n++; d >>>= 1 } return n }
function getBCHTypeInfo(data: number) {
  let d = data << 10
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15))
  return ((data << 10) | d) ^ G15_MASK
}
function getBCHTypeNumber(data: number) {
  let d = data << 12
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18))
  return (data << 12) | d
}

function getLengthInBits(type: number) {
  if (type < 10) return 8
  return 16
}

function getMask(pattern: number, i: number, j: number) {
  switch (pattern) {
    case 0: return (i + j) % 2 === 0
    case 1: return i % 2 === 0
    case 2: return j % 3 === 0
    case 3: return (i + j) % 3 === 0
    case 4: return (Math.floor(i/2) + Math.floor(j/3)) % 2 === 0
    case 5: return (i*j)%2 + (i*j)%3 === 0
    case 6: return ((i*j)%2 + (i*j)%3) % 2 === 0
    case 7: return ((i*j)%3 + (i+j)%2) % 2 === 0
    default: throw new Error('bad mask')
  }
}

function getErrorCorrectPolynomial(len: number) {
  let a = new QRPolynomial([1], 0)
  for (let i = 0; i < len; i++) a = a.multiply(new QRPolynomial([1, gexp(i)], 0))
  return a
}

// ─── BitBuffer ───────────────────────────────────────────────────────────────
class BitBuffer {
  buffer: number[] = []
  length = 0
  get(index: number) { return ((this.buffer[Math.floor(index/8)] >>> (7 - index%8)) & 1) === 1 }
  put(num: number, length: number) {
    for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1)
  }
  getLengthInBits() { return this.length }
  putBit(bit: boolean) {
    const bi = Math.floor(this.length/8)
    if (this.buffer.length <= bi) this.buffer.push(0)
    if (bit) this.buffer[bi] |= 0x80 >>> (this.length%8)
    this.length++
  }
}

// ─── Core QR matrix builder ───────────────────────────────────────────────────
function makeQR(text: string, ecLevel = 1 /* M */): boolean[][] {
  // Encode as UTF-8 bytes
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
    } else {
      bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
    }
  }

  // Find minimum version
  let typeNumber = 1
  for (; typeNumber <= 40; typeNumber++) {
    const blocks = getRSBlocks(typeNumber, ecLevel)
    const totalData = blocks.reduce((s, b) => s + b.dataCount, 0)
    const bitsNeeded = 4 + getLengthInBits(typeNumber) + bytes.length * 8
    if (bitsNeeded <= totalData * 8) break
  }

  const createData = (tn: number): number[] => {
    const blocks = getRSBlocks(tn, ecLevel)
    const buf = new BitBuffer()
    buf.put(4, 4)                          // mode: 8-bit byte
    buf.put(bytes.length, getLengthInBits(tn))
    for (const b of bytes) buf.put(b, 8)
    const totalData = blocks.reduce((s, b) => s + b.dataCount, 0)
    if (buf.getLengthInBits() + 4 <= totalData * 8) buf.put(0, 4)
    while (buf.getLengthInBits() % 8) buf.putBit(false)
    while (buf.getLengthInBits() < totalData * 8) {
      buf.put(0xEC, 8)
      if (buf.getLengthInBits() < totalData * 8) buf.put(0x11, 8)
    }

    // Interleave + error correction
    let offset = 0
    let maxDc = 0, maxEc = 0
    const dcdata: number[][] = []
    const ecdata: number[][] = []
    for (let r = 0; r < blocks.length; r++) {
      const dc = blocks[r].dataCount
      const ec = blocks[r].totalCount - dc
      maxDc = Math.max(maxDc, dc)
      maxEc = Math.max(maxEc, ec)
      dcdata.push([])
      for (let i = 0; i < dc; i++) dcdata[r].push(0xFF & buf.buffer[i + offset])
      offset += dc
      const rsPoly = getErrorCorrectPolynomial(ec)
      const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1)
      const modPoly = rawPoly.mod(rsPoly)
      ecdata.push(new Array(rsPoly.getLength() - 1))
      for (let x = 0; x < ecdata[r].length; x++) {
        const mi = x + modPoly.getLength() - ecdata[r].length
        ecdata[r][x] = mi >= 0 ? modPoly.get(mi) : 0
      }
    }
    const total = blocks.reduce((s, b) => s + b.totalCount, 0)
    const data = new Array<number>(total)
    let idx = 0
    for (let z = 0; z < maxDc; z++) for (const d of dcdata) if (z < d.length) data[idx++] = d[z]
    for (let z = 0; z < maxEc; z++) for (const d of ecdata) if (z < d.length) data[idx++] = d[z]
    return data
  }

  const makeImpl = (tn: number, test: boolean, maskPattern: number): boolean[][] => {
    const mc = tn * 4 + 17
    const modules: (boolean | null)[][] = Array.from({ length: mc }, () => new Array(mc).fill(null))

    const setProbe = (row: number, col: number) => {
      for (let r = -1; r <= 7; r++) {
        if (row+r < 0 || mc <= row+r) continue
        for (let c = -1; c <= 7; c++) {
          if (col+c < 0 || mc <= col+c) continue
          modules[row+r][col+c] =
            (r>=0&&r<=6&&(c===0||c===6)) ||
            (c>=0&&c<=6&&(r===0||r===6)) ||
            (r>=2&&r<=4&&c>=2&&c<=4)
        }
      }
    }
    setProbe(0, 0); setProbe(mc-7, 0); setProbe(0, mc-7)

    // Timing
    for (let r = 8; r < mc-8; r++) if (modules[r][6] === null) modules[r][6] = r%2===0
    for (let c = 8; c < mc-8; c++) if (modules[6][c] === null) modules[6][c] = c%2===0

    // Alignment
    const pos = PATTERN_POSITION_TABLE[tn-1]
    for (const row of pos) for (const col of pos) {
      if (modules[row][col] !== null) continue
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++)
        modules[row+r][col+c] = Math.abs(r)===2 || Math.abs(c)===2 || (r===0&&c===0)
    }

    // Type info
    const typeInfoBits = getBCHTypeInfo((ecLevel << 3) | maskPattern)
    for (let v = 0; v < 15; v++) {
      const mod = !test && ((typeInfoBits >> v) & 1) === 1
      if (v < 6) modules[v][8] = mod
      else if (v < 8) modules[v+1][8] = mod
      else modules[mc-15+v][8] = mod
    }
    for (let h = 0; h < 15; h++) {
      const mod = !test && ((typeInfoBits >> h) & 1) === 1
      if (h < 8) modules[8][mc-h-1] = mod
      else if (h < 9) modules[8][15-h] = mod
      else modules[8][15-h-1] = mod
    }
    modules[mc-8][8] = !test

    // Type number (>= v7)
    if (tn >= 7) {
      const bits = getBCHTypeNumber(tn)
      for (let i = 0; i < 18; i++) {
        const mod = !test && ((bits >> i) & 1) === 1
        modules[Math.floor(i/3)][i%3 + mc-8-3] = mod
      }
      for (let i = 0; i < 18; i++) {
        const mod = !test && ((bits >> i) & 1) === 1
        modules[i%3 + mc-8-3][Math.floor(i/3)] = mod
      }
    }

    // Map data
    const dataBytes = createData(tn)
    let inc = -1, row = mc-1, bitIndex = 7, byteIndex = 0
    for (let col = mc-1; col > 0; col -= 2) {
      if (col === 6) col--
      // eslint-disable-next-line no-constant-condition
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (modules[row][col-c] === null) {
            let dark = byteIndex < dataBytes.length ? ((dataBytes[byteIndex] >>> bitIndex) & 1) === 1 : false
            if (getMask(maskPattern, row, col-c)) dark = !dark
            modules[row][col-c] = dark
            if (--bitIndex === -1) { byteIndex++; bitIndex = 7 }
          }
        }
        row += inc
        if (row < 0 || mc <= row) { row -= inc; inc = -inc; break }
      }
    }

    return modules as boolean[][]
  }

  // Pick best mask
  const getLostPoint = (mods: (boolean|null)[][]): number => {
    const mc = mods.length
    let lp = 0
    for (let r = 0; r < mc; r++) for (let c = 0; c < mc; c++) {
      let same = 0; const dark = mods[r][c]
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr===0&&dc===0) continue
        if (r+dr<0||mc<=r+dr||c+dc<0||mc<=c+dc) continue
        if (dark === mods[r+dr][c+dc]) same++
      }
      if (same > 5) lp += 3 + same - 5
    }
    for (let r = 0; r < mc-1; r++) for (let c = 0; c < mc-1; c++) {
      let cnt = 0
      if (mods[r][c]) cnt++; if (mods[r+1][c]) cnt++
      if (mods[r][c+1]) cnt++; if (mods[r+1][c+1]) cnt++
      if (cnt===0||cnt===4) lp += 3
    }
    for (let r = 0; r < mc; r++) for (let c = 0; c < mc-6; c++)
      if (mods[r][c]&&!mods[r][c+1]&&mods[r][c+2]&&mods[r][c+3]&&mods[r][c+4]&&!mods[r][c+5]&&mods[r][c+6]) lp+=40
    for (let c = 0; c < mc; c++) for (let r = 0; r < mc-6; r++)
      if (mods[r][c]&&!mods[r+1][c]&&mods[r+2][c]&&mods[r+3][c]&&mods[r+4][c]&&!mods[r+5][c]&&mods[r+6][c]) lp+=40
    let dark = 0
    for (let c = 0; c < mc; c++) for (let r = 0; r < mc; r++) if (mods[r][c]) dark++
    lp += Math.abs(Math.floor(100*dark/mc/mc/5)*5 - 50) / 5 * 10
    return lp
  }

  let best = 0, bestLoss = Infinity
  for (let p = 0; p < 8; p++) {
    const mods = makeImpl(typeNumber, true, p)
    const loss = getLostPoint(mods)
    if (loss < bestLoss) { bestLoss = loss; best = p }
  }
  return makeImpl(typeNumber, false, best)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the raw boolean[][] module matrix — use this to render via canvas */
export function getQRModules(text: string): boolean[][] {
  return makeQR(text)
}


export function generateQRSvg(text: string, size = 220): string {
  const modules = makeQR(text)
  const count = modules.length
  // Use integer cell size — crisp pixels, no anti-aliasing on edges
  const cellSize = Math.floor(size / (count + 8))
  const actualSize = cellSize * (count + 8)
  const offset = cellSize * 4 // 4-module quiet zone

  const rects: string[] = []
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (modules[r][c]) {
        const x = offset + c * cellSize
        const y = offset + r * cellSize
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"/>`)
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 ${actualSize} ${actualSize}" shape-rendering="crispEdges">
  <rect width="${actualSize}" height="${actualSize}" fill="white"/>
  <g fill="black">${rects.join('')}</g>
</svg>`
}

/** Returns a data: URI that can be used in an <img src=...> */
export function generateQRDataUri(text: string, size = 220): string {
  const svg = generateQRSvg(text, size)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
