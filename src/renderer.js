// =============================================================
//  renderer.js  —  az ablak BELSEJÉNEK a JavaScriptje
// =============================================================
//
//  Ez fut az ablakban (mint egy weboldal szkriptje). Nem internetezik
//  közvetlenül — a preload.js által adott "window.viharAPI" függvényeit
//  hívja, azok kérik le a main processtől az adatokat.
//
//  Feladatai:
//    1) másodpercenként frissíti az élő órát,
//    2) induláskor és 5 percenként lekéri + kirajzolja
//       a viharjelzést, az időjárást (szél!) és a foci VB-t.

// -------------------------------------------------------------
//  1) DOM-elemek "megfogása" id alapján.
// -------------------------------------------------------------
const oraIdo = document.getElementById('oraIdo')
const oraDatum = document.getElementById('oraDatum')

// Viharjelzés (bal)
const viharPanel = document.getElementById('viharPanel')
const viharKep = document.getElementById('viharKep')
const viharFokozat = document.getElementById('viharFokozat')
const viharLeiras = document.getElementById('viharLeiras')
const medencekEl = document.getElementById('medencek')
const viharForrasIdo = document.getElementById('viharForrasIdo')
const viharSajatIdo = document.getElementById('viharSajatIdo')
const camKep = document.getElementById('camKep')
const camAllapot = document.getElementById('camAllapot')

// Időjárás / szél (közép)
const szelKmh = document.getElementById('szelKmh')
const szelNyil = document.getElementById('szelNyil')
const szelIranyLabel = document.getElementById('szelIranyLabel')
const szelExtra = document.getElementById('szelExtra')
const szelLoket = document.getElementById('szelLoket')
const idoIkon = document.getElementById('idoIkon')
const idoHom = document.getElementById('idoHom')
const idoLeiras = document.getElementById('idoLeiras')
const idoReszletek = document.getElementById('idoReszletek')
const idoSajatIdo = document.getElementById('idoSajatIdo')
const szelterkepVideo = document.getElementById('szelterkepVideo')

// Foci VB (jobb)
const vbEredmenyek = document.getElementById('vbEredmenyek')
const vbKovetkezok = document.getElementById('vbKovetkezok')
const vbSajatIdo = document.getElementById('vbSajatIdo')

// Frissítési gyakoriság: 5 perc, ezredmásodpercben.
const FRISSITES_MS = 5 * 60 * 1000

// A webkamerát gyakrabban frissítjük (új képkockákért): 60 másodpercenként.
const KAMERA_FRISSITES_MS = 60 * 1000
// Milyen gyorsan pörögjenek a képkockák (egy kocka ennyi ideig látszik).
const KAMERA_KOCKA_MS = 150

// A szél-térkép videó nagy (~8 MB), ritkábban frissítjük: 15 percenként.
// (A videó közben helyben, folyamatosan pörög, tehát mindig "él".)
const SZELTERKEP_FRISSITES_MS = 15 * 60 * 1000

// A szél-térkép animáció lejátszási sebessége (1 = eredeti, 0.5 = fele).
const SZELTERKEP_SEBESSEG = 0.5

// Melyik státuszok jelentik, hogy a meccs BEFEJEZŐDÖTT?
// FT = rendes idő vége, AET = hosszabbítás után, AP = tizenegyesek után.
const BEFEJEZETT = new Set(['FT', 'AET', 'AP', 'Match Finished'])

// -------------------------------------------------------------
//  Apró segédfüggvények
// -------------------------------------------------------------

// Két számjegyre egészít ("9" -> "09").
function ketJegy(n) {
  return String(n).padStart(2, '0')
}

