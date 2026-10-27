# Min kalender

En enkel webbapp för iPhone som visar dina kommande kalenderhändelser.
Den läggs till på hemskärmen och ser då ut som en vanlig app.

## Så fungerar det

1. En GitHub Action körs var 30:e minut, hämtar din kalender via en iCal-länk
   och plockar ut händelserna för de närmaste 60 dagarna.
2. Händelserna krypteras med ett lösenord du väljer och publiceras med
   GitHub Pages tillsammans med appen.
3. Appen på iPhonen hämtar filen och låser upp den med lösenordet
   (det sparas på telefonen, så du skriver det bara en gång).

Krypteringen behövs eftersom GitHub Pages-sidor är publika – utan lösenordet
går det inte att läsa dina händelser.

## Kom igång

### 1. Hämta din kalenderlänk (iCal)

- **Google Kalender** (på datorn): Inställningar → välj kalendern → *Integrera kalender* →
  kopiera *Hemlig adress i iCal-format*.
- **iCloud:** Kalender-appen på iPhone → *Kalendrar* → (i) bredvid kalendern →
  slå på *Offentlig kalender* → *Dela länk*. (Länken börjar med `webcal://`, det går bra.)
- **Outlook:** Inställningar → Kalender → Delade kalendrar → *Publicera en kalender* →
  kopiera ICS-länken.

### 2. Lägg in hemligheter i GitHub

I repot: **Settings → Secrets and variables → Actions → New repository secret**

| Namn         | Värde                                       |
|--------------|---------------------------------------------|
| `ICS_URL`    | Kalenderlänken från steg 1                  |
| `PASSPHRASE` | Ett lösenord du hittar på (används i appen) |

### 3. Slå på GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions**

### 4. Publicera

Koden behöver ligga på `main`-grenen. Gå sedan till **Actions → Uppdatera kalender →
Run workflow**. När den är klar finns appen på
`https://<ditt-användarnamn>.github.io/test-av-app/`.

### 5. Lägg till på iPhonen

Öppna adressen i **Safari** → tryck på dela-knappen → **Lägg till på hemskärmen**.

## Köra lokalt

```sh
npm install
npm start                          # med exempeldata
ICS_URL="https://…" npm start      # med din riktiga kalender
```

## Filer

- `public/` – själva appen (HTML, CSS, JavaScript, ikoner)
- `scripts/build-events.mjs` – hämtar och krypterar kalendern
- `.github/workflows/deploy.yml` – kör skriptet och publicerar till GitHub Pages
