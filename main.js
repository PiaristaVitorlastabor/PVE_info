// =============================================================
//  main.js  —  az Electron "fő folyamata" (main process)
// =============================================================
//
//  Ez a fájl fut le ELŐSZÖR, amikor elindítod az appot. Node.js
//  környezetben fut, ezért hozzáfér a hálózathoz és a fájlrendszerhez.
//  Két dolga van:
//    1) létrehozza az ablakot (a látható részt a src/index.html adja),
//    2) lekéri az internetről az adatokat (viharjelzés + időjárás).
//
//  MIÉRT ITT kérjük le az adatokat, és nem az ablak belsejében?
//  Mert az ablak (a "renderer") olyan, mint egy böngészőfül, és a
//  böngészők biztonsági okból NEM engedik, hogy egy oldal egy másik
//  weboldalról (pl. met.hu) adatot töltsön le — ezt hívják CORS-nak.
//  A main process viszont Node.js, rá ez a korlát nem vonatkozik, így
//  innen szabadon le tudjuk kérni a met.hu oldalt is. Az eredményt
//  aztán egy biztonságos "csövön" (IPC) keresztül adjuk át az ablaknak.

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

// -------------------------------------------------------------
//  ÁLLANDÓK (konfiguráció) — itt tudod majd könnyen átállítani.
// -------------------------------------------------------------

// A met.hu oldalon a tényleges viharjelzés-táblázat egy külön kis
// oldalon (iframe-ben) van; ez az a lap, amit le kell töltenünk.
const VIHAR_URL =
  'https://www.met.hu/idojaras/tavaink/balaton/viharjelzes/main.php'

// A met.hu ezen a helyen tárolja a jelzés-képeket (viharjelzes0/1/2.png).
// Ezt majd az ablakban is használjuk, hogy az EREDETI képet mutassuk.
const MET_KEP_ALAP = 'https://www.met.hu/images/elemek/'

// OpenWeather — az INGYENES "Current Weather" (2.5-ös) végpontot
// használjuk. (A linkelt One Call 3.0-hoz külön, fizetős előfizetés
// kellene, ezért arra most nem építünk.)
const OPENWEATHER_KULCS = 'a69e3e0bba0d9ced099ba6c278531be5'

// Melyik Balaton-parti pontra kérjük az időjárást? Balatonberény
// (a délnyugati parton, itt van a vitorlástábor).
// (A szélesség/hosszúság = latitude/longitude, azaz földrajzi koordináták.)
const IDOJARAS_HELY = { nev: 'Balatonberény', lat: 46.7086, lon: 17.3078 }

// Ebből építjük fel az időjárás-lekérés webcímét. A units=metric a
// Celsiust és m/s-t adja, a lang=hu pedig magyar leírást ("felhős").
const IDOJARAS_URL =
  'https://api.openweathermap.org/data/2.5/weather' +
  `?lat=${IDOJARAS_HELY.lat}&lon=${IDOJARAS_HELY.lon}` +
  `&units=metric&lang=hu&appid=${OPENWEATHER_KULCS}`

// TheSportsDB — INGYENES, regisztráció nélküli sport-adatbázis. A "3"
// egy nyilvános teszt-kulcs. Innen kérjük a 2026-os FIFA VB adatait.
const SPORTSDB_ALAP = 'https://www.thesportsdb.com/api/v1/json/3'
const VB_LIGA_ID = '4429' // a FIFA World Cup azonosítója a TheSportsDB-ben

// Ennyi nappal nézünk vissza/előre a mai naptól, hogy összegyűjtsük a
// legutóbbi eredményeket és a következő meccseket.
const VB_NAP_VISSZA = 3
const VB_NAP_ELORE = 3

