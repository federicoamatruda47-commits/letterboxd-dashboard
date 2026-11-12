#!/usr/bin/env python3
"""Svuota tasche rotondo, parametrico, per stampa 3D (Bambu Lab A1 Mini, PLA).

Uso:  python3 svuotatasche.py
Crea output/svuotatasche.stl, output/svuotatasche.step e output/anteprima.png.

Il solido è un profilo di rivoluzione: tutta la forma è decisa dalla sezione
costruita in `profilo()`.
"""
import math
import sys
from pathlib import Path

import cadquery as cq
import numpy as np

# ───────────────────────────── PARAMETRI (mm) ─────────────────────────────
diametro_esterno = 150.0   # diametro massimo, misurato sul bordo superiore
altezza = 28.0             # altezza totale
spessore_parete = 3.2      # spessore della parete (8 passate con ugello 0,4)
svasatura = 6.0            # di quanto la parete si allarga dal basso verso l'alto
spessore_fondo = 3.0       # spessore del fondo
raccordo_esterno = 10.0    # raggio del raccordo fondo/parete, lato esterno
raccordo_interno = 8.0     # raggio del raccordo fondo/parete, lato interno
smusso_base = 0.6          # smusso sul perimetro d'appoggio (anti elephant foot)
sbalzo_massimo = 45.0      # gradi dalla verticale: oltre servirebbero i supporti

# Il bordo superiore è un mezzo tondo: il suo raggio è metà dello spessore parete.

# Stampante e materiale (solo per i controlli e la stima del peso)
lato_piatto = 180.0        # piatto della A1 Mini
densita_pla = 1.24         # g/cm³

# Esportazione
cartella_output = Path(__file__).resolve().parent / "output"
tolleranza_stl = 0.01      # scostamento massimo della mesh dalla superficie (mm)
tolleranza_angolare = 0.1  # radianti: più basso = curve più fitte
# ───────────────────────────────────────────────────────────────────────────


def profilo():
    """Punti notevoli della mezza sezione nel piano (raggio, quota).

    Lato esterno, dal basso: smusso a 45°, poi il raccordo che parte già a 45°
    (in continuità con lo smusso) e arriva tangente alla parete. Un raccordo
    tangente anche al fondo partirebbe orizzontale, cioè con uno sbalzo di 90°
    sui primi strati: così invece non si supera mai `sbalzo_massimo`, e lo
    spigolo che resta è quello d'appoggio sul piatto, che non si vede.
    """
    a = math.atan2(svasatura, altezza)             # inclinazione della parete
    u = np.array([math.sin(a), math.cos(a)])       # direzione della parete, verso l'alto
    n = np.array([math.cos(a), -math.sin(a)])      # normale alla parete, verso l'esterno
    r = spessore_parete / 2                        # raggio del mezzo tondo sul bordo
    s = math.radians(sbalzo_massimo)

    c_bordo = np.array([diametro_esterno / 2 - r, altezza - r])

    # Raccordo esterno: centro sulla parallela alla parete, a quota tale che
    # il punto a 45° dell'arco cada esattamente in cima allo smusso.
    z_ce = smusso_base + raccordo_esterno * math.sin(s)
    base = c_bordo + (r - raccordo_esterno) * n
    c_est = base + (z_ce - base[1]) / u[1] * u
    q = c_est + raccordo_esterno * np.array([math.cos(s), -math.sin(s)])
    m = (s + a) / 2
    medio_est = c_est + raccordo_esterno * np.array([math.cos(m), -math.sin(m)])
    tang_est = c_est + raccordo_esterno * n

    # Raccordo interno: tangente al fondo e alla parete interna.
    z_ci = spessore_fondo + raccordo_interno
    base = c_bordo - (r + raccordo_interno) * n
    c_int = base + (z_ci - base[1]) / u[1] * u
    m = (math.pi / 2 + a) / 2
    medio_int = c_int + raccordo_interno * np.array([math.cos(m), -math.sin(m)])
    tang_int = c_int + raccordo_interno * n

    p = {
        "angolo_parete": math.degrees(a),
        "base": np.array([q[0] - smusso_base * math.tan(s), 0.0]),
        "fine_smusso": q,
        "medio_est": medio_est,
        "tang_est": tang_est,
        "bordo_est": c_bordo + r * n,
        "bordo_cima": c_bordo + r * u,
        "bordo_int": c_bordo - r * n,
        "tang_int": tang_int,
        "medio_int": medio_int,
        "fondo_int": np.array([c_int[0], spessore_fondo]),
        "c_est": c_est,
        "c_int": c_int,
    }

    # Controlli di coerenza dei parametri
    if not a < s:
        sys.exit("Errore: la svasatura inclina la parete oltre lo sbalzo massimo.")
    if p["tang_est"][1] >= p["bordo_est"][1] or p["tang_int"][1] >= p["bordo_int"][1]:
        sys.exit("Errore: raccordi troppo grandi per questa altezza.")
    if p["base"][0] <= 0 or p["fondo_int"][0] <= 0:
        sys.exit("Errore: raccordi troppo grandi per questo diametro.")
    return p


