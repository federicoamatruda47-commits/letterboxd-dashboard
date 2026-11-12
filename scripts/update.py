#!/usr/bin/env python3
"""Aggiorna data/ a partire da un export di Letterboxd.

Uso:
    python3 scripts/update.py percorso/dell/export.zip
    python3 scripts/update.py            # usa lo ZIP più recente in export/

Cosa fa:
  1. copia ratings, diary, watched e watchlist dall'export;
  2. ricostruisce reviews.json, likes.csv, liste.csv e favorites.csv;
  3. aggiorna films_info.csv: tiene le righe già compilate e aggiunge
     i film nuovi con regista, genere e paese VUOTI (da compilare a mano
     o con Claude Code);
  4. riabbina saghe.csv e classici.csv ai film visti e in watchlist;
  5. scrive data/meta.json con la data dell'export.

Non servono librerie esterne. Dal profilo usa solo i film preferiti:
nome ed email non finiscono nel repository.
"""
import csv
import glob
import io
import json
import os
import re
import sys
import tempfile
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
INFO_COLS = ["Letterboxd URI", "Name", "Year", "Lista", "Regista", "Genere", "Paese", "Regia"]


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, cols):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "and"))


def find_zip(argv):
    if len(argv) > 1:
        return argv[1]
    zips = sorted(glob.glob(os.path.join(ROOT, "export", "*.zip")), key=os.path.getmtime)
    if not zips:
        sys.exit("Nessuno ZIP trovato: passa il percorso dell'export o mettilo in export/")
    return zips[-1]


def main():
    zpath = find_zip(sys.argv)
    print("Export:", zpath)
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zpath) as z:
            z.extractall(tmp)
        src = tmp
        if not os.path.exists(os.path.join(src, "watched.csv")):
            inner = glob.glob(os.path.join(tmp, "*", "watched.csv"))
            if not inner:
                sys.exit("Lo ZIP non sembra un export di Letterboxd (manca watched.csv)")
            src = os.path.dirname(inner[0])

        # 1. file copiati così come sono
        for name in ("ratings", "diary", "watched", "watchlist"):
            rows = read_csv(os.path.join(src, name + ".csv"))
            write_csv(os.path.join(DATA, name + ".csv"), rows, list(rows[0].keys()))

        # 2. recensioni, cuori, liste, preferiti
        reviews = read_csv(os.path.join(src, "reviews.csv"))
        keep = ["Date", "Name", "Year", "Rating", "Review", "Watched Date"]
        with open(os.path.join(DATA, "reviews.json"), "w", encoding="utf-8") as f:
            json.dump([{k: r[k] for k in keep} for r in reviews], f, ensure_ascii=False, indent=1)

        likes_path = os.path.join(src, "likes", "films.csv")
        likes = read_csv(likes_path) if os.path.exists(likes_path) else []
        write_csv(os.path.join(DATA, "likes.csv"), likes, ["Date", "Name", "Year", "Letterboxd URI"])

        liste = []
        for p in sorted(glob.glob(os.path.join(src, "lists", "*.csv"))):
            text = open(p, encoding="utf-8").read().replace("\r\n", "\n")
            head, _, films = text.partition("\n\n")
            meta = list(csv.DictReader(io.StringIO(head.split("\n", 1)[1])))[0]
            for r in csv.DictReader(io.StringIO(films)):
                liste.append({"Lista": meta["Name"].strip(), "Descrizione": meta.get("Description", ""),
                              "Posizione": r["Position"], "Name": r["Name"], "Year": r["Year"],
                              "Letterboxd URI": r["URL"]})
        write_csv(os.path.join(DATA, "liste.csv"), liste,
                  ["Lista", "Descrizione", "Posizione", "Name", "Year", "Letterboxd URI"])

        profile = read_csv(os.path.join(src, "profile.csv"))[0]
        favs = [u.strip() for u in profile.get("Favorite Films", "").split(",") if u.strip()]
        write_csv(os.path.join(DATA, "favorites.csv"),
                  [{"Position": i + 1, "Letterboxd URI": u} for i, u in enumerate(favs)],
                  ["Position", "Letterboxd URI"])

    watched = read_csv(os.path.join(DATA, "watched.csv"))
    watchlist = read_csv(os.path.join(DATA, "watchlist.csv"))

    # 3. registi, generi, paesi: tieni il compilato, aggiungi i nuovi vuoti
    old = read_csv(os.path.join(DATA, "films_info.csv"))
    by_uri = {r["Letterboxd URI"]: r for r in old}
    info, nuovi = [], []
    for lista, rows in (("Visti", watched), ("Watchlist", watchlist)):
        for r in rows:
            o = by_uri.get(r["Letterboxd URI"])
            row = {"Letterboxd URI": r["Letterboxd URI"], "Name": r["Name"], "Year": r["Year"], "Lista": lista,
                   "Regista": o["Regista"] if o else "", "Genere": o["Genere"] if o else "",
                   "Paese": o["Paese"] if o else "", "Regia": o.get("Regia", "") if o else ""}
            if not o:
                nuovi.append(row)
            info.append(row)
    write_csv(os.path.join(DATA, "films_info.csv"), info, INFO_COLS)

    # 4. saghe e classici: riabbina per titolo e anno (tolleranza di un anno)
    idx, by_name = {}, {}
    for key, rows in (("W", watched), ("L", watchlist)):
        for r in rows:
            idx.setdefault((norm(r["Name"]), int(r["Year"])), {})[key] = r["Letterboxd URI"]
    for (n, y), v in idx.items():
        by_name.setdefault(n, []).append((y, v))

    def match(title, year):
        m = idx.get((norm(title), year))
        if not m:
            near = [v for yy, v in by_name.get(norm(title), []) if abs(yy - year) <= 1]
            m = near[0] if near else {}
        return m.get("W") or m.get("L") or ""

    for fname in ("saghe.csv", "classici.csv"):
        path = os.path.join(DATA, fname)
        rows = read_csv(path)
        for r in rows:
            r["Letterboxd URI"] = match(r["Titolo"], int(r["Anno"]))
        write_csv(path, rows, list(rows[0].keys()))

    # 5. data dell'export
    m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(zpath))
    with open(os.path.join(DATA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"export_date": m.group(1) if m else date.today().isoformat()}, f)

    print(f"Visti: {len(watched)} · watchlist: {len(watchlist)} · recensioni: {len(reviews)} · "
          f"cuori: {len(likes)} · liste: {len({l['Lista'] for l in liste})}")
    if nuovi:
        print(f"\n{len(nuovi)} film nuovi da completare in data/films_info.csv "
              "(colonne Regista, Genere, Paese, Regia):")
        for r in nuovi:
            print(f"  - [{r['Lista']}] {r['Name']} ({r['Year']})")
    else:
        print("Nessun film nuovo da completare.")


if __name__ == "__main__":
    main()
