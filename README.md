# LernEasy AI – Erster Entwurf (GitHub Pages)

Dieser Entwurf implementiert die von dir gewünschte Zweiteilung:

- **Erklären-Modus**: DeepSeek erklärt ein Thema (für Schüler/Studierende)
- **Abfrage-Modus**: DeepSeek generiert Aufgaben per **Structured Output (JSON-Schema)**
  - **Objektive Aufgaben**: direkte Lösung + Äquivalenzprüfung bei abweichender Formulierung
  - **Offene Aufgaben**: Rubrik-basiertes Feedback (z. B. Deutsch-Interpretation)

## Start lokal

```bash
python3 -m http.server 8080
```

Dann öffnen: `http://localhost:8080`

## DeepSeek

- API-Endpunkt: `https://api.deepseek.com/chat/completions`
- API-Key wird im UI eingegeben (nur für den Entwurf).

> Für Produktion sollte der API-Key **nicht im Browser** verwendet werden, sondern über ein Backend-Proxy.

## Internet-Kontext

Wenn aktiviert, wird für das Thema ein kurzer Zusatzkontext aus der Wikipedia-REST-API geladen:

- `https://de.wikipedia.org/api/rest_v1/page/summary/<Thema>`

So bekommt DeepSeek bei unbekannteren Themen zusätzliche Hinweise.

## Dateien

- `index.html`: Oberfläche mit Modus-Umschaltung
- `styles.css`: Styling
- `app.js`: DeepSeek-Aufrufe, Structured Output, Bewertungspipeline