def costruisci(p):
    """Solido di rivoluzione della mezza sezione attorno all'asse Z."""
    t = lambda nome: tuple(float(v) for v in p[nome])
    sezione = cq.Workplane("XZ").moveTo(0, 0).lineTo(*t("base"))
    if smusso_base > 0:
        sezione = sezione.lineTo(*t("fine_smusso"))
    sezione = (
        sezione
        .threePointArc(t("medio_est"), t("tang_est"))
        .lineTo(*t("bordo_est"))
        .threePointArc(t("bordo_cima"), t("bordo_int"))
        .lineTo(*t("tang_int"))
        .threePointArc(t("medio_int"), t("fondo_int"))
        .lineTo(0, spessore_fondo)
        .close()
    )
    return sezione.revolve(360, (0, 0, 0), (0, 1, 0)).val()


def mesh(solido, tol, tol_ang):
    """Triangoli del solido con i vertici coincidenti saldati."""
    vertici, triangoli = solido.tessellate(tol, tol_ang)
    v = np.array([(q.x, q.y, q.z) for q in vertici])
    f = np.array(triangoli)
    _, primo, inverso = np.unique(np.round(v, 5), axis=0, return_index=True, return_inverse=True)
    f = inverso.ravel()[f]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
    return v[primo], f


def mesh_chiusa(f):
    """Vero se ogni spigolo è condiviso da esattamente due triangoli."""
    spigoli = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, conteggi = np.unique(spigoli, axis=0, return_counts=True)
    return bool(np.all(conteggi == 2))


def sbalzo_peggiore(v, f):
    """Sbalzo massimo (gradi dalla verticale) delle facce rivolte in basso,
    escluse quelle appoggiate sul piatto."""
    tri = v[f]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(nrm, axis=1)
    ok = area > 1e-9
    nz = nrm[ok, 2] / area[ok]
    sollevate = tri[ok][:, :, 2].max(axis=1) > 1e-6
    giu = nz[sollevate & (nz < 0)]
    return float(np.degrees(np.arcsin(-giu.min()))) if giu.size else 0.0