// idokep.hu webkamera — Balatonberény (INDERNET). Az idokep NEM egy
// videó-streamet ad, hanem gyorsan egymás után készült JPG képkockákat,
// amiket "lejátszva" kapjuk a mozgóképet. A képkockák időbélyegeit egy
// "piclist.js" nevű fájl sorolja fel (var imgs=[...]); maguk a képek itt:
//   https://cam.idokep.hu/anim/<kameranev>/<időbélyeg>.jpg
const KAMERA_NEV = 'indernet5'
const KAMERA_PICLIST = `https://cam.idokep.hu/cam/${KAMERA_NEV}/piclist.js`
const KAMERA_KOCKA_BAZIS = `https://cam.idokep.hu/anim/${KAMERA_NEV}/`
const KAMERA_KOCKAK_SZAMA = 100 // ennyi LEGUTÓBBI képkockát pörgetünk körbe

// idokep.hu szél-térkép — az ANIMÁLT (mp4) verzió. Az idokep iframe-ben
// tiltja a beágyazást, ezért a VIDEÓT töltjük le a main processben, és
// data URL-ként adjuk át az ablaknak (a hotlink-védelmet is így kerüljük
// ki). Az ablakban Balatonra zoomolunk rá (CSS-sel).
const SZELTERKEP_URL = 'https://www.idokep.hu/terkep/hu/szelterkep3.mp4'

// A met.hu oldalon a mért szél- és időjárás adatok táblázata
const MERT_ADATOK_URL = 'https://www.met.hu/idojaras/tavaink/balaton/mert_adatok/'

// -------------------------------------------------------------
//  Az ablak létrehozása
// -------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1120, // szélesebb ablak, hogy elférjen az 1/3 – 2/3 osztás
    height: 680,
    minWidth: 720,
    minHeight: 480,
    title: 'Balatoni viharjelzés',
    webPreferences: {
      // Biztonsági alapbeállítások: az oldal NEM fér közvetlenül a
      // Node.js-hez. Ehelyett a preload.js egy szűk, biztonságos
      // "API-t" ad az ablaknak (lásd ott).
      contextIsolation: true,
      nodeIntegration: false,
      // A preload egy köztes szkript, ami MIND a Node.js-t, MIND az
      // ablakot látja — ő építi ki a biztonságos hidat a kettő között.
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))
}

// =============================================================
//  ADATLEKÉRÉS 1.  —  Viharjelzés a met.hu-ról
// =============================================================
//
//  A met.hu HTML-t ad vissza (nem "szép" adatot), ezért nekünk kell
//  kibányászni belőle a lényeget. A képek neve árulja el a fokozatot:
//    viharjelzes0.png -> alapfok  (nincs élő viharjelzés)
//    viharjelzes1.png -> elsőfok  (sárga)
//    viharjelzes2.png -> másodfok (piros)
//  A lapon három medence szerepel ebben a sorrendben:
//    Nyugati, Középső, Keleti.

// Egy szám -> ember által olvasható címke + belső "kulcs" (a színhez).
function fokozatInfo(szint) {
  if (szint >= 2) return { szint, cimke: 'Másodfok', kulcs: 'masodfok' }
  if (szint === 1) return { szint, cimke: 'Elsőfok', kulcs: 'elsofok' }
  return { szint: 0, cimke: 'Alapfok', kulcs: 'alapfok' }
}

