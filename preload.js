// =============================================================
//  preload.js  —  a biztonságos "híd" a main process és az ablak közt
// =============================================================
//
//  Ez a szkript egy KÜLÖNLEGES helyen fut: látja a Node.js-t IS, meg
//  az ablakot (a weboldalt) IS. Pont ezért ő a megfelelő hely arra,
//  hogy egy SZŰK, biztonságos kaput nyisson az ablak felé — anélkül,
//  hogy az egész Node.js-t odaadnánk (ami veszélyes lenne).
//
//  A contextBridge segítségével létrehozunk egy "window.viharAPI"
//  objektumot, amit a src/renderer.js majd használni tud. Ebben csak
//  két függvény van, semmi több — így az ablak PONTOSAN annyit tud,
//  amennyit engedünk neki.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('viharAPI', {
  // Elkéri a viharjelzést. Az ipcRenderer.invoke egy üzenetet küld a
  // main process felé (a 'vihar:lekered' csatornán), és megvárja a
  // választ. A "=> ..." miatt ez egy Promise-t ad vissza, amire a
  // renderer oldalon "await"-tel tudunk várni.
  getVihar: () => ipcRenderer.invoke('vihar:lekered'),

  // Ugyanez az időjárásra.
  getIdojaras: () => ipcRenderer.invoke('idojaras:lekered'),

  // És a foci VB-re (legutóbbi eredmények + következő meccsek).
  getFoci: () => ipcRenderer.invoke('foci:lekered'),

  // A webkamera képkockáinak időbélyegei (a "lejátszáshoz").
  getKamera: () => ipcRenderer.invoke('kamera:lekered'),

  // Az idokep szél-térkép képe (data URL-ként).
  getSzelterkep: () => ipcRenderer.invoke('szelterkep:lekered'),

  // A met.hu oldalon mért részletes balatoni széladatok kérése.
  getMertAdatok: () => ipcRenderer.invoke('mertadatok:lekered')
})
