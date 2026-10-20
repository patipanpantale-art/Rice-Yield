import os
import sys
import json
from typing import Dict, Any, Optional, List

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "khon_kaen")
AGRONOMY_DIR = os.path.join(DATA_DIR, "agronomy")
STATS_DIR = os.path.join(DATA_DIR, "statistics")

VARIETIES_PATH = os.path.join(AGRONOMY_DIR, "rice_varieties.json")
FERTILIZER_PATH = os.path.join(AGRONOMY_DIR, "fertilizer_ssnm.json")
DISASTER_PATH = os.path.join(AGRONOMY_DIR, "disaster_thresholds.json")
AMPHOE_STATS_PATH = os.path.join(STATS_DIR, "khonkaen_amphoe_rice_yield.json")

# ต้นทุนการผลิตเฉลี่ยต่อไร่ (ต้นทุนรวมข้าวนาปี จ.ขอนแก่น ปี 2567/68, สำนักงานเกษตรและสหกรณ์จังหวัดขอนแก่น 2568)
BASELINE_COST_PER_RAI = 4926.01  # บาท/ไร่

# ราคาข้าวเปลือก ณ ตลาดกลาง/สหกรณ์ ธ.ก.ส. ขอนแก่น (บาท/ตัน)
PADDY_PRICES_PER_TON = {
    "KDML105": 17000.0,  # ข้าวหอมมะลิ 105 ความชื้น 15%
    "RD6": 12500.0,      # ข้าวเหนียว กข6
    "RD43": 8800.0       # ข้าวเจ้า กข43 (ข้าวเปลือกเจ้า ความชื้น 15%, สศก. ต.ค. 2569)
}

# ปัจจัยระบบน้ำ (Water Factor)
WATER_FACTORS = {
    "irrigated": {
        "f_water": 1.00,
        "name_th": "ในเขตชลประทาน (เช่น ลุ่มน้ำพอง/หนองหวาย)",
        "description": "น้ำสมบูรณ์ตลอดฤดู ได้รับน้ำสม่ำเสมอทุกระยะ"
    },
    "rainfed_pond": {
        "f_water": 0.88,
        "name_th": "นอกเขตชลประทาน แต่มีสระน้ำไร่นา/บ่อน้ำสำรอง",
        "description": "ใช้น้ำฝนเป็นหลัก แต่มีน้ำสำรองสูบช่วยช่วงฝนทิ้งช่วง"
    },
    "pure_rainfed": {
        "f_water": 0.72,
        "name_th": "นอกเขตชลประทาน อาศัยน้ำฝนธรรมชาติ 100%",
        "description": "เสี่ยงขาดน้ำหากเกิดฝนทิ้งช่วงในระยะตั้งท้องหรือออกรวง"
    }
}

# ปัจจัยการจัดการปุ๋ย (Fertilizer Management Factor)
FERTILIZER_FACTORS = {
    "ssnm_3split": {
        "f_fert": 1.00,
        "name_th": "ปุ๋ยสั่งตัด (SSNM) แบ่งใส่ครบ 3 ระยะตรงตามชุดดิน",
        "cost_add": 350.0,
        "description": "ใส่ปุ๋ยตามค่าวิเคราะห์ดิน: ระยะแตกกอ + ระยะสร้างรวงอ่อน + ระยะสะสมแป้ง"
    },
    "standard_2split": {
        "f_fert": 0.88,
        "name_th": "ปุ๋ยเคมีมาตรฐาน 2 รอบ (รองพื้น + แต่งหน้า)",
        "cost_add": 0.0,
        "description": "ใส่สูตร 16-16-8 หรือ 16-20-0 ตอนแตกกอ และยูเรีย 46-0-0 ตอนตั้งท้อง"
    },
    "farmer_habit": {
        "f_fert": 0.75,
        "name_th": "ใส่ปุ๋ยตามความคุ้นเคยทั่วไป (ใส่รอบเดียว/สูตรไม่ตรงระยะ)",
        "cost_add": -200.0,
        "description": "ใส่ปุ๋ยปริมาณน้อย หรือใส่ครั้งเดียวตอนเริ่มปลูก ไม่มีการใส่ปุ๋ยแต่งหน้า"
    },
    "none": {
        "f_fert": 0.58,
        "name_th": "ไม่ใส่ปุ๋ยเคมี / ขาดการบำรุงธาตุอาหาร",
        "cost_add": -800.0,
        "description": "อาศัยอินทรียวัตถุเดิมในดิน ผลผลิตต่ำตามความอุดมสมบูรณ์ธรรมชาติ"
    }
}

