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
// const metMeasure = document.getElementById('metMeasure')
const metForecast = document.getElementById('metForecast')
const vbSajatIdo = document.getElementById('vbSajatIdo')

// Új mérési adatok (Balatonmáriafürdő és Keszthely platform)
const mertAdatokDiv = document.getElementById('metMeasure')
const mertSajatIdo = document.getElementById('mertSajatIdo')

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

  // 1. Megkeressük a nyugati medencét a medence tömbből
  // (Feltételezve, hogy a medence objektumnak van 'nev' vagy 'kulcs' mezője, pl. m.nev.includes('Nyugati'))
  const nyugatiMedence = adat.medencek.find(m => 
    m.nev && m.nev.toLowerCase().includes('nyugati')
  ) || adat.medencek[0]; // Fallback az elsőre, ha nem találná

  // 2. A panel háttérszíne és a felső ikon CSAK a nyugati alapján frissül
  viharPanel.className = `panel vihar vihar--${nyugatiMedence.kulcs || nyugatiMedence.szint}`
  viharKep.src = nyugatiMedence.kepUrl
  viharFokozat.textContent = nyugatiMedence.cimke
  viharLeiras.textContent =
    nyugatiMedence.szint === 0
      ? 'Nincs érvényben viharjelzés a Balaton nyugati medencéjében.'
      : `${nyugatiMedence.cimke}ú viharjelzés érvényben a nyugati medencében.`

  // 3. Az összes medence listázása alul maradhat mind a 3-mal
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
    metMeasure.innerHTML = `<div class="hiba">${esc(
      adat?.hiba || 'A VB-adatok most nem elérhetők.'
    )}</div>`
    vbKovetkezok.innerHTML = ''
    return
  }

  metMeasure.innerHTML = adat.eredmenyek.length
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
  fetch('/api/kamera')
    .then((r) => r.json())
    .then(kameraKirajzol)
    .catch((err) => kameraKirajzol({ ok: false, hiba: err.message }))
}

function szelterkepFrissit() {
  // A videót a szerver adja vissza MP4-ként. A lekérésben benne van a
  // timestamp, hogy minden frissítés új forrást indítson.
  szelterkepVideo.src = `/api/szelterkep?ts=${Date.now()}`
  szelterkepVideo.load()
  szelterkepVideo.play?.().catch(() => {})
}

// =============================================================
//  MÉRT ADATOK kirajzolása (met.hu táblázat alapján)
// =============================================================
function mertAdatokKirajzol(adat) {
  const mertAdatokEredmenyek = document.getElementById('metMeasure');
  const vbSajatIdo = document.getElementById('vbSajatIdo');

  if (vbSajatIdo) {
    vbSajatIdo.textContent = `Frissítve: ${mostSzoveg()} · Forrás: met.hu`;
  }

  if (!mertAdatokEredmenyek) return;

  // 1. Hibakezelés, ha a szerver nem válaszol megfelelően
  if (!adat || !adat.ok || !adat.adatok) {
    mertAdatokEredmenyek.innerHTML = `
      <div class="hiba" style="color: #ff5252; padding: 10px;">
        <strong>Hiba az adatok betöltésekor:</strong><br />
        ${esc(adat?.hiba || 'Üres válasz érkezett a szervertől.')}
      </div>`;
    return;
  }

  const maria = adat.adatok['Balatonmáriafürdő'];
  const keszthely = adat.adatok['Keszthely platform'];

  // 2. Hibakezelés, ha a struktúra sérült
  if ((maria && maria.hiba) || (keszthely && keszthely.hiba)) {
    mertAdatokEredmenyek.innerHTML = `
      <div class="hiba" style="color: #ffb300; padding: 10px;">
        <strong>Adatbeolvasási hiba:</strong><br />
        Máriafürdő: ${esc(maria?.hiba || 'OK')}<br />
        Keszthely: ${esc(keszthely?.hiba || 'OK')}
      </div>`;
    return;
  }

  // Segédfüggvény egy település blokkjának legenerálásához kéthasábos elrendezéssel
  function generalHelyszinHtml(nev, adatObj) {
    return `
      <div class="mert-helyszin" style="margin-bottom: 25px;">
        <strong style="color: #fff; display: block; margin-bottom: 8px; font-size: 1.15em; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">
          ${esc(nev)}
        </strong>
        
        <!-- Kéthasábos elrendezés Flexbox-szal -->
        <div style="display: flex; gap: 15px; width: 100%;">
          
          <!-- BAL OLDAL: Széllökés -->
          <div style="flex: 1; background: rgba(255, 235, 59, 0.05); padding: 8px; border-radius: 4px; border-left: 3px solid #ffeb3b;">
            <div style="font-size: 0.85em; color: #ffeb3b; font-weight: bold; margin-bottom: 5px; text-transform: uppercase;">Széllökés</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #aaa; font-size: 0.9em;">Sebesség:</span>
              <span style="font-weight: bold; color: #fff;">${esc(adatObj.szellokesKmh)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #aaa; font-size: 0.9em;">Irány:</span>
              <span style="color: #fff;">${esc(adatObj.szellokesIrany)}</span>
            </div>
          </div>
          
          <!-- JOBB OLDAL: Átlagszél -->
          <div style="flex: 1; background: rgba(33, 150, 243, 0.05); padding: 8px; border-radius: 4px; border-left: 3px solid #2196f3;">
            <div style="font-size: 0.85em; color: #2196f3; font-weight: bold; margin-bottom: 5px; text-transform: uppercase;">Átlagszél</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #aaa; font-size: 0.9em;">Sebesség:</span>
              <span style="font-weight: bold; color: #fff;">${esc(adatObj.atlagszelSebessegKmh)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #aaa; font-size: 0.9em;">Irány:</span>
              <span style="color: #fff;">${esc(adatObj.atlagszelIranyFok)}</span>
            </div>
          </div>
          
        </div>
      </div>
    `;
  }

  // A két helyszín egymás alá pakolása a tiszta, új elrendezéssel
  mertAdatokEredmenyek.innerHTML = `
    ${generalHelyszinHtml('Balatonmáriafürdő', maria)}
    ${generalHelyszinHtml('Keszthely platform', keszthely)}
  `;
}

