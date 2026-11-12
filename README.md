# Il mio Letterboxd

Dashboard personale delle statistiche del mio diario di cinema su [Letterboxd](https://letterboxd.com/francebove/): voti, registi, generi, saghe, classici della critica, diario, watchlist e collezione.

È un sito statico, senza build: HTML, CSS e JavaScript (con [d3](https://d3js.org)) che leggono i file in `data/`. È pubblicato con GitHub Pages dal branch `main`.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `index.html` | La pagina: schede, card e tabelle. I numeri sono segnaposto riempiti da `app.js`. |
| `assets/app.js` | Tutti i calcoli (`dash.calc`) e i disegni (`dash.draw`). |
| `assets/dash.js` | Il mini-runtime: carica `data/`, esegue i calcoli, ridisegna. |
| `assets/style.css`, `assets/base.css` | Stile della pagina e tema (chiaro e scuro). |
| `data/` | I dati: export di Letterboxd più i file compilati a mano. |
| `scripts/update.py` | Aggiorna `data/` da un nuovo export. |

## Aggiornare i dati

1. Su letterboxd.com: **Settings → Data → Export your data**.
2. Metti lo ZIP nella cartella `export/` (non viene caricata su GitHub).
3. Esegui `python3 scripts/update.py`.
4. Se lo script elenca film nuovi, completa per ognuno le colonne `Regista`, `Genere`, `Paese` e `Regia` in `data/films_info.csv`.
5. Commit e push: il sito si aggiorna da solo in un paio di minuti.

Con Claude Code basta dire "aggiorna il sito con il nuovo export": le istruzioni sono in `CLAUDE.md`.

## Provarlo in locale

```
python3 -m http.server 8000
```

e poi apri <http://localhost:8000>. Aprire `index.html` con un doppio clic non funziona, perché il browser blocca il caricamento dei file di dati.

## Da dove vengono i dati

- `ratings`, `diary`, `watched`, `watchlist`, `reviews`, `likes`, `liste`, `favorites`: dall'export di Letterboxd.
- `films_info.csv` (regista, genere, paese): compilato con Claude, può contenere errori.
- `saghe.csv`: le trilogie delle classifiche di [GamesRadar](https://www.gamesradar.com/entertainment/movies/the-32-greatest-movie-trilogies-of-all-time) e [/Film](https://slashfilm.com/754613/the-15-greatest-film-trilogies-of-all-time-ranked), più le saghe presenti tra i film visti.
- `classici.csv`: la top 50 del sondaggio della critica Sight and Sound 2022.
