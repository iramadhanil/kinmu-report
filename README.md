# Laporan Lembur · 勤務時間記録表

Aplikasi web statis untuk mencatat jam kerja & lembur harian dalam Bahasa Indonesia,
lalu meng-export-nya menjadi file Excel **勤務時間記録表** berbahasa Jepang yang formatnya
**sama persis** dengan template perusahaan — siap dikirim.

🔗 **Live:** https://iramadhanil.github.io/kinmu-report/

## Cara pakai

1. Buka aplikasinya. Hari ini sudah otomatis terpilih.
2. Isi **Jam masuk**, **Jam keluar** (istirahat otomatis 1 jam, bisa diubah). Lembur dihitung otomatis.
3. Pilih **Aktivitas** (atau set 1 *aktivitas default* untuk semua hari kerja).
4. Untuk **cuti** (有給) atau **kerja hari libur** (休日出勤), pakai pilihan di kartu hari.
5. Semua **tersimpan otomatis** di browser. Pindah hari lewat kalender atau panah ‹ ›.
6. Kapan saja, klik **Export bulan ini** → file `.xlsx` Jepang ter-download, siap kirim.

### Pertama kali

- Buka **⚙ Pengaturan** dan isi nama (氏名), nama stempel katakana (本人印), perusahaan,
  agen, dan alamat. Data ini **hanya tersimpan di browser Anda** dan disisipkan otomatis
  saat export — tidak ikut ke GitHub.
- Buka **📝 Daftar aktivitas** untuk menambah/ubah kalimat aktivitas (label Indonesia → teks Jepang).

## Privasi

Semua data (pengaturan, preset, catatan harian) disimpan **hanya di `localStorage` browser
Anda**. Tidak ada server, tidak ada yang dikirim ke mana pun. Gunakan tombol **Backup
(.json)** secara berkala, dan **Restore** bila ganti perangkat/browser.

## Cara kerja (teknis singkat)

File `assets/template.xlsx` adalah template asli perusahaan yang sudah **dibersihkan dari
data pribadi** dan dikosongkan. Saat export, aplikasi hanya menulis sel input (jam, lembur,
aktivitas, dll.) ke dalam template lewat *surgical patch* (pakai `fflate`), lalu menyalakan
*recalculate-on-open*. Semua rumus, gaya, sel gabungan, dan kotak stempel template tetap
**identik** — Excel menghitung ulang nilai turunan (jam, lembur, total) saat dibuka.

Detail desain ada di [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Menjalankan secara lokal

Situs ini murni statis (tanpa build). Jalankan server statis apa pun, mis.:

```sh
python -m http.server 8000
# buka http://localhost:8000
```

> Catatan: output adalah `.xlsx` (bukan `.xls`) agar rumus & format tetap utuh. File ini
> terbuka identik di Excel; bila perusahaan mewajibkan `.xls`, cukup "Save As" sekali di Excel.
