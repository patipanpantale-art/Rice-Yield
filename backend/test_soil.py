import os
import sys

# ป้องกันปัญหา UnicodeEncodeError บน Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# แก้ไขปัญหา shx ไฟล์ไม่สมบูรณ์หากมี
os.environ["SHAPE_RESTORE_SHX"] = "YES"

try:
    import geopandas as gpd
except ImportError:
    print("ยังไม่ได้ติดตั้ง geopandas กรุณาติดตั้งด้วย: pip install geopandas")
    sys.exit(1)

# กำหนด Path แบบ Relative เพื่อให้รันได้ทุกเครื่อง
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SHP_PATH = os.path.join(BASE_DIR, "data", "soil", "northeast", "nakhon_phanom", "soilgroup_npn.shp")

print(f"กำลังอ่านไฟล์ข้อมูลดินจาก: {SHP_PATH}")

if not os.path.exists(SHP_PATH):
    print(f"ข้อผิดพลาด: ไม่พบไฟล์ที่ {SHP_PATH}")
    sys.exit(1)

# 1. อ่านไฟล์ Shapefile พร้อมแก้ปัญหาภาษาไทยต่างดาว (รหัสภาษาไทย cp874)
soil_data = gpd.read_file(SHP_PATH, encoding="cp874")

# 2. แปลงระบบพิกัดให้เป็น Lat/Lng (EPSG:4326) เพื่อรองรับ Leaflet.js และ Turf.js
soil_data = soil_data.to_crs(epsg=4326)

# 3. ลองดึงข้อมูลเฉพาะคอลัมน์ที่เราต้องการใช้ในแบบจำลองข้าว
# คอลัมน์ประกอบด้วย: จังหวัด, อำเภอ, รหัสชุดดิน, กลุ่มชุดดิน, เนื้อดินชั้นบน, ค่า pH ชั้นบน
rice_soil_columns = soil_data[['prov_nam_t', 'amphoe_t', 'soil', 'soilgroup', 'tex_top', 'pH_top']]

print("\n--- ตัวอย่างข้อมูลดินสำหรับการจำลองนาข้าว (5 รายการแรก) ---")
print(rice_soil_columns.head())

print("\n--- สรุปกลุ่มชุดดินที่พบในชุดข้อมูล ---")
print(f"จำนวนแปลงดินทั้งหมด: {len(soil_data):,} แปลง")
print(f"กลุ่มชุดดินที่มี: {sorted(soil_data['soilgroup'].dropna().unique())}")
