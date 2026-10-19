from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import os

from services.soil_service import soil_service
from services.khonkaen_service import khonkaen_service
from services.yield_engine import yield_engine

app = FastAPI(
    title="Rice Yield Simulator API",
    description="API บริการข้อมูลดิน ผังการใช้ที่ดิน LDD และแบบจำลองผลผลิตข้าว จังหวัดขอนแก่น",
    version="2.0.0"
)

# เปิดใช้งาน CORS เพื่อให้ Frontend (Leaflet / Localhost) เรียกใช้งานได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PolygonRequest(BaseModel):
    geometry: Dict[str, Any] = Field(..., description="GeoJSON Geometry ของแปลงนา")

class SimulationRequest(BaseModel):
    variety_id: str = Field(default="KDML105", description="รหัสพันธุ์ข้าว เช่น KDML105, RD6, RD43")
    target_yield_kg_rai: float = Field(default=450.0, description="เป้าหมายผลผลิต (กก./ไร่)")
    area_rai: float = Field(default=5.0, description="ขนาดแปลงนา (ไร่)")
    f_soil: float = Field(default=0.85, description="ตัวคูณความเหมาะสมของดิน F_soil")
    suitability_level: str = Field(default="S2", description="ระดับความเหมาะสมของดิน LDD (S1, S2, S3, N)")
    soil_group_number: str = Field(default="35", description="หมายเลขกลุ่มชุดดิน เช่น 35, 18")
    amphoe_name: str = Field(default="เมืองขอนแก่น", description="ชื่ออำเภอในจังหวัดขอนแก่น")
    water_system: str = Field(default="rainfed_pond", description="ระบบน้ำ: irrigated, rainfed_pond, pure_rainfed")
    fertilizer_management: str = Field(default="standard_2split", description="การใส่ปุ๋ย: ssnm_3split, standard_2split, farmer_habit, none")
    planting_method: str = Field(default="dry_broadcast", description="วิธีปลูก: transplanting, wet_broadcast, dry_broadcast")
    disaster_type: Optional[str] = Field(default=None, description="ประเภทภัยธรรมชาติ: flood, drought หรือ None")
    disaster_days: int = Field(default=0, description="จำนวนวันที่เกิดภัยพิบัติ")
    disaster_stage: str = Field(default="reproductive_flowering", description="ระยะที่เกิดภัยพิบัติ")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": "Interactive Map-Based Sandbox Simulator for Rice Yield Analytics",
        "scope": "Khon Kaen Province (26 Amphoes)",
        "role": "Backend / Data Pipeline (P2: นายปฏิภาณ ปานทะเล)",
        "version": "2.0.0"
    }

@app.get("/health")
def health_check():
    prov_count = len(soil_service.province_mapping.get("provinces", {}))
    return {
        "status": "healthy",
        "mode": "Khon Kaen Stage-based Threshold Simulator",
        "khonkaen_amphoes": 26,
        "provinces_indexed": prov_count
    }

# 1. API ตรวจสอบแปลงนาเชิงพื้นที่ (อำเภอ, ข้อมูลดิน, ผังที่ดิน LDD)
@app.post("/api/khon-kaen/inspect-polygon")
def inspect_polygon_endpoint(payload: PolygonRequest):
    """
    ตรวจสอบแปลงนาที่วาดบนแผนที่:
    - ระบุอำเภอใน 26 อำเภอของขอนแก่น
    - ตรวจสอบกลุ่มชุดดินและค่า F_soil
    - ตรวจสอบการใช้ที่ดินตามผัง LDD 2565 (เป็นนาข้าว A101 หรือไม่)
    - ส่งคืนสถิติจริงอ้างอิง สศก.
    """
    try:
        inspection = khonkaen_service.inspect_polygon(payload.geometry)
        return inspection
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 2. API จำลองผลผลิตข้าว (Season Simulation & Scenarios)
@app.post("/api/khon-kaen/simulate-season")
def simulate_season_endpoint(payload: SimulationRequest):
    """
    คำนวณแบบจำลองผลผลิตข้าว:
    - คำนวณตามสูตร Y = Y_genetic * F_soil * F_water * F_fert * F_method * (1 - D_disaster)
    - เปรียบเทียบ 4 กรณี (สถิติ สศก. / การจัดการปัจจุบัน / ปุ๋ยสั่งตัด SSNM / เพดานพันธุกรรม)
    - วิเคราะห์ Feasibility & Yield Gap
    - สรุปต้นทุนและกำไรสุทธิ
    - แนะนำแผนปุ๋ยสั่งตัด SSNM 3 ระยะ
    """
    try:
        result = yield_engine.simulate(
            variety_id=payload.variety_id,
            target_yield_kg_rai=payload.target_yield_kg_rai,
            area_rai=payload.area_rai,
            f_soil=payload.f_soil,
            suitability_level=payload.suitability_level,
            soil_group_number=payload.soil_group_number,
            amphoe_name=payload.amphoe_name,
            water_system=payload.water_system,
            fertilizer_management=payload.fertilizer_management,
            planting_method=payload.planting_method,
            disaster_type=payload.disaster_type,
            disaster_days=payload.disaster_days,
            disaster_stage=payload.disaster_stage
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 3. API ดึงสถิติจริง 26 อำเภอ
@app.get("/api/khon-kaen/baseline-stats")
def get_baseline_stats():
    return {
        "success": True,
        "province_baseline": khonkaen_service.baseline_stats,
        "amphoe_stats": khonkaen_service.amphoe_stats
    }

# 4. API ดึงข้อมูลพันธุ์ข้าว
@app.get("/api/khon-kaen/varieties")
def get_varieties():
    return {
        "success": True,
        "varieties": yield_engine.get_varieties()
    }

# 5. API เดิม (Backward compatibility)
@app.post("/api/soil")
def get_soil(payload: PolygonRequest):
    try:
        soil_info = soil_service.get_soil_info(payload.geometry)
        return {"success": True, "data": soil_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
