import time
from collections import defaultdict
import cv2
from ultralytics import YOLO

# Kelas kendaraan COCO dataset
# 2: car, 3: motorcycle, 5: bus, 7: truck
VEHICLE_CLASS_MAP = {
    2: 'car',
    3: 'motorcycle',
    5: 'bus',
    7: 'truck'
}

class VehicleCounter:
    def __init__(self, camera_id, camera_name, line_ratio_y=0.55, conf=0.35, model=None):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.line_ratio_y = line_ratio_y
        self.conf = conf
        
        # Share model instance across cameras to save RAM
        if model is not None:
            self.model = model
        else:
            self.model = YOLO('yolov8n.pt')

        # State tracking
        self.track_history = defaultdict(list) # track_id -> [(cx, cy), ...]
        self.counted_ids = set() # id yang sudah terhitung agar tidak duplikat
        self.counts = {
            'IN': 0,
            'OUT': 0,
            'by_type': {
                'car': {'IN': 0, 'OUT': 0},
                'motorcycle': {'IN': 0, 'OUT': 0},
                'truck': {'IN': 0, 'OUT': 0},
                'bus': {'IN': 0, 'OUT': 0}
            }
        }

    def process_frame(self, frame):
        """
        Memproses 1 frame: deteksi + tracking + hitung garis melintang.
        Mengembalikan list event hitungan baru: [{'cctv_id', 'cctv_name', 'direction', 'vehicle_type', 'count'}]
        """
        h, w = frame.shape[:2]
        line_y = int(h * self.line_ratio_y)
        new_events = []

        # Jalankan tracking dengan ByteTrack & filter hanya kelas kendaraan
        results = self.model.track(
            frame,
            persist=True,
            classes=list(VEHICLE_CLASS_MAP.keys()),
            conf=self.conf,
            tracker="bytetrack.yaml",
            verbose=False
        )

        # Gambar Garis Batas Virtual Tripwire
        cv2.line(frame, (0, line_y), (w, line_y), (0, 255, 255), 2)
        cv2.putText(frame, "GARIS BATAS KOTA [MASUK v | KELUAR ^]", (15, max(20, line_y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

        COLOR_MAP = {
            'car': (0, 255, 120),       # Hijau
            'motorcycle': (255, 230, 0), # Cyan/Biru muda
            'truck': (0, 160, 255),      # Oranye
            'bus': (255, 100, 255)       # Magenta/Pink
        }

        if results and results[0].boxes and results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().tolist()
            class_ids = results[0].boxes.cls.int().cpu().tolist()
            current_active_ids = set(track_ids)

            for box, track_id, cls_id in zip(boxes, track_ids, class_ids):
                vehicle_type = VEHICLE_CLASS_MAP.get(cls_id, 'car')
                color = COLOR_MAP.get(vehicle_type, (0, 255, 0))
                x1, y1, x2, y2 = box
                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)

                # Anotasi visual Bounding Box & Label
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                cv2.circle(frame, (cx, cy), 3, (0, 0, 255), -1)
                label = f"#{track_id} {vehicle_type}"
                cv2.rectangle(frame, (int(x1), max(0, int(y1) - 18)), (int(x1) + len(label) * 8, int(y1)), color, -1)
                cv2.putText(frame, label, (int(x1) + 2, max(12, int(y1) - 4)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)

                # Simpan riwayat titik tengah kendaraan
                history = self.track_history[track_id]
                history.append((cx, cy))
                if len(history) > 15:
                    history.pop(0)

                # Cek penyeberangan garis jika belum pernah dihitung
                if track_id not in self.counted_ids and len(history) >= 2:
                    prev_y = history[-2][1]
                    curr_y = cy

                    # Arah Masuk: Dari atas garis ke bawah garis (mendekat ke kota)
                    if prev_y < line_y and curr_y >= line_y:
                        direction = 'IN'
                        self.counted_ids.add(track_id)
                        self._record_count(direction, vehicle_type)
                        new_events.append({
                            'cctv_id': self.camera_id,
                            'cctv_name': self.camera_name,
                            'direction': direction,
                            'vehicle_type': vehicle_type,
                            'count': 1,
                            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                        })
                    # Arah Keluar: Dari bawah garis ke atas garis (menjauh dari kota)
                    elif prev_y > line_y and curr_y <= line_y:
                        direction = 'OUT'
                        self.counted_ids.add(track_id)
                        self._record_count(direction, vehicle_type)
                        new_events.append({
                            'cctv_id': self.camera_id,
                            'cctv_name': self.camera_name,
                            'direction': direction,
                            'vehicle_type': vehicle_type,
                            'count': 1,
                            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                        })

            # Bersihkan ID lama
            for tid in list(self.track_history.keys()):
                if tid not in current_active_ids:
                    self.track_history.pop(tid, None)

        if len(self.counted_ids) > 1000:
            self.counted_ids.clear()

        # OSD Header Bar
        cv2.rectangle(frame, (0, 0), (w, 28), (20, 20, 20), -1)
        osd_text = f"{self.camera_name}  |  MASUK: {self.counts['IN']}  KELUAR: {self.counts['OUT']}"
        cv2.putText(frame, osd_text, (10, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        return new_events, frame

    def _record_count(self, direction, vehicle_type):
        self.counts[direction] += 1
        if vehicle_type in self.counts['by_type']:
            self.counts['by_type'][vehicle_type][direction] += 1
        print(f"🚗 [{self.camera_name}] Terdeteksi: {vehicle_type.upper()} melintas arah {direction}! Total {direction}: {self.counts[direction]}")
