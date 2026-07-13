// A web alapú app szerveroldali része.
// Egyszerű statikus fájl- és proxy-szerver Node.js használatával.

const http = require('http')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

const PORT = process.env.PORT || 3000
const PUBLIC_DIR = path.join(__dirname, 'src')

const VIHAR_URL =
  'https://www.met.hu/idojaras/tavaink/balaton/viharjelzes/main.php'
const MET_KEP_ALAP = 'https://www.met.hu/images/elemek/'
const OPENWEATHER_KULCS = 'a69e3e0bba0d9ced099ba6c278531be5'
const IDOJARAS_HELY = { nev: 'Balatonberény', lat: 46.7086, lon: 17.3078 }
const IDOJARAS_URL =
  'https://api.openweathermap.org/data/2.5/weather' +
  `?lat=${IDOJARAS_HELY.lat}&lon=${IDOJARAS_HELY.lon}` +
  `&units=metric&lang=hu&appid=${OPENWEATHER_KULCS}`
const SPORTSDB_ALAP = 'https://www.thesportsdb.com/api/v1/json/3'
const VB_LIGA_ID = '4429'
const VB_NAP_VISSZA = 3
const VB_NAP_ELORE = 3
const KAMERA_NEV = 'indernet5'
const KAMERA_PICLIST = `https://cam.idokep.hu/cam/${KAMERA_NEV}/piclist.js`
const KAMERA_KOCKA_BAZIS = `https://cam.idokep.hu/anim/${KAMERA_NEV}/`
const KAMERA_KOCKAK_SZAMA = 100
const SZELTERKEP_URL = 'https://www.idokep.hu/terkep/hu/szelterkep3.mp4'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

function sendText(res, text, type = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Nem található: ' + filePath)
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const type = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(data)
  })
}

function sanitizePath(requestPath) {
  const normalized = path.normalize(requestPath).replace(/^\/+/, '')
  return path.join(PUBLIC_DIR, normalized)
}

function fokozatInfo(szint) {
  if (szint >= 2) return { szint, cimke: 'Másodfok', kulcs: 'masodfok' }
  if (szint === 1) return { szint, cimke: 'Elsőfok', kulcs: 'elsofok' }
  return { szint: 0, cimke: 'Alapfok', kulcs: 'alapfok' }
}

