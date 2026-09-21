import os
import sys

# Paksa OpenCV menggunakan TCP (bukan UDP) agar tidak ada packet loss / error decoding macroblock
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000"
os.environ["OPENCV_LOG_LEVEL"] = "FATAL" # Redam log decode intra-mode yang mengotori terminal

import re
import time
import json
import random
import threading
import requests
import cv2
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from ultralytics import YOLO
from vehicle_counter import VehicleCounter

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.json')

# Global buffer frame JPEG untuk MJPEG live streaming ke frontend
LATEST_FRAMES = {} # cctv_id -> bytes
FRAME_LOCK = threading.Lock()

class MJPEGStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/stream/'):
            cctv_id = self.path.split('/stream/')[1].split('?')[0]
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            while True:
                with FRAME_LOCK:
                    frame_bytes = LATEST_FRAMES.get(cctv_id)
                if frame_bytes:
                    try:
                        self.wfile.write(b'--frame\r\n')
                        self.send_header('Content-Type', 'image/jpeg')
                        self.send_header('Content-Length', str(len(frame_bytes)))
                        self.end_headers()
                        self.wfile.write(frame_bytes)
                        self.wfile.write(b'\r\n')
                    except (BrokenPipeError, ConnectionResetError):
                        break
                time.sleep(0.12) # ~8 FPS output untuk browser, sangat hemat CPU & bandwidth
        elif self.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            with FRAME_LOCK:
                active = list(LATEST_FRAMES.keys())
            self.wfile.write(json.dumps({'status': 'running', 'active_streams': active}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return # Hilangkan log request HTTP agar terminal tetap bersih

def start_stream_server(port=5001):
    try:
        server = HTTPServer(('0.0.0.0', port), MJPEGStreamHandler)
        print(f"📡 [Stream Server] Live AI Stream berjalan di http://localhost:{port}/stream/<cctv_id>")
        server.serve_forever()
    except Exception as e:
        print(f"⚠️ Gagal memulai stream server di port {port}: {e}")

def load_config():
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def sync_targets_from_backend(config):
    """Mencoba mengambil konfigurasi RTSP & nama terbaru dari backend Node.js"""
    try:
        res = requests.get('http://localhost:5000/api/vehicle-counts/targets', timeout=2)
        if res.status_code == 200:
            data = res.json()
            if data.get('success'):
                target_map = {item['id']: item for item in data['data']}
                for cam in config.get('cameras', []):
                    if cam['id'] in target_map:
                        t = target_map[cam['id']]
                        cam['name'] = t['name']
                        if t.get('rtsp_url'):
                            cam['rtsp_url'] = t['rtsp_url']
                        if t.get('ip'):
                            cam['ip'] = t['ip']
                print("🔄 Berhasil sinkronisasi target CCTV dari backend Node.js.")
    except Exception:
        pass
    return config

def send_events_to_backend(api_url, events):
    if not events:
        return
    try:
        requests.post(api_url, json={'events': events}, timeout=3)
    except Exception as e:
        print(f"⚠️ Gagal mengirim event counting ke backend: {e}")

def generate_synthetic_traffic_frame(cam, step, w=640, h=360):
    """Membuat frame simulasi visual jalan raya jika RTSP belum terhubung ke jaringan fisik CCTV"""
    frame = np.ones((h, w, 3), dtype=np.uint8) * 45 # Aspal abu-abu gelap
    
    # Garis tepi dan marka jalan
    cv2.line(frame, (20, 0), (20, h), (180, 180, 180), 2)
    cv2.line(frame, (w - 20, 0), (w - 20, h), (180, 180, 180), 2)
    cv2.line(frame, (w // 2, 0), (w // 2, h), (255, 255, 255), 2)

    # Garis batas tripwire kuning
    line_y = int(h * 0.55)
    cv2.line(frame, (0, line_y), (w, line_y), (0, 255, 255), 2)
    cv2.putText(frame, "GARIS BATAS KOTA (AI TRIPWIRE)", (25, line_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

    # Mobil 1 Arah Masuk (turun ke bawah)
    y_in = int((step * 7) % (h + 120) - 60)
    if -30 < y_in < h + 30:
        cv2.rectangle(frame, (w // 4 - 24, y_in - 28), (w // 4 + 24, y_in + 28), (0, 220, 100), 2)
        cv2.circle(frame, (w // 4, y_in), 3, (0, 0, 255), -1)
        cv2.putText(frame, "#101 CAR", (w // 4 - 22, y_in - 32), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 220, 100), 1)

    # Mobil 2 Arah Keluar (naik ke atas)
    y_out = int(h - ((step * 6) % (h + 120)) + 60)
    if -30 < y_out < h + 30:
        cv2.rectangle(frame, (3 * w // 4 - 26, y_out - 32), (3 * w // 4 + 26, y_out + 32), (255, 200, 0), 2)
        cv2.circle(frame, (3 * w // 4, y_out), 3, (0, 0, 255), -1)
        cv2.putText(frame, "#102 MOTOR", (3 * w // 4 - 25, y_out - 36), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 200, 0), 1)

    # OSD Header
    cv2.rectangle(frame, (0, 0), (w, 28), (20, 20, 20), -1)
    osd_text = f"[{cam['id']}] {cam['name']} - LIVE AI CAMERA (CPU Mode)"
    cv2.putText(frame, osd_text, (10, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1)

    return frame

def run_simulation_worker(config, shared_model):
    """Worker simulasi jika RTSP offline/tanpa jaringan fisik kamera"""
    api_url = config.get('backend_api_url', 'http://localhost:5000/api/vehicle-counts/record')
    cameras = [c for c in config.get('cameras', []) if c.get('enabled', True)]
    
    print("\n" + "="*60)
    print("🚦 [MODE SIMULASI & VERIFIKASI LOKAL AKTIF]")
    print(f"Memantau 4 Batas Kota dengan interval CPU ultra-ringan...")
    for c in cameras:
        print(f" - [{c['id']}] {c['name']} (IP: {c.get('ip')})")
    print("="*60 + "\n")

    vehicle_types = ['car', 'motorcycle', 'truck', 'bus']
    weights = [0.55, 0.30, 0.10, 0.05]

    step = 0
    while True:
        step += 1
        # Update frame simulasi visual setiap kamera untuk stream preview
        for cam in cameras:
            sim_frame = generate_synthetic_traffic_frame(cam, step + int(cam['id'][-1]) * 15)
            _, buf = cv2.imencode('.jpg', sim_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            with FRAME_LOCK:
                LATEST_FRAMES[cam['id']] = buf.tobytes()

        # Kirim event pergerakan kendaraan ke backend tiap beberapa detik
        if step % 25 == 0:
            cam = random.choice(cameras)
            direction = random.choice(['IN', 'OUT'])
            v_type = random.choices(vehicle_types, weights=weights)[0]

            event = {
                'cctv_id': cam['id'],
                'cctv_name': cam['name'],
                'direction': direction,
                'vehicle_type': v_type,
                'count': 1,
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
            }

            print(f"📊 [EVENT SIMULASI] {cam['name']}: 1 {v_type.upper()} ({direction}) melintas batas kota.")
            send_events_to_backend(api_url, [event])

        time.sleep(0.12) # ~8 FPS simulasi

def run_live_camera(cam, config, shared_model):
    """Thread reader dan processor untuk 1 kamera RTSP aktif"""
    api_url = config.get('backend_api_url', 'http://localhost:5000/api/vehicle-counts/record')
    rtsp_url = cam.get('rtsp_url')
    if not rtsp_url and cam.get('ip'):
        rtsp_user = config.get('rtsp_default_user', os.environ.get('RTSP_USER', 'admin'))
        rtsp_pass = config.get('rtsp_default_pass', os.environ.get('RTSP_PASS', 'admin123'))
        rtsp_url = f"rtsp://{rtsp_user}:{rtsp_pass}@{cam.get('ip')}:554/Streaming/Channels/102"

    counter = VehicleCounter(
        camera_id=cam['id'],
        camera_name=cam['name'],
        line_ratio_y=cam.get('line_ratio_y', 0.55),
        conf=config.get('confidence_threshold', 0.35),
        model=shared_model
    )

    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not cap.isOpened():
        safe_url = re.sub(r'://[^@]+@', '://***:***@', rtsp_url) if rtsp_url else 'None'
        print(f"❌ [RTSP] Tidak dapat membuka stream {cam['name']} ({safe_url})")
        return

    print(f"✅ [RTSP] Terhubung ke {cam['name']}")
    frame_skip = config.get('frame_skip', 7)
    frame_idx = 0
    consecutive_drops = 0

    while True:
        ret, frame = cap.read()
        if not ret or frame is None or frame.size == 0:
            consecutive_drops += 1
            # Hanya rekoneksi jika benar-benar mati (gagal 25 kali berturut-turut)
            if consecutive_drops >= 25:
                print(f"⚠️ [RTSP] Stream terputus untuk {cam['name']}, mencoba rekoneksi dalam 3s...")
                cap.release()
                time.sleep(3)
                cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                consecutive_drops = 0
            else:
                time.sleep(0.04)
            continue

        consecutive_drops = 0

        frame_idx += 1
        if frame_idx % frame_skip != 0:
            continue

        # Resize ke resolusi rendah agar inferensi CPU kilat
        inf_w = config.get('inference_width', 640)
        h, w = frame.shape[:2]
        inf_h = int(h * (inf_w / w))
        small_frame = cv2.resize(frame, (inf_w, inf_h))

        events, annotated_frame = counter.process_frame(small_frame)
        if events:
            send_events_to_backend(api_url, events)

        # Update buffer stream MJPEG untuk ditonton di browser
        _, buf = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        with FRAME_LOCK:
            LATEST_FRAMES[cam['id']] = buf.tobytes()

        time.sleep(0.05)

def main():
    config = load_config()
    config = sync_targets_from_backend(config)

    # Jalankan background MJPEG HTTP server di port 5001
    server_thread = threading.Thread(target=start_stream_server, args=(5001,), daemon=True)
    server_thread.start()

    is_simulation = '--simulate' in sys.argv
    has_valid_rtsp = any(c.get('rtsp_url') for c in config.get('cameras', []))

    print("🧠 Memuat model deteksi YOLOv8n (CPU Mode)...")
    model = YOLO('yolov8n.pt')
    print("✅ Model YOLOv8n siap digunakan.")

    if is_simulation or not has_valid_rtsp:
        if not is_simulation:
            print("ℹ️ URL RTSP belum diisi lengkap untuk 4 kamera. Menjalankan mode simulasi traffic lokal.")
        run_simulation_worker(config, model)
    else:
        threads = []
        for cam in config.get('cameras', []):
            if cam.get('enabled', True):
                t = threading.Thread(target=run_live_camera, args=(cam, config, model), daemon=True)
                t.start()
                threads.append(t)
        
        for t in threads:
            t.join()

if __name__ == '__main__':
    main()