// A letöltött HTML szövegből kinyeri a szükséges adatokat.
function viharjelzestFeldolgoz(html) {
  // 1) Megkeressük az ÖSSZES "viharjelzesN.png" előfordulást, és
  //    kiszedjük belőle az N számot. A matchAll az összes találatot
  //    végigjárja; a Number(...) szöveg -> szám átalakítás.
  const talalatok = [...html.matchAll(/viharjelzes(\d+)\.png/g)].map((m) =>
    Number(m[1])
  )

  // Ha egyetlen képet sem találtunk, valószínűleg megváltozott az oldal.
  if (talalatok.length === 0) {
    return { ok: false, hiba: 'Nem található viharjelzés-kép az oldalon.' }
  }

  // 2) A három medence rögzített sorrendben van. Amelyikhez nincs
  //    külön adat, ott az elsőt használjuk tartaléknak.
  const nevek = ['Nyugati medence', 'Középső medence', 'Keleti medence']
  const medencek = nevek.map((nev, i) => {
    const info = fokozatInfo(talalatok[i] ?? talalatok[0])
    return {
      nev,
      ...info,
      kepUrl: `${MET_KEP_ALAP}viharjelzes${info.szint}.png`,
    }
  })

  // 3) Az "összesített" állapot a legmagasabb fokozat (a legszigorúbb).
  const legmagasabb = Math.max(...talalatok)
  const osszesitett = fokozatInfo(legmagasabb)

  // 4) A frissítés időpontja: "HungaroMet: 2026. július 2. 09:52 (...)"
  //    A [^\[]* azt jelenti: minden karakter a nyitó "[" jeléig.
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

// Ez a függvény TÖLTI LE a met.hu oldalt, majd feldolgozza.
async function viharjelzestLekered() {
  try {
    // Néhány szerver elutasítja a kéréseket, ha nincs "User-Agent"
    // (böngésző-azonosító), ezért adunk neki egyet.
    const valasz = await fetch(VIHAR_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!valasz.ok) {
      return { ok: false, hiba: `met.hu válasz: HTTP ${valasz.status}` }
    }
    const html = await valasz.text()
    return viharjelzestFeldolgoz(html)
  } catch (err) {
    // Ide akkor jutunk, ha pl. nincs internet.
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

// =============================================================
//  ADATLEKÉRÉS 2.  —  Aktuális időjárás (OpenWeather)
// =============================================================
async function idojarastLekered() {
  try {
    const valasz = await fetch(IDOJARAS_URL)
    // Az OpenWeather még hiba esetén is JSON-t küld egy "cod" mezővel.
    const adat = await valasz.json()

    if (!valasz.ok) {
      // A leggyakoribb eset a 401: rossz VAGY még nem aktivált kulcs.
      return {
        ok: false,
        hiba:
          adat.message ||
          `Időjárás lekérés hiba: HTTP ${valasz.status}`,
      }
    }

    // Csak azt adjuk tovább az ablaknak, amire tényleg szükség van.
    return {
      ok: true,
      hely: IDOJARAS_HELY.nev,
      homerseklet: adat.main?.temp, // °C
      hoerzet: adat.main?.feels_like, // °C ("hőérzet")
      paratartalom: adat.main?.humidity, // %
      legnyomas: adat.main?.pressure, // hPa
      szelSebesseg: adat.wind?.speed, // m/s
      szelLoket: adat.wind?.gust, // m/s (széllökés, ha van adat)
      szelIrany: adat.wind?.deg, // fok (0 = észak)
      leiras: adat.weather?.[0]?.description, // pl. "közepesen felhős"
      ikon: adat.weather?.[0]?.icon, // pl. "04d" -> ebből lesz a kép
      felhozet: adat.clouds?.all, // % (felhőborítottság)
      // A rain/snow "1h" mező CSAK akkor jön, ha épp esik/havazik.
      eso: adat.rain?.['1h'], // mm az elmúlt 1 órában
      ho: adat.snow?.['1h'], // mm az elmúlt 1 órában (hó)
      latotav: adat.visibility, // méter (max 10000)
    }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

// =============================================================
//  ADATLEKÉRÉS 3.  —  Foci VB (TheSportsDB)
// =============================================================
//
//  Az ingyenes végpont fordulónként/lekérésenként keveset ad vissza,
//  ezért NAPI bontásban kérjük le a meccseket a mai nap körül, majd
//  MI magunk bontjuk szét: aminek már van eredménye = "legutóbbi
//  eredmény", aminek még nincs = "következő meccs".

// Egy Date-ből "ÉÉÉÉ-HH-NN" formátumú szöveget csinál (ezt várja az API).
function datumSzoveggé(d) {
  const h = String(d.getMonth() + 1).padStart(2, '0')
  const n = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${h}-${n}`
}

// Legenerálja a lekérendő napok listáját (ma ± néhány nap).
function vbNapok() {
  const napok = []
  const ma = new Date()
  for (let i = -VB_NAP_VISSZA; i <= VB_NAP_ELORE; i++) {
    // Új dátum "ma + i nap" — a Date magától kezeli a hónapfordulót.
    const d = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + i)
    napok.push(datumSzoveggé(d))
  }
  return napok
}

async function fociLekered() {
  try {
    // Minden naphoz külön lekérés — PÁRHUZAMOSAN indítjuk (Promise.all).
    // Ha egy nap lekérése elhasal, azt üresnek vesszük (nem dől össze).
    const valaszok = await Promise.all(
      vbNapok().map((nap) =>
        fetch(`${SPORTSDB_ALAP}/eventsday.php?d=${nap}&l=${VB_LIGA_ID}`)
          .then((r) => (r.ok ? r.json() : { events: null }))
          .catch(() => ({ events: null }))
      )
    )

    // Összeöntjük az összes meccset egyetlen listába.
    const nyers = []
    valaszok.forEach((v) => {
      if (v && Array.isArray(v.events)) nyers.push(...v.events)
    })

    // Ugyanaz a meccs több napi lekérésben is felbukkanhat (időzóna
    // miatt) — az idEvent alapján kiszűrjük a duplikátumokat.
    const latott = new Set()
    const meccsek = nyers
      .filter((e) => {
        if (!e || latott.has(e.idEvent)) return false
        latott.add(e.idEvent)
        return true
      })
      .map((e) => ({
        id: e.idEvent,
        idopont: e.strTimestamp, // UTC időpont, pl. "2026-07-02T19:00:00"
        hazai: e.strHomeTeam,
        vendeg: e.strAwayTeam,
        hazaiGol: e.intHomeScore, // null, ha még nem játszották le
        vendegGol: e.intAwayScore,
        statusz: e.strStatus, // FT / AET / AP / NS / stb.
        fordulo: e.intRound,
      }))

    // Rendezéshez: a "2026-07-02T19:00:00" szövegek időrendben is
    // helyesen összehasonlíthatók (mind ugyanolyan formátum).
    const idoSzerint = (a, b) => (a.idopont < b.idopont ? -1 : 1)

    // Eredmény = amihez már van gólszám. A legfrissebb elöl (fordított sorrend).
    const eredmenyek = meccsek
      .filter((m) => m.hazaiGol != null)
      .sort((a, b) => -idoSzerint(a, b))
      .slice(0, 7)

    // Következő = amihez még nincs eredmény. A leghamarabbi elöl.
    const kovetkezok = meccsek
      .filter((m) => m.hazaiGol == null)
      .sort(idoSzerint)
      .slice(0, 7)

    return { ok: true, eredmenyek, kovetkezok }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

// =============================================================
//  ADATLEKÉRÉS 4.  —  Webkamera képkockái (idokep.hu)
// =============================================================
//
//  Csak a képkockák IDŐBÉLYEGEIT kérjük le itt (a piclist.js-ből).
//  Magukat a képeket majd az ablak tölti be <img>-ként — arra nem
//  vonatkozik a CORS-korlát, szóval az ott is működik.
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
    // A piclist.js egy "var imgs=[unix időbélyegek]" — nekünk csak a
    // számok kellenek belőle (9+ jegyű = unix időbélyeg másodpercben).
    const idobelyegek = (kod.match(/\d{9,}/g) || []).map(Number)
    if (idobelyegek.length === 0) {
      return { ok: false, hiba: 'Nincs elérhető képkocka a kamerához.' }
    }
    // Csak a legutóbbi N képkockát adjuk vissza (a friss "élő" hurokhoz).
    return {
      ok: true,
      bazis: KAMERA_KOCKA_BAZIS,
      kockak: idobelyegek.slice(-KAMERA_KOCKAK_SZAMA),
    }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

// =============================================================
//  ADATLEKÉRÉS 5.  —  Szél-térkép kép (idokep.hu)
// =============================================================
//
//  Letöltjük a szél-térkép JPG-t, és base64 "data URL"-lé alakítjuk,
//  amit az ablak közvetlenül be tud tenni egy <img>-be. Így nem
//  akad fenn se a CORS-on, se az esetleges hotlink-védelmen.
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
    // A videót nyers bájtokként kérjük, majd base64-be kódoljuk, hogy
    // közvetlenül egy <video>-ba tehető data URL legyen belőle.
    const buffer = Buffer.from(await valasz.arrayBuffer())
    return { ok: true, kep: `data:video/mp4;base64,${buffer.toString('base64')}` }
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` }
  }
}

// =============================================================
//  ADATLEKÉRÉS 6.  —  Mért széladatok (met.hu)
// =============================================================
function mertAdatokatFeldolgoz(html) {
  // Tisztítsuk meg a HTML-t az újsoroktól és extra szóközöktől a könnyebb regex illesztésért
  const tisztaHtml = html.replace(/\s+/g, ' ');

  // Keresett települések listája
  const celpontok = ['Balatonmáriafürdő', 'Keszthely platform'];
  const eredmeny = {};

  celpontok.forEach((hely) => {
    // Regex magyarázat: megkeresi a hely nevét egy <td>-ben, majd végigkíséri a következő <td> elemeket
    // [^>]*>([^<]*)< kinyeri a szöveges tartalmat a <td> és </td> jelek közül.
    const sorRegex = new RegExp(
      `<td>\\s*${hely}\\s*<\/td>\\s*` + 
      `<td>[^<]*<\/td>\\s*` + // 2. oszlop (Széllökés irány)
      `<td>([^<]*)<\/td>\\s*` + // 3. oszlop (Széllökés Beaufort) -> Kívánt
      `<td>([^<]*)<\/td>\\s*` + // 4. oszlop (Széllökés km/h)     -> Kívánt
      `<td>[^<]*<\/td>\\s*` + // 5. oszlop (Átlagszél irány)
      `<td>[^<]*<\/td>\\s*` + // 6. oszlop (Átlagszél Beaufort)
      `<td>([^<]*)<\/td>\\s*` + // 7. oszlop (Átlagszél irány fok) -> Kívánt
      `<td>([^<]*)<\/td>`,      // 8. oszlop (Átlagszél sebesség)  -> Kívánt
      'i'
    );

    const talalat = tisztaHtml.match(sorRegex);

    if (talalat) {
      eredmeny[hely] = {
        szellokesBeaufort: talalat[1].trim(),
        szellokesKmh: talalat[2].trim(),
        atlagszelIranyFok: talalat[3].trim(),
        atlagszelSebessegKmh: talalat[4].trim(),
      };
    } else {
      eredmeny[hely] = { hiba: 'Nem található adat ehhez a helyszínhez.' };
    }
  });

  return { ok: true, adatok: eredmeny };
}

async function mertAdatokatLekered() {
  try {
    const valasz = await fetch(MERT_ADATOK_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!valasz.ok) {
      return { ok: false, hiba: `met.hu válasz: HTTP ${valasz.status}` };
    }
    const html = await valasz.text();
    return mertAdatokatFeldolgoz(html);
  } catch (err) {
    return { ok: false, hiba: `Hálózati hiba: ${err.message}` };
  }
}

// =============================================================
//  IPC — a biztonságos "cső" az ablak és a main process között
// =============================================================
//
//  Az ablak (renderer) NEM tud közvetlenül internetezni. Ezért itt
//  "csatornákat" nyitunk: amikor az ablak a 'vihar:lekered' üzenetet
//  küldi, lefuttatjuk a fenti függvényt, és visszaküldjük az eredményt.
//  (A preload.js köti majd össze ezeket az ablak oldali hívásokkal.)
ipcMain.handle('vihar:lekered', () => viharjelzestLekered())
ipcMain.handle('idojaras:lekered', () => idojarastLekered())
ipcMain.handle('foci:lekered', () => fociLekered())
ipcMain.handle('kamera:lekered', () => kameraLekered())
ipcMain.handle('szelterkep:lekered', () => szelterkepLekered())
ipcMain.handle('mertadatok:lekered', () => mertAdatokatLekered())

// =============================================================
//  Az app életciklusa (ugyanaz a minta, mint a lock-in appban)
// =============================================================
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