function balatonElorejelzesKirajzol(adat) {
  const elorejelzesDiv = document.getElementById('metForecast');
  if (!elorejelzesDiv) return;

  if (!adat || !adat.ok || !adat.htmlTartalom) {
    elorejelzesDiv.innerHTML = `<div style="color: #aaa; font-style: italic; padding: 5px;">Az előrejelzés jelenleg nem érhető el.</div>`;
    return;
  }

  // Változtatás nélkül, közvetlenül beszúrjuk az összesített dobozokat
  elorejelzesDiv.innerHTML = adat.htmlTartalom;
}

let elerhetoKepek = [];

async function initBalatonSlider() {
    try {
        const response = await fetch('/api/balaton-terkep-slider');
        const data = await response.json();

        if (data.ok && data.urls && data.urls.length > 0) {
            elerhetoKepek = data.urls;

            const slider = document.getElementById('terkepSlider');
            if (slider) {
                slider.max = elerhetoKepek.length - 1;
                slider.value = 0; // Biztosítjuk, hogy 0-ról induljon
                
                // Slider eseménykezelő
                slider.addEventListener('input', (e) => {
                    rajzoldKiAKept(e.target.value);
                });
            }

            // KÉNYSZERÍTETT ELSŐ HÍVÁS:
            // Meghívjuk a függvényt explicit módon a 0-s indexszel
            rajzoldKiAKept(0);
        }
    } catch (e) {
        console.error("Hiba a slider inicializálásakor:", e);
    }
}

function rajzoldKiAKept(index) {
    const imgContainer = document.getElementById('forecastImg');
    const jelzes = document.getElementById('sliderIdoJelzes');
    
    // Debugolás: ellenőrizzük, hogy létezik-e a kép az adott indexen
    const url = elerhetoKepek[index];
    if (!url) {
        console.error("Nincs kép a megadott indexen:", index);
        return;
    }

    // Biztosítjuk a megjelenítést
    imgContainer.style.display = 'block';
    imgContainer.style.visibility = 'visible';

    imgContainer.innerHTML = `
        <div style="margin-top: 5px; padding: 5px; background: #000; border-radius: 4px;">
            <img src="${url}" alt="Balaton Térkép" style="width: 100%; height: auto; display: block;" />
        </div>
    `;
    
    if (jelzes) {
        jelzes.innerText = `Előrejelzés: +${parseInt(index) + 1} óra`;
    }
}

// Az oldal betöltésekor indítjuk
document.addEventListener('DOMContentLoaded', initBalatonSlider);

// =============================================================
//  Az adatok lekérése és kirajzolása
// =============================================================
async function mindentFrissit() {
  fetch('/api/vihar')
    .then((r) => r.json())
    .then(viharKirajzol)
    .catch((err) => viharKirajzol({ ok: false, hiba: err.message }))

  fetch('/api/idojaras')
    .then((r) => r.json())
    .then(idojarasKirajzol)
    .catch((err) => idojarasKirajzol({ ok: false, hiba: err.message }))

  fetch('/api/mertadatok')
    .then((r) => r.json())
    .then(mertAdatokKirajzol)
    .catch((err) => mertAdatokKirajzol({ ok: false, hiba: err.message }))

  fetch('/api/balaton-elorejelzes')
    .then((r) => r.json())
    .then(balatonElorejelzesKirajzol)
    .catch((err) => console.error("Előrejelzés hiba:", err))

  // A régi fetch('/api/balaton-terkep') sort töröld ki innen!
}

// =============================================================
//  INDÍTÁS
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
    oratFrissit();
    setInterval(oratFrissit, 1000);

    mindentFrissit();
    setInterval(mindentFrissit, FRISSITES_MS);

    // Kamera indítása
    kameratFrissit();
    setInterval(kameratFrissit, KAMERA_FRISSITES_MS);

    // Térkép slider indítása
    initBalatonSlider();

    // Szél-térkép videó
    szelterkepFrissit();
    setInterval(szelterkepFrissit, SZELTERKEP_FRISSITES_MS);
});

// A videó sebesség beállítása maradjon a fájl végén
szelterkepVideo.addEventListener('loadeddata', () => {
  szelterkepVideo.playbackRate = SZELTERKEP_SEBESSEG
})