function viharjelzestFeldolgoz(html) {
  const talalatok = [...html.matchAll(/viharjelzes(\d+)\.png/g)].map((m) =>
    Number(m[1])
  )
  if (talalatok.length === 0) {
    return { ok: false, hiba: 'Nem található viharjelzés-kép az oldalon.' }
  }
  const nevek = ['Nyugati medence', 'Középső medence', 'Keleti medence']
  const medencek = nevek.map((nev, i) => {
    const info = fokozatInfo(talalatok[i] ?? talalatok[0])
    return {
      nev,
      ...info,
      kepUrl: `${MET_KEP_ALAP}viharjelzes${info.szint}.png`,
    }
  })
  const legmagasabb = Math.max(...talalatok)
  const osszesitett = fokozatInfo(legmagasabb)
  const idoTalalat = html.match(/HungaroMet:\s*([^\[]*)/)
  const frissitve = idoTalalat
    ? idoTalalat[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    : null
  return {
    ok: true,
    osszesitett: {
      ...osszesitett,
      kepUrl: `${MET_KEP_ALAP}viharjelzes${legmagasabb}.png`,
    },
    medencek,
    frissitve,
  }
}

async function viharjelzestLekered() {
  try {
    const valasz = await fetch(VIHAR_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!valasz.ok) {
      return { ok: false, hiba: `met.hu válasz: HTTP ${valasz.status}` }
    }
    const html = await valasz.text()
    return viharjelzestFeldolgoz(html)
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

async function idojarastLekered() {
  try {
    const valasz = await fetch(IDOJARAS_URL)
    const adat = await valasz.json()
    if (!valasz.ok) {
      return {
        ok: false,
        hiba: adat.message || `Időjárás lekérés hiba: HTTP ${valasz.status}`,
      }
    }
    return {
      ok: true,
      hely: IDOJARAS_HELY.nev,
      homerseklet: adat.main?.temp,
      hoerzet: adat.main?.feels_like,
      paratartalom: adat.main?.humidity,
      legnyomas: adat.main?.pressure,
      szelSebesseg: adat.wind?.speed,
      szelLoket: adat.wind?.gust,
      szelIrany: adat.wind?.deg,
      leiras: adat.weather?.[0]?.description,
      ikon: adat.weather?.[0]?.icon,
      felhozet: adat.clouds?.all,
      eso: adat.rain?.['1h'],
      ho: adat.snow?.['1h'],
      latotav: adat.visibility,
    }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

function datumSzovegge(d) {
  const h = String(d.getMonth() + 1).padStart(2, '0')
  const n = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${h}-${n}`
}

function vbNapok() {
  const napok = []
  const ma = new Date()
  for (let i = -VB_NAP_VISSZA; i <= VB_NAP_ELORE; i++) {
    const d = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + i)
    napok.push(datumSzovegge(d))
  }
  return napok
}

async function fociLekered() {
  try {
    const valaszok = await Promise.all(
      vbNapok().map((nap) =>
        fetch(`${SPORTSDB_ALAP}/eventsday.php?d=${nap}&l=${VB_LIGA_ID}`)
          .then((r) => (r.ok ? r.json() : { events: null }))
          .catch(() => ({ events: null }))
      )
    )
    const nyers = []
    valaszok.forEach((v) => {
      if (v && Array.isArray(v.events)) nyers.push(...v.events)
    })
    const latott = new Set()
    const meccsek = nyers
      .filter((e) => {
        if (!e || latott.has(e.idEvent)) return false
        latott.add(e.idEvent)
        return true
      })
      .map((e) => ({
        id: e.idEvent,
        idopont: e.strTimestamp,
        hazai: e.strHomeTeam,
        vendeg: e.strAwayTeam,
        hazaiGol: e.intHomeScore,
        vendegGol: e.intAwayScore,
        statusz: e.strStatus,
        fordulo: e.intRound,
      }))
    const idoSzerint = (a, b) => (a.idopont < b.idopont ? -1 : 1)
    const eredmenyek = meccsek
      .filter((m) => m.hazaiGol != null)
      .sort((a, b) => -idoSzerint(a, b))
      .slice(0, 7)
    const kovetkezok = meccsek
      .filter((m) => m.hazaiGol == null)
      .sort(idoSzerint)
      .slice(0, 7)
    return { ok: true, eredmenyek, kovetkezok }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

async function kameraLekered() {
  try {
    const valasz = await fetch(KAMERA_PICLIST, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.idokep.hu/',
      },
    })
    if (!valasz.ok) {
      return { ok: false, hiba: `Kamera lekérés: HTTP ${valasz.status}` }
    }
    const kod = await valasz.text()
    const idobelyegek = (kod.match(/\d{9,}/g) || []).map(Number)
    if (idobelyegek.length === 0) {
      return { ok: false, hiba: 'Nincs elérhető képkocka a kamerához.' }
    }
    return {
      ok: true,
      bazis: KAMERA_KOCKA_BAZIS,
      kockak: idobelyegek.slice(-KAMERA_KOCKAK_SZAMA),
    }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

async function szelterkepLekered() {
  try {
    const valasz = await fetch(SZELTERKEP_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://www.idokep.hu/szel',
      },
    })
    if (!valasz.ok) {
      return { ok: false, hiba: `Szél-térkép: HTTP ${valasz.status}` }
    }
    const buffer = Buffer.from(await valasz.arrayBuffer())
    return { ok: true, adat: buffer }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/vihar') {
    sendJson(res, await viharjelzestLekered())
    return
  }
  if (pathname === '/api/idojaras') {
    sendJson(res, await idojarastLekered())
    return
  }
  if (pathname === '/api/foci') {
    sendJson(res, await fociLekered())
    return
  }
  if (pathname === '/api/kamera') {
    sendJson(res, await kameraLekered())
    return
  }
  if (pathname === '/api/szelterkep') {
    const eredmeny = await szelterkepLekered()
    if (!eredmeny.ok) {
      sendJson(res, eredmeny)
      return
    }
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
    })
    res.end(eredmeny.adat)
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: false, hiba: 'Ismeretlen API útvonal.' }))
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`)
    const pathname = parsed.pathname
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname)
      return
    }
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : sanitizePath(pathname)
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Hozzáférés megtagadva')
      return
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Nem található')
      return
    }
    sendFile(res, filePath)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Szerver hiba: ' + err.message)
  }
})

server.listen(PORT, () => {
  console.log(`Web app elérhető: http://localhost:${PORT}`)
})
