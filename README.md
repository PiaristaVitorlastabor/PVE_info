# PVE_info

Ez a projekt a Balatoni viharjelzés, Balatonberény időjárása és a 2026-os foci VB adatait mutatja weben.

## Használat

1. `npm install`
2. `npm run start:web`
3. Nyisd meg a böngészőben: `http://localhost:3000`

## Elektron verzió

Ha szeretnéd megtartani az eredeti asztali appot, futtasd:

```bash
npm run start:electron
```

## Megjegyzés

A web app a szerveren keresztül proxyzza az adatforrásokat, így a böngészőből közvetlenül elérhetővé válik a met.hu, OpenWeather, TheSportsDB és idokep tartalom.