def anteprima(solido, p, percorso):
    """PNG con vista 3D, sezione quotata e ingrandimenti di raccordi e bordo."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    fig = plt.figure(figsize=(15, 9), dpi=130)
    griglia = fig.add_gridspec(2, 3, height_ratios=[1.25, 1], hspace=0.12, wspace=0.12)

    # Vista 3D
    # Sezione vera del solido sul piano XZ
    facce = cq.Workplane("XZ").add(solido).section().vals()
    facce = [fc for o in facce for fc in o.Faces()]

    # Vista 3D: il contorno della sezione, campionato fitto e fatto ruotare.
    # (Una griglia regolare di piccoli quadrilateri evita gli artefatti di
    # ordinamento che matplotlib produce con i triangoli grandi della mesh.)
    contorno = []
    for e in facce[0].outerWire():                 # spigoli in ordine lungo il filo
        passi = max(2, int(e.Length() / 1.5))
        pts = [e.positionAt(k / passi) for k in range(passi + 1)]
        pts = [(q.x, q.z) for q in pts]
        if contorno and math.dist(pts[-1], contorno[-1]) < math.dist(pts[0], contorno[-1]):
            pts.reverse()
        contorno += pts
    contorno = np.array([q for q in contorno if q[0] >= -1e-6])
    salto = np.argmax(np.linalg.norm(np.diff(contorno, axis=0, append=contorno[:1]), axis=1))
    contorno = np.roll(contorno, -(salto + 1), axis=0)   # mezza sezione, da asse ad asse
    angoli = np.linspace(0, 2 * math.pi, 121)
    X = np.outer(contorno[:, 0], np.cos(angoli))
    Y = np.outer(contorno[:, 0], np.sin(angoli))
    Z = np.outer(contorno[:, 1], np.ones_like(angoli))
    # Quadrilateri, con le facce rivolte dalla parte opposta all'osservatore
    # scartate: matplotlib non ha uno z-buffer e altrimenti le mescolerebbe.
    G = np.stack([X, Y, Z], axis=-1)
    quad = np.stack([G[:-1, :-1], G[1:, :-1], G[1:, 1:], G[:-1, 1:]], axis=2).reshape(-1, 4, 3)
    nrm = np.cross(quad[:, 2] - quad[:, 0], quad[:, 3] - quad[:, 1])
    lung = np.linalg.norm(nrm, axis=1)
    quad, nrm = quad[lung > 1e-9], nrm[lung > 1e-9] / lung[lung > 1e-9, None]
    if nrm[np.argmax(quad[:, :, 2].mean(axis=1)), 2] < 0:
        nrm = -nrm                                 # normali verso l'esterno del solido
    elev, azim = math.radians(32), math.radians(-60)
    vista = np.array([math.cos(elev) * math.cos(azim), math.cos(elev) * math.sin(azim), math.sin(elev)])
    luce = np.array([0.25, -0.45, 0.86])
    visibili = nrm @ vista > 0
    tono = 0.45 + 0.55 * np.clip(nrm[visibili] @ luce, 0, 1)
    colori = np.clip(tono[:, None] * np.array([0.93, 0.52, 0.28]), 0, 1)
    ax = fig.add_subplot(griglia[0, :2], projection="3d")
    ax.add_collection3d(Poly3DCollection(quad[visibili], facecolors=colori, edgecolors=colori,
                                         linewidths=0.3))
    R = diametro_esterno / 2
    ax.set_xlim(-R, R); ax.set_ylim(-R, R); ax.set_zlim(-R + altezza / 2, R + altezza / 2)
    ax.set_box_aspect((1, 1, 1), zoom=1.45)
    ax.view_init(elev=math.degrees(elev), azim=math.degrees(azim))
    ax.set_axis_off()
    ax.set_title("Vista 3D", y=0.9)

    def disegna_sezione(ax):
        for faccia in facce:
            fv, ft = faccia.tessellate(0.01, 0.05)
            xs = [q.x for q in fv]; zs = [q.z for q in fv]
            ax.tripcolor(xs, zs, ft, facecolors=np.zeros(len(ft)), cmap="Oranges",
                         vmin=-1, vmax=1.5, edgecolors="none")
            for e in faccia.Edges():
                pts = [e.positionAt(k / 60) for k in range(61)]
                ax.plot([q.x for q in pts], [q.z for q in pts], color="#5a2a0c", lw=1.1)
        ax.set_aspect("equal")

    ax = fig.add_subplot(griglia[0, 2])
    disegna_sezione(ax)
    ax.axhline(0, color="0.6", lw=0.8)
    ax.set_xlim(-R - 8, R + 8); ax.set_ylim(-14, altezza + 12)
    ax.annotate("", (-R, altezza + 5), (R, altezza + 5), arrowprops=dict(arrowstyle="<->"))
    ax.text(0, altezza + 6.5, f"Ø {diametro_esterno:g}", ha="center")
    ax.annotate("", (-p['base'][0], -5), (p['base'][0], -5), arrowprops=dict(arrowstyle="<->"))
    ax.text(0, -11, f"appoggio Ø {2 * p['base'][0]:.1f}", ha="center")
    ax.set_title("Sezione")
    ax.set_xlabel("mm")

    # Ingrandimenti
    ax = fig.add_subplot(griglia[1, 0:2])
    disegna_sezione(ax)
    ax.axhline(0, color="0.6", lw=0.8)
    ax.set_xlim(R - 34, R + 4); ax.set_ylim(-2, altezza + 2)
    for nome, colore in (("fine_smusso", "tab:blue"), ("tang_est", "tab:blue"),
                         ("tang_int", "tab:green"), ("fondo_int", "tab:green"),
                         ("bordo_est", "tab:red"), ("bordo_int", "tab:red")):
        ax.plot(*p[nome], "o", ms=4, color=colore)
    ax.plot([], [], "o", color="tab:blue", label=f"raccordo esterno R{raccordo_esterno:g}")
    ax.plot([], [], "o", color="tab:green", label=f"raccordo interno R{raccordo_interno:g}")
    ax.plot([], [], "o", color="tab:red", label=f"mezzo tondo R{spessore_parete / 2:g}")
    ax.legend(loc="upper left", fontsize=9, title="Punti di tangenza")
    ax.set_title("Ingrandimento: raccordi e parete")
    ax.set_xlabel("raggio (mm)"); ax.set_ylabel("quota (mm)")

    ax = fig.add_subplot(griglia[1, 2])
    disegna_sezione(ax)
    ax.axhline(0, color="0.6", lw=0.8)
    bx = p["base"][0]
    ax.set_xlim(bx - 3, bx + 5); ax.set_ylim(-0.5, 4.5)
    ax.set_title(f"Ingrandimento: smusso {smusso_base:g} mm a 45°")
    ax.set_xlabel("raggio (mm)")

    fig.savefig(percorso, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main():
    p = profilo()
    solido = costruisci(p)

    # Validità del solido e chiusura della mesh
    valido = solido.isValid()
    v, f = mesh(solido, tolleranza_stl, tolleranza_angolare)
    chiusa = mesh_chiusa(f)
    sbalzo = sbalzo_peggiore(v, f)

    ingombro = v.max(axis=0) - v.min(axis=0)      # misurato sulla mesh esportata
    volume = solido.Volume() / 1000  # cm³
    interno = (cq.Workplane("XY").circle(diametro_esterno).extrude(altezza)
               .cut(cq.Workplane("XY").add(solido)).solids("<Z").val())

    cartella_output.mkdir(exist_ok=True)
    cq.exporters.export(cq.Workplane().add(solido), str(cartella_output / "svuotatasche.stl"),
                        tolerance=tolleranza_stl, angularTolerance=tolleranza_angolare)
    cq.exporters.export(cq.Workplane().add(solido), str(cartella_output / "svuotatasche.step"))
    anteprima(solido, p, cartella_output / "anteprima.png")

    si = lambda b: "sì" if b else "NO"
    print(f"Dimensioni d'ingombro : {ingombro[0]:.2f} × {ingombro[1]:.2f} × {ingombro[2]:.2f} mm")
    print(f"Diametro d'appoggio   : {2 * p['base'][0]:.2f} mm")
    print(f"Inclinazione parete   : {p['angolo_parete']:.1f}° dalla verticale")
    print(f"Volume del materiale  : {volume:.1f} cm³  (~{volume * densita_pla:.0f} g di PLA se pieno)")
    print(f"Capienza interna      : {interno.Volume() / 1000:.0f} cm³")
    print(f"Solido valido         : {si(valido)}")
    print(f"Mesh chiusa           : {si(chiusa)}  ({len(f)} triangoli)")
    print(f"Sbalzo massimo        : {sbalzo:.1f}°  (limite {sbalzo_massimo:g}°)")
    print(f"Entra nel piatto      : {si(max(ingombro[:2]) <= lato_piatto)}  ({lato_piatto:g} mm)")
    print(f"File in               : {cartella_output}")

    problemi = []
    if not valido: problemi.append("solido non valido")
    if not chiusa: problemi.append("mesh non chiusa")
    if sbalzo > sbalzo_massimo + 0.5: problemi.append("sbalzo oltre il limite")
    if max(ingombro[:2]) > lato_piatto: problemi.append("non entra nel piatto")
    if problemi:
        sys.exit("ATTENZIONE: " + ", ".join(problemi))


if __name__ == "__main__":
    main()
