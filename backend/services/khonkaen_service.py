import os
import sys
import json
import warnings
from typing import Dict, Any, Optional, List

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

warnings.filterwarnings("ignore", category=UserWarning)

try:
    import geopandas as gpd
    from shapely.geometry import shape, Point
    from pyproj import Transformer
    import pyogrio
except ImportError:
    gpd = None
    shape = None
    Point = None
    Transformer = None
    pyogrio = None

from services.soil_service import soil_service

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
KKN_DATA_DIR = os.path.join(DATA_DIR, "khon_kaen")
AMPHOE_GEOJSON_PATH = os.path.join(BASE_DIR, "..", "frontend", "data", "khon_kaen_amphoes.geojson")
AMPHOE_STATS_PATH = os.path.join(KKN_DATA_DIR, "statistics", "khonkaen_amphoe_rice_yield.json")
BASELINE_STATS_PATH = os.path.join(KKN_DATA_DIR, "statistics", "verified_khonkaen_baseline_2567_2568.json")

# เส้นทางไฟล์ Land Use ขอนแก่น
LU_SHP_PATH = os.path.join(
    KKN_DATA_DIR, "gis", "landuse", "Landuse_kkn", 
    "ขอนแก่น2565", "การใช้ที่ดิน", "LU_KKN_2565.shp"
)

# หมวดหมู่รหัสการใช้ที่ดิน LDD (Land Development Department)
LU_CATEGORIES = {
    "A101": {"name": "นาข้าว", "is_rice": True, "category": "เกษตรกรรม (นาข้าว)"},
    "A102": {"name": "นาร้าง", "is_rice": False, "category": "พื้นที่เกษตรร้าง"},
    "A201": {"name": "อ้อยโรงงาน", "is_rice": False, "category": "พืชไร่ (อ้อย)"},
    "A202": {"name": "มันสำปะหลัง", "is_rice": False, "category": "พืชไร่ (มันสำปะหลัง)"},
    "A203": {"name": "ข้าวโพดเลี้ยงสัตว์", "is_rice": False, "category": "พืชไร่ (ข้าวโพด)"},
    "A3": {"name": "ไม้ยืนต้นและไม้ผล (เช่น ยางพารา/ยูคาลิปตัส)", "is_rice": False, "category": "ไม้ยืนต้น"},
    "A4": {"name": "พืชผักและพืชสวน", "is_rice": False, "category": "พืชสวน"},
    "U1": {"name": "พื้นที่ชุมชนและที่อยู่อาศัย", "is_rice": False, "category": "เขตเมือง/ชุมชน"},
    "U2": {"name": "สถานที่ราชการและสถานศึกษา", "is_rice": False, "category": "เขตเมือง/ชุมชน"},
    "U3": {"name": "ระบบคมนาคมและขนส่ง", "is_rice": False, "category": "เขตเมือง/ชุมชน"},
    "U4": {"name": "ย่านพาณิชยกรรมและการค้า", "is_rice": False, "category": "เขตเมือง/ชุมชน"},
    "U": {"name": "ชุมชนและสิ่งปลูกสร้าง", "is_rice": False, "category": "เขตเมือง/ชุมชน"},
    "F": {"name": "ป่าไม้ธรรมชาติหรือป่าปลูก", "is_rice": False, "category": "พื้นที่ป่า"},
    "W": {"name": "แหล่งน้ำธรรมชาติหรืออ่างเก็บน้ำ", "is_rice": False, "category": "แหล่งน้ำ"},
    "M": {"name": "พื้นที่ทุ่งหญ้า/พื้นที่โล่งว่างเปล่า", "is_rice": False, "category": "พื้นที่เบ็ดเตล็ด"}
}

