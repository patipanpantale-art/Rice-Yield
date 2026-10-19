import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import json
import warnings
from typing import Dict, Any, Optional, List

warnings.filterwarnings("ignore", category=UserWarning)

os.environ["SHAPE_RESTORE_SHX"] = "YES"

try:
    import geopandas as gpd
    from shapely.geometry import shape, Point
except ImportError:
    gpd = None
    shape = None
    Point = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
SOIL_ROOT_DIR = os.path.join(DATA_DIR, "soil")
SUITABILITY_JSON_PATH = os.path.join(DATA_DIR, "soil_suitability.json")
MAPPING_JSON_PATH = os.path.join(SOIL_ROOT_DIR, "province_mapping.json")

class SoilService:
    def __init__(self, max_cache_provinces: int = 3):
        self.max_cache_provinces = max_cache_provinces
        self.cached_layers: Dict[str, Any] = {}  # LRU cache สำหรับเลเยอร์ดิน: prov_code -> GeoDataFrame
        self.cache_order: List[str] = []
        self.suitability_data = self._load_suitability()
        self.province_mapping = self._load_mapping()

    def _load_suitability(self) -> Dict[str, Any]:
        """โหลดตารางความเหมาะสมของกลุ่มชุดดินต่อการปลูกข้าว"""
        if os.path.exists(SUITABILITY_JSON_PATH):
            try:
                with open(SUITABILITY_JSON_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[SoilService] โหลด suitability.json ผิดพลาด: {e}")
        return {"soil_groups": {}, "suitability_levels": {}}

    def _load_mapping(self) -> Dict[str, Any]:
        """โหลดทะเบียนรหัสจังหวัด พิกัด Bounding Box และภูมิภาค"""
        if os.path.exists(MAPPING_JSON_PATH):
            try:
                with open(MAPPING_JSON_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[SoilService] โหลด province_mapping.json ผิดพลาด: {e}")
        return {"provinces": {}, "regions": {}}

    def _find_target_province(self, poly) -> Optional[Dict[str, Any]]:
        """
        ค้นหาจังหวัดที่แปลงนาตั้งอยู่ โดยใช้ Centroid เทียบกับ Bounding Box
        ประมวลผลเร็วระดับ < 1 มิลลิวินาที โดยไม่ต้องเปิดไฟล์ Shapefile ทั้งหมด
        """
        cx, cy = poly.centroid.x, poly.centroid.y
        provinces = self.province_mapping.get("provinces", {})

        for code, info in provinces.items():
            bounds = info.get("bounds")
            if bounds and len(bounds) == 4:
                minx, miny, maxx, maxy = bounds
                if minx <= cx <= maxx and miny <= cy <= maxy:
                    return info
        return None

    def _get_or_load_province_gdf(self, prov_info: Dict[str, Any]):
        """โหลด GeoDataFrame ของจังหวัดแบบ On-Demand พร้อมระบบ Cache เพื่อประหยัด RAM"""
        if gpd is None:
            return None

        code = prov_info["code"]
        if code in self.cached_layers:
            # ย้ายขึ้นมาเป็นตำแหน่งล่าสุดใน cache
            self.cache_order.remove(code)
            self.cache_order.append(code)
            return self.cached_layers[code]

        region = prov_info["region"]
        name_en = prov_info["name_en"]
        shp_name = prov_info["shp_name"]
        shp_path = os.path.join(SOIL_ROOT_DIR, region, name_en, shp_name)

        if not os.path.exists(shp_path):
            print(f"[SoilService] ไม่พบไฟล์ Shapefile สำหรับ {prov_info.get('name_th')}: {shp_path}")
            return None

        # จัดการพื้นที่ RAM: ลบเลเยอร์ที่เก่าที่สุดหากเกินขนาดแคชที่กำหนด
        if len(self.cache_order) >= self.max_cache_provinces:
            oldest = self.cache_order.pop(0)
            if oldest in self.cached_layers:
                del self.cached_layers[oldest]
                print(f"[SoilService] เคลียร์เลเยอร์ {oldest} ออกจากหน่วยความจำเพื่อควบคุม RAM")

        try:
            print(f"[SoilService] กำลังโหลดข้อมูลดิน {prov_info.get('name_th')} ({shp_name})...")
            gdf = gpd.read_file(shp_path, encoding="cp874")
            if gdf.crs != "EPSG:4326":
                gdf = gdf.to_crs(epsg=4326)
            
            self.cached_layers[code] = gdf
            self.cache_order.append(code)
            print(f"[SoilService] โหลดดิน {prov_info.get('name_th')} สำเร็จ ({len(gdf):,} แปลง)")
            return gdf
        except Exception as e:
            print(f"[SoilService] ผิดพลาดในการโหลด {shp_path}: {e}")
            return None

    def get_soil_info(self, geojson_geometry: Dict[str, Any]) -> Dict[str, Any]:
        """
        วิเคราะห์กลุ่มชุดดินจากรูปหลายเหลี่ยมแปลงนา (GeoJSON polygon)
        ระบุจังหวัดอัตโนมัติ โหลดเลเยอร์ดินแบบ On-Demand และคำนวณ Spatial Join
        """
        if shape is None or gpd is None:
            return self._get_fallback_soil("ยังไม่ได้ติดตั้งไลบรารี geopandas หรือ shapely")

        try:
            geom = dict(geojson_geometry)
            if geom.get("type") == "Polygon":
                coords = geom.get("coordinates", [])
                if coords and isinstance(coords[0], list) and coords[0] and isinstance(coords[0][0], (int, float)):
                    geom["coordinates"] = [coords]

            poly = shape(geom)
            prov_info = self._find_target_province(poly)

            if not prov_info:
                return self._get_fallback_soil("แปลงนาอยู่นอกขอบเขตประเทศไทย")

            gdf = self._get_or_load_province_gdf(prov_info)
            if gdf is None:
                return self._get_fallback_soil(f"ไม่พบชั้นข้อมูลดินของจังหวัด {prov_info.get('name_th')}")

            # ตรวจสอบการทับซ้อนด้วย Spatial Index
            possible_idx = list(gdf.sindex.intersection(poly.bounds))
            if not possible_idx:
                return self._get_fallback_soil(f"แปลงนาไม่อยู่ในพื้นที่สำรวจดินของ {prov_info.get('name_th')}")

            possible_matches = gdf.iloc[possible_idx]
            exact_matches = possible_matches[possible_matches.intersects(poly)]

            if not exact_matches.empty:
                # เลือกแปลงดินที่มีพื้นที่ทับซ้อนมากที่สุด
                intersections = exact_matches.intersection(poly)
                dominant_idx = intersections.area.idxmax()
                matched_row = exact_matches.loc[dominant_idx]
            else:
                # กรณีขอบเขตไม่ทับซ้อน ลองตรวจสอบด้วย Centroid
                centroid_matches = possible_matches[possible_matches.contains(poly.centroid)]
                if not centroid_matches.empty:
                    matched_row = centroid_matches.iloc[0]
                else:
                    return self._get_fallback_soil(f"ไม่พบข้อมูลดินตรงกับพิกัดแปลงใน {prov_info.get('name_th')}")

            # ดึงข้อมูลจากคอลัมน์ของกรมพัฒนาที่ดิน
            raw_soil = str(matched_row.get("soil", "")).strip()
            clean_soil_group = raw_soil.split("/")[0] if "/" in raw_soil else raw_soil

            prov_name = str(matched_row.get("prov_nam_t", prov_info.get("name_th", ""))).strip()
            amphoe_name = str(matched_row.get("amphoe_t", "-")).strip()
            subdistrict_name = str(matched_row.get("tam_nam_t", "-")).strip()
            tex_top = str(matched_row.get("tex_top", "-")).strip()
            ph_top = str(matched_row.get("pH_top", "-")).strip()
            fer_top = str(matched_row.get("fer_top", "M")).strip()

            suit_info = self._get_suitability_factor(clean_soil_group)

            return {
                "found": True,
                "province": prov_name,
                "district": amphoe_name,
                "subdistrict": subdistrict_name,
                "soil_group": raw_soil,
                "soil_group_number": clean_soil_group,
                "topsoil_texture": tex_top,
                "topsoil_pH": ph_top,
                "topsoil_fertility": fer_top,
                "suitability_level": suit_info["level"],
                "suitability_name": suit_info["name_th"],
                "f_soil": suit_info["f_soil"],
                "description": suit_info["description"],
                "note": suit_info.get("note", "")
            }

        except Exception as e:
            return self._get_fallback_soil(f"เกิดข้อผิดพลาดในการประมวลผลเชิงพื้นที่: {str(e)}")

    def _get_suitability_factor(self, soil_group: str) -> Dict[str, Any]:
        """จับคู่กลุ่มชุดดินกับค่า F_soil"""
        groups = self.suitability_data.get("soil_groups", {})
        levels = self.suitability_data.get("suitability_levels", {})

        target = groups.get(soil_group, groups.get("default", {
            "suitability": "S2",
            "f_soil": 0.80,
            "note": "ค่าเฉลี่ยเริ่มต้นสำหรับกลุ่มชุดดินที่ไม่มีในระบบ"
        }))

        level_code = target.get("suitability", "S2")
        level_meta = levels.get(level_code, {
            "name_th": "เหมาะสมปานกลาง",
            "description": "ดินมีความเหมาะสมระดับปานกลาง"
        })

        return {
            "level": level_code,
            "name_th": level_meta.get("name_th", "เหมาะสมปานกลาง"),
            "f_soil": float(target.get("f_soil", 0.80)),
            "description": level_meta.get("description", ""),
            "note": target.get("note", "")
        }

    def _get_fallback_soil(self, reason: str) -> Dict[str, Any]:
        """ค่าสำรองเมื่อแปลงนาอยู่นอกพื้นที่หรือไฟล์ดินไม่พร้อมใช้งาน"""
        return {
            "found": False,
            "province": "ไม่ระบุ (นอกพื้นที่สำรวจ)",
            "district": "-",
            "subdistrict": "-",
            "soil_group": "22 (ค่าแทน)",
            "soil_group_number": "22",
            "topsoil_texture": "ดินร่วนปนทราย",
            "topsoil_pH": "5.5 - 6.5",
            "topsoil_fertility": "M",
            "suitability_level": "S2",
            "suitability_name": "เหมาะสมปานกลาง (ค่าประมาณ)",
            "f_soil": 0.85,
            "description": "ใช้ค่าดินตัวแทนเนื่องจากแปลงอยู่นอกพื้นที่สำรวจความละเอียดสูง",
            "note": reason
        }

soil_service = SoilService()
