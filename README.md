# Stok Grade (web, portable)

## Menjalankan (Windows)
1. Belum punya Python? Klik dua kali `setup_portable.bat` (unduh Python portable ke folder `python`, butuh internet sekali).
   Atau pasang Python sendiri lalu klik `install.bat`.
2. Klik dua kali `start.bat`. Browser terbuka di http://localhost:5000.
3. PC lain di jaringan kantor membuka alamat yang tampil di jendela hitam (mis. http://192.168.1.10:5000).

Terminal: `pip install flask openpyxl waitress` lalu `python app.py` (Linux/macOS: `python3`).

## 5 halaman
1. **DB** - master: Motif, Jenis, Stok Awal Sistem (per Kode Motif - Motif - Jenis), Ket & Rumus, Dept, Ket Produksi, Pengrajin, Karyawan, **Kolom Produksi** (judul kolom Wadimor, Junior, dst: tambah/ganti judul/hapus), **Stok Awal Produksi** (saldo pembuka per Kode Motif untuk tiap kolom produksi).
2. **Produksi** - rekap produksi + tombol "+ Tambah Produksi" (form overlay). Tab "Daftar Input" untuk edit/hapus.
3. **Data Masuk** - daftar + "+ Tambah Data Masuk" (1 SSTB = banyak baris barang).
4. **Data Keluar** - sama, plus info stok tersedia dan peringatan / mode ketat.
5. **Laporan Stok** - kolom No, Tanggal, Motif, Jenis, Saldo Awal, Masuk, Keluar, Saldo Akhir. Saldo akhir hari N = saldo awal hari N+1.

## Alur kerja (v1.1)
Urutan halaman: **DB → Barang Masuk → Produksi → Barang Keluar → Laporan Stok**.

## Performa & pencarian (v1.1)
- Kolom pilihan (Motif, Karyawan, Dept, Ket, dst) tidak lagi memuat semua data sekaligus: mengetik "de" mencari ke server dan hanya menampilkan hasil yang cocok (mis. Dedi, Devi, Dekin), maksimal 50 hasil. Ini berlaku di semua form input.
- Produksi, Barang Masuk, dan Barang Keluar hanya menampilkan **7 hari terakhir**, **25 baris per halaman** (pilihan 25/50/100). Ubah rentang tanggal untuk melihat data lama; tanggal tidak bisa dikosongkan.
- Setiap tabel punya kotak **Cari** (cari di server, bukan di browser), filter **Kategori** (per Jenis, bila relevan), dan **Kolom** untuk mencentang kolom mana saja yang ditampilkan (tersimpan di browser).
- Stok Awal Sistem per **Kode Motif**; Laporan Stok tetap dijumlah per **Jenis**. Database versi lama (stok awal per Jenis) dimigrasi otomatis bila Jenis itu hanya punya 1 motif; sisanya disimpan di tabel `opening_lama` dan perlu diisi ulang per Kode Motif (cadangan: `backup/pra-stokawal-*.db`).

## Link Barang Masuk → Produksi → Barang Keluar (opsional)
- Form **Produksi** punya kolom opsional "Link Barang Masuk": cari & pilih baris Barang Masuk yang jadi sumbernya.
- Baris **Barang Keluar** punya kolom opsional "Link Produksi": cari & pilih input Produksi yang jadi sumbernya.
- Keduanya opsional — boleh dikosongkan kalau tidak perlu ditelusuri. Terlihat sebagai kolom "Link" di tabel Produksi/Barang Keluar.

## Cetak SSTB
Tombol **Cetak** pada setiap baris Barang Masuk/Barang Keluar (juga di form Edit SSTB) membuka tampilan cetak Surat Serah Terima Barang: No SSTB, tanggal, dept, daftar No/motif/ket/jumlah/satuan (total dipisah per satuan), dan kolom tanda tangan Yang Menyerahkan / Yang Menerima dengan ruang tanda tangan + nama jelas — lalu otomatis membuka dialog Print browser.

## Satuan (ptg / kodi)
Setiap baris Barang Masuk/Keluar punya kolom **Satuan** (`ptg` atau `kodi`, default `ptg`). Tampil di daftar, form, cetak SSTB, Export, dan Import Excel (kolom `Satuan`; kosong = ptg). Database lama dimigrasi otomatis (baris lama = ptg). Catatan: satuan hanya penanda — Laporan Stok tetap menjumlahkan angka Jumlah apa adanya, tanpa konversi kodi → ptg.

## Data
- Semua data di `data/inventory.db`. Backup otomatis harian di `backup/` (30 hari), tombol "Backup DB" untuk unduh manual.
- Data tidak ganda: transaksi hanya menyimpan ID master. Motif, Jenis, Rumus, Jumlah dihitung saat ditampilkan.
- Jika `data/inventory.db` dari versi lama ditemukan, otomatis dimigrasi (cadangan disimpan di `backup/pra-migrasi-*.db`).

## Excel
Semua halaman punya Import Excel, Template, dan Export. Import Data Masuk/Keluar memakai format datar
(satu baris per barang); baris dengan SSTB sama digabung menjadi satu dokumen.