// Biztonságos szövegbeillesztés: a <, >, & jeleket ártalmatlanítja,
// hogy a beszúrt adat ne tudjon HTML-t "belopni" az oldalba.
function esc(szoveg) {
  return String(szoveg ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const HONAPOK = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]
const HONAP_ROVID = [
  'jan.', 'feb.', 'márc.', 'ápr.', 'máj.', 'jún.',
  'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.',
]
const NAPOK = ['vas.', 'hét.', 'kedd', 'sze.', 'csüt.', 'pén.', 'szo.']

// "most" óra:perc formában (a "frissítve" jelzéshez).
function mostSzoveg() {
  const m = new Date()
  return `${ketJegy(m.getHours())}:${ketJegy(m.getMinutes())}`
}

// Egy UTC időbélyeget ("2026-07-02T19:00:00") HELYI idő szerinti
// "júl. 2. 21:00" formára hoz. (A böngésző a helyi időzónára vált.)
function mikorSzoveg(utcIso) {
  if (!utcIso) return ''
  const d = new Date(utcIso.endsWith('Z') ? utcIso : utcIso + 'Z')
  return `${HONAP_ROVID[d.getMonth()]} ${d.getDate()}. ${ketJegy(
    d.getHours()
  )}:${ketJegy(d.getMinutes())}`
}

// =============================================================
//  ÉLŐ ÓRA
// =============================================================
function oratFrissit() {
  const most = new Date()
  oraIdo.textContent =
    ketJegy(most.getHours()) +
    ':' +
    ketJegy(most.getMinutes()) +
    ':' +
    ketJegy(most.getSeconds())
  oraDatum.textContent =
    `${most.getFullYear()}. ${HONAPOK[most.getMonth()]} ${most.getDate()}. ` +
    NAPOK[most.getDay()]
}

// =============================================================
//  VIHARJELZÉS kirajzolása (bal)
// =============================================================
function viharKirajzol(adat) {
  viharSajatIdo.textContent = ` · Frissítve: ${mostSzoveg()}`

  if (!adat || !adat.ok) {
    viharPanel.className = 'panel vihar'
    viharKep.removeAttribute('src')
    viharFokozat.textContent = 'Nem elérhető'
    viharLeiras.textContent = adat?.hiba || 'Ismeretlen hiba.'
    medencekEl.innerHTML = ''
    viharForrasIdo.textContent = ''
    return
  }

  viharPanel.className = `panel vihar vihar--${adat.osszesitett.kulcs}`
  viharKep.src = adat.osszesitett.kepUrl
  viharFokozat.textContent = adat.osszesitett.cimke
  viharLeiras.textContent =
    adat.osszesitett.szint === 0
      ? 'Nincs érvényben viharjelzés a Balatonon.'
      : `${adat.osszesitett.cimke}ú viharjelzés érvényben.`

  medencekEl.innerHTML = ''
  adat.medencek.forEach((m) => {
    const div = document.createElement('div')
    div.className = 'medence'
    div.innerHTML = `
      <img class="medence__kep" src="${esc(m.kepUrl)}" alt="" />
      <div class="medence__nev">${esc(m.nev)}</div>
      <div class="medence__szoveg">
        <div class="medence__fok">${esc(m.cimke)}</div>
      </div>
    `
    medencekEl.appendChild(div)
  })

  viharForrasIdo.textContent = adat.frissitve
    ? `Forrás (met.hu): ${adat.frissitve}`
    : 'Forrás: met.hu'
}

// =============================================================
//  IDŐJÁRÁS / SZÉL kirajzolása (közép)
// =============================================================

// Szélirány fokból (0–360) magyar égtájjá — AHONNAN a szél fúj.
function szelIranyNev(fok) {
  if (fok == null) return '–'
  const egtajak = ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy']
  return egtajak[Math.round(fok / 45) % 8]
}

// Beaufort-fokozat és neve a szélsebességből (m/s). A vitorlázóknak
// ez a legbeszédesebb mérték.
function beaufort(ms) {
  const hatarok = [0.5, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
  const nevek = [
    'szélcsend', 'gyenge szellő', 'enyhe szél', 'gyenge szél',
    'mérsékelt szél', 'élénk szél', 'erős szél', 'viharos szél',
    'élénk viharos szél', 'heves vihar', 'dühöngő vihar', 'szélvész', 'orkán',
  ]
  let fok = 0
  for (const h of hatarok) {
    if (ms >= h) fok++
    else break
  }
  return { fok, nev: nevek[fok] }
}

function idojarasKirajzol(adat) {
  idoSajatIdo.textContent = `Frissítve: ${mostSzoveg()}`

  if (!adat || !adat.ok) {
    szelKmh.textContent = '–'
    szelNyil.style.transform = 'rotate(0deg)'
    szelIranyLabel.textContent = ''
    szelExtra.textContent = ''
    szelLoket.textContent = ''
    idoIkon.removeAttribute('src')
    idoHom.textContent = '–'
    idoLeiras.textContent = ''
    idoReszletek.innerHTML = `
      <div class="hiba">
        <strong>Az időjárás most nem elérhető.</strong><br />
        ${esc(adat?.hiba || 'Ismeretlen hiba.')}
      </div>
    `
    return
  }

  // --- SZÉL (a főszereplő) ---
  const ms = adat.szelSebesseg // m/s
  if (ms != null) {
    const kmh = Math.round(ms * 3.6)
    const csomo = Math.round(ms * 1.94384) // 1 m/s = 1,94384 csomó
    const bft = beaufort(ms)
    szelKmh.textContent = kmh
    szelExtra.textContent = `${csomo} csomó · ${bft.fok} Bft — ${bft.nev}`
    // A nyíl abba mutasson, AMERRE a szél fúj (az irány + 180 fok).
    if (adat.szelIrany != null) {
      szelNyil.style.transform = `rotate(${(adat.szelIrany + 180) % 360}deg)`
      szelIranyLabel.textContent = `${szelIranyNev(adat.szelIrany)} felől`
    } else {
      szelIranyLabel.textContent = ''
    }
  } else {
    szelKmh.textContent = '–'
    szelExtra.textContent = ''
    szelIranyLabel.textContent = ''
  }

  // Széllökés (ha az API ad ilyen adatot).
  szelLoket.textContent =
    adat.szelLoket != null
      ? `Széllökés: ${Math.round(adat.szelLoket * 3.6)} km/h`
      : ''

  // --- Másodlagos infók ---
  idoIkon.src = `https://openweathermap.org/img/wn/${adat.ikon}@2x.png`
  idoHom.textContent = `${Math.round(adat.homerseklet)}°C`
  idoLeiras.textContent = adat.leiras || ''

  // Csapadék: eső, ha van adat; különben hó; különben 0.
  const csapadek =
    adat.eso != null
      ? `${adat.eso} mm/h`
      : adat.ho != null
      ? `${adat.ho} mm/h hó`
      : '0 mm'
  // Látótáv méterből km-re (10 km a jellemző maximum az API-ban).
  const latotav =
    adat.latotav != null
      ? adat.latotav >= 10000
        ? '10+ km'
        : (adat.latotav / 1000).toFixed(1) + ' km'
      : '–'

  idoReszletek.innerHTML = `
    <div class="reszlet">
      <div class="reszlet__cimke">Hőérzet</div>
      <div class="reszlet__ertek">${
        adat.hoerzet != null ? Math.round(adat.hoerzet) + '°C' : '–'
      }</div>
    </div>
    <div class="reszlet">
      <div class="reszlet__cimke">Csapadék (1ó)</div>
      <div class="reszlet__ertek">${csapadek}</div>
    </div>
    <div class="reszlet">
      <div class="reszlet__cimke">Felhőzet</div>
      <div class="reszlet__ertek">${adat.felhozet ?? '–'}%</div>
    </div>
    <div class="reszlet">
      <div class="reszlet__cimke">Páratartalom</div>
      <div class="reszlet__ertek">${adat.paratartalom ?? '–'}%</div>
    </div>
    <div class="reszlet">
      <div class="reszlet__cimke">Látótáv</div>
      <div class="reszlet__ertek">${latotav}</div>
    </div>
    <div class="reszlet">
      <div class="reszlet__cimke">Légnyomás</div>
      <div class="reszlet__ertek">${adat.legnyomas ?? '–'} hPa</div>
    </div>
  `
}

// =============================================================
//  FOCI VB kirajzolása (jobb)
// =============================================================

// Csapatnév -> ISO országkód. Ebből képezzük a zászló-emojit.
// (Pontosan azok a szövegek, amiket a TheSportsDB ad a VB-csapatokra.)
const ORSZAG_KOD = {
  Algeria: 'DZ', Argentina: 'AR', Australia: 'AU', Austria: 'AT',
  Belgium: 'BE', 'Bosnia-Herzegovina': 'BA', Brazil: 'BR', Canada: 'CA',
  'Cape Verde': 'CV', Colombia: 'CO', Croatia: 'HR', 'Curaçao': 'CW',
  'Czech Republic': 'CZ', 'DR Congo': 'CD', Ecuador: 'EC', Egypt: 'EG',
  France: 'FR', Germany: 'DE', Ghana: 'GH', Haiti: 'HT', Iran: 'IR',
  Iraq: 'IQ', 'Ivory Coast': 'CI', Japan: 'JP', Jordan: 'JO', Mexico: 'MX',
  Morocco: 'MA', Netherlands: 'NL', 'New Zealand': 'NZ', Norway: 'NO',
  Paraguay: 'PY', Portugal: 'PT', Qatar: 'QA', 'Saudi Arabia': 'SA',
  Senegal: 'SN', 'South Africa': 'ZA', 'South Korea': 'KR', Spain: 'ES',
  Sweden: 'SE', Switzerland: 'CH', Tunisia: 'TN', Turkey: 'TR', USA: 'US',
  Uruguay: 'UY', Uzbekistan: 'UZ',
}

// England és Skócia nem önálló ország, de VAN saját zászló-emojijuk
// (különleges karaktersorozat) — ezeket kézzel adjuk meg.
const KULON_ZASZLO = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
}

// Csapatnévből zászló-emoji. Az ISO2 kód két betűjét "regionális jelző"
// karakterekké alakítjuk — ezekből rakja össze a rendszer a zászlót.
function zaszlo(nev) {
  if (KULON_ZASZLO[nev]) return KULON_ZASZLO[nev]
  const kod = ORSZAG_KOD[nev]
  if (!kod) return '' // ismeretlen csapat -> nincs zászló, de a név megmarad
  return kod.replace(/./g, (b) =>
    String.fromCodePoint(0x1f1e6 + b.charCodeAt(0) - 65)
  )
}

// A forduló számából ember-barát nevet csinál (legjobb tudásunk szerint;
// most a kieséses szakaszban vagyunk, a csoportkör már lement).
function forduloNev(r) {
  const map = {
    1: 'Csoportkör', 2: 'Csoportkör', 3: 'Csoportkör',
    32: 'Legjobb 32', 16: 'Nyolcaddöntő', 8: 'Negyeddöntő', 4: 'Elődöntő',
  }
  return map[r] || ''
}

// Egy LEJÁTSZOTT (vagy épp élő) meccs egy sora.
function eredmenySor(m) {
  const elo = m.hazaiGol != null && !BEFEJEZETT.has(m.statusz)
  const meta = elo ? 'ÉLŐ' : forduloNev(m.fordulo)
  return `
    <div class="vb-meccs ${elo ? 'vb-meccs--elo' : ''}">
      <div class="vb-meccs__hazai">${esc(m.hazai)} <span class="vb-zaszlo">${zaszlo(
        m.hazai
      )}</span></div>
      <div class="vb-meccs__kozep">
        <div class="vb-meccs__eredmeny">${esc(m.hazaiGol)}–${esc(m.vendegGol)}</div>
        <div class="vb-meccs__meta">${esc(meta)}</div>
      </div>
      <div class="vb-meccs__vendeg"><span class="vb-zaszlo">${zaszlo(
        m.vendeg
      )}</span> ${esc(m.vendeg)}</div>
    </div>
  `
}

// Egy KÖVETKEZŐ meccs egy sora (időpont, még nincs eredmény).
function kovetkezoSor(m) {
  return `
    <div class="vb-meccs">
      <div class="vb-meccs__hazai">${esc(m.hazai)} <span class="vb-zaszlo">${zaszlo(
        m.hazai
      )}</span></div>
      <div class="vb-meccs__kozep">
        <div class="vb-meccs__ido">${esc(mikorSzoveg(m.idopont))}</div>
        <div class="vb-meccs__meta">${esc(forduloNev(m.fordulo))}</div>
      </div>
      <div class="vb-meccs__vendeg"><span class="vb-zaszlo">${zaszlo(
        m.vendeg
      )}</span> ${esc(m.vendeg)}</div>
    </div>
  `
}

function fociKirajzol(adat) {
  vbSajatIdo.textContent = `Frissítve: ${mostSzoveg()} · Forrás: TheSportsDB`

  if (!adat || !adat.ok) {
    vbEredmenyek.innerHTML = `<div class="hiba">${esc(
      adat?.hiba || 'A VB-adatok most nem elérhetők.'
    )}</div>`
    vbKovetkezok.innerHTML = ''
    return
  }

  vbEredmenyek.innerHTML = adat.eredmenyek.length
    ? adat.eredmenyek.map(eredmenySor).join('')
    : '<div class="halvany">Nincs friss eredmény.</div>'

  vbKovetkezok.innerHTML = adat.kovetkezok.length
    ? adat.kovetkezok.map(kovetkezoSor).join('')
    : '<div class="halvany">Nincs közelgő meccs a következő napokban.</div>'
}

// =============================================================
//  WEBKAMERA lejátszása (bal, a viharjelzés alatt)
// =============================================================
//
//  Az idokep nem videót ad, hanem sok kis képkockát. Ezeket gyorsan
//  egymás után lecserélve kapjuk a "mozgóképet" (mint egy pörgetett
//  fotósorozat). A képkockákat előtöltjük, hogy ne villogjon.

let camKockak = [] // a képkockák teljes URL-jei
let camIndex = 0 // épp hányadik kockát mutatjuk
let camIdozito = null // a lejátszó időzítő (setInterval) azonosítója
const camElotoltott = new Set() // amit már betöltöttünk (villogás ellen)

// Egy lépés a lejátszásban: a következő kockát mutatjuk, a végén elölről.
function camLep() {
  if (camKockak.length === 0) return
  if (camIndex >= camKockak.length) camIndex = 0
  camKep.src = camKockak[camIndex]
  camIndex++
}

function kameraKirajzol(adat) {
  if (!adat || !adat.ok) {
    camAllapot.textContent = '(nem elérhető)'
    return
  }

  // Az időbélyegekből teljes kép-URL-eket építünk.
  camKockak = adat.kockak.map((ts) => `${adat.bazis}${ts}.jpg`)

  // Az ÚJ kockákat előtöltjük a böngésző gyorsítótárába (egy rejtett
  // Image objektummal), hogy a lejátszáskor már készen legyenek.
  camKockak.forEach((url) => {
    if (!camElotoltott.has(url)) {
      camElotoltott.add(url)
      const elo = new Image()
      elo.src = url
    }
  })
  // Ne nőjön a végtelenségig a "látott" halmaz.
  if (camElotoltott.size > 1000) camElotoltott.clear()

  camAllapot.textContent = 'élő'

  // Ha még nem fut a lejátszás, most indítjuk el.
  if (!camIdozito) {
    camIndex = 0
    camIdozito = setInterval(camLep, KAMERA_KOCKA_MS)
  }
}

function kameratFrissit() {
  if (!window.viharAPI) return
  window.viharAPI.getKamera().then(kameraKirajzol)
}

// A szél-térkép (animált videó) kirajzolása — data URL-t kapunk.
function szelterkepKirajzol(adat) {
  if (!adat || !adat.ok) return // hiba esetén marad az eddigi videó
  // Csak akkor cseréljük a forrást, ha tényleg új (különben feleslegesen
  // újratöltené és megakadna a lejátszás).
  if (szelterkepVideo.src !== adat.kep) {
    szelterkepVideo.src = adat.kep
    szelterkepVideo.play?.().catch(() => {}) // az autoplay-t megtámogatjuk
  }
}

function szelterkepFrissit() {
  if (!window.viharAPI) return
  window.viharAPI.getSzelterkep().then(szelterkepKirajzol)
}

// =============================================================
//  Az adatok lekérése és kirajzolása
// =============================================================
async function mindentFrissit() {
  if (!window.viharAPI) {
    console.error('A viharAPI nem elérhető (fut egyáltalán Electronban?).')
    return
  }
  // Mindegyik lekérést párhuzamosan indítjuk, és külön-külön rajzoljuk ki.
  window.viharAPI.getVihar().then(viharKirajzol)
  window.viharAPI.getIdojaras().then(idojarasKirajzol)
  window.viharAPI.getFoci().then(fociKirajzol)
}

// =============================================================
//  INDÍTÁS
// =============================================================
oratFrissit()
setInterval(oratFrissit, 1000)

mindentFrissit()
setInterval(mindentFrissit, FRISSITES_MS)

// Webkamera: azonnal, majd 60 másodpercenként új képkockákért.
kameratFrissit()
setInterval(kameratFrissit, KAMERA_FRISSITES_MS)

// A szél-térkép animációt fél sebességre lassítjuk. Ezt minden
// betöltéskor újra beállítjuk, mert új forrásnál visszaállhat.
szelterkepVideo.addEventListener('loadeddata', () => {
  szelterkepVideo.playbackRate = SZELTERKEP_SEBESSEG
})

// Szél-térkép videó: azonnal, majd 15 percenként frissebb felvételért.
szelterkepFrissit()
setInterval(szelterkepFrissit, SZELTERKEP_FRISSITES_MS)
