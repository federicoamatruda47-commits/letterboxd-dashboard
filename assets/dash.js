// Mini-runtime della dashboard: carica i file in data/, esegue i calcoli e ridisegna.
// app.js lo usa tramite l'oggetto globale `dash`:
//   dash.calc(id, {inputs, fn})  definisce un dato calcolato da altri dati
//   dash.draw(nome, fn)          disegna ogni elemento con data-draw="nome"
//   dash.draw(nome)              ridisegna quegli elementi
//   dash.onData(fn)              eseguita prima dei disegni, a ogni ridisegno
//   dash.data(id)                -> {status, data}
(function () {
  // id del dato -> file in data/
  const FILES = {
    ratings: 'ratings.csv',
    diary: 'diary.csv',
    watched: 'watched.csv',
    watchlist: 'watchlist.csv',
    reviews: 'reviews.json',
    favorites: 'favorites.csv',
    likes: 'likes.csv',
    liste: 'liste.csv',
    films_info: 'films_info.csv',
    saghe_elenco: 'saghe.csv',
    classici: 'classici.csv',
  };

  const calcs = new Map();
  const draws = new Map();
  const listeners = [];
  const store = {};
  let state = 'loading';

  const compute = (id, stack = []) => {
    if (id in store) return store[id];
    const c = calcs.get(id);
    if (!c) throw new Error('Dato sconosciuto: ' + id);
    if (stack.includes(id)) throw new Error('Calcoli in ciclo: ' + [...stack, id].join(' > '));
    const args = c.inputs.map((i) => compute(i, [...stack, id]));
    store[id] = c.fn(...args);
    return store[id];
  };

  const runDraw = (name) => {
    const fn = draws.get(name);
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (el.closest('[hidden]')) return; // le schede nascoste si disegnano quando vengono aperte
      try { fn(el); } catch (e) { console.error('Disegno "' + name + '":', e); }
    });
  };

  const renderAll = () => {
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    draws.forEach((_, name) => runDraw(name));
  };

  let queued = false;
  const queueRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; renderAll(); });
  };

  window.dash = {
    colors: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 'var(--lb-c' + i + ')'),
    calc(id, def) { calcs.set(id, def); },
    draw(name, fn) { if (fn === undefined) runDraw(name); else draws.set(name, fn); },
    onData(fn) { listeners.push(fn); },
    data(id) {
      if (state !== 'ok') return { status: state, data: [] };
      try { return { status: 'ok', data: compute(id) }; }
      catch (e) { console.error(e); return { status: 'error', data: [], message: String(e.message || e) }; }
    },
    params: () => ({}),
    setParams() {},
    resetParams() {},
    refresh() {},
    setLink(id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignora */ } },
  };

  const load = async () => {
    try {
      const ids = Object.keys(FILES);
      const loaded = await Promise.all(ids.map((id) => {
        const url = 'data/' + FILES[id];
        return FILES[id].endsWith('.json') ? d3.json(url) : d3.csv(url);
      }));
      ids.forEach((id, i) => { store[id] = loaded[i]; });
      state = 'ok';
    } catch (e) {
      console.error('Caricamento dei dati fallito:', e);
      state = 'error';
    }
    renderAll();
    d3.json('data/meta.json').then((m) => {
      const el = document.getElementById('site-updated');
      if (el && m && m.export_date) el.textContent = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m.export_date + 'T00:00:00Z'));
    }).catch(() => {});
  };

  window.addEventListener('DOMContentLoaded', () => {
    renderAll(); // stato di caricamento
    load();
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; queueRender(); } });
    // quando si apre una scheda, i suoi grafici vanno disegnati alla larghezza reale
    new MutationObserver((muts) => {
      if (muts.some((m) => m.target.matches && m.target.matches('[role="tabpanel"]'))) queueRender();
    }).observe(document.getElementById('dash-root'), { attributes: true, attributeFilter: ['hidden'], subtree: true });
  });
})();
