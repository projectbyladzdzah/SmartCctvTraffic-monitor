# Template Import CCTV

Gunakan file CSV ini sebagai acuan untuk import data CCTV ke database.

## Kolom yang disarankan

| Kolom | Wajib | Contoh |
|---|---|---|
| id | Tidak | CCTV-001 |
| name | Ya | CCTV Lobby |
| jenis | Tidak | Domes |
| merk | Tidak | Hikvision |
| type | Tidak | IP Camera |
| ip | Tidak | 192.168.1.10 |
| gateway | Tidak | 192.168.1.1 |
| rtsp_url | Tidak | rtsp://admin:admin123@192.168.1.10:554/stream1 |

## Catatan penting
- Jika kolom `id` kosong, sistem akan otomatis membuat ID baru.
- Jika kolom `name` kosong, sistem akan isi nama default seperti `CCTV 2`.
- Jika `rtsp_url` kosong, CCTV akan masuk dengan URL kosong dan bisa diisi nanti.
- Pastikan nilai IP tidak mengandung spasi atau karakter aneh.
- Jangan gunakan tanda koma dalam kolom teks jika Anda mengedit CSV manual. Gunakan format CSV yang benar.

## Rekomendasi cara membuat di Excel
1. Buka Excel baru.
2. Buat header seperti contoh di bawah ini:
   `id,name,jenis,merk,type,ip,gateway,rtsp_url`
3. Isi data per baris.
4. Simpan dengan format `CSV (Comma delimited)`.

## Contoh header Excel

id | name | jenis | merk | type | ip | gateway | rtsp_url
--- | --- | --- | --- | --- | --- | --- | ---
CCTV-001 | CCTV Lobby | Domes | Hikvision | IP Camera | 192.168.1.10 | 192.168.1.1 | rtsp://admin:admin123@192.168.1.10:554/stream1

## Agar import tidak error
- Jangan save dengan format Excel `.xlsx` yang punya sheet lain, pilih CSV bila mau paling aman.
- Pastikan header tidak diubah terlalu jauh.
- Hindari cell yang berisi formula rumit.
- Kosongkan kolom yang tidak dipakai.
