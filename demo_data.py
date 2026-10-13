"""Isi data demo ke database (data/inventory.db) lewat API aplikasi sendiri.

    python demo_data.py          # tambah data demo (aman dijalankan ulang: yang sudah ada dilewati)
    python demo_data.py --hapus  # hapus data demo saja (SSTB berawalan DEMO/ dan produksi bercatatan [demo])

Tanggal dibuat relatif terhadap hari ini (7 hari terakhir) supaya langsung tampil di
daftar Produksi / Barang Masuk / Barang Keluar. Master (Jenis, Motif, Karyawan, Pengrajin)
yang sudah ada dipakai lagi; yang belum ada ditambahkan. Disarankan klik "Backup DB" dulu.
"""
import datetime as dt
import sys

import app as A

PREFIX = "DEMO/"
TAG = "[demo]"
client = A.app.test_client()
today = dt.date.today()
day = lambda n: (today - dt.timedelta(days=n)).isoformat()


def post(url, body):
    r = client.post(url, json=body)
    return r.status_code, (r.get_json() or {})


def opts(src):
    return [o["v"] for o in client.get(f"/api/opt/{src}?limit=200").get_json()]


def hapus():
    n = 0
    for arah in ("masuk", "keluar"):  # keluar dulu: baris keluar menaut ke produksi
        for r in client.get(f"/api/lines/{arah}?from=2000-01-01&to=2999-12-31&size=100&q={PREFIX}").get_json()["rows"]:
            if r["sstb"].startswith(PREFIX):
                client.delete(f"/api/doc/{arah}/{r['doc_id']}"); n += 1
    for r in client.get("/api/produksi?from=2000-01-01&to=2999-12-31&size=100&q=" + TAG).get_json()["rows"]:
        if r.get("catatan") == TAG:
            client.delete(f"/api/produksi/{r['id']}"); n += 1
    print(f"Dihapus: {n} data demo (master yang ditambahkan tidak ikut dihapus).")


def main():
    if "--hapus" in sys.argv:
        return hapus()
    if client.get("/api/lines/masuk?from=2000-01-01&to=2999-12-31&q=" + PREFIX).get_json()["docs"]:
        print("Data demo sudah ada. Jalankan `python demo_data.py --hapus` dulu bila ingin membuat ulang.")
        return

    # --- master: pakai yang ada, tambah bila kurang ---
    for j in ("30 STR", "40 STR", "60 STR"):
        post("/api/jenis", {"nama": j})
    for kode, nama, jenis in [("DM.101", "Garis Biru (demo)", "40 STR"), ("DM.102", "Kotak Merah (demo)", "40 STR"),
                              ("DM.103", "Polos Hijau (demo)", "60 STR")]:
        post("/api/motif", {"kode_motif": kode, "nama_motif": nama, "jenis": jenis})
    for i, nm in enumerate(["DEMO AGUS", "DEMO BUDI", "DEMO CITRA", "DEMO DEWI"]):
        post("/api/karyawan", {"nik": f"DEMO{i+1:03d}", "nama": nm})
    post("/api/pengrajin", {"nama": "DEMO PENGRAJIN"})

    motif = [m for m in opts("motif")]
    demo_motif = [m for m in motif if m.startswith("DM.")] or motif[:3]
    pakai = (demo_motif + motif)[:6]
    kar = [k for k in opts("karyawan") if k.startswith("DEMO")] or opts("karyawan")[:4]
    ket, dept, ketprod = opts("ket"), opts("dept"), opts("ketprod")
    peng = ["DEMO PENGRAJIN"] + [p for p in opts("pengrajin") if p != "DEMO PENGRAJIN"][:2]

    # --- stok awal (supaya Barang Keluar tidak memicu peringatan stok) ---
    for m in pakai:
        post("/api/opening", {"kode_motif": m, "jumlah": 200, "tanggal_mulai": day(30)})

    # --- Barang Masuk: 1 SSTB bisa berisi beberapa motif ---
    masuk = [(f"{PREFIX}M/{i+1:03d}", day(6 - i), dept[i % len(dept)], peng[i % len(peng)], items)
             for i, items in enumerate([
                 [(pakai[0], 120), (pakai[1], 80)],
                 [(pakai[2], 150)],
                 [(pakai[1], 90), (pakai[3], 60), (pakai[4], 40)],
                 [(pakai[0], 70)],
                 [(pakai[5 % len(pakai)], 110), (pakai[2], 50)]])]
    for sstb, tgl, dp, pg, items in masuk:
        c, r = post("/api/doc/masuk", {"sstb": sstb, "tanggal": tgl, "dept": dp, "pengrajin": pg,
                                       "items": [{"kode_motif": m, "ket": ket[(k + 1) % len(ket)], "jumlah": j}
                                                 for k, (m, j) in enumerate(items)]})
        if c != 200:
            print("Masuk gagal:", sstb, r)

    # --- Produksi: menaut ke SSTB Barang Masuk (hanya nomor SSTB) ---
    kolom = [k["n"] for k in client.get("/api/meta/produksi").get_json()["cols"] if k["t"] == "int"]
    prod = [(masuk[0], pakai[0], 3), (masuk[0], pakai[1], 2), (masuk[1], pakai[2], 4), (masuk[2], pakai[1], 1),
            (masuk[2], pakai[3], 3), (masuk[3], pakai[0], 2), (masuk[4], pakai[2], 5)]
    for i, (m, motif_kode, d) in enumerate(prod):
        body = {"tgl_produksi": day(d), "tgl_masuk_sanggan": m[1], "nama": kar[i % len(kar)],
                "pasangan": kar[(i + 1) % len(kar)], "kode_motif": motif_kode, "link_masuk": m[0],
                "ket": ketprod[i % len(ketprod)], "catatan": TAG}
        for j, c in enumerate(kolom[:4]):
            body[c] = 10 * (i + 1) + 5 * j if j < 2 else (3 * i if j == 2 else 0)
        c, r = post("/api/produksi", body)
        if c != 200:
            print("Produksi gagal:", r)

    # --- Barang Keluar: menaut ke input produksi (id dipakai di belakang layar) ---
    ids = [r["id"] for r in client.get("/api/produksi?from=2000-01-01&to=2999-12-31&size=100&q=" + TAG).get_json()["rows"]
           if r.get("catatan") == TAG]
    keluar = [(f"{PREFIX}K/001", day(3), dept[1 % len(dept)], [(pakai[0], 40, ids[0] if ids else None)]),
              (f"{PREFIX}K/002", day(2), dept[2 % len(dept)], [(pakai[1], 30, ids[1] if len(ids) > 1 else None),
                                                           (pakai[2], 25, ids[2] if len(ids) > 2 else None)]),
              (f"{PREFIX}K/003", day(1), dept[3 % len(dept)], [(pakai[3], 20, None)])]
    for sstb, tgl, dp, items in keluar:
        c, r = post("/api/doc/keluar", {"sstb": sstb, "tanggal": tgl, "dept": dp, "pengrajin": "",
                                        "items": [{"kode_motif": m, "ket": ket[0], "jumlah": j,
                                                   "link_produksi": f"x #{pid}" if pid else ""} for m, j, pid in items]})
        if c != 200:
            print("Keluar gagal:", sstb, r)

    print(f"Selesai: {len(masuk)} SSTB masuk, {len(prod)} input produksi, {len(keluar)} SSTB keluar. "
          f"Buka http://localhost:5000 (hapus lagi dengan: python demo_data.py --hapus).")


if __name__ == "__main__":
    main()
