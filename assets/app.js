// Calcoli e disegni della dashboard. Il mini-runtime `dash` è in assets/dash.js.
// ================= CALCOLI =================
  dash.calc('cambi_voto', {
    title: 'Voto a caldo vs voto di oggi',
    description: 'Per ogni film del diario, il voto della prima visione registrata confrontato con il voto attuale.',
    inputs: ['diary', 'ratings'],
    fn: (diary, ratings) => {
      const oggi = new Map(ratings.map((r) => [r.Name + '|' + r.Year, Number(r.Rating)]));
      const primo = new Map();
      [...diary]
        .sort((a, b) => String(a['Watched Date']).localeCompare(String(b['Watched Date'])))
        .forEach((d) => {
          const k = d.Name + '|' + d.Year;
          if (!primo.has(k) && d.Rating != null && d.Rating !== '') primo.set(k, { film: d.Name, anno: Number(d.Year), caldo: Number(d.Rating) });
        });
      return [...primo.entries()]
        .filter(([k]) => oggi.has(k))
        .map(([k, v]) => ({ ...v, oggi: oggi.get(k), diff: oggi.get(k) - v.caldo }));
    },
  });

  dash.calc('riepilogo', {
    title: 'Numeri principali',
    description: 'Conteggi e medie di visti, voti, diario, recensioni e watchlist.',
    inputs: ['watched', 'ratings', 'diary', 'reviews', 'watchlist', 'cambi_voto', 'likes'],
    fn: (watched, ratings, diary, reviews, watchlist, cambi_voto, likes) => {
      const voti = ratings.map((r) => Number(r.Rating));
      return [{
        visti: watched.length,
        votati: ratings.length,
        media: Math.round((voti.reduce((s, v) => s + v, 0) / voti.length) * 10) / 10,
        cinque: voti.filter((v) => v === 5).length,
        diario: diary.length,
        rewatch: diary.filter((d) => d.Rewatch === 'Yes').length,
        recensioni: reviews.length,
        watchlist: watchlist.length,
        cuori: likes.length,
        delta_medio: Math.round((cambi_voto.reduce((s, c) => s + c.diff, 0) / cambi_voto.length) * 100) / 100,
      }];
    },
  });

  dash.calc('visti_info', {
    title: 'Film votati con regista e genere',
    description: 'Ogni film votato con il suo voto, unito a regista, genere e paese compilati da Claude.',
    inputs: ['ratings', 'films_info'],
    fn: (ratings, films_info) => {
      const info = new Map(films_info.filter((f) => f.Lista === 'Visti').map((f) => [f['Letterboxd URI'], f]));
      return ratings.map((r) => {
        const f = info.get(r['Letterboxd URI']) || {};
        return { 'Letterboxd URI': r['Letterboxd URI'], film: r.Name, anno: Number(r.Year), voto: Number(r.Rating), regista: f.Regista || null, genere: f.Genere || null, paese: f.Paese || null, regia: f.Regia || null, votato: r.Date };
      });
    },
  });

  dash.calc('wl_info', {
    title: 'Watchlist con regista',
    description: 'I film in watchlist con data di aggiunta, uniti a regista, genere e paese compilati da Claude.',
    inputs: ['watchlist', 'films_info'],
    fn: (watchlist, films_info) => {
      const info = new Map(films_info.filter((f) => f.Lista === 'Watchlist').map((f) => [f['Letterboxd URI'], f]));
      return watchlist.map((w) => {
        const f = info.get(w['Letterboxd URI']) || {};
        return { 'Letterboxd URI': w['Letterboxd URI'], film: w.Name, anno: Number(w.Year), aggiunto: w.Date, regista: f.Regista || null, genere: f.Genere || null, paese: f.Paese || null };
      });
    },
  });

  dash.calc('registi', {
    title: 'Registi',
    description: 'Per ogni regista: film votati, voto medio e il suo film con il voto più alto.',
    inputs: ['visti_info'],
    fn: (visti_info) => [...d3.group(visti_info.filter((f) => f.regista && f.regista !== 'AA.VV.'), (f) => f.regista)]
      .map(([regista, v]) => {
        const top = [...v].sort((a, b) => b.voto - a.voto || a.anno - b.anno)[0];
        return { regista, film: v.length, media: Math.round(d3.mean(v, (f) => f.voto) * 100) / 100, migliore: top.film, migliore_voto: top.voto };
      })
      .sort((a, b) => b.media - a.media || b.film - a.film),
  });

  dash.calc('generi', {
    title: 'Generi',
    description: 'Per ogni genere: film votati, voto medio e differenza media tra voto di oggi e voto della prima visione nel diario.',
    inputs: ['visti_info', 'cambi_voto'],
    fn: (visti_info, cambi_voto) => {
      const genereDi = new Map(visti_info.map((f) => [f.film + '|' + f.anno, f.genere]));
      const cambi = d3.group(cambi_voto.filter((c) => genereDi.get(c.film + '|' + c.anno)), (c) => genereDi.get(c.film + '|' + c.anno));
      return [...d3.group(visti_info.filter((f) => f.genere), (f) => f.genere)]
        .map(([genere, v]) => {
          const c = cambi.get(genere) || [];
          return { genere, film: v.length, media: Math.round(d3.mean(v, (f) => f.voto) * 100) / 100, confronti: c.length, cambio_medio: c.length ? Math.round(d3.mean(c, (x) => x.diff) * 100) / 100 : null };
        })
        .sort((a, b) => b.media - a.media);
    },
  });

  dash.calc('paesi', {
    title: 'Paesi',
    description: 'Per ogni paese di produzione: film votati e voto medio.',
    inputs: ['visti_info'],
    fn: (visti_info) => [...d3.group(visti_info.filter((f) => f.paese), (f) => f.paese)]
      .map(([paese, v]) => ({ paese, film: v.length, media: Math.round(d3.mean(v, (f) => f.voto) * 100) / 100 }))
      .sort((a, b) => b.film - a.film || b.media - a.media),
  });

  dash.calc('distribuzione_voti', {
    title: 'Distribuzione dei voti',
    description: 'Numero di film per ogni voto attuale, da mezza stella a cinque.',
    inputs: ['ratings'],
    fn: (ratings) => d3.range(1, 11).map((i) => ({ voto: i / 2, film: ratings.filter((r) => Number(r.Rating) === i / 2).length })),
  });

  dash.calc('per_decennio', {
    title: 'Film per decennio',
    description: 'Film visti, film votati e voto medio per decennio di uscita.',
    inputs: ['watched', 'ratings'],
    fn: (watched, ratings) => {
      const dec = (y) => Math.floor(Number(y) / 10) * 10;
      const visti = d3.rollup(watched, (v) => v.length, (r) => dec(r.Year));
      const voti = d3.group(ratings, (r) => dec(r.Year));
      return [...visti.keys()].sort((a, b) => a - b).map((d) => {
        const v = (voti.get(d) || []).map((r) => Number(r.Rating));
        return { decennio: d, visti: visti.get(d), votati: v.length, media: v.length ? Math.round(d3.mean(v) * 100) / 100 : null };
      });
    },
  });

  dash.calc('identikit', {
    title: 'Identikit',
    description: 'Regista e genere con il voto medio più alto e più basso, il regista più visto, classici contro recenti, decennio migliore e quota di cinema italiano.',
    inputs: ['visti_info', 'registi', 'generi', 'per_decennio'],
    fn: (visti_info, registi, generi, per_decennio) => {
      const soglia_regista = 4, soglia_genere = 10, soglia_decennio = 5, anno_classici = 1980, anno_recenti = 2010;
      const r1 = registi.filter((r) => r.film >= soglia_regista).sort((a, b) => b.media - a.media)[0] || {};
      const r2 = [...registi].sort((a, b) => b.film - a.film || b.media - a.media)[0] || {};
      const g = generi.filter((x) => x.film >= soglia_genere).sort((a, b) => b.media - a.media);
      const d = per_decennio.filter((x) => x.votati >= soglia_decennio).sort((a, b) => b.media - a.media)[0] || {};
      const cl = visti_info.filter((f) => f.anno < anno_classici);
      const re = visti_info.filter((f) => f.anno >= anno_recenti);
      const it = visti_info.filter((f) => f.paese === 'Italia');
      const dn = visti_info.filter((f) => f.regia === 'Donna');
      const conRegia = visti_info.filter((f) => f.regia);
      const r2d = (x) => Math.round(x * 100) / 100;
      return [{
        soglia_regista, soglia_genere, anno_classici, anno_recenti,
        regista_top: r1.regista ?? null, regista_top_film: r1.film ?? null, regista_top_media: r1.media ?? null,
        regista_piu: r2.regista ?? null, regista_piu_film: r2.film ?? null, regista_piu_media: r2.media ?? null,
        genere_top: g[0] ? g[0].genere : null, genere_top_media: g[0] ? g[0].media : null, genere_top_film: g[0] ? g[0].film : null,
        genere_flop: g.length ? g[g.length - 1].genere : null, genere_flop_media: g.length ? g[g.length - 1].media : null, genere_flop_film: g.length ? g[g.length - 1].film : null,
        decennio_top: d.decennio ?? null, decennio_top_media: d.media ?? null, decennio_top_film: d.votati ?? null,
        classici_media: cl.length ? r2d(d3.mean(cl, (f) => f.voto)) : null, recenti_media: re.length ? r2d(d3.mean(re, (f) => f.voto)) : null,
        donne_film: dn.length, donne_quota: conRegia.length ? r2d(dn.length / conRegia.length * 100) / 100 : null, donne_media: dn.length ? r2d(d3.mean(dn, (f) => f.voto)) : null,
        italia_film: it.length, italia_quota: r2d(it.length / visti_info.length * 100) / 100, italia_media: it.length ? r2d(d3.mean(it, (f) => f.voto)) : null,
      }];
    },
  });

  dash.calc('importazioni', {
    title: 'Giorni di importazione',
    description: 'Giorni del diario con più di 10 film registrati, cioè importazioni in blocco di film già visti.',
    inputs: ['diary'],
    fn: (diary) => [...d3.rollup(diary, (v) => v.length, (d) => d['Watched Date'])]
      .filter(([, n]) => n > 10)
      .map(([giorno, film]) => ({ giorno, film })),
  });

  dash.calc('diario_mensile', {
    title: 'Visioni per mese',
    description: 'Prime visioni e rewatch del diario per mese di visione, senza i giorni di importazione.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const tenuti = diary.filter((d) => !esclusi.has(d['Watched Date']));
      const mesi = d3.rollup(tenuti, (v) => ({ nuovi: v.filter((d) => d.Rewatch !== 'Yes').length, rewatch: v.filter((d) => d.Rewatch === 'Yes').length }), (d) => String(d['Watched Date']).slice(0, 7));
      const chiavi = [...mesi.keys()].sort();
      if (!chiavi.length) return [];
      const start = new Date(chiavi[0] + '-01T00:00:00Z');
      const end = new Date(chiavi[chiavi.length - 1] + '-01T00:00:00Z');
      return d3.utcMonths(start, d3.utcMonth.offset(end, 1)).map((m) => {
        const k = m.toISOString().slice(0, 7);
        const v = mesi.get(k) || { nuovi: 0, rewatch: 0 };
        return { mese: k, nuovi: v.nuovi, rewatch: v.rewatch };
      });
    },
  });

  dash.calc('eta_trimestre', {
    title: 'Classici per trimestre',
    description: 'Per trimestre di visione (senza importazioni, solo trimestri con almeno 3 visioni): quota di film usciti prima del 1980 e anno di uscita mediano.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const prima_di = 1980;
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const tenuti = diary.filter((d) => !esclusi.has(d['Watched Date']));
      const trim = (s) => String(s).slice(0, 4) + ' T' + (Math.floor((Number(String(s).slice(5, 7)) - 1) / 3) + 1);
      return [...d3.group(tenuti, (d) => trim(d['Watched Date']))]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .filter(([, v]) => v.length >= 3)
        .map(([trimestre, v]) => ({
          trimestre, prima_di, film: v.length,
          classici_pct: Math.round((v.filter((d) => Number(d.Year) < prima_di).length / v.length) * 1000) / 1000,
          anno_mediano: Math.round(d3.median(v, (d) => Number(d.Year))),
        }));
    },
  });

  dash.calc('giorni_settimana', {
    title: 'Visioni per giorno della settimana',
    description: 'Visioni del diario per giorno della settimana, senza i giorni di importazione.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const nomi = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
      const conta = d3.rollup(diary.filter((d) => !esclusi.has(d['Watched Date'])), (v) => v.length, (d) => (new Date(String(d['Watched Date']).slice(0, 10) + 'T00:00:00Z').getUTCDay() + 6) % 7);
      return nomi.map((giorno, i) => ({ giorno, visioni: conta.get(i) || 0 }));
    },
  });

  dash.calc('piu_rivisti', {
    title: 'I più rivisti',
    description: 'Film con almeno due visioni nel diario e il voto dell’ultima visione.',
    inputs: ['diary'],
    fn: (diary) => [...d3.group(diary, (d) => d.Name + '|' + d.Year).values()]
      .filter((v) => v.length >= 2)
      .map((v) => {
        const ultima = [...v].sort((a, b) => String(b['Watched Date']).localeCompare(String(a['Watched Date'])))[0];
        return { film: ultima.Name, anno: Number(ultima.Year), visioni: v.length, ultimo_voto: ultima.Rating === '' || ultima.Rating == null ? null : Number(ultima.Rating) };
      })
      .sort((a, b) => b.visioni - a.visioni || (b.ultimo_voto ?? 0) - (a.ultimo_voto ?? 0) || a.film.localeCompare(b.film)),
  });

  dash.calc('preferiti', {
    title: 'Preferiti con voto',
    description: 'I quattro preferiti del profilo con titolo, anno e voto attuale.',
    inputs: ['favorites', 'ratings'],
    fn: (favorites, ratings) => {
      const byUri = new Map(ratings.map((r) => [r['Letterboxd URI'], r]));
      return favorites.map((f) => {
        const r = byUri.get(f['Letterboxd URI']);
        return { posizione: Number(f.Position), film: r ? r.Name : null, anno: r ? Number(r.Year) : null, voto: r ? Number(r.Rating) : null };
      });
    },
  });

  dash.calc('watchlist_decenni', {
    title: 'Watchlist per decennio',
    description: 'Film in watchlist per decennio di uscita.',
    inputs: ['watchlist'],
    fn: (watchlist) => [...d3.rollup(watchlist, (v) => v.length, (r) => Math.floor(Number(r.Year) / 10) * 10)]
      .sort((a, b) => a[0] - b[0])
      .map(([decennio, film]) => ({ decennio, film })),
  });

  dash.calc('wl_registi', {
    title: 'Registi in watchlist',
    description: 'Registi con almeno due film in watchlist, con quanti loro film hai già votato e il voto medio.',
    inputs: ['wl_info', 'registi'],
    fn: (wl_info, registi) => {
      const visti = new Map(registi.map((r) => [r.regista, r]));
      return [...d3.rollup(wl_info.filter((f) => f.regista && f.regista !== 'AA.VV.'), (v) => v.length, (f) => f.regista)]
        .filter(([, n]) => n >= 2)
        .map(([regista, n]) => ({ regista, in_watchlist: n, visti: visti.get(regista)?.film ?? 0, media_visti: visti.get(regista)?.media ?? null }))
        .sort((a, b) => b.in_watchlist - a.in_watchlist || b.visti - a.visti || a.regista.localeCompare(b.regista));
    },
  });

  dash.calc('confronto', {
    title: 'Visti e watchlist a confronto',
    description: 'Quota di film per paese e per genere tra i film visti e quelli in watchlist (i sei valori più frequenti in ciascuna dimensione, il resto in "Altri").',
    inputs: ['films_info'],
    fn: (films_info) => {
      const out = [];
      [['Paese', 'Paese'], ['Genere', 'Genere']].forEach(([dim, col]) => {
        const vis = films_info.filter((f) => f.Lista === 'Visti' && f[col]);
        const wl = films_info.filter((f) => f.Lista === 'Watchlist' && f[col]);
        const tot = d3.rollup([...vis, ...wl], (v) => v.length, (f) => f[col]);
        const top = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
        const key = (f) => (top.includes(f[col]) ? f[col] : 'Altri');
        const cv = d3.rollup(vis, (v) => v.length, key), cw = d3.rollup(wl, (v) => v.length, key);
        [...top, 'Altri'].forEach((valore) => out.push({ dimensione: dim, valore, visti_pct: Math.round(((cv.get(valore) || 0) / vis.length) * 1000) / 1000, watchlist_pct: Math.round(((cw.get(valore) || 0) / wl.length) * 1000) / 1000 }));
      });
      return out;
    },
  });

  dash.calc('wl_sintesi', {
    title: 'Watchlist in sintesi',
    description: 'Quota di film usciti prima del 1980 e di film non statunitensi, tra i film visti e quelli in watchlist.',
    inputs: ['visti_info', 'wl_info'],
    fn: (visti_info, wl_info) => {
      const prima_di = 1980;
      const q = (arr, p) => Math.round((arr.filter(p).length / arr.length) * 1000) / 1000;
      const conPaese = (arr) => arr.filter((f) => f.paese);
      return [{
        prima_di,
        visti_classici: q(visti_info, (f) => f.anno < prima_di), wl_classici: q(wl_info, (f) => f.anno < prima_di),
        visti_estero: q(conPaese(visti_info), (f) => f.paese !== 'Stati Uniti'), wl_estero: q(conPaese(wl_info), (f) => f.paese !== 'Stati Uniti'),
      }];
    },
  });

  // ---------- Saghe ----------
  dash.calc('saghe_film', {
    title: 'Film delle saghe',
    description: 'Ogni film delle saghe con il suo stato (visto, in watchlist, da vedere) e il tuo voto attuale, abbinato per link Letterboxd o per titolo e anno.',
    inputs: ['saghe_elenco', 'watched', 'ratings', 'watchlist'],
    fn: (saghe_elenco, watched, ratings, watchlist) => {
      const norm = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
      const visto = new Set(watched.map((w) => w['Letterboxd URI']));
      const vistoNome = new Map(watched.map((w) => [norm(w.Name) + '|' + w.Year, w['Letterboxd URI']]));
      const voto = new Map(ratings.map((r) => [r['Letterboxd URI'], Number(r.Rating)]));
      const wl = new Set(watchlist.map((w) => w['Letterboxd URI']));
      const wlNome = new Set(watchlist.map((w) => norm(w.Name) + '|' + w.Year));
      return saghe_elenco.map((s) => {
        const k = norm(s.Titolo) + '|' + s.Anno;
        const uri = s['Letterboxd URI'] && visto.has(s['Letterboxd URI']) ? s['Letterboxd URI'] : vistoNome.get(k) || null;
        const stato = uri ? 'Visto' : wl.has(s['Letterboxd URI']) || wlNome.has(k) ? 'In watchlist' : 'Da vedere';
        return { saga: s.Saga, ordine: Number(s.Ordine), titolo: s.Titolo, anno: Number(s.Anno), stato, voto: uri && voto.has(uri) ? voto.get(uri) : null, fonte: s.Fonte };
      });
    },
  });

  dash.calc('saghe', {
    title: 'Saghe',
    description: 'Per ogni saga: film, quanti visti e in watchlist, completamento, voto medio dei film visti, il migliore e il primo film che manca.',
    inputs: ['saghe_film'],
    fn: (saghe_film) => [...d3.group(saghe_film, (f) => f.saga)].map(([saga, lista]) => {
      const v = [...lista].sort((a, b) => a.ordine - b.ordine);
      const visti = v.filter((f) => f.stato === 'Visto');
      const votati = visti.filter((f) => f.voto != null);
      const prossimo = v.find((f) => f.stato !== 'Visto');
      const best = [...votati].sort((a, b) => b.voto - a.voto || a.ordine - b.ordine)[0];
      return {
        saga, fonte: v[0].fonte, film: v.length, visti: visti.length,
        in_watchlist: v.filter((f) => f.stato === 'In watchlist').length,
        completamento: Math.round((visti.length / v.length) * 1000) / 1000,
        media: votati.length ? Math.round(d3.mean(votati, (f) => f.voto) * 100) / 100 : null,
        migliore: best ? best.titolo : null,
        prossimo: prossimo ? prossimo.titolo : null, prossimo_anno: prossimo ? prossimo.anno : null,
        stato: visti.length === v.length ? 'Completata' : visti.length ? 'In corso' : 'Da iniziare',
      };
    }),
  });

  dash.calc('saghe_sintesi', {
    title: 'Saghe in sintesi',
    description: 'Quante saghe sono completate, in corso e da iniziare, e quanti dei loro film hai visto.',
    inputs: ['saghe'],
    fn: (saghe) => [{
      totale: saghe.length,
      completate: saghe.filter((s) => s.stato === 'Completata').length,
      in_corso: saghe.filter((s) => s.stato === 'In corso').length,
      da_iniziare: saghe.filter((s) => s.stato === 'Da iniziare').length,
      film_visti: d3.sum(saghe, (s) => s.visti),
      film_totali: d3.sum(saghe, (s) => s.film),
    }],
  });

  // ---------- Altri calcoli ----------
  dash.calc('genere_decennio', {
    title: 'Genere per decennio',
    description: 'Film votati e voto medio per ogni combinazione di genere e decennio di uscita.',
    inputs: ['visti_info'],
    fn: (visti_info) => [...d3.group(visti_info.filter((f) => f.genere), (f) => f.genere + '|' + Math.floor(f.anno / 10) * 10)]
      .map(([k, v]) => ({ genere: v[0].genere, decennio: Math.floor(v[0].anno / 10) * 10, film: v.length, media: Math.round(d3.mean(v, (f) => f.voto) * 100) / 100 })),
  });

  dash.calc('diario_giorni', {
    title: 'Visioni per giorno',
    description: 'Film del diario per data di visione, con i titoli, senza i giorni di importazione.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      return [...d3.group(diary.filter((d) => !esclusi.has(d['Watched Date'])), (d) => String(d['Watched Date']).slice(0, 10))]
        .map(([giorno, v]) => ({ giorno, visioni: v.length, titoli: v.map((d) => d.Name).join(' · ') }))
        .sort((a, b) => a.giorno.localeCompare(b.giorno));
    },
  });

  dash.calc('voto_mensile', {
    title: 'Voto medio del diario per mese',
    description: 'Media dei voti dati nel diario al momento della visione, per mese, senza i giorni di importazione.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const conVoto = diary.filter((d) => !esclusi.has(d['Watched Date']) && d.Rating != null && d.Rating !== '');
      return [...d3.group(conVoto, (d) => String(d['Watched Date']).slice(0, 7))]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mese, v]) => ({ mese, media: Math.round(d3.mean(v, (d) => Number(d.Rating)) * 100) / 100, visioni: v.length }));
    },
  });

  dash.calc('wl_consigli', {
    title: 'Watchlist per regista',
    description: 'Film in watchlist non ancora visti, con il voto medio che dai al loro regista e quanti suoi film hai votato.',
    inputs: ['wl_info', 'registi', 'visti_info'],
    fn: (wl_info, registi, visti_info) => {
      const visti = new Set(visti_info.map((f) => f['Letterboxd URI']));
      const reg = new Map(registi.map((r) => [r.regista, r]));
      return wl_info
        .filter((f) => f.regista && reg.has(f.regista) && !visti.has(f['Letterboxd URI']))
        .map((f) => ({ 'Letterboxd URI': f['Letterboxd URI'], film: f.film, anno: f.anno, regista: f.regista, media_regista: reg.get(f.regista).media, visti_regista: reg.get(f.regista).film }))
        .sort((a, b) => b.media_regista - a.media_regista || b.visti_regista - a.visti_regista || a.anno - b.anno);
    },
  });

  // ---------- Il tuo anno ----------
  dash.calc('anno_review', {
    title: 'Il tuo anno',
    description: 'Riepilogo dell’anno più recente del diario (senza importazioni): film, prime visioni, rewatch, voto medio, settimana, giorno e mese più pieni, serie di giorni consecutivi, primo e ultimo film, film più vecchio, recensioni e film visti al cinema.',
    inputs: ['diary', 'importazioni', 'reviews', 'liste'],
    fn: (diary, importazioni, reviews, liste) => {
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const wd = (d) => String(d['Watched Date']).slice(0, 10);
      const tenuti = diary.filter((d) => !esclusi.has(wd(d)));
      const anno = d3.max(tenuti, (d) => Number(wd(d).slice(0, 4)));
      const v = tenuti.filter((d) => Number(wd(d).slice(0, 4)) === anno).sort((a, b) => wd(a).localeCompare(wd(b)));
      if (!v.length) return [];
      const day = (s) => new Date(s + 'T00:00:00Z');
      const conVoto = v.filter((d) => d.Rating != null && d.Rating !== '');
      const sett = [...d3.rollup(v, (x) => x.length, (d) => d3.utcMonday.floor(day(wd(d))).toISOString().slice(0, 10))].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const nomi = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
      const gg = [...d3.rollup(v, (x) => x.length, (d) => (day(wd(d)).getUTCDay() + 6) % 7)].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      const mm = [...d3.rollup(v, (x) => x.length, (d) => wd(d).slice(0, 7))].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const giorni = [...new Set(v.map(wd))].sort();
      let best = 1, bestStart = giorni[0], run = 1, runStart = giorni[0];
      for (let i = 1; i < giorni.length; i++) {
        if (d3.utcDay.count(day(giorni[i - 1]), day(giorni[i])) === 1) run++; else { run = 1; runStart = giorni[i]; }
        if (run > best) { best = run; bestStart = runStart; }
      }
      const vecchio = [...v].sort((a, b) => Number(a.Year) - Number(b.Year))[0];
      const cinema = liste.filter((l) => /cinema/i.test(l.Lista) && String(l.Lista).includes(String(anno)));
      return [{
        anno, film: v.length,
        prime_visioni: v.filter((d) => d.Rewatch !== 'Yes').length, rewatch: v.filter((d) => d.Rewatch === 'Yes').length,
        media: conVoto.length ? Math.round(d3.mean(conVoto, (d) => Number(d.Rating)) * 100) / 100 : null,
        cinque: conVoto.filter((d) => Number(d.Rating) === 5).length,
        settimana_inizio: sett[0], settimana_film: sett[1],
        giorno: nomi[gg[0]], giorno_film: gg[1],
        mese: mm[0], mese_film: mm[1],
        serie: best, serie_inizio: bestStart,
        primo: v[0].Name, primo_data: wd(v[0]), ultimo: v[v.length - 1].Name, ultimo_data: wd(v[v.length - 1]),
        vecchio: vecchio.Name, vecchio_anno: Number(vecchio.Year),
        recensioni: reviews.filter((r) => String(r['Watched Date']).slice(0, 4) === String(anno)).length,
        al_cinema: cinema.length,
      }];
    },
  });

  dash.calc('traguardi', {
    title: 'Traguardi dell’anno',
    description: 'Ogni 25 film nel diario dell’anno più recente: il film del traguardo e la data.',
    inputs: ['diary', 'importazioni'],
    fn: (diary, importazioni) => {
      const passo = 25;
      const esclusi = new Set(importazioni.map((i) => i.giorno));
      const wd = (d) => String(d['Watched Date']).slice(0, 10);
      const tenuti = diary.filter((d) => !esclusi.has(wd(d)));
      const anno = d3.max(tenuti, (d) => Number(wd(d).slice(0, 4)));
      const v = tenuti.filter((d) => Number(wd(d).slice(0, 4)) === anno).sort((a, b) => wd(a).localeCompare(wd(b)) || String(a.Date).localeCompare(String(b.Date)));
      const out = [{ n: 1, film: v[0]?.Name ?? null, data: v[0] ? wd(v[0]) : null, passo }];
      for (let n = passo; n <= v.length; n += passo) out.push({ n, film: v[n - 1].Name, data: wd(v[n - 1]), passo });
      return v.length ? out : [];
    },
  });

  dash.calc('anno_decenni', {
    title: 'Decenni dell’anno',
    description: 'Film del diario dell’anno più recente per decennio di uscita.',
    inputs: ['diary', 'anno_review'],
    fn: (diary, anno_review) => {
      const anno = anno_review[0]?.anno;
      return [...d3.rollup(diary.filter((d) => String(d['Watched Date']).slice(0, 4) === String(anno)), (v) => v.length, (d) => Math.floor(Number(d.Year) / 10) * 10)]
        .sort((a, b) => a[0] - b[0]).map(([decennio, film]) => ({ decennio, film }));
    },
  });

  dash.calc('anno_top', {
    title: 'I migliori dell’anno',
    description: 'Le 10 prime visioni dell’anno più recente con il voto più alto nel diario.',
    inputs: ['diary', 'anno_review'],
    fn: (diary, anno_review) => {
      const anno = anno_review[0]?.anno;
      return diary.filter((d) => String(d['Watched Date']).slice(0, 4) === String(anno) && d.Rewatch !== 'Yes' && d.Rating != null && d.Rating !== '')
        .map((d) => ({ film: d.Name, anno: Number(d.Year), voto: Number(d.Rating), data: String(d['Watched Date']).slice(0, 10) }))
        .sort((a, b) => b.voto - a.voto || a.data.localeCompare(b.data)).slice(0, 10);
    },
  });

  // ---------- Classici della critica ----------
  dash.calc('classici_film', {
    title: 'Top 50 Sight and Sound',
    description: 'I film della top 50 Sight and Sound 2022 con stato (visto, in watchlist, da vedere) e il tuo voto.',
    inputs: ['classici', 'watched', 'ratings', 'watchlist'],
    fn: (classici, watched, ratings, watchlist) => {
      const norm = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
      const visto = new Set(watched.map((w) => w['Letterboxd URI']));
      const vistoNome = new Map(watched.map((w) => [norm(w.Name) + '|' + w.Year, w['Letterboxd URI']]));
      const voto = new Map(ratings.map((r) => [r['Letterboxd URI'], Number(r.Rating)]));
      const wl = new Set(watchlist.map((w) => w['Letterboxd URI']));
      return classici.map((c) => {
        const uri = c['Letterboxd URI'] && visto.has(c['Letterboxd URI']) ? c['Letterboxd URI'] : vistoNome.get(norm(c.Titolo) + '|' + c.Anno) || null;
        return { posizione: Number(c.Posizione), titolo: c.Titolo, anno: Number(c.Anno), regista: c.Regista, stato: uri ? 'Visto' : wl.has(c['Letterboxd URI']) ? 'In watchlist' : 'Da vedere', voto: uri && voto.has(uri) ? voto.get(uri) : null };
      });
    },
  });

  dash.calc('classici_sintesi', {
    title: 'Top 50 in sintesi',
    description: 'Quanti film della top 50 hai visto o hai in watchlist, e il voto medio di quelli visti.',
    inputs: ['classici_film'],
    fn: (classici_film) => {
      const visti = classici_film.filter((c) => c.stato === 'Visto');
      const votati = visti.filter((c) => c.voto != null);
      return [{ totale: classici_film.length, visti: visti.length, in_watchlist: classici_film.filter((c) => c.stato === 'In watchlist').length, quota: Math.round((visti.length / classici_film.length) * 1000) / 1000, media: votati.length ? Math.round(d3.mean(votati, (c) => c.voto) * 100) / 100 : null }];
    },
  });

  // ---------- Collezione ----------
  dash.calc('liste_info', {
    title: 'Le tue liste',
    description: 'Per ogni lista: descrizione, numero di film, quanti visti e voto medio dei film votati.',
    inputs: ['liste', 'watched', 'ratings'],
    fn: (liste, watched, ratings) => {
      const visto = new Set(watched.map((w) => w['Letterboxd URI']));
      const voto = new Map(ratings.map((r) => [r['Letterboxd URI'], Number(r.Rating)]));
      return [...d3.group(liste, (l) => l.Lista)].map(([lista, v]) => {
        const vv = v.filter((l) => voto.has(l['Letterboxd URI']));
        return { lista, descrizione: v[0].Descrizione || null, film: v.length, visti: v.filter((l) => visto.has(l['Letterboxd URI'])).length, media: vv.length ? Math.round(d3.mean(vv, (l) => voto.get(l['Letterboxd URI'])) * 100) / 100 : null };
      }).sort((a, b) => b.film - a.film);
    },
  });

  dash.calc('bluray', {
    title: 'Collezione Blu-ray',
    description: 'I film della lista "collezione blu-ray" con il tuo voto e il regista.',
    inputs: ['liste', 'ratings', 'films_info'],
    fn: (liste, ratings, films_info) => {
      const voto = new Map(ratings.map((r) => [r['Letterboxd URI'], Number(r.Rating)]));
      const info = new Map(films_info.map((f) => [f['Letterboxd URI'], f]));
      return liste.filter((l) => /blu-?ray/i.test(l.Lista)).map((l) => ({ posizione: Number(l.Posizione), film: l.Name, anno: Number(l.Year), voto: voto.get(l['Letterboxd URI']) ?? null, regista: info.get(l['Letterboxd URI'])?.Regista || null }));
    },
  });

  dash.calc('bluray_sintesi', {
    title: 'Blu-ray in sintesi',
    description: 'Numero di dischi, voto medio e regista più presente nella collezione.',
    inputs: ['bluray'],
    fn: (bluray) => {
      const votati = bluray.filter((b) => b.voto != null);
      const top = [...d3.rollup(bluray.filter((b) => b.regista), (v) => v.length, (b) => b.regista)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [null, null];
      return [{ film: bluray.length, media: votati.length ? Math.round(d3.mean(votati, (b) => b.voto) * 100) / 100 : null, regista_top: top[0], regista_top_film: top[1] }];
    },
  });

  dash.calc('in_sala', {
    title: 'Visti al cinema',
    description: 'I film della lista "cinema" dell’anno più recente, con il tuo voto.',
    inputs: ['liste', 'ratings', 'anno_review'],
    fn: (liste, ratings, anno_review) => {
      const anno = String(anno_review[0]?.anno);
      const voto = new Map(ratings.map((r) => [r['Letterboxd URI'], Number(r.Rating)]));
      return liste.filter((l) => /cinema/i.test(l.Lista) && String(l.Lista).includes(anno)).map((l) => ({ posizione: Number(l.Posizione), film: l.Name, anno: Number(l.Year), voto: voto.get(l['Letterboxd URI']) ?? null }));
    },
  });

  dash.calc('cuori_sintesi', {
    title: 'Cuori in sintesi',
    description: 'Film con il cuore, quota sui film visti, voto medio dei film con e senza cuore, soglia dei "piaceri colpevoli" (2,5★).',
    inputs: ['likes', 'watched', 'ratings'],
    fn: (likes, watched, ratings) => {
      const cuore = new Set(likes.map((l) => l['Letterboxd URI']));
      const con = ratings.filter((r) => cuore.has(r['Letterboxd URI'])), senza = ratings.filter((r) => !cuore.has(r['Letterboxd URI']));
      const m = (a) => (a.length ? Math.round(d3.mean(a, (r) => Number(r.Rating)) * 100) / 100 : null);
      return [{ cuori: likes.length, quota: Math.round((likes.length / watched.length) * 1000) / 1000, media_cuori: m(con), media_altri: m(senza), soglia_colpa: 2.5 }];
    },
  });

  dash.calc('cuori_per_voto', {
    title: 'Cuori per voto',
    description: 'Per ogni voto: film votati, quanti con il cuore e la quota.',
    inputs: ['likes', 'ratings'],
    fn: (likes, ratings) => {
      const cuore = new Set(likes.map((l) => l['Letterboxd URI']));
      return d3.range(1, 11).map((i) => {
        const v = ratings.filter((r) => Number(r.Rating) === i / 2);
        const c = v.filter((r) => cuore.has(r['Letterboxd URI'])).length;
        return { voto: i / 2, film: v.length, cuori: c, quota: v.length ? Math.round((c / v.length) * 1000) / 1000 : 0 };
      });
    },
  });

  dash.calc('piaceri_colpevoli', {
    title: 'Piaceri colpevoli',
    description: 'Film con il cuore che oggi hanno un voto pari o inferiore alla soglia di cuori_sintesi.',
    inputs: ['likes', 'ratings', 'cuori_sintesi'],
    fn: (likes, ratings, cuori_sintesi) => {
      const soglia = cuori_sintesi[0].soglia_colpa;
      const cuore = new Set(likes.map((l) => l['Letterboxd URI']));
      return ratings.filter((r) => cuore.has(r['Letterboxd URI']) && Number(r.Rating) <= soglia)
        .map((r) => ({ 'Letterboxd URI': r['Letterboxd URI'], film: r.Name, anno: Number(r.Year), voto: Number(r.Rating) }))
        .sort((a, b) => a.voto - b.voto || a.film.localeCompare(b.film));
    },
  });

  // ================= COSTANTI E FORMATI =================
  const C = { TOP_CAMBI: 12, MIN_DEC: 3, N_WL: 10, MIN_REG: 2, MIN_CONF: 5, MIN_CONS: 2, N_CONS: 15, MAX_PER_REG: 3 };
  const tileColor = (v) => `color-mix(in srgb, ${dash.colors[0]} ${Math.round(18 + (v / 5) * 77)}%, transparent)`;
  const tileText = (v) => (v >= 3.5 ? 'var(--color-bg)' : 'var(--color-fg)');
  const it1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const it2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const itInt = new Intl.NumberFormat('it-IT');
  const itPct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 });
  const voto = (v) => (v == null || Number.isNaN(v) ? '—' : it1.format(v));
  const dataIt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtData = (s) => (s ? dataIt.format(new Date(String(s).slice(0, 10) + 'T00:00:00Z')) : '—');
  const meseIt = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const stelle = (v) => (v === 0.5 ? '½' : Number.isInteger(v) ? String(v) : Math.floor(v) + '½');
  const fmt = (v, f) => {
    if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '—';
    if (f === 'text' || f === 'year') return String(v);
    if (f === 'date') return fmtData(v);
    if (f === 'month') { const t = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(String(v).slice(0, 7) + '-01T00:00:00Z')); return t.charAt(0).toUpperCase() + t.slice(1); }
    if (f === 'dec1') return it1.format(v);
    if (f === 'pct') return itPct.format(v);
    if (f === 'signed') return (v > 0 ? '+' : v < 0 ? '−' : '') + it2.format(Math.abs(v));
    return itInt.format(v);
  };

  const stato = (...ids) => {
    const ds = ids.map((id) => dash.data(id));
    if (ds.every((d) => d.status === 'ok')) return { ok: true, data: ds.map((d) => d.data) };
    return { ok: false, fail: ds.some((d) => d.status === 'error' || d.status === 'missing' || d.status === 'declined') };
  };
  const failBox = (el) => {
    el.classList.remove('dash-skeleton');
    const f = document.createElement('div');
    f.className = 'lb-fail';
    f.textContent = 'Impossibile caricare';
    el.replaceChildren(f);
  };
  const waitBox = (el, fail) => {
    if (fail) failBox(el);
    else { el.replaceChildren(); el.classList.add('dash-skeleton'); }
  };
  const ready = (el) => { el.classList.remove('dash-skeleton'); el.replaceChildren(); };

  const makeTip = (el) => {
    const tip = document.createElement('div');
    tip.className = 'lb-tip';
    tip.hidden = true;
    el.appendChild(tip);
    return {
      show(event, head, line) {
        tip.replaceChildren();
        const h = document.createElement('div'); h.className = 'lb-tip-head'; h.textContent = head;
        tip.appendChild(h);
        (Array.isArray(line) ? line : [line]).forEach((l) => { const d = document.createElement('div'); d.textContent = l; tip.appendChild(d); });
        tip.hidden = false;
        const r = el.getBoundingClientRect();
        const sx = el.scrollLeft, sy = el.scrollTop;
        let x = event.clientX - r.left + sx + 12;
        let y = event.clientY - r.top + sy - 10 - tip.offsetHeight;
        x = Math.max(sx, Math.min(x, sx + el.clientWidth - tip.offsetWidth));
        if (y < sy) y = event.clientY - r.top + sy + 14;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      },
      hide() { tip.hidden = true; },
    };
  };

  const textWidth = (sel) => { let w = 0; sel.each(function () { w = Math.max(w, this.getComputedTextLength()); }); return w; };
  const truncate = (sel, maxW) => sel.each(function () {
    const full = this.textContent; let t = full;
    while (this.getComputedTextLength() > maxW && t.length > 4) { t = t.slice(0, -2); this.textContent = t.trimEnd() + '…'; }
  });

  // Barre verticali
  const bars = (el, rows, { x, y, xLabel, valLabel, tipHead, tipLine, yMax, color }) => {
    ready(el);
    const W = Math.max(el.clientWidth, 240), H = 220, m = { t: 18, r: 2, b: 24, l: 2 };
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const xs = d3.scaleBand(rows.map(x), [m.l, W - m.r]).padding(0.25);
    const ys = d3.scaleLinear([0, yMax ?? (d3.max(rows, y) || 1)], [H - m.b, m.t]);
    const bw = Math.min(xs.bandwidth(), 32), off = (xs.bandwidth() - bw) / 2;
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', ys(0)).attr('y2', ys(0)).style('stroke', 'var(--cds-chart-axis)');
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('rect').attr('class', 'lb-bar').attr('x', (d) => xs(x(d)) + off).attr('width', bw).attr('y', (d) => ys(y(d))).attr('height', (d) => ys(0) - ys(y(d))).attr('rx', 3).style('fill', color);
    const vals = g.append('text').attr('x', (d) => xs(x(d)) + xs.bandwidth() / 2).attr('y', (d) => ys(y(d)) - 5).attr('text-anchor', 'middle').text((d) => valLabel(d));
    if (textWidth(vals) + 2 > xs.step()) vals.remove();
    const xl = g.append('text').attr('x', (d) => xs(x(d)) + xs.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => xLabel(d));
    const step = Math.max(1, Math.ceil((textWidth(xl) + 8) / xs.step()));
    xl.filter((d, i) => i % step !== 0).remove();
    g.append('rect').attr('x', (d) => xs(x(d)) - (xs.step() - xs.bandwidth()) / 2).attr('width', xs.step()).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', function (event, d) { d3.select(this.parentNode).select('.lb-bar').style('opacity', 0.75); tip.show(event, tipHead(d), tipLine(d)); })
      .on('mouseleave', function () { d3.select(this.parentNode).select('.lb-bar').style('opacity', null); tip.hide(); });
  };

  // Barre orizzontali (anche con valori negativi)
  const hbars = (el, rows, { label, value, domain, valText, tipHead, tipLine, color }) => {
    ready(el);
    const W = Math.max(el.clientWidth, 240), row = 26, m = { t: 4, r: 8, b: 6, l: 0 };
    const H = m.t + m.b + rows.length * row;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const labs = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'lb-film').attr('y', (d, i) => m.t + i * row + row / 2 + 4).text(label);
    truncate(labs, W * 0.32);
    const lw = textWidth(labs);
    labs.attr('x', lw).attr('text-anchor', 'end');
    const probe = svg.append('g').selectAll('text').data(rows).join('text').text(valText);
    const vw = textWidth(probe); probe.remove();
    const neg = domain[0] < 0;
    const xs = d3.scaleLinear(domain, [lw + 10 + (neg ? vw + 6 : 0), W - m.r - vw - 6]);
    if (neg) svg.append('line').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--cds-chart-axis)');
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d, i) => `translate(0,${m.t + i * row})`);
    g.append('rect').attr('class', 'lb-bar').attr('x', (d) => Math.min(xs(0), xs(value(d)))).attr('width', (d) => Math.abs(xs(value(d)) - xs(0))).attr('y', 5).attr('height', row - 10).attr('rx', 3).style('fill', (d) => (typeof color === 'function' ? color(d) : color));
    g.append('text').attr('y', row / 2 + 4).attr('x', (d) => (value(d) < 0 ? xs(value(d)) - 6 : xs(value(d)) + 6)).attr('text-anchor', (d) => (value(d) < 0 ? 'end' : 'start')).text(valText);
    g.append('rect').attr('x', 0).attr('width', W).attr('height', row).style('fill', 'transparent')
      .on('mousemove', function (event, d) { d3.select(this.parentNode).select('.lb-bar').style('opacity', 0.75); tip.show(event, tipHead(d), tipLine(d)); })
      .on('mouseleave', function () { d3.select(this.parentNode).select('.lb-bar').style('opacity', null); tip.hide(); });
  };

  // Barre orizzontali a coppie (visti vs watchlist)
  const pairs = (el, rows) => {
    ready(el);
    const W = Math.max(el.clientWidth, 240), row = 34, m = { t: 4, r: 8, b: 4 };
    const H = m.t + m.b + rows.length * row;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const labs = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'lb-film').attr('y', (d, i) => m.t + i * row + row / 2 + 4).text((d) => d.valore);
    truncate(labs, W * 0.3);
    const lw = textWidth(labs);
    labs.attr('x', lw).attr('text-anchor', 'end');
    const xs = d3.scaleLinear([0, d3.max(rows, (d) => Math.max(d.visti_pct, d.watchlist_pct)) || 1], [lw + 10, W - m.r - 36]);
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d, i) => `translate(0,${m.t + i * row})`);
    [['visti_pct', dash.colors[0], 5], ['watchlist_pct', dash.colors[3], 18]].forEach(([k, c, y]) => {
      g.append('rect').attr('class', 'lb-bar').attr('x', xs(0)).attr('width', (d) => xs(d[k]) - xs(0)).attr('y', y).attr('height', 11).attr('rx', 2).style('fill', c);
      g.append('text').attr('x', (d) => xs(d[k]) + 5).attr('y', y + 9).text((d) => itPct.format(d[k]));
    });
    g.append('rect').attr('x', 0).attr('width', W).attr('height', row).style('fill', 'transparent')
      .on('mousemove', (event, d) => tip.show(event, d.valore, ['Visti: ' + itPct.format(d.visti_pct), 'Watchlist: ' + itPct.format(d.watchlist_pct)]))
      .on('mouseleave', () => tip.hide());
  };

  // ================= SCHEDE =================
  const openTab = (id, link) => {
    document.querySelectorAll('.lb-page').forEach((s) => { s.hidden = s.id !== id; });
    document.querySelectorAll('.lb-tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
    if (link) dash.setLink(id);
  };
  document.querySelectorAll('.lb-tab').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab, true)));
  {
    const named = document.getElementById(location.hash.slice(1));
    const page = named && (named.classList.contains('lb-page') ? named : named.closest('.lb-page'));
    if (page) { openTab(page.id, false); requestAnimationFrame(() => named.scrollIntoView()); }
  }

  // Colori della legenda e accento
  document.querySelectorAll('.lb').forEach((e) => e.style.setProperty('--lb-accent', dash.colors[0]));
  [0, 1, 2, 3].forEach((i) => document.querySelectorAll('.lb-c' + i).forEach((e) => { e.style.background = dash.colors[i]; }));
  [1, 3, 5].forEach((v) => document.querySelectorAll('.lb-key-' + v).forEach((e) => { e.style.background = tileColor(v); e.style.color = tileText(v); }));

  // Controlli del tabellone delle saghe
  window.lbSaga = { filter: 'tutte', sort: 'voto' };
  document.querySelectorAll('.lb-saga-filter').forEach((b) => b.addEventListener('click', () => {
    window.lbSaga.filter = b.dataset.filter;
    document.querySelectorAll('.lb-saga-filter').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    dash.draw('saghe-board');
  }));
  document.querySelectorAll('.lb-saga-sort').forEach((sel) => sel.addEventListener('change', () => {
    window.lbSaga.sort = sel.value;
    dash.draw('saghe-board');
  }));

  dash.onData(() => {
    const r = dash.data('riepilogo');
    const giu = !(r.status === 'ok' && r.data[0] && r.data[0].delta_medio > 0);
    document.querySelectorAll('.lb-giu').forEach((e) => { e.hidden = !giu; });
    document.querySelectorAll('.lb-su').forEach((e) => { e.hidden = giu; });
  });

  // ================= VALORI SINGOLI =================
  dash.draw('v', (el) => {
    const s = stato(el.dataset.source);
    const row = s.ok ? s.data[0][Number(el.dataset.row || 0)] : null;
    if (!row) { el.textContent = '—'; el.classList.toggle('dash-skeleton', !s.ok && !s.fail); return; }
    el.classList.remove('dash-skeleton');
    el.textContent = fmt(row[el.dataset.field], el.dataset.fmt);
  });
  dash.draw('const', (el) => { el.textContent = String(C[el.dataset.const] ?? '—'); });

  // ================= GRAFICI =================
  dash.draw('hist', (el) => {
    const s = stato('distribuzione_voti');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.voto, y: (d) => d.film,
      xLabel: (d) => stelle(d.voto), valLabel: (d) => itInt.format(d.film),
      tipHead: (d) => 'Voto ' + voto(d.voto) + '★', tipLine: (d) => itInt.format(d.film) + ' film',
      color: dash.colors[0],
    });
  });

  dash.draw('dec-visti', (el) => {
    const s = stato('per_decennio');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.decennio, y: (d) => d.visti,
      xLabel: (d) => String(d.decennio), valLabel: (d) => itInt.format(d.visti),
      tipHead: (d) => 'Anni ' + d.decennio, tipLine: (d) => itInt.format(d.visti) + ' film visti',
      color: dash.colors[0],
    });
  });

  dash.draw('dec-media', (el) => {
    const s = stato('per_decennio');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0].filter((d) => d.votati >= C.MIN_DEC && d.media != null);
    bars(el, rows, {
      x: (d) => d.decennio, y: (d) => d.media, yMax: 5,
      xLabel: (d) => String(d.decennio), valLabel: (d) => it1.format(d.media),
      tipHead: (d) => 'Anni ' + d.decennio, tipLine: (d) => ['Voto medio ' + it2.format(d.media) + '★', itInt.format(d.votati) + ' film votati'],
      color: dash.colors[2],
    });
  });

  dash.draw('wl-dec', (el) => {
    const s = stato('watchlist_decenni');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.decennio, y: (d) => d.film,
      xLabel: (d) => String(d.decennio), valLabel: (d) => itInt.format(d.film),
      tipHead: (d) => 'Anni ' + d.decennio, tipLine: (d) => itInt.format(d.film) + ' film in watchlist',
      color: dash.colors[3],
    });
  });

  dash.draw('classici', (el) => {
    const s = stato('eta_trimestre');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.trimestre, y: (d) => d.classici_pct, yMax: 1,
      xLabel: (d) => d.trimestre.replace(' ', ' '), valLabel: (d) => itPct.format(d.classici_pct),
      tipHead: (d) => d.trimestre, tipLine: (d) => ['Usciti prima del ' + d.prima_di + ': ' + itPct.format(d.classici_pct), 'Anno di uscita mediano: ' + d.anno_mediano, itInt.format(d.film) + ' visioni'],
      color: dash.colors[2],
    });
  });

  dash.draw('settimana', (el) => {
    const s = stato('giorni_settimana');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.giorno, y: (d) => d.visioni,
      xLabel: (d) => d.giorno.slice(0, 3), valLabel: (d) => itInt.format(d.visioni),
      tipHead: (d) => d.giorno, tipLine: (d) => itInt.format(d.visioni) + ' visioni',
      color: dash.colors[1],
    });
  });

  dash.draw('generi', (el) => {
    const s = stato('generi');
    if (!s.ok) return waitBox(el, s.fail);
    hbars(el, s.data[0], {
      label: (d) => d.genere, value: (d) => d.media, domain: [0, 5],
      valText: (d) => it1.format(d.media) + '★ · ' + d.film,
      tipHead: (d) => d.genere, tipLine: (d) => ['Voto medio ' + it2.format(d.media) + '★', itInt.format(d.film) + ' film votati'],
      color: dash.colors[0],
    });
  });

  dash.draw('generi-cambio', (el) => {
    const s = stato('generi');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0].filter((d) => d.confronti >= C.MIN_CONF && d.cambio_medio != null).sort((a, b) => a.cambio_medio - b.cambio_medio);
    const ext = Math.max(0.5, d3.max(rows, (d) => Math.abs(d.cambio_medio)) || 0.5);
    hbars(el, rows, {
      label: (d) => d.genere, value: (d) => d.cambio_medio, domain: [-ext, Math.max(0.25, d3.max(rows, (d) => d.cambio_medio) || 0)],
      valText: (d) => fmt(d.cambio_medio, 'signed'),
      tipHead: (d) => d.genere, tipLine: (d) => ['Cambio medio ' + fmt(d.cambio_medio, 'signed') + '★', itInt.format(d.confronti) + ' film confrontati'],
      color: (d) => (d.cambio_medio < 0 ? dash.colors[1] : dash.colors[0]),
    });
  });

  dash.draw('conf-paese', (el) => {
    const s = stato('confronto');
    if (!s.ok) return waitBox(el, s.fail);
    pairs(el, s.data[0].filter((d) => d.dimensione === 'Paese'));
  });
  dash.draw('conf-genere', (el) => {
    const s = stato('confronto');
    if (!s.ok) return waitBox(el, s.fail);
    pairs(el, s.data[0].filter((d) => d.dimensione === 'Genere'));
  });

  dash.draw('mesi', (el) => {
    const s = stato('diario_mensile');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0];
    ready(el);
    const W = Math.max(el.clientWidth, 240), H = 220, m = { t: 10, r: 4, b: 24, l: 4 };
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const ys = d3.scaleLinear([0, d3.max(rows, (d) => d.nuovi + d.rewatch) || 1], [H - m.b, m.t]).nice();
    const ticks = ys.ticks(4);
    const tg = svg.append('g');
    const tt = tg.selectAll('text').data(ticks).join('text').attr('y', (d) => ys(d) + 4).text((d) => itInt.format(d));
    const tw = textWidth(tt);
    m.l = tw + 8;
    tt.attr('x', tw).attr('text-anchor', 'end');
    tg.selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (d) => ys(d)).attr('y2', (d) => ys(d)).style('stroke', (d) => (d === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)'));
    const xs = d3.scaleBand(rows.map((d) => d.mese), [m.l, W - m.r]).padding(0.2);
    const bw = Math.min(xs.bandwidth(), 32), off = (xs.bandwidth() - bw) / 2;
    const g = svg.append('g').selectAll('g').data(rows).join('g');
    g.append('rect').attr('class', 'lb-b').attr('x', (d) => xs(d.mese) + off).attr('width', bw).attr('y', (d) => ys(d.nuovi)).attr('height', (d) => ys(0) - ys(d.nuovi)).style('fill', dash.colors[0]);
    g.append('rect').attr('class', 'lb-b').attr('x', (d) => xs(d.mese) + off).attr('width', bw).attr('y', (d) => ys(d.nuovi + d.rewatch)).attr('height', (d) => ys(d.nuovi) - ys(d.nuovi + d.rewatch)).style('fill', dash.colors[1]);
    const lab = (d) => meseIt.format(new Date(d.mese + '-01T00:00:00Z'));
    const xl = g.append('text').attr('x', (d) => xs(d.mese) + xs.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text(lab);
    const step = Math.max(1, Math.ceil((textWidth(xl) + 10) / xs.step()));
    xl.filter((d, i) => (rows.length - 1 - i) % step !== 0).remove();
    g.append('rect').attr('x', (d) => xs(d.mese) - (xs.step() - xs.bandwidth()) / 2).attr('width', xs.step()).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', function (event, d) {
        d3.select(this.parentNode).selectAll('.lb-b').style('opacity', 0.75);
        tip.show(event, lab(d), ['Prime visioni: ' + itInt.format(d.nuovi), 'Rewatch: ' + itInt.format(d.rewatch)]);
      })
      .on('mouseleave', function () { d3.select(this.parentNode).selectAll('.lb-b').style('opacity', null); tip.hide(); });
  });

  dash.draw('dumbbell', (el) => {
    const s = stato('cambi_voto');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = [...s.data[0]].filter((d) => d.diff !== 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.film.localeCompare(b.film))
      .slice(0, C.TOP_CAMBI);
    ready(el);
    const W = Math.max(el.clientWidth, 240), row = 26, m = { t: 6, r: 10, b: 24 };
    const H = m.t + m.b + rows.length * row;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const labels = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'lb-film')
      .attr('y', (d, i) => m.t + i * row + row / 2 + 4).text((d) => d.film);
    truncate(labels, W * 0.45);
    const lw = textWidth(labels);
    labels.attr('x', lw).attr('text-anchor', 'end');
    const xs = d3.scaleLinear([0.5, 5], [lw + 18, W - m.r]);
    const ticks = [1, 2, 3, 4, 5];
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', (d) => xs(d)).attr('x2', (d) => xs(d)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', (d) => xs(d)).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d + '★');
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d, i) => `translate(0,${m.t + i * row + row / 2})`);
    g.append('line').attr('x1', (d) => xs(d.caldo)).attr('x2', (d) => xs(d.oggi)).style('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    g.append('circle').attr('cx', (d) => xs(d.caldo)).attr('r', 5).style('fill', 'var(--color-panel)').style('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2);
    g.append('circle').attr('cx', (d) => xs(d.oggi)).attr('r', 5).style('fill', dash.colors[0]);
    g.append('rect').attr('x', 0).attr('width', W).attr('y', -row / 2).attr('height', row).style('fill', 'transparent')
      .on('mousemove', (event, d) => tip.show(event, d.film + ' (' + d.anno + ')', ['Diario: ' + voto(d.caldo) + '★ → oggi: ' + voto(d.oggi) + '★']))
      .on('mouseleave', () => tip.hide());
  });

  // ---------- Nuovi grafici ----------
  const yStarAxis = (svg, ys, W, m, ticks) => {
    const tg = svg.append('g');
    const tt = tg.selectAll('text').data(ticks).join('text').attr('y', (d) => ys(d) + 4).text((d) => d + '★');
    const tw = textWidth(tt);
    tt.attr('x', tw).attr('text-anchor', 'end');
    tg.selectAll('line').data(ticks).join('line').attr('x1', tw + 8).attr('x2', W - m.r).attr('y1', (d) => ys(d)).attr('y2', (d) => ys(d)).style('stroke', 'var(--cds-chart-grid)');
    return tw + 8;
  };
  const jit = (i, s) => (((i * 9301 + 49297 + s * 233) % 233280) / 233280) - 0.5;

  dash.draw('scatter-anni', (el) => {
    const s = stato('visti_info', 'per_decennio');
    if (!s.ok) return waitBox(el, s.fail);
    const [films, dec] = s.data;
    ready(el);
    const W = Math.max(el.clientWidth, 240), H = 260, m = { t: 8, r: 8, b: 24 };
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const ys = d3.scaleLinear([0.2, 5.3], [H - m.b, m.t]);
    const left = yStarAxis(svg, ys, W, m, [1, 2, 3, 4, 5]);
    const [y0, y1] = d3.extent(films, (f) => f.anno);
    const xs = d3.scaleLinear([y0 - 2, y1 + 2], [left + 6, W - m.r]);
    const xt = xs.ticks(Math.max(3, Math.floor(W / 90))).filter((t) => Number.isInteger(t));
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', (d) => xs(d)).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => String(d));
    const pts = films.map((f, i) => ({ f, x: xs(f.anno + jit(i, 1) * 0.8), y: ys(f.voto + jit(i, 2) * 0.3) }));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', 3.2).style('fill', dash.colors[0]).style('opacity', 0.5);
    const line = dec.filter((d) => d.votati >= C.MIN_DEC && d.media != null).map((d) => [xs(d.decennio + 5), ys(d.media)]);
    svg.append('path').attr('d', d3.line()(line)).style('fill', 'none').style('stroke', dash.colors[2]).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    svg.append('g').selectAll('circle').data(line).join('circle').attr('cx', (p) => p[0]).attr('cy', (p) => p[1]).attr('r', 3.5).style('fill', dash.colors[2]);
    const hl = svg.append('circle').attr('r', 5.5).style('fill', 'none').style('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).style('display', 'none');
    const del = d3.Delaunay.from(pts, (p) => p.x, (p) => p.y);
    svg.append('rect').attr('x', left).attr('y', 0).attr('width', W - left).attr('height', H - m.b).style('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event);
        const p = pts[del.find(mx, my)];
        if (!p || Math.hypot(p.x - mx, p.y - my) > 24) { hl.style('display', 'none'); return tip.hide(); }
        hl.attr('cx', p.x).attr('cy', p.y).style('display', null);
        tip.show(event, p.f.film + ' (' + p.f.anno + ')', [voto(p.f.voto) + '★' + (p.f.regista ? ' · ' + p.f.regista : '')]);
      })
      .on('mouseleave', () => { hl.style('display', 'none'); tip.hide(); });
  });

  dash.draw('heatmap', (el) => {
    const s = stato('genere_decennio');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0];
    ready(el);
    const generi = [...d3.rollup(rows, (v) => d3.sum(v, (d) => d.film), (d) => d.genere)].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const decenni = [...new Set(rows.map((d) => d.decennio))].sort((a, b) => a - b);
    const cellH = 26, top = 20;
    const probe = d3.select(el).append('svg').attr('class', 'lb-svg');
    const lw = textWidth(probe.selectAll('text').data(generi).join('text').text((d) => d));
    probe.remove();
    const avail = Math.max(el.clientWidth, 240) - lw - 10;
    const cellW = Math.max(30, Math.floor(avail / decenni.length));
    const W = lw + 10 + cellW * decenni.length, H = top + cellH * generi.length + 2;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', W > el.clientWidth ? W : '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const xs = (d) => lw + 10 + decenni.indexOf(d) * cellW, ysF = (g) => top + generi.indexOf(g) * cellH;
    const dlab = svg.append('g').selectAll('text').data(decenni).join('text').attr('x', (d) => xs(d) + cellW / 2).attr('y', 12).attr('text-anchor', 'middle').text((d) => "'" + String(d).slice(2));
    if (textWidth(dlab) + 4 > cellW) dlab.filter((d, i) => i % 2).remove();
    svg.append('g').selectAll('text').data(generi).join('text').attr('class', 'lb-film').attr('x', lw).attr('text-anchor', 'end').attr('y', (g) => ysF(g) + cellH / 2 + 4).text((g) => g);
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d) => `translate(${xs(d.decennio)},${ysF(d.genere)})`);
    g.append('rect').attr('x', 1).attr('y', 1).attr('width', cellW - 2).attr('height', cellH - 2).attr('rx', 3).style('fill', (d) => tileColor(d.media));
    g.append('text').attr('x', cellW / 2).attr('y', cellH / 2 + 4).attr('text-anchor', 'middle').style('fill', (d) => tileText(d.media)).text((d) => (cellW >= 30 ? it1.format(d.media) : ''));
    g.on('mousemove', (event, d) => tip.show(event, d.genere + ' · anni ' + d.decennio, ['Voto medio ' + it2.format(d.media) + '★', itInt.format(d.film) + (d.film === 1 ? ' film' : ' film')]))
      .on('mouseleave', () => tip.hide());
  });

  dash.draw('calendario', (el) => {
    const s = stato('diario_giorni');
    if (!s.ok) return waitBox(el, s.fail);
    const byDay = new Map(s.data[0].map((d) => [d.giorno, d]));
    ready(el);
    const W = Math.max(el.clientWidth, 240);
    const end = d3.utcDay.floor(new Date());
    const start = d3.utcMonday.floor(d3.utcDay.offset(end, -364));
    const days = d3.utcDays(start, d3.utcDay.offset(end, 1));
    const weeks = d3.utcMonday.count(start, end) + 1;
    const svg0 = d3.select(el).append('svg').attr('class', 'lb-svg');
    const wd = svg0.selectAll('text').data(['lun', 'mer', 'ven']).join('text').text((d) => d);
    const lw = textWidth(wd) + 6;
    svg0.remove();
    const step = Math.max(7, Math.min(18, Math.floor((W - lw) / weeks)));
    const cell = step - 2, top = 16;
    const Wt = lw + weeks * step, H = top + 7 * step;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', Wt > W ? Wt : '100%').attr('viewBox', `0 0 ${Math.max(Wt, W)} ${H}`);
    const tip = makeTip(el);
    const dow = (d) => (d.getUTCDay() + 6) % 7;
    const col = (d) => d3.utcMonday.count(start, d);
    svg.append('g').selectAll('text').data([0, 2, 4]).join('text').attr('x', 0).attr('y', (r) => top + r * step + cell - 1).text((r) => ['lun', 'mer', 'ven'][r / 2]);
    const fmtM = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' });
    let lastX = -999;
    days.filter((d) => d.getUTCDate() === 1).forEach((d) => {
      const x = lw + col(d) * step;
      if (x - lastX < 30) return;
      lastX = x;
      svg.append('text').attr('x', x).attr('y', 10).text(fmtM.format(d));
    });
    const key = (d) => d.toISOString().slice(0, 10);
    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('x', (d) => lw + col(d) * step).attr('y', (d) => top + dow(d) * step).attr('width', cell).attr('height', cell).attr('rx', 2)
      .style('fill', (d) => { const n = byDay.get(key(d))?.visioni || 0; return n ? `color-mix(in srgb, ${dash.colors[0]} ${n >= 3 ? 100 : n === 2 ? 72 : 45}%, transparent)` : 'var(--cds-chart-grid)'; })
      .on('mousemove', (event, d) => { const r = byDay.get(key(d)); tip.show(event, fmtData(key(d)), r ? [itInt.format(r.visioni) + (r.visioni === 1 ? ' film' : ' film'), r.titoli] : ['Nessun film']); })
      .on('mouseleave', () => tip.hide());
  });

  dash.draw('voto-mensile', (el) => {
    const s = stato('voto_mensile');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0];
    ready(el);
    const W = Math.max(el.clientWidth, 240), H = 220, m = { t: 10, r: 10, b: 24 };
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const ys = d3.scaleLinear([0.5, 5], [H - m.b, m.t]);
    const left = yStarAxis(svg, ys, W, m, [1, 2, 3, 4, 5]);
    const xs = d3.scalePoint(rows.map((d) => d.mese), [left + 10, W - m.r - 6]);
    const lab = (k) => meseIt.format(new Date(k + '-01T00:00:00Z'));
    const xl = svg.append('g').selectAll('text').data(rows).join('text').attr('x', (d) => xs(d.mese)).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => lab(d.mese));
    const stepPx = rows.length > 1 ? xs.step() : W;
    const k = Math.max(1, Math.ceil((textWidth(xl) + 8) / stepPx));
    xl.filter((d, i) => (rows.length - 1 - i) % k !== 0).remove();
    svg.append('path').attr('d', d3.line((d) => xs(d.mese), (d) => ys(d.media))(rows)).style('fill', 'none').style('stroke', dash.colors[1]).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', (d) => xs(d.mese)).attr('cy', (d) => ys(d.media)).attr('r', (d) => Math.min(6, 2.5 + Math.sqrt(d.visioni))).style('fill', dash.colors[1])
      .on('mousemove', (event, d) => tip.show(event, lab(d.mese), ['Voto medio ' + it2.format(d.media) + '★', itInt.format(d.visioni) + ' film votati']))
      .on('mouseleave', () => tip.hide());
  });

  // ---------- Saghe ----------
  dash.draw('saghe-board', (el) => {
    const s = stato('saghe', 'saghe_film');
    if (!s.ok) return waitBox(el, s.fail);
    const [saghe, film] = s.data;
    ready(el);
    const tip = makeTip(el);
    const perSaga = d3.group(film, (f) => f.saga);
    const { filter, sort } = window.lbSaga;
    const byName = (a, b) => a.saga.localeCompare(b.saga, 'it');
    const sorters = {
      voto: (a, b) => (a.media == null) - (b.media == null) || (b.media ?? 0) - (a.media ?? 0) || b.completamento - a.completamento || b.in_watchlist - a.in_watchlist || byName(a, b),
      completamento: (a, b) => b.completamento - a.completamento || (b.media ?? -1) - (a.media ?? -1) || b.in_watchlist - a.in_watchlist || byName(a, b),
      nome: byName,
    };
    const rows = saghe.filter((x) => filter === 'tutte' || x.stato === filter).sort(sorters[sort] || sorters.voto);
    if (!rows.length) {
      const p = document.createElement('p'); p.className = 'lb-note'; p.textContent = 'Nessuna saga in questo gruppo.';
      el.appendChild(p);
      return;
    }
    rows.forEach((sg) => {
      const row = document.createElement('div'); row.className = 'lb-saga';
      const head = document.createElement('div');
      const name = document.createElement('div'); name.className = 'lb-saga-name'; name.textContent = sg.saga;
      const meta = document.createElement('div'); meta.className = 'lb-saga-meta';
      const c = document.createElement('span');
      c.textContent = sg.stato === 'Completata' ? 'Completata ✓' : sg.visti + ' di ' + sg.film + ' visti';
      if (sg.stato === 'Completata') c.className = 'lb-done';
      meta.appendChild(c);
      if (sg.media != null) { const m = document.createElement('span'); m.textContent = 'media ' + it1.format(sg.media) + '★'; meta.appendChild(m); }
      if (sg.in_watchlist) { const w = document.createElement('span'); w.textContent = sg.in_watchlist + ' in watchlist'; meta.appendChild(w); }
      head.append(name, meta);
      const tiles = document.createElement('div'); tiles.className = 'lb-saga-films';
      [...(perSaga.get(sg.saga) || [])].sort((a, b) => a.ordine - b.ordine).forEach((f) => {
        const t = document.createElement('span'); t.className = 'lb-t';
        if (f.stato === 'Visto' && f.voto != null) { t.style.background = tileColor(f.voto); t.style.color = tileText(f.voto); t.textContent = stelle(f.voto); }
        else if (f.stato === 'Visto') { t.classList.add('lb-t-seen-norate'); t.textContent = '✓'; }
        else if (f.stato === 'In watchlist') { t.classList.add('lb-t-wl'); t.textContent = '+'; }
        else { t.classList.add('lb-t-todo'); t.textContent = String(f.ordine); }
        t.addEventListener('mousemove', (event) => tip.show(event, f.titolo + ' (' + f.anno + ')', [f.stato === 'Visto' ? (f.voto != null ? 'Visto · ' + voto(f.voto) + '★' : 'Visto, senza voto') : f.stato]));
        t.addEventListener('mouseleave', () => tip.hide());
        tiles.appendChild(t);
      });
      row.append(head, tiles);
      el.appendChild(row);
    });
  });

  dash.draw('saghe-scatter', (el) => {
    const s = stato('saghe');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0].filter((d) => d.visti > 0 && d.media != null);
    ready(el);
    const W = Math.max(el.clientWidth, 240), H = 260, m = { t: 10, r: 14, b: 24 };
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const tip = makeTip(el);
    const ys = d3.scaleLinear([0.2, 5.3], [H - m.b, m.t]);
    const left = yStarAxis(svg, ys, W, m, [1, 2, 3, 4, 5]);
    const xs = d3.scaleLinear([0, 1], [left + 12, W - m.r]);
    svg.append('g').selectAll('text').data([0.25, 0.5, 0.75, 1]).join('text').attr('x', (d) => xs(d)).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => itPct.format(d));
    const rs = d3.scaleSqrt([2, d3.max(rows, (d) => d.film) || 2], [4, 10]);
    const pts = rows.map((d, i) => ({ d, x: xs(d.completamento) + (d.completamento === 1 ? -jit(i, 3) * 10 - 5 : 0), y: ys(d.media) }));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', (p) => rs(p.d.film))
      .style('fill', (p) => (p.d.stato === 'Completata' ? dash.colors[0] : dash.colors[3])).style('opacity', 0.75)
      .on('mousemove', (event, p) => tip.show(event, p.d.saga, [p.d.visti + ' di ' + p.d.film + ' visti', 'Media ' + it2.format(p.d.media) + '★' + (p.d.migliore ? ' · migliore: ' + p.d.migliore : '')]))
      .on('mouseleave', () => tip.hide());
  });

  // ---------- Il tuo anno, classici, collezione ----------
  dash.draw('spark', (el) => {
    const s = stato('diario_mensile');
    el.replaceChildren();
    if (!s.ok || !s.data[0].length) return;
    const rows = s.data[0].slice(-12);
    const W = Math.max(el.clientWidth, 80), H = 28;
    const xs = d3.scaleLinear([0, rows.length - 1], [2, W - 2]);
    const ys = d3.scaleLinear([0, d3.max(rows, (d) => d.nuovi + d.rewatch) || 1], [H - 2, 3]);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');
    svg.append('path').attr('d', d3.area((d, i) => xs(i), H - 1, (d) => ys(d.nuovi + d.rewatch))(rows)).style('fill', `color-mix(in srgb, ${dash.colors[0]} 18%, transparent)`);
    svg.append('path').attr('d', d3.line((d, i) => xs(i), (d) => ys(d.nuovi + d.rewatch))(rows)).style('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5).attr('stroke-linejoin', 'round');
  });

  dash.draw('traguardi', (el) => {
    const s = stato('traguardi');
    if (!s.ok) return waitBox(el, s.fail);
    const rows = s.data[0];
    ready(el);
    if (!rows.length) return;
    const tip = makeTip(el);
    const W = Math.max(el.clientWidth, 240);
    const anno = rows[0].data.slice(0, 4);
    const t0 = new Date(anno + '-01-01T00:00:00Z'), t1 = new Date(anno + '-12-31T00:00:00Z');
    const xs = d3.scaleUtc([t0, t1], [16, W - 16]);
    const H = 120, mid = 60;
    const svg = d3.select(el).append('svg').attr('class', 'lb-svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('line').attr('x1', 16).attr('x2', W - 16).attr('y1', mid).attr('y2', mid).style('stroke', 'var(--cds-chart-axis)').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    const mesi = d3.utcMonths(t0, t1);
    const fmtM = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' });
    svg.append('g').selectAll('line').data(mesi).join('line').attr('x1', (d) => xs(d)).attr('x2', (d) => xs(d)).attr('y1', mid - 3).attr('y2', mid + 3).style('stroke', 'var(--cds-chart-axis)');
    const ml = svg.append('g').selectAll('text').data(mesi).join('text').attr('x', (d) => xs(d) + 2).attr('y', mid + 16).text((d) => fmtM.format(d));
    if (textWidth(ml) + 6 > (W - 32) / 12) ml.filter((d, i) => i % 2).remove();
    const now = d3.utcDay.floor(new Date());
    if (now >= t0 && now <= t1) svg.append('line').attr('x1', xs(now)).attr('x2', xs(now)).attr('y1', mid - 14).attr('y2', mid + 14).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d) => `translate(${xs(new Date(d.data + 'T00:00:00Z'))},${mid})`);
    g.append('circle').attr('r', (d) => (d.n === 1 ? 5 : 7)).style('fill', (d) => (d.n === 1 ? 'var(--color-panel)' : dash.colors[0])).style('stroke', dash.colors[0]).attr('stroke-width', 2);
    const lab = g.append('text').attr('class', 'lb-film').attr('text-anchor', 'middle').attr('y', (d, i) => (i % 2 ? 32 : -16)).text((d) => (d.n === 1 ? '1°' : d.n + '°'));
    g.append('circle').attr('r', 14).style('fill', 'transparent')
      .on('mousemove', (event, d) => tip.show(event, (d.n === 1 ? 'Primo film' : d.n + '° film') + ' · ' + fmtData(d.data), [d.film]))
      .on('mouseleave', () => tip.hide());
    void lab;
  });

  dash.draw('anno-decenni', (el) => {
    const s = stato('anno_decenni');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.decennio, y: (d) => d.film,
      xLabel: (d) => "'" + String(d.decennio).slice(2), valLabel: (d) => itInt.format(d.film),
      tipHead: (d) => 'Anni ' + d.decennio, tipLine: (d) => itInt.format(d.film) + ' film visti quest’anno',
      color: dash.colors[2],
    });
  });

  dash.draw('progress', (el) => {
    const s = stato(el.dataset.source);
    const row = s.ok ? s.data[0][Number(el.dataset.row || 0)] : null;
    el.style.width = row ? Math.round(Math.max(0, Math.min(1, row[el.dataset.field])) * 1000) / 10 + '%' : '0';
  });

  dash.draw('classici-tiles', (el) => {
    const s = stato('classici_film');
    if (!s.ok) return waitBox(el, s.fail);
    ready(el);
    const tip = makeTip(el);
    [...s.data[0]].sort((a, b) => a.posizione - b.posizione).forEach((c) => {
      const t = document.createElement('span'); t.className = 'lb-t';
      const r = document.createElement('span'); r.className = 'lb-t-rank'; r.textContent = '#' + c.posizione;
      const v = document.createElement('span');
      if (c.stato === 'Visto' && c.voto != null) { t.style.background = tileColor(c.voto); t.style.color = tileText(c.voto); v.textContent = stelle(c.voto); }
      else if (c.stato === 'Visto') { t.classList.add('lb-t-seen-norate'); v.textContent = '✓'; }
      else if (c.stato === 'In watchlist') { t.classList.add('lb-t-wl'); v.textContent = '+'; }
      else { t.classList.add('lb-t-todo'); v.textContent = '·'; }
      t.append(r, v);
      t.addEventListener('mousemove', (event) => tip.show(event, '#' + c.posizione + ' ' + c.titolo + ' (' + c.anno + ')', [c.regista, c.stato === 'Visto' ? (c.voto != null ? 'Visto · ' + voto(c.voto) + '★' : 'Visto') : c.stato]));
      t.addEventListener('mouseleave', () => tip.hide());
      el.appendChild(t);
    });
  });

  dash.draw('liste', (el) => {
    const s = stato('liste_info');
    if (!s.ok) return waitBox(el, s.fail);
    ready(el);
    s.data[0].forEach((l) => {
      const c = document.createElement('article'); c.className = 'lb-listcard';
      const h = document.createElement('h4'); h.textContent = l.lista;
      const d = document.createElement('p'); d.textContent = l.film + ' film · ' + l.visti + ' visti' + (l.media != null ? ' · media ' + it1.format(l.media) + '★' : '');
      const pr = document.createElement('div'); pr.className = 'lb-progress';
      const f = document.createElement('span'); f.className = 'lb-progress-fill'; f.style.width = Math.round((l.visti / l.film) * 100) + '%';
      pr.appendChild(f);
      c.append(h, d);
      if (l.descrizione) { const x = document.createElement('p'); x.textContent = l.descrizione; c.appendChild(x); }
      c.appendChild(pr);
      el.appendChild(c);
    });
  });

  dash.draw('scaffale', (el) => {
    const s = stato('bluray');
    if (!s.ok) return waitBox(el, s.fail);
    ready(el);
    const tip = makeTip(el);
    [...s.data[0]].sort((a, b) => a.posizione - b.posizione).forEach((b) => {
      const sp = document.createElement('span'); sp.className = 'lb-spine';
      sp.style.height = (110 + (b.voto ?? 0) * 20) + 'px';
      if (b.voto != null) { sp.style.background = tileColor(b.voto); sp.style.color = tileText(b.voto); }
      else { sp.style.background = 'var(--cds-chart-grid)'; sp.style.color = 'var(--color-fg-muted)'; }
      sp.textContent = b.film;
      sp.addEventListener('mousemove', (event) => tip.show(event, b.film + ' (' + b.anno + ')', [(b.regista ? b.regista + ' · ' : '') + (b.voto != null ? voto(b.voto) + '★' : 'senza voto')]));
      sp.addEventListener('mouseleave', () => tip.hide());
      el.appendChild(sp);
    });
  });

  dash.draw('in-sala', (el) => {
    const s = stato('in_sala');
    if (!s.ok) return waitBox(el, s.fail);
    ready(el);
    const tip = makeTip(el);
    [...s.data[0]].sort((a, b) => a.posizione - b.posizione).forEach((f) => {
      const c = document.createElement('span'); c.className = 'lb-filmchip';
      const b = document.createElement('b');
      if (f.voto != null) { b.style.background = tileColor(f.voto); b.style.color = tileText(f.voto); b.textContent = stelle(f.voto); } else { b.textContent = '—'; }
      const t = document.createElement('span'); t.textContent = f.film;
      c.append(b, t);
      c.addEventListener('mousemove', (event) => tip.show(event, f.film + ' (' + f.anno + ')', [f.voto != null ? voto(f.voto) + '★' : 'senza voto']));
      c.addEventListener('mouseleave', () => tip.hide());
      el.appendChild(c);
    });
  });

  dash.draw('cuori-voto', (el) => {
    const s = stato('cuori_per_voto');
    if (!s.ok) return waitBox(el, s.fail);
    bars(el, s.data[0], {
      x: (d) => d.voto, y: (d) => d.quota, yMax: 1,
      xLabel: (d) => stelle(d.voto), valLabel: (d) => (d.film ? itPct.format(d.quota) : ''),
      tipHead: (d) => 'Voto ' + voto(d.voto) + '★', tipLine: (d) => [itInt.format(d.cuori) + ' su ' + itInt.format(d.film) + ' film con il cuore'],
      color: dash.colors[0],
    });
  });

  // ================= TABELLE =================
  const td = (text, cls) => { const c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; return c; };
  const tr = (key, cells) => { const r = document.createElement('tr'); r.dataset.key = key; cells.forEach((c) => r.appendChild(c)); return r; };
  const starsCell = (v) => {
    const c = document.createElement('td');
    if (v == null) { c.textContent = '—'; return c; }
    const w = document.createElement('span'); w.className = 'lb-stars';
    const g = document.createElement('span'); g.className = 'lb-stars-g'; g.setAttribute('aria-hidden', 'true');
    g.textContent = '★'.repeat(Math.floor(v)) + (v % 1 ? '½' : '');
    const n = document.createElement('span'); n.className = 'lb-stars-n'; n.textContent = voto(v);
    w.append(g, n); c.appendChild(w);
    return c;
  };
  const rankCell = (i) => td(String(i + 1), 'lb-rank');
  const barCell = (v, max) => {
    const c = document.createElement('td');
    const wrap = document.createElement('span'); wrap.className = 'lb-cellbar';
    const track = document.createElement('span'); track.className = 'lb-cellbar-track';
    const fill = document.createElement('span'); fill.className = 'lb-cellbar-fill';
    fill.style.width = (v == null ? 0 : Math.max(0, Math.min(1, v / max)) * 100) + '%';
    fill.style.background = dash.colors[0];
    const val = document.createElement('span'); val.className = 'lb-cellbar-val'; val.textContent = voto(v);
    track.appendChild(fill); wrap.append(track, val); c.appendChild(wrap);
    return c;
  };

  dash.draw('t-preferiti', (el) => {
    const s = stato('preferiti');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d) => el.appendChild(tr(String(d.posizione), [td(String(d.posizione), 'lb-muted'), td(d.film ?? '—'), td(d.anno == null ? '—' : String(d.anno), 'lb-num'), starsCell(d.voto)])));
  });

  dash.draw('t-cinque', (el) => {
    const s = stato('visti_info');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].filter((r) => r.voto === 5).sort((a, b) => a.anno - b.anno)
      .forEach((r) => el.appendChild(tr(r['Letterboxd URI'], [td(r.film), td(r.regista ?? '—', 'lb-muted lb-hide-narrow'), td(String(r.anno), 'lb-num')])));
  });

  dash.draw('t-registi', (el) => {
    const s = stato('registi');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].filter((d) => d.film >= C.MIN_REG)
      .forEach((d) => el.appendChild(tr(d.regista, [td(d.regista), td(itInt.format(d.film), 'lb-num'), barCell(d.media, 5), td(d.migliore + ' (' + voto(d.migliore_voto) + '★)', 'lb-muted lb-hide-narrow')])));
  });

  dash.draw('t-paesi', (el) => {
    const s = stato('paesi');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d) => el.appendChild(tr(d.paese, [td(d.paese), td(itInt.format(d.film), 'lb-num'), barCell(d.media, 5)])));
  });

  dash.draw('t-rivisti', (el) => {
    const s = stato('piu_rivisti');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d) => el.appendChild(tr(encodeURIComponent(d.film) + ',' + d.anno, [td(d.film), td(String(d.anno), 'lb-num'), td(itInt.format(d.visioni), 'lb-num'), starsCell(d.ultimo_voto)])));
  });

  dash.draw('t-wl-registi', (el) => {
    const s = stato('wl_registi');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d) => el.appendChild(tr(d.regista, [td(d.regista), td(itInt.format(d.in_watchlist), 'lb-num'), td(itInt.format(d.visti), 'lb-num'), td(voto(d.media_visti), 'lb-num')])));
  });

  dash.draw('t-wl', (el) => {
    const s = stato('wl_info');
    el.replaceChildren();
    if (!s.ok) return;
    [...s.data[0]].sort((a, b) => String(b.aggiunto).localeCompare(String(a.aggiunto))).slice(0, C.N_WL)
      .forEach((r) => el.appendChild(tr(r['Letterboxd URI'], [td(r.film), td(r.regista ?? '—', 'lb-muted lb-hide-narrow'), td(String(r.anno), 'lb-num'), td(fmtData(r.aggiunto), 'lb-num')])));
  });

  dash.draw('t-anno-top', (el) => {
    const s = stato('anno_top');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d, i) => el.appendChild(tr(encodeURIComponent(d.film) + ',' + d.anno, [rankCell(i), td(d.film), td(String(d.anno), 'lb-num'), starsCell(d.voto)])));
  });

  dash.draw('t-colpevoli', (el) => {
    const s = stato('piaceri_colpevoli');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].forEach((d) => el.appendChild(tr(d['Letterboxd URI'], [td(d.film), td(String(d.anno), 'lb-num'), starsCell(d.voto)])));
  });

  dash.draw('t-prossimi', (el) => {
    const s = stato('saghe');
    el.replaceChildren();
    if (!s.ok) return;
    s.data[0].filter((d) => d.stato === 'In corso')
      .sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || b.completamento - a.completamento || a.saga.localeCompare(b.saga, 'it'))
      .forEach((d) => el.appendChild(tr(d.saga, [td(d.saga), td(d.prossimo ?? '—'), td(voto(d.media), 'lb-num'), td(itInt.format(d.visti), 'lb-num lb-hide-narrow')])));
  });

  dash.draw('t-consigli', (el) => {
    const s = stato('wl_consigli');
    el.replaceChildren();
    if (!s.ok) return;
    const perReg = new Map();
    s.data[0].filter((d) => d.visti_regista >= C.MIN_CONS)
      .filter((d) => { const n = (perReg.get(d.regista) || 0) + 1; perReg.set(d.regista, n); return n <= C.MAX_PER_REG; })
      .slice(0, C.N_CONS)
      .forEach((d) => el.appendChild(tr(d['Letterboxd URI'], [td(d.film), td(d.regista, 'lb-muted'), td(String(d.anno), 'lb-num'), barCell(d.media_regista, 5), td(itInt.format(d.visti_regista), 'lb-num lb-hide-narrow')])));
  });

  // Tutti i voti: ordinamento e ricerca
  window.lbSort = { key: 'votato', dir: -1 };
  window.lbQuery = '';
  document.querySelectorAll('.lb-all th[data-sort] button').forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.closest('th').dataset.sort;
      window.lbSort = { key, dir: window.lbSort.key === key ? -window.lbSort.dir : (['film', 'regista', 'genere'].includes(key) ? 1 : -1) };
      document.querySelectorAll('.lb-all th[data-sort]').forEach((h) => {
        if (h.dataset.sort === key) h.setAttribute('aria-sort', window.lbSort.dir > 0 ? 'ascending' : 'descending');
        else h.removeAttribute('aria-sort');
      });
      dash.draw('t-tutti');
    });
  });
  document.querySelectorAll('.lb-search').forEach((inp) => {
    inp.addEventListener('input', () => { window.lbQuery = inp.value.trim().toLowerCase(); dash.draw('t-tutti'); });
  });

  dash.draw('t-tutti', (el) => {
    const s = stato('visti_info');
    el.replaceChildren();
    if (!s.ok) return;
    const { key, dir } = window.lbSort;
    const q = window.lbQuery;
    const val = (r) => (key === 'anno' || key === 'voto' ? Number(r[key]) : String(r[key] ?? ''));
    [...s.data[0]]
      .filter((r) => !q || [r.film, r.regista, r.genere].some((x) => x && String(x).toLowerCase().includes(q)))
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        const c = typeof va === 'number' ? va - vb : va.localeCompare(vb);
        return c * dir || String(a.film).localeCompare(String(b.film));
      })
      .forEach((r) => el.appendChild(tr(r['Letterboxd URI'], [td(r.film), td(r.regista ?? '—', 'lb-muted lb-hide-narrow'), td(r.genere ?? '—', 'lb-muted lb-hide-narrow'), td(String(r.anno), 'lb-num'), starsCell(r.voto), td(fmtData(r.votato), 'lb-num lb-hide-narrow')])));
  });

  // ================= RECENSIONI =================
  dash.draw('reviews', (el) => {
    const s = stato('reviews');
    if (!s.ok) return waitBox(el, s.fail);
    ready(el);
    [...s.data[0]].sort((a, b) => String(b['Watched Date']).localeCompare(String(a['Watched Date']))).forEach((r) => {
      const a = document.createElement('article'); a.className = 'lb-review';
      const h = document.createElement('h3'); h.textContent = r.Name + ' (' + r.Year + ')';
      const meta = document.createElement('p'); meta.className = 'lb-review-meta';
      meta.textContent = voto(Number(r.Rating)) + '★ · visto il ' + fmtData(r['Watched Date']);
      const p = document.createElement('p'); p.className = 'lb-review-text'; p.textContent = r.Review;
      a.append(h, meta, p);
      el.appendChild(a);
    });
  });
