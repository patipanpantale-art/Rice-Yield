from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import os

from services.soil_service import soil_service

app = FastAPI(
    title="Rice Yield Simulator API",
    description="API บริการข้อมูลดิน สภาพอากาศ ดัชนีดาวเทียม และแบบจำลองผลผลิตข้าว",
    version="1.0.0"
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

@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": "Interactive Map-Based Sandbox Simulator for Rice Yield Analytics",
        "role": "Backend / Data Pipeline (P2: นายปฏิภาณ ปานทะเล)"
    }

@app.get("/health")
def health_check():
    prov_count = len(soil_service.province_mapping.get("provinces", {}))
    return {
        "status": "healthy",
        "mode": "On-Demand Dynamic Loader (77 Provinces)",
        "provinces_indexed": prov_count,
        "cached_provinces": list(soil_service.cached_layers.keys())
    }

@app.post("/api/soil")
def get_soil(payload: PolygonRequest):
    """
    รับ GeoJSON Polygon จากการวาดบนแผนที่ Leaflet แล้วระบุกลุ่มชุดดิน
    พร้อมคำนวณค่าตัวคูณสภาพดิน (F_soil)
    """
    try:
        soil_info = soil_service.get_soil_info(payload.geometry)
        return {"success": True, "data": soil_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