class KhonKaenService:
    def __init__(self):
        self.amphoes_gdf = None
        self.amphoe_stats = self._load_json(AMPHOE_STATS_PATH)
        self.baseline_stats = self._load_json(BASELINE_STATS_PATH)
        self.transformer_to_32648 = None
        self._init_spatial()

    def _load_json(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[KhonKaenService] โหลด {path} ผิดพลาด: {e}")
        return {}

    def _init_spatial(self):
        """โหลดชั้นข้อมูลขอบเขต 26 อำเภอ และเตรียมตัวแปลงพิกัด WGS84 -> UTM Zone 48N"""
        if gpd is None:
            return

        # ตัวแปลงพิกัด EPSG:4326 (WGS84) -> EPSG:32648 (UTM Zone 48N)
        try:
            self.transformer_to_32648 = Transformer.from_crs("EPSG:4326", "EPSG:32648", always_xy=True).transform
        except Exception as e:
            print(f"[KhonKaenService] กำหนด Transformer ผิดพลาด: {e}")

        # โหลดขอบเขต 26 อำเภอ
        if os.path.exists(AMPHOE_GEOJSON_PATH):
            try:
                self.amphoes_gdf = gpd.read_file(AMPHOE_GEOJSON_PATH)
                print(f"[KhonKaenService] โหลดขอบเขต 26 อำเภอสำเร็จ ({len(self.amphoes_gdf)} อำเภอ)")
            except Exception as e:
                print(f"[KhonKaenService] ไม่สามารถอ่าน {AMPHOE_GEOJSON_PATH}: {e}")

    def inspect_polygon(self, geojson_geometry: Dict[str, Any]) -> Dict[str, Any]:
        """
        ตรวจสอบแปลงนาที่วาดบนแผนที่:
        1. ระบุอำเภอใน 26 อำเภอของขอนแก่น
        2. ตรวจสอบข้อมูลดินและค่า F_soil
        3. ตรวจสอบการใช้ที่ดินตามผัง LDD 2565 (เป็นนาข้าวหรือไม่)
        4. ดึงสถิติจริงอ้างอิง สศก. ของอำเภอนั้น
        """
        if shape is None:
            return {"success": False, "error": "ไม่ได้ติดตั้งไลบรารี geopandas/shapely"}

        try:
            # ตรวจสอบและ Normalize พิกัด GeoJSON Polygon ให้รองรับทั้งแบบ 2D และ 3D
            geom = dict(geojson_geometry)
            if geom.get("type") == "Polygon":
                coords = geom.get("coordinates", [])
                if coords and isinstance(coords[0], list) and coords[0] and isinstance(coords[0][0], (int, float)):
                    # ถูก Flatten เหลือ 2 มิติ ให้ครอบเป็น [ [ [x, y], ... ] ]
                    geom["coordinates"] = [coords]

            poly = shape(geom)
            centroid = poly.centroid

            # 1. ระบุอำเภอ
            amphoe_info = self._detect_amphoe(poly, centroid)

            # 2. ตรวจสอบข้อมูลดินผ่าน soil_service
            soil_result = soil_service.get_soil_info(geojson_geometry)

            # 3. ตรวจสอบการใช้ประโยชน์ที่ดิน LDD 2565
            landuse_result = self._check_landuse(poly)

            # 4. สถิติจริงประจำอำเภอ (OAE Benchmark)
            amphoe_name = amphoe_info.get("amphoe_th", "")
            stats_entry = self.amphoe_stats.get("districts", {}).get(amphoe_name, {})
            baseline_yield = stats_entry.get("yield_kg_per_rai", 336.0)

            # ตรวจสอบว่าอยู่ในเขตขอนแก่นหรือไม่
            in_khonkaen = amphoe_info.get("found", False)

            return {
                "success": True,
                "in_khonkaen": in_khonkaen,
                "amphoe": amphoe_info,
                "soil": soil_result,
                "landuse": landuse_result,
                "oae_baseline": {
                    "amphoe_yield_kg_rai": baseline_yield,
                    "province_avg_yield_kg_rai": 336.0,
                    "district_planted_rai": stats_entry.get("planted_rai", 0),
                    "district_harvested_rai": stats_entry.get("harvested_rai", 0),
                    "harvest_ratio": stats_entry.get("harvest_ratio", 0.94)
                }
            }
        except Exception as e:
            return {"success": False, "error": f"เกิดข้อผิดพลาดในการวิเคราะห์เชิงพื้นที่: {str(e)}"}

    def _detect_amphoe(self, poly, centroid) -> Dict[str, Any]:
        """ระบุอำเภอจากรูปแปลง"""
        if self.amphoes_gdf is None or self.amphoes_gdf.empty:
            # Fallback หากไม่มีชั้นข้อมูลขอบเขต
            return {
                "found": True,
                "amphoe_th": "เมืองขอนแก่น",
                "amphoe_en": "Mueang Khon Kaen",
                "amp_code": "01",
                "note": "ใช้ค่าอำเภอเริ่มต้น"
            }

        # หาแปลงที่ทับซ้อนหรือมี centroid อยู่ในอำเภอ
        possible = self.amphoes_gdf[self.amphoes_gdf.contains(centroid)]
        if possible.empty:
            possible = self.amphoes_gdf[self.amphoes_gdf.intersects(poly)]

        if not possible.empty:
            row = possible.iloc[0]
            amp_name = str(row.get("AMP_NAME", row.get("AMPHOE_T", ""))).strip()
            amp_code = str(row.get("AMP_CODE", ""))
            amp_en = str(row.get("AMPHOE_E", ""))
            return {
                "found": True,
                "amphoe_th": amp_name,
                "amphoe_en": amp_en,
                "amp_code": amp_code
            }

        return {
            "found": False,
            "amphoe_th": "อยู่นอกเขตขอนแก่น",
            "amphoe_en": "Outside Khon Kaen",
            "amp_code": "-"
        }

    def _check_landuse(self, poly_wgs84) -> Dict[str, Any]:
        """
        ตรวจสอบการใช้ที่ดิน LDD 2565 ด้วย Spatial Bounding Box & Intersection
        ใช้เวลาประมวลผล ~0.1 วินาที โดยไม่ทำให้หน่วยความจำบวม
        """
        if pyogrio is None or self.transformer_to_32648 is None or not os.path.exists(LU_SHP_PATH):
            return {
                "checked": False,
                "is_rice": True,
                "lu_code": "A101",
                "lu_name_th": "นาข้าว (ค่าเริ่มต้น)",
                "confidence_pct": 100,
                "warning": None,
                "note": "ไม่ได้ติดตั้งไฟล์ผัง LDD ขนาดยักษ์ในเครื่อง ใช้ค่าสมมติฐานนาข้าว"
            }

        try:
            # แปลง Bounding Box ของแปลงจาก WGS84 เป็น UTM Zone 48N
            minx_wgs, miny_wgs, maxx_wgs, maxy_wgs = poly_wgs84.bounds
            minx_utm, miny_utm = self.transformer_to_32648(minx_wgs, miny_wgs)
            maxx_utm, maxy_utm = self.transformer_to_32648(maxx_wgs, maxy_wgs)

            # ขยาย bbox เล็กน้อยเพื่อป้องกันขอบตัด
            pad = 50.0  # 50 เมตร
            bbox = (
                min(minx_utm, maxx_utm) - pad,
                min(miny_utm, maxy_utm) - pad,
                max(minx_utm, maxx_utm) + pad,
                max(miny_utm, maxy_utm) + pad
            )

            # อ่านเฉพาะฟีเจอร์ที่อยู่ใน Bounding Box ผ่าน pyogrio (< 0.15 วิ)
            lu_df = pyogrio.read_dataframe(LU_SHP_PATH, bbox=bbox, encoding="cp874")
            if lu_df.empty:
                return {
                    "checked": True,
                    "is_rice": True,
                    "lu_code": "A101",
                    "lu_name_th": "พื้นที่เพาะปลูกข้าว",
                    "confidence_pct": 80,
                    "warning": None,
                    "note": "ไม่พบรหัสผังในพิกัดนี้ อนุโลมเป็นนาข้าว"
                }

            # ตรวจสอบรหัสการใช้ที่ดินที่พบมากที่สุด
            lu_counts = lu_df["LU_CODE"].value_counts()
            dominant_code = str(lu_counts.index[0]).strip()
            
            # ค้นหาคำอธิบายรหัสแบบไล่ระดับ (Full Code -> 2 ตัวหน้า -> 1 ตัวหน้า)
            lu_meta = (
                LU_CATEGORIES.get(dominant_code) or
                LU_CATEGORIES.get(dominant_code[:2]) or
                LU_CATEGORIES.get(dominant_code[:1]) or
                {
                    "name": f"พื้นที่ประเภท {dominant_code}",
                    "is_rice": dominant_code.startswith("A1"),
                    "category": "การใช้ที่ดินอื่นๆ"
                }
            )

            is_paddy = lu_meta.get("is_rice", dominant_code == "A101")
            lu_name = lu_meta.get("name", dominant_code)

            warning = None
            if not is_paddy:
                warning = f"คำเตือน: ตามผังการใช้ที่ดิน LDD ปี 2565 พื้นที่นี้จัดเป็น '{lu_name}' ({dominant_code}) ไม่ใช่เขตนาข้าวเดิม"

            return {
                "checked": True,
                "is_rice": is_paddy,
                "lu_code": dominant_code,
                "lu_name_th": lu_name,
                "category": lu_meta.get("category", ""),
                "detected_codes": list(lu_counts.keys())[:3],
                "warning": warning
            }

        except Exception as e:
            return {
                "checked": False,
                "is_rice": True,
                "lu_code": "A101",
                "lu_name_th": "นาข้าว",
                "warning": None,
                "note": f"เกิดข้อผิดพลาดในการตรวจสอบผังที่ดิน: {str(e)}"
            }

khonkaen_service = KhonKaenService()
