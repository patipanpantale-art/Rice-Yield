# โปรแกรมจำลองพื้นที่เพาะปลูกเสมือนจริงเชิงแผนที่แบบโต้ตอบ เพื่อการวิเคราะห์ผลผลิตข้าว
**Interactive Map-Based Sandbox Simulator for Rice Yield Analytics**

---

## 👥 ผู้จัดทำและบทบาทหน้าที่ (Role Allocation)

1. **นายปฏิภาณ ปานทะเล (673380411-3) — P2 (Logic & Data Pipeline)**
   - ดูแลระบบประมวลผลฝั่งเซิร์ฟเวอร์ (Python Backend / FastAPI)
   - จัดการข้อมูลกลุ่มชุดดินกรมพัฒนาที่ดิน (Spatial Join ด้วย GeoPandas & Shapely)
   - เชื่อมต่อ Open-Meteo API (สภาพอากาศ, การคายระเหยน้ำ ETo, CDD/CWD)
   - เชื่อมต่อ Sentinel Hub Statistical API (ดัชนี NDVI เฉลี่ยระดับแปลง)
   - เขียนและปรับจูนแบบจำลองสูตรผสมผสาน (Hybrid Yield Formula) และเทียบเคียงข้อมูล สศก.

2. **นายอาณัฐ อารีย์ (673380432-5) — P1 (Client-side & UI/UX)**
   - พัฒนาระบบแผนที่ Leaflet และเครื่องมือวาดแปลง Leaflet.draw
   - คำนวณพื้นที่เชิงภูมิศาสตร์จริงด้วย Turf.js (ตร.ม. / ไร่-งาน-วา)
   - ออกแบบ UI แผงควบคุม 3 แผง และกลไกเร่งเวลา (Time Engine / Timeline)
   - แสดงผลกราฟสภาพอากาศและการเจริญเติบโตด้วย Chart.js

---

## 📁 โครงสร้างโปรเจกต์ (Project Directory)

```text
code/
├── backend/                       # ฝั่งเซิร์ฟเวอร์และการประมวลผล (P2: นายปฏิภาณ)
│   ├── data/
│   │   ├── soil/                  # ไฟล์ Shapefile ข้อมูลกลุ่มชุดดิน (LDD)
│   │   │   └── soilgroup_npn.*
│   │   ├── soil_suitability.json  # ตารางระดับความเหมาะสมของดินและค่าตัวคูณ F_soil
│   │   └── oae_reference.json     # สถิติผลผลิตเฉลี่ยของ สศก. (เตรียมไว้สำหรับเปรียบเทียบ)
│   ├── services/
│   │   ├── soil_service.py        # วิเคราะห์ดินเชิงพื้นที่ (Spatial Join)
│   │   ├── weather_service.py     # ข้อมูลสภาพอากาศและดัชนีความเสี่ยง
│   │   ├── satellite_service.py   # ดึงค่า NDVI จากดาวเทียม
│   │   └── yield_model.py         # สมองกลคำนวณผลผลิตแบบสูตรผสมผสาน
│   ├── main.py                    # FastAPI Web Service
│   ├── test_soil.py               # สคริปต์ทดสอบการอ่านและคัดกรองข้อมูลดิน
│   └── requirements.txt           # รายการแพ็กเกจ Python
│
├── frontend/                      # ฝั่งหน้าเว็บส่วนต่อประสานผู้ใช้ (P1: นายอาณัฐ)
│   ├── index.html                 # หน้าจอหลัก แผนที่ + แผงควบคุม
│   ├── css/
│   │   └── style.css              # รูปแบบการแสดงผล Dark Theme / Dashboard
│   └── js/
│       ├── map.js                 # ระบบแผนที่ Leaflet และ Leaflet.draw
│       ├── area_calc.js           # คำนวณพื้นที่ด้วย Turf.js
│       ├── time_engine.js         # จำลองการเร่งเวลา 5 ระยะ
│       └── charts.js              # กราฟ Chart.js
│
└── README.md
```

---

## 🚀 วิธีการรันระบบเพื่อการพัฒนา (Local Development)

### วิธีที่ 1: ดับเบิลคลิกไฟล์เดียวรันได้เลย (แนะนำที่สุด 🌟)
1. ดับเบิลคลิกที่ไฟล์ [run_dev.bat](file:///d:/All/PROJECTcs/โปรเจคจบ/code/run_dev.bat)
   - สคริปต์จะเปิด **Backend (Port 8000)** และ **Frontend (Port 3000)** ให้โดยอัตโนมัติ
   - เปิดเว็บเบราว์เซอร์เข้าสู่ `http://localhost:3000` ทันที
2. หากต้องการหยุดระบบ ให้ดับเบิลคลิกไฟล์ [stop_dev.bat](file:///d:/All/PROJECTcs/โปรเจคจบ/code/stop_dev.bat)

---

### วิธีที่ 2: รันแยกทีละหน้าต่างผ่าน Terminal

#### 1. ติดตั้ง Dependencies (Python 3.10+)
```powershell
cd backend
pip install -r requirements.txt
```

#### 2. รัน Backend API Server (FastAPI)
```powershell
cd backend
python -m uvicorn main:app --reload --port 8000
```
- API Docs (Swagger UI): `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

#### 3. รัน Frontend Web Server
```powershell
cd frontend
python -m http.server 3000
```
- เข้าใช้งานเว็บที่: `http://localhost:3000`

---

## 🐙 วิธีนำโค้ดขึ้น GitHub ด้วย GitHub Desktop

1. เปิดโปรแกรม **GitHub Desktop**
2. ไปที่เมนู **File** > **Add Local Repository...** (หรือกด `Ctrl + O`)
3. เลือกโฟลเดอร์โปรเจกต์: `d:\All\PROJECTcs\โปรเจคจบ\code` แล้วกด **Add repository**
4. ในช่อง Summary ด้านซ้ายล่าง พิมพ์ข้อความ Commit เช่น:
   - `Initial commit: Rice sandbox prototype with 77-province soil lazy loading`
5. กดปุ่ม **Commit to main**
6. กดปุ่ม **Publish repository** เพื่ออัปโหลดขึ้น GitHub ของคุณ (สามารถเลือกเป็น Private หรือ Public ได้)

