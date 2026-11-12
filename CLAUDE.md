# Istruzioni per Claude Code

Sito statico (GitHub Pages, branch `main`, cartella radice) con le statistiche Letterboxd di Federico (@francebove). Nessun build e nessuna dipendenza: non introdurre framework, bundler o CDN. Testi dell'interfaccia in italiano.

## Aggiornare con un nuovo export

1. Lo ZIP dell'export sta in `export/` (ignorata da git) oppure viene indicato dall'utente. Non committare mai lo ZIP né `profile.csv`: contengono nome ed email.
2. Esegui `python3 scripts/update.py [percorso.zip]`.
3. Lo script elenca i film nuovi. Per ognuno completa la riga in `data/films_info.csv`:
   - `Regista`: nome come già scritto nel file per gli altri film dello stesso regista (i calcoli raggruppano per testo esatto). Coppie nella forma "Joel & Ethan Coen"; film collettivi "AA.VV.".
   - `Genere`: uno solo, il prevalente, tra quelli già usati: Animazione, Commedia, Fantascienza, Dramma, Thriller, Cinecomic, Azione, Biografico, Sport, Guerra, Horror, Crime, Romantico, Avventura, Fantasy, Western, Storico, Musical, Documentario.
   - `Paese`: paese di produzione principale, in italiano (Stati Uniti, Italia, Regno Unito, ...).
   - `Regia`: `Donna` se alla regia c'è almeno una donna, altrimenti `Uomo`; vuoto per AA.VV.
   - Se non sei sicuro di un film, lascia le colonne vuote e dillo all'utente: meglio vuoto che inventato.
4. Se tra i film nuovi c'è un capitolo di una saga non ancora in `data/saghe.csv`, proponi all'utente di aggiungerla (colonne: Saga, Fonte, Ordine, Titolo, Anno, Letterboxd URI; titoli come su Letterboxd, in inglese) e poi riesegui lo script per riabbinare.
5. Controlla in locale (vedi sotto), poi commit e push su `main`.

## Come è fatto il codice

- `assets/dash.js` espone `dash`. I file caricati sono elencati in `FILES` (id → file in `data/`): per un nuovo file di dati aggiungilo lì.
- `assets/app.js`:
  - `dash.calc(id, {title, description, inputs, fn})` definisce un dato derivato; `fn` riceve le righe degli `inputs` (file o altri calcoli). I valori dei CSV sono stringhe: convertire con `Number()`.
  - `dash.draw(nome, fn)` disegna ogni elemento con `data-draw="nome"`; viene richiamata al caricamento, al ridimensionamento e all'apertura di una scheda, quindi deve svuotare e ridisegnare l'elemento.
  - Le costanti sono nell'oggetto `C`; i formati italiani in `fmt`, `voto`, `fmtData`.
- `index.html`: i testi fissi stanno nell'HTML; ogni numero è un segnaposto `—` con `data-draw="v" data-source="<id>" data-field="<colonna>" data-fmt="int|dec1|pct|date|month|year|text|signed"`. Niente numeri scritti a mano nell'HTML: devono venire da `data/`.
- Le schede sono `<section class="lb-page" id="..." role="tabpanel" hidden>` più un bottone `.lb-tab` con lo stesso `data-tab`.
- Colori: solo variabili (`--lb-c0`…`--lb-c7`, `--color-*`) definite in `assets/base.css` per tema chiaro e scuro. I dati vanno inseriti con `textContent`, mai `innerHTML`.

## Verifica prima del push

```
python3 -m http.server 8000
```

Apri ogni scheda e controlla che la console del browser non mostri errori e che nessun riquadro resti vuoto, sia in tema chiaro sia in tema scuro, anche a larghezza da telefono.