# ปัจจัยวิธีการปลูก (Planting Method Factor)
PLANTING_METHOD_FACTORS = {
    "transplanting": {
        "f_method": 1.00,
        "name_th": "นาดำ / รถปักดำ",
        "cost_add": 300.0,
        "description": "ควบคุมวัชพืชได้ดีที่สุด ระยะห่างต้นสม่ำเสมอ แตกกอได้เต็มศักยภาพ"
    },
    "wet_broadcast": {
        "f_method": 0.94,
        "name_th": "นาหว่านน้ำตม",
        "cost_add": 0.0,
        "description": "ข้าวขึ้นสม่ำเสมอปานกลาง จัดการวัชพืชได้พอใช้"
    },
    "dry_broadcast": {
        "f_method": 0.88,
        "name_th": "นาหว่านข้าวแห้ง (วิธีหลักของเกษตรกรอีสาน)",
        "cost_add": -200.0,
        "description": "ต้นทุนแรงงานต่ำ แต่วัชพืชแย่งอาหารและน้ำ ความหนาแน่นต้นไม่สม่ำเสมอ"
    }
}

class YieldEngine:
    def __init__(self):
        self.varieties_data = self._load_json(VARIETIES_PATH).get("varieties", {})
        self.fertilizer_data = self._load_json(FERTILIZER_PATH).get("fertilizer_plans", {})
        self.disaster_data = self._load_json(DISASTER_PATH)
        self.amphoe_stats = self._load_json(AMPHOE_STATS_PATH).get("districts", {})

    def _load_json(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[YieldEngine] โหลด {path} ผิดพลาด: {e}")
        return {}

    def get_varieties(self) -> List[Dict[str, Any]]:
        """ส่งคืนข้อมูลพันธุ์ข้าวที่รองรับ"""
        return list(self.varieties_data.values())

    def simulate(
        self,
        variety_id: str = "KDML105",
        target_yield_kg_rai: float = 450.0,
        area_rai: float = 5.0,
        f_soil: float = 0.85,
        suitability_level: str = "S2",
        soil_group_number: str = "35",
        amphoe_name: str = "เมืองขอนแก่น",
        water_system: str = "rainfed_pond",
        fertilizer_management: str = "standard_2split",
        planting_method: str = "dry_broadcast",
        disaster_type: Optional[str] = None,
        disaster_days: int = 0,
        disaster_stage: str = "reproductive_flowering"
    ) -> Dict[str, Any]:
        """
        คำนวณผลผลิตข้าวตามสูตรขอนแก่น Sandbox:
        Y = Y_genetic * F_soil * F_water * F_fert * F_method * (1 - D_disaster)
        """
        # 1. พันธุ์ข้าวและเพดานพันธุกรรม
        variety = self.varieties_data.get(variety_id, self.varieties_data.get("KDML105", {}))
        y_genetic_max = float(variety.get("genetic_yield_potential_max_kg_rai", 550.0))
        variety_name_th = variety.get("name_th", "ขาวดอกมะลิ 105")

        # 2. ปัจจัยตัวคูณต่างๆ
        water_info = WATER_FACTORS.get(water_system, WATER_FACTORS["rainfed_pond"])
        f_water = water_info["f_water"]

        fert_info = FERTILIZER_FACTORS.get(fertilizer_management, FERTILIZER_FACTORS["standard_2split"])
        f_fert = fert_info["f_fert"]

        method_info = PLANTING_METHOD_FACTORS.get(planting_method, PLANTING_METHOD_FACTORS["dry_broadcast"])
        f_method = method_info["f_method"]

        # ตรวจสอบ F_soil
        f_soil_val = float(f_soil) if f_soil > 0 else 0.80

        # 3. คำนวณความเสียหายจากภัยพิบัติ (Disaster Loss Rate: D_disaster)
        d_disaster = self._calculate_disaster_damage(disaster_type, disaster_days, disaster_stage)

        # 4. คำนวณผลผลิตต่อไร่ (Current Simulated Yield)
        base_yield = y_genetic_max * f_soil_val * f_water * f_fert * f_method
        simulated_yield_kg_rai = base_yield * (1.0 - d_disaster)

        # ผลผลิตต้องไม่เกินเพดานพันธุกรรม
        simulated_yield_kg_rai = min(simulated_yield_kg_rai, y_genetic_max)
        simulated_yield_kg_rai = max(simulated_yield_kg_rai, 0.0)

        # 5. สถิติอ้างอิง สศก. รายอำเภอ (OAE Baseline)
        amphoe_entry = self.amphoe_stats.get(amphoe_name, {})
        oae_baseline_kg_rai = float(amphoe_entry.get("yield_kg_per_rai", 336.0))

        # 6. คำนวณเคสแนะนำ (Optimal SSNM Yield)
        # หากใช้ปุ๋ย SSNM (f_fert=1.0) และมีน้ำสมบูรณ์ (f_water=1.0 หรือ 0.95) และวิธีนาดำ/หว่านตม
        optimal_water = 1.00 if water_system == "irrigated" else 0.95
        optimal_method = 1.00
        optimal_yield_kg_rai = min(y_genetic_max * f_soil_val * optimal_water * 1.00 * optimal_method, y_genetic_max)

        # 7. การวิเคราะห์ความเป็นไปได้ (Feasibility & Yield Gap)
        yield_gap = target_yield_kg_rai - simulated_yield_kg_rai
        feasibility_pct = min(max((simulated_yield_kg_rai / target_yield_kg_rai * 100.0) if target_yield_kg_rai > 0 else 100.0, 0.0), 100.0)
        
        exceeds_genetic_ceiling = target_yield_kg_rai > y_genetic_max

        feasibility_label = "เป็นไปได้สูงมาก (บรรลุเป้าหมาย)"
        if exceeds_genetic_ceiling:
            feasibility_label = f"ยากเกินขีดจำกัด (เกินเพดานพันธุกรรมของ {variety_name_th}: {y_genetic_max:.0f} กก./ไร่)"
        elif feasibility_pct >= 95.0:
            feasibility_label = "บรรลุเป้าหมายได้อย่างมีประสิทธิภาพ"
        elif feasibility_pct >= 80.0:
            feasibility_label = "ใกล้เคียงเป้าหมาย (ปรับปรุงปุ๋ยหรือน้ำจะถึงเป้า)"
        else:
            feasibility_label = "ต่ำกว่าเป้าหมาย (ต้องการปรับเปลี่ยนการจัดการหลายด้าน)"

        # 8. ผลผลิตรวมทั้งแปลง
        total_production_kg = simulated_yield_kg_rai * area_rai
        total_production_tons = total_production_kg / 1000.0

        # 9. เศรษฐศาสตร์ (Economics: ต้นทุน vs รายได้)
        price_per_ton = PADDY_PRICES_PER_TON.get(variety_id, 17000.0)
        price_per_kg = price_per_ton / 1000.0

        cost_per_rai = BASELINE_COST_PER_RAI + fert_info.get("cost_add", 0.0) + method_info.get("cost_add", 0.0)
        total_cost = cost_per_rai * area_rai
        gross_revenue = total_production_tons * price_per_ton
        net_profit = gross_revenue - total_cost
        profit_per_rai = net_profit / area_rai if area_rai > 0 else 0.0

        # 10. แผนปุ๋ยสั่งตัด SSNM Checklist
        ssnm_plan = self._get_ssnm_plan(soil_group_number)

        # สรุป 4 เคสเปรียบเทียบ (Scenario Comparison)
        cases = [
            {
                "case_id": "case_1_oae",
                "name_th": f"สถิติจริง สศก. (อ.{amphoe_name})",
                "yield_kg_rai": round(oae_baseline_kg_rai, 1),
                "total_production_kg": round(oae_baseline_kg_rai * area_rai, 1),
                "diff_from_target_kg_rai": round(oae_baseline_kg_rai - target_yield_kg_rai, 1),
                "status_label": "สถิติเฉลี่ยของเกษตรกรทั่วไป",
                "badge_class": "badge-secondary"
            },
            {
                "case_id": "case_2_current",
                "name_th": "ผลผลิตประเมินจากการจัดการของคุณ",
                "yield_kg_rai": round(simulated_yield_kg_rai, 1),
                "total_production_kg": round(total_production_kg, 1),
                "diff_from_target_kg_rai": round(simulated_yield_kg_rai - target_yield_kg_rai, 1),
                "status_label": "ตามน้ำและปุ๋ยที่คุณเลือกปัจจุบัน",
                "badge_class": "badge-primary"
            },
            {
                "case_id": "case_3_ssnm",
                "name_th": "ผลผลิตสูงสุดด้วยปุ๋ยสั่งตัด SSNM",
                "yield_kg_rai": round(optimal_yield_kg_rai, 1),
                "total_production_kg": round(optimal_yield_kg_rai * area_rai, 1),
                "diff_from_target_kg_rai": round(optimal_yield_kg_rai - target_yield_kg_rai, 1),
                "status_label": "แนวทางปฏิบัติที่แนะนำให้ปรับปรุง",
                "badge_class": "badge-success"
            },
            {
                "case_id": "case_4_genetic",
                "name_th": f"เพดานพันธุกรรมสูงสุด ({variety_name_th})",
                "yield_kg_rai": round(y_genetic_max, 1),
                "total_production_kg": round(y_genetic_max * area_rai, 1),
                "diff_from_target_kg_rai": round(y_genetic_max - target_yield_kg_rai, 1),
                "status_label": "ขีดจำกัดชีวภาพสูงสุด",
                "badge_class": "badge-warning"
            }
        ]

        return {
            "success": True,
            "inputs": {
                "variety": variety,
                "target_yield_kg_rai": target_yield_kg_rai,
                "area_rai": area_rai,
                "f_soil": f_soil_val,
                "suitability_level": suitability_level,
                "soil_group_number": soil_group_number,
                "amphoe_name": amphoe_name,
                "water_system": water_info,
                "fertilizer_management": fert_info,
                "planting_method": method_info,
                "disaster": {
                    "type": disaster_type,
                    "days": disaster_days,
                    "stage": disaster_stage,
                    "damage_rate_pct": round(d_disaster * 100.0, 1)
                }
            },
            "results": {
                "yield_kg_rai": round(simulated_yield_kg_rai, 1),
                "total_production_kg": round(total_production_kg, 1),
                "total_production_tons": round(total_production_tons, 2),
                "target_yield_kg_rai": round(target_yield_kg_rai, 1),
                "yield_gap_kg_rai": round(yield_gap, 1),
                "feasibility_pct": round(feasibility_pct, 1),
                "feasibility_label": feasibility_label,
                "exceeds_genetic_ceiling": exceeds_genetic_ceiling
            },
            "scenarios": cases,
            "economics": {
                "price_per_ton": price_per_ton,
                "cost_per_rai": round(cost_per_rai, 1),
                "total_cost": round(total_cost, 1),
                "gross_revenue": round(gross_revenue, 1),
                "net_profit": round(net_profit, 1),
                "profit_per_rai": round(profit_per_rai, 1),
                "roi_pct": round((net_profit / total_cost * 100.0) if total_cost > 0 else 0.0, 1)
            },
            "ssnm_recommendations": ssnm_plan
        }

    def _calculate_disaster_damage(
        self, 
        disaster_type: Optional[str], 
        days: int, 
        stage: str
    ) -> float:
        """คำนวณความเสียหายจากน้ำท่วมหรือฝนแล้งตามเกณฑ์ชีววิทยาข้าว"""
        if not disaster_type or days <= 0:
            return 0.0

        if disaster_type == "flood":
            flood_rules = self.disaster_data.get("flood_submergence", {}).get(stage, {})
            curves = flood_rules.get("damage_curves", [])
            safe_days = flood_rules.get("safe_submerged_days", 2)
            if days <= safe_days:
                return 0.0

            loss_pct = 0.0
            for item in curves:
                if days >= item.get("submerged_days", 0):
                    loss_pct = max(loss_pct, float(item.get("yield_loss_pct", 0.0)))
            return min(loss_pct / 100.0, 1.0)

        elif disaster_type == "drought":
            drought_rules = self.disaster_data.get("drought_stress", {}).get(stage, {})
            threshold = drought_rules.get("dry_spell_days_threshold", 10)
            if days <= threshold:
                return 0.0

            extra_days = days - threshold
            rate_per_day = drought_rules.get("damage_per_day_after_threshold_pct", 3.0)
            max_loss = drought_rules.get("max_loss_pct", 80.0)
            loss_pct = min(extra_days * rate_per_day, max_loss)
            return min(loss_pct / 100.0, 1.0)

        return 0.0

    def _get_ssnm_plan(self, soil_group_number: str) -> Dict[str, Any]:
        """จับคู่แผนปุ๋ยสั่งตัด SSNM ตามประเภทเนื้อดินของชุดดิน"""
        # ดินเหนียว: เช่น 15, 18, 56, 59 (ชุดดินพิมาย บุรีรัมย์ ชัยภูมิ)
        # ดินทราย: เช่น 35, 40, 41, 44, 48 (ชุดดินร้อยเอ็ด น้ำพอง วาริน อุบล)
        clay_groups = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"]
        clean_num = str(soil_group_number).split("/")[0].strip()

        is_clay = clean_num in clay_groups
        plan_key = "clay_soil" if is_clay else "sandy_soil"
        plan_info = self.fertilizer_data.get(plan_key, {})

        return {
            "soil_type_detected": "ดินเหนียว/ร่วนเหนียว" if is_clay else "ดินทราย/ร่วนปนทราย",
            "soil_group": soil_group_number,
            "steps": [
                {
                    "step": 1,
                    "stage": "ระยะรองพื้น / แตกกอแรกเริ่ม (15-20 วัน)",
                    "formula": plan_info.get("step_1_basal", {}).get("formula", "16-16-8"),
                    "rate_kg_rai": plan_info.get("step_1_basal", {}).get("rate_kg_rai", 25),
                    "purpose": plan_info.get("step_1_basal", {}).get("purpose", "สร้างรากและเร่งกอ")
                },
                {
                    "step": 2,
                    "stage": "ระยะแตกกอสูงสุด (30-40 วัน)",
                    "formula": plan_info.get("step_2_tillering", {}).get("formula", "46-0-0"),
                    "rate_kg_rai": plan_info.get("step_2_tillering", {}).get("rate_kg_rai", 10),
                    "purpose": plan_info.get("step_2_tillering", {}).get("purpose", "เพิ่มจำนวนต้นต่อกอ")
                },
                {
                    "step": 3,
                    "stage": "ระยะตั้งท้องและกำเนิดช่อดอก (ก่อนออกดอก 30 วัน)",
                    "formula": plan_info.get("step_3_panicle", {}).get("formula", "0-0-60 หรือ 15-15-15"),
                    "rate_kg_rai": plan_info.get("step_3_panicle", {}).get("rate_kg_rai", 5),
                    "purpose": plan_info.get("step_3_panicle", {}).get("purpose", "บำรุงเมล็ด เพิ่มน้ำหนักรวง ลดเมล็ดลีบ")
                }
            ],
            "amendment": plan_info.get("amendment_needed", None)
        }

yield_engine = YieldEngine()
