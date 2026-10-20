/**
 * SandboxController - ควบคุมการทำงานของระบบ 3 ส่วน (Input - Map - Output)
 * ออกแบบเพื่อความเป็นมิตรต่อผู้ใช้สูงสุด คมชัด ไม่กลืนสายตา และตรงตามบริบทจังหวัดขอนแก่น
 */
const SandboxController = {
  backendUrl: "http://localhost:8000",
  backendOnline: false,

  // สถานะแปลงที่เลือก
  currentPolygon: null,
  currentAreaRai: 5.0,
  currentAmphoe: "เมืองขอนแก่น",
  currentSoilGroup: "35",
  currentFSoil: 0.85,
  currentSuitability: "S3",
  currentLandUse: { is_rice: true, lu_code: "A101", lu_name_th: "นาข้าว" },

  // เลเยอร์แผนที่
  map: null,
  drawnItems: null,
  amphoeLayer: null,
  activeDrawHandler: null,
  amphoesGeoJSON: null,

  varieties: {
    "KDML105": { name_th: "ขาวดอกมะลิ 105", ceiling: 550, type: "ข้าวเจ้านาปี (ไวแสง)", duration: 120 },
    "RD6": { name_th: "กข6", ceiling: 800, type: "ข้าวเหนียวนาปี (ไวแสง)", duration: 130 },
    "RD43": { name_th: "กข43", ceiling: 700, type: "ข้าวน้ำตาลต่ำ (ไม่ไวแสง)", duration: 95 }
  },

  async init() {
    console.log("[SandboxController] กำลังเริ่มต้นระบบ 3-Zone Khon Kaen Sandbox...");
    this.initMap();
    this.bindInputs();
    this.bindDrawTools();
    await this.checkBackend();
    this.loadAmphoesGeoJSON();
    
    // จำลองค่าเริ่มต้นครั้งแรกเพื่อให้ผู้ใช้เห็นภาพ
    this.runSimulation();
  },

  async checkBackend() {
    const badge = document.getElementById("zBackendStatus");
    try {
      const res = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        this.backendOnline = true;
        if (badge) {
          badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; margin-right:6px;"></span> เซิร์ฟเวอร์ขอนแก่นออนไลน์ (พร้อมระบบตรวจสอบ LDD)`;
          badge.style.color = "#15803d";
        }
        return;
      }
    } catch (e) {
      console.warn("[SandboxController] Backend ออฟไลน์ ใช้การคำนวณในตัว");
    }
    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:6px;"></span> โหมดคำนวณในตัว (ไม่ได้เชื่อมต่อ Backend)`;
      badge.style.color = "#b45309";
    }
  },

  /* ---------------------------------------------------------------------- */
  /* แผนที่และเลเยอร์ 26 อำเภอ                                                */
  /* ---------------------------------------------------------------------- */
  initMap() {
    if (!window.L) {
      console.error("[SandboxController] ไม่พบไลบรารี Leaflet");
      return;
    }

    // แผนที่ดาวเทียม Esri World Imagery พร้อม Label
    const satTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles &copy; Esri" }
    );
    const labelTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, opacity: 0.85 }
    );

    const streetTile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    });

    this.map = L.map("map", {
      center: [16.4322, 102.8236], // กลางเมืองขอนแก่น
      zoom: 10,
      minZoom: 8,
      maxZoom: 18,
      layers: [satTile, labelTile],
      zoomControl: false
    });

    L.control.zoom({ position: "bottomright" }).addTo(this.map);

    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.amphoeLayer = L.geoJSON(null, {
      style: {
        color: "#f59e0b",
        weight: 1.5,
        opacity: 0.6,
        fillColor: "#fbbf24",
        fillOpacity: 0.05
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.AMP_NAME || feature.properties.AMPHOE_T || "อำเภอในขอนแก่น";
        layer.bindTooltip(`<b>${name}</b>`, { sticky: true, className: "amphoe-tooltip" });
        layer.on("click", () => {
          this.currentAmphoe = name;
          this.updateAmphoeBadge(name);
          this.map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 13 });
          this.runSimulation();
        });
      }
    });
    this.map.addLayer(this.amphoeLayer);

    // เลเยอร์สลับแผนที่
    this.baseMaps = {
      satellite: L.layerGroup([satTile, labelTile]),
      street: streetTile
    };
  },

  async loadAmphoesGeoJSON() {
    try {
      const res = await fetch("data/khon_kaen_amphoes.geojson");
      if (res.ok) {
        this.amphoesGeoJSON = await res.json();
        this.amphoeLayer.addData(this.amphoesGeoJSON);
        console.log("[SandboxController] โหลดขอบเขต 26 อำเภอขอนแก่นสำเร็จ");
      }
    } catch (e) {
      console.warn("[SandboxController] ไม่สามารถโหลดไฟล์ khon_kaen_amphoes.geojson ได้:", e);
    }
  },

  /* ---------------------------------------------------------------------- */
  /* เครื่องมือวาดแปลง (Drawing Tools)                                         */
  /* ---------------------------------------------------------------------- */
  bindDrawTools() {
    const btnPoly = document.getElementById("zToolDrawPoly");
    const btnRect = document.getElementById("zToolDrawRect");
    const btnClear = document.getElementById("zToolClear");
    const btnFocus = document.getElementById("zToolFocus");
    const btnLayerSat = document.getElementById("zToolLayerSat");
    const btnLayerStreet = document.getElementById("zToolLayerStreet");

    if (btnPoly) {
      btnPoly.addEventListener("click", () => this.startDrawMode("polygon", btnPoly));
    }
    if (btnRect) {
      btnRect.addEventListener("click", () => this.startDrawMode("rectangle", btnRect));
    }
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        this.drawnItems.clearLayers();
        this.currentPolygon = null;
        this.currentAreaRai = 5.0;
        this.updatePaddyInfoUI(null);
        this.runSimulation();
      });
    }
    if (btnFocus) {
      btnFocus.addEventListener("click", () => {
        this.map.setView([16.4322, 102.8236], 10);
      });
    }
    if (btnLayerSat && btnLayerStreet) {
      btnLayerSat.addEventListener("click", () => {
        btnLayerSat.classList.add("active");
        btnLayerStreet.classList.remove("active");
        this.map.removeLayer(this.baseMaps.street);
        this.map.addLayer(this.baseMaps.satellite);
      });
      btnLayerStreet.addEventListener("click", () => {
        btnLayerStreet.classList.add("active");
        btnLayerSat.classList.remove("active");
        this.map.removeLayer(this.baseMaps.satellite);
        this.map.addLayer(this.baseMaps.street);
      });
    }

    // เมื่อวาดเสร็จ
    this.map.on(L.Draw.Event.CREATED, (e) => {
      this.drawnItems.clearLayers();
      const layer = e.layer;
      layer.setStyle({
        color: "#16a34a",
        weight: 3,
        fillColor: "#22c55e",
        fillOpacity: 0.35
      });
      this.drawnItems.addLayer(layer);
      this.currentPolygon = layer.toGeoJSON().geometry;
      this.stopDrawMode();

      // คำนวณพื้นที่
      this.handleDrawnPolygon(layer);
    });
  },

  startDrawMode(mode, triggerBtn) {
    this.stopDrawMode();
    document.querySelectorAll(".z-tool-btn").forEach((b) => b.classList.remove("active"));
    triggerBtn.classList.add("active");

    if (mode === "polygon") {
      this.activeDrawHandler = new L.Draw.Polygon(this.map, {
        shapeOptions: { color: "#16a34a", weight: 3, fillColor: "#22c55e", fillOpacity: 0.35 }
      });
    } else if (mode === "rectangle") {
      this.activeDrawHandler = new L.Draw.Rectangle(this.map, {
        shapeOptions: { color: "#16a34a", weight: 3, fillColor: "#22c55e", fillOpacity: 0.35 }
      });
    }
    this.activeDrawHandler.enable();
  },

  stopDrawMode() {
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }
    const btnPoly = document.getElementById("zToolDrawPoly");
    const btnRect = document.getElementById("zToolDrawRect");
    if (btnPoly) btnPoly.classList.remove("active");
    if (btnRect) btnRect.classList.remove("active");
  },

  async handleDrawnPolygon(layer) {
    const geojson = layer.toGeoJSON();
    
    // 1. คำนวณขนาดพื้นที่ด้วย Turf.js
    let sqMeters = 0;
    if (window.turf) {
      sqMeters = turf.area(geojson);
    }
    const rai = sqMeters / 1600.0;
    this.currentAreaRai = Math.max(0.5, Math.round(rai * 100) / 100);

    // 2. เรียก API ตรวจสอบแปลงเชิงพื้นที่ (อำเภอ, ดิน, ผัง LDD 2565)
    if (this.backendOnline) {
      try {
        const res = await fetch(`${this.backendUrl}/api/khon-kaen/inspect-polygon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geojson.geometry })
        });
        const json = await res.json();
        if (json.success) {
          if (json.amphoe && json.amphoe.amphoe_th) {
            this.currentAmphoe = json.amphoe.amphoe_th;
          }
          if (json.soil) {
            this.currentSoilGroup = json.soil.soil_group_number || "35";
            this.currentFSoil = json.soil.f_soil || 0.85;
            this.currentSuitability = json.soil.suitability_level || "S3";
          }
          if (json.landuse) {
            this.currentLandUse = json.landuse;
          }
        }
      } catch (err) {
        console.warn("[SandboxController] ตรวจสอบแปลงเชิงพื้นที่ไม่สำเร็จ:", err);
      }
    } else {
      // โหมดสำรอง: ตรวจสอบอำเภอจาก Turf.js
      if (this.amphoesGeoJSON && window.turf) {
        const centroid = turf.centroid(geojson);
        for (const feat of this.amphoesGeoJSON.features) {
          if (turf.booleanPointInPolygon(centroid, feat)) {
            this.currentAmphoe = feat.properties.AMP_NAME || feat.properties.AMPHOE_T;
            break;
          }
        }
      }
    }

    this.updatePaddyInfoUI(sqMeters);
    this.runSimulation();
  },

  updatePaddyInfoUI(sqMeters) {
    const elArea = document.getElementById("zDispArea");
    const elAmphoe = document.getElementById("zDispAmphoe");
    const elSoil = document.getElementById("zDispSoil");
    const elLandUse = document.getElementById("zDispLandUse");

    if (!sqMeters) {
      if (elArea) elArea.innerHTML = `<span style="color:#64748b;">5.0 ไร่ (ค่าจำลองเริ่มต้น)</span>`;
      if (elAmphoe) elAmphoe.innerText = "อ.เมืองขอนแก่น";
      if (elSoil) elSoil.innerHTML = `<span class="z-tag" style="background:#fef3c7; color:#78350f;">กลุ่มดินที่ 35 (S3 ดินทราย)</span>`;
      if (elLandUse) elLandUse.innerHTML = `<span class="z-tag" style="background:#dcfce7; color:#14532d;">✓ ในผังนาข้าว LDD (A101)</span>`;
      return;
    }

    // แปลง ตร.ม. เป็น ไร่-งาน-วา
    const totalWah = sqMeters / 4.0;
    const rai = Math.floor(totalWah / 400);
    const ngan = Math.floor((totalWah % 400) / 100);
    const wah = Math.round(totalWah % 100);

    if (elArea) {
      elArea.innerHTML = `<strong>${rai} ไร่ ${ngan} งาน ${wah} วา</strong> <span style="font-size:11px; color:#64748b;">(${this.currentAreaRai} ไร่)</span>`;
    }
    if (elAmphoe) {
      elAmphoe.innerText = `อ.${this.currentAmphoe}`;
    }
    if (elSoil) {
      elSoil.innerHTML = `<span class="z-tag" style="background:#fef3c7; color:#78350f;">กลุ่มดินที่ ${this.currentSoilGroup} (${this.currentSuitability})</span>`;
    }
    if (elLandUse) {
      if (this.currentLandUse.is_rice) {
        elLandUse.innerHTML = `<span class="z-tag" style="background:#dcfce7; color:#14532d;">✓ ในผังนาข้าว LDD (${this.currentLandUse.lu_code})</span>`;
      } else {
        elLandUse.innerHTML = `<span class="z-tag" style="background:#fee2e2; color:#991b1b;">⚠️ นอกผังนาข้าว (${this.currentLandUse.lu_name_th})</span>`;
      }
    }
  },

  updateAmphoeBadge(name) {
    const elAmphoe = document.getElementById("zDispAmphoe");
    if (elAmphoe) elAmphoe.innerText = `อ.${name}`;
  },

  /* ---------------------------------------------------------------------- */
  /* ผูก Event กับ Input Controls ทางซ้าย                                    */
  /* ---------------------------------------------------------------------- */
  bindInputs() {
    const selVariety = document.getElementById("zInputVariety");
    const sliderTarget = document.getElementById("zSliderTarget");
    const numTarget = document.getElementById("zNumTarget");
    const btnSimulate = document.getElementById("zBtnSimulate");

    if (selVariety) {
      selVariety.addEventListener("change", (e) => {
        const spec = this.varieties[e.target.value] || this.varieties["KDML105"];
        const ceilingEl = document.getElementById("zDispCeiling");
        if (ceilingEl) ceilingEl.innerText = `${spec.ceiling} กก./ไร่`;
        this.runSimulation();
      });
    }

    if (sliderTarget && numTarget) {
      sliderTarget.addEventListener("input", (e) => {
        numTarget.value = e.target.value;
        this.runSimulation();
      });
      numTarget.addEventListener("input", (e) => {
        sliderTarget.value = e.target.value;
        this.runSimulation();
      });
    }

    // Radio Groups (Water, Fert, Method)
    document.querySelectorAll("input[name='zWater']").forEach((r) => {
      r.addEventListener("change", () => {
        document.querySelectorAll("input[name='zWater']").forEach((el) => el.closest(".z-radio-card").classList.remove("active"));
        r.closest(".z-radio-card").classList.add("active");
        this.runSimulation();
      });
    });

    document.querySelectorAll("input[name='zFert']").forEach((r) => {
      r.addEventListener("change", () => {
        document.querySelectorAll("input[name='zFert']").forEach((el) => el.closest(".z-radio-card").classList.remove("active"));
        r.closest(".z-radio-card").classList.add("active");
        this.runSimulation();
      });
    });

    document.querySelectorAll("input[name='zMethod']").forEach((r) => {
      r.addEventListener("change", () => {
        document.querySelectorAll("input[name='zMethod']").forEach((el) => el.closest(".z-radio-card").classList.remove("active"));
        r.closest(".z-radio-card").classList.add("active");
        this.runSimulation();
      });
    });

    // Disaster Shock inputs
    const selDisaster = document.getElementById("zInputDisasterType");
    const sliderDisasterDays = document.getElementById("zSliderDisasterDays");
    const numDisasterDays = document.getElementById("zNumDisasterDays");
    const selDisasterStage = document.getElementById("zInputDisasterStage");

    if (selDisaster) {
      selDisaster.addEventListener("change", () => this.runSimulation());
    }
    if (sliderDisasterDays && numDisasterDays) {
      sliderDisasterDays.addEventListener("input", (e) => {
        numDisasterDays.innerText = `${e.target.value} วัน`;
        this.runSimulation();
      });
    }
    if (selDisasterStage) {
      selDisasterStage.addEventListener("change", () => this.runSimulation());
    }

    if (btnSimulate) {
      btnSimulate.addEventListener("click", () => this.runSimulation());
    }
  },

  /* ---------------------------------------------------------------------- */
  /* คำนวณและประมวลผล (Simulation & Scenarios Engine)                        */
  /* ---------------------------------------------------------------------- */
  async runSimulation() {
    const selVariety = document.getElementById("zInputVariety");
    const numTarget = document.getElementById("zNumTarget");
    const rWater = document.querySelector("input[name='zWater']:checked");
    const rFert = document.querySelector("input[name='zFert']:checked");
    const rMethod = document.querySelector("input[name='zMethod']:checked");
    const selDisaster = document.getElementById("zInputDisasterType");
    const sliderDisasterDays = document.getElementById("zSliderDisasterDays");
    const selDisasterStage = document.getElementById("zInputDisasterStage");

    const payload = {
      variety_id: selVariety ? selVariety.value : "KDML105",
      target_yield_kg_rai: parseFloat(numTarget ? numTarget.value : 450),
      area_rai: this.currentAreaRai,
      f_soil: this.currentFSoil,
      suitability_level: this.currentSuitability,
      soil_group_number: this.currentSoilGroup,
      amphoe_name: this.currentAmphoe,
      water_system: rWater ? rWater.value : "rainfed_pond",
      fertilizer_management: rFert ? rFert.value : "standard_2split",
      planting_method: rMethod ? rMethod.value : "dry_broadcast",
      disaster_type: (selDisaster && selDisaster.value !== "none") ? selDisaster.value : null,
      disaster_days: sliderDisasterDays ? parseInt(sliderDisasterDays.value, 10) : 0,
      disaster_stage: selDisasterStage ? selDisasterStage.value : "reproductive_flowering"
    };

    if (this.backendOnline) {
      try {
        const res = await fetch(`${this.backendUrl}/api/khon-kaen/simulate-season`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          this.renderOutput(json);
          return;
        }
      } catch (err) {
        console.warn("[SandboxController] Simulation API ขัดข้อง ใช้การคำนวณในตัว:", err);
      }
    }

    // Fallback Client-side Simulation
    this.runClientSimulation(payload);
  },

  runClientSimulation(p) {
    const spec = this.varieties[p.variety_id] || this.varieties["KDML105"];
    const y_genetic = spec.ceiling;

    const waterMap = { irrigated: 1.0, rainfed_pond: 0.88, pure_rainfed: 0.72 };
    const fertMap = { ssnm_3split: 1.0, standard_2split: 0.88, farmer_habit: 0.75, none: 0.58 };
    const methodMap = { transplanting: 1.0, wet_broadcast: 0.94, dry_broadcast: 0.88 };

    const fw = waterMap[p.water_system] || 0.88;
    const ff = fertMap[p.fertilizer_management] || 0.88;
    const fm = methodMap[p.planting_method] || 0.88;

    let d_disaster = 0.0;
    if (p.disaster_type === "flood" && p.disaster_days > 2) {
      d_disaster = Math.min((p.disaster_days - 2) * 0.15, 1.0);
    } else if (p.disaster_type === "drought" && p.disaster_days > 7) {
      d_disaster = Math.min((p.disaster_days - 7) * 0.05, 0.8);
    }

    const current_yield = Math.min(y_genetic * p.f_soil * fw * ff * fm * (1.0 - d_disaster), y_genetic);
    const optimal_yield = Math.min(y_genetic * p.f_soil * 0.96 * 1.0 * 1.0, y_genetic);
    const oae_baseline = (p.water_system === "irrigated" || ["เมืองขอนแก่น", "น้ำพอง", "ชุมแพ", "หนองเรือ"].includes(p.amphoe_name)) ? 345.0 : 310.0;

    const total_prod_kg = current_yield * p.area_rai;
    const total_prod_tons = total_prod_kg / 1000.0;
    const price_per_ton = p.variety_id === "KDML105" ? 17000.0 : (p.variety_id === "RD6" ? 12500.0 : 8800.0);
    const cost_per_rai = 4926.01;
    const total_cost = cost_per_rai * p.area_rai;
    const gross_rev = total_prod_tons * price_per_ton;
    const net_profit = gross_rev - total_cost;

    const gap = p.target_yield_kg_rai - current_yield;
    const feasibility = Math.min(Math.max((current_yield / p.target_yield_kg_rai) * 100.0, 0), 100);

    const mockData = {
      results: {
        yield_kg_rai: Math.round(current_yield * 10) / 10,
        total_production_kg: Math.round(total_prod_kg * 10) / 10,
        total_production_tons: Math.round(total_prod_tons * 100) / 100,
        target_yield_kg_rai: p.target_yield_kg_rai,
        yield_gap_kg_rai: Math.round(gap * 10) / 10,
        feasibility_pct: Math.round(feasibility * 10) / 10,
        feasibility_label: feasibility >= 95 ? "บรรลุเป้าหมายได้อย่างมีประสิทธิภาพ" : (feasibility >= 80 ? "ใกล้เคียงเป้าหมาย (ปรับปุ๋ย/น้ำเพื่อแตะเป้า)" : "ต่ำกว่าเป้าหมาย (ต้องปรับการจัดการ)"),
        exceeds_genetic_ceiling: p.target_yield_kg_rai > y_genetic
      },
      scenarios: [
        { case_id: "case_1_oae", name_th: `สถิติจริง สศก. (อ.${p.amphoe_name})`, yield_kg_rai: oae_baseline, status_label: "สถิติเฉลี่ยเกษตรกรทั่วไป", diff_from_target_kg_rai: oae_baseline - p.target_yield_kg_rai },
        { case_id: "case_2_current", name_th: "ผลผลิตประเมินจากการจัดการของคุณ", yield_kg_rai: Math.round(current_yield * 10) / 10, status_label: "ตามปัจจัยที่เลือกปัจจุบัน", diff_from_target_kg_rai: Math.round(current_yield - p.target_yield_kg_rai) },
        { case_id: "case_3_ssnm", name_th: "ผลผลิตสูงสุดด้วยปุ๋ยสั่งตัด SSNM", yield_kg_rai: Math.round(optimal_yield * 10) / 10, status_label: "แนวทางปฏิบัติที่แนะนำ", diff_from_target_kg_rai: Math.round(optimal_yield - p.target_yield_kg_rai) },
        { case_id: "case_4_genetic", name_th: `เพดานพันธุกรรมสูงสุด (${spec.name_th})`, yield_kg_rai: y_genetic, status_label: "ขีดจำกัดชีวภาพสูงสุด", diff_from_target_kg_rai: Math.round(y_genetic - p.target_yield_kg_rai) }
      ],
      economics: {
        price_per_ton: price_per_ton,
        cost_per_rai: cost_per_rai,
        total_cost: Math.round(total_cost),
        gross_revenue: Math.round(gross_rev),
        net_profit: Math.round(net_profit),
        profit_per_rai: Math.round(net_profit / p.area_rai),
        roi_pct: Math.round((net_profit / total_cost) * 1000) / 10
      },
      ssnm_recommendations: {
        soil_type_detected: "ดินร่วนปนทราย (ชุดดินที่ 35)",
        steps: [
          { step: 1, stage: "ระยะรองพื้น (15-20 วัน)", formula: "16-16-8", rate_kg_rai: 25, purpose: "สร้างรากและเร่งแตกกอ" },
          { step: 2, stage: "ระยะแตกกอสูงสุด (30-40 วัน)", formula: "46-0-0 (ยูเรีย)", rate_kg_rai: 15, purpose: "เพิ่มจำนวนต้นต่อกอและใบรับแสง" },
          { step: 3, stage: "ระยะสร้างรวงอ่อน (ก่อนออกดอก 30 วัน)", formula: "0-0-60 หรือ 15-15-15", rate_kg_rai: 10, purpose: "บำรุงเมล็ด เพิ่มน้ำหนักรวง ลดเมล็ดลีบ" }
        ],
        amendment: { action: "ใส่ปุ๋ยคอก/ปุ๋ยหมัก 1,000 กก./ไร่ เพื่อปรับปรุงโครงสร้างดินทราย", yield_boost_kg_rai: 80 }
      }
    };

    this.renderOutput(mockData);
  },

  /* ---------------------------------------------------------------------- */
  /* แสดงผลใน ZONE 3: OUTPUT PANEL                                         */
  /* ---------------------------------------------------------------------- */
  renderOutput(data) {
    const res = data.results;
    const eco = data.economics;
    const scenarios = data.scenarios;
    const ssnm = data.ssnm_recommendations;

    // 1. สรุปผลผลิตและการเงิน (Highlight Card)
    const elYieldVal = document.getElementById("zDispYieldVal");
    const elTotalTons = document.getElementById("zDispTotalTons");
    const elProfitBadge = document.getElementById("zDispProfitBadge");
    const elGrossRev = document.getElementById("zDispGrossRev");
    const elTotalCost = document.getElementById("zDispTotalCost");

    if (elYieldVal) elYieldVal.innerText = res.yield_kg_rai.toLocaleString();
    if (elTotalTons) elTotalTons.innerText = `${res.total_production_tons} ตัน (${res.total_production_kg.toLocaleString()} กก.)`;
    
    if (elProfitBadge) {
      const isProfitable = eco.net_profit >= 0;
      elProfitBadge.className = `z-profit-badge ${isProfitable ? "badge-success" : "badge-danger"}`;
      elProfitBadge.style.background = isProfitable ? "#dcfce7" : "#fee2e2";
      elProfitBadge.style.color = isProfitable ? "#14532d" : "#991b1b";
      elProfitBadge.innerHTML = `<i class="fa-solid ${isProfitable ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i> กำไรสุทธิ: ${eco.net_profit > 0 ? '+' : ''}${eco.net_profit.toLocaleString()} บาท (กำไร ${eco.profit_per_rai.toLocaleString()} บ./ไร่)`;
    }

    if (elGrossRev) elGrossRev.innerText = `${eco.gross_revenue.toLocaleString()} บาท`;
    if (elTotalCost) elTotalCost.innerText = `${eco.total_cost.toLocaleString()} บาท`;

    // 2. แถบวัดความเป็นไปได้ & Yield Gap (Feasibility Gauge)
    const elFeasProgress = document.getElementById("zDispFeasProgress");
    const elFeasPct = document.getElementById("zDispFeasPct");
    const elFeasLabel = document.getElementById("zDispFeasLabel");
    const elGapText = document.getElementById("zDispGapText");

    if (elFeasProgress) elFeasProgress.style.width = `${res.feasibility_pct}%`;
    if (elFeasPct) elFeasPct.innerText = `${res.feasibility_pct}%`;
    if (elFeasLabel) {
      elFeasLabel.innerText = res.feasibility_label;
      elFeasLabel.style.color = res.feasibility_pct >= 90 ? "#15803d" : (res.feasibility_pct >= 75 ? "#b45309" : "#b91c1c");
    }
    if (elGapText) {
      if (res.exceeds_genetic_ceiling) {
        elGapText.innerHTML = `⚠️ เป้าหมาย ${res.target_yield_kg_rai} กก./ไร่ <strong>เกินเพดานพันธุกรรมสูงสุด</strong> ของพันธุ์นี้`;
        elGapText.style.color = "#b91c1c";
      } else if (res.yield_gap_kg_rai > 0) {
        elGapText.innerHTML = `ขาดอีก <strong>${res.yield_gap_kg_rai} กก./ไร่</strong> จะบรรลุเป้าหมาย ${res.target_yield_kg_rai} กก./ไร่`;
        elGapText.style.color = "#b45309";
      } else {
        elGapText.innerHTML = `🎉 <strong>บรรลุเป้าหมายแล้ว!</strong> เกินเป้าหมาย ${Math.abs(res.yield_gap_kg_rai)} กก./ไร่`;
        elGapText.style.color = "#15803d";
      }
    }

    // 3. ตารางเปรียบเทียบ 4 กรณี (4 Scenarios Comparison)
    const tableBody = document.getElementById("zTableScenariosBody");
    if (tableBody && scenarios) {
      tableBody.innerHTML = scenarios.map((c) => {
        const isCurrent = c.case_id === "case_2_current";
        const diffText = c.diff_from_target_kg_rai > 0 ? `+${c.diff_from_target_kg_rai}` : `${c.diff_from_target_kg_rai}`;
        const diffColor = c.diff_from_target_kg_rai >= 0 ? "#15803d" : "#b45309";
        return `
          <tr class="${isCurrent ? 'highlight' : ''}">
            <td>
              <div style="font-weight:700;">${c.name_th}</div>
              <div style="font-size:11px; color:#64748b;">${c.status_label}</div>
            </td>
            <td style="font-size:13px; font-weight:700;">${c.yield_kg_rai.toLocaleString()} กก./ไร่</td>
            <td style="font-weight:600; color:${diffColor};">${diffText} กก.</td>
          </tr>
        `;
      }).join("");
    }

    // 4. แผนปุ๋ยสั่งตัด SSNM 3 ระยะ (SSNM Checklist)
    const ssnmBox = document.getElementById("zDispSsnmSteps");
    if (ssnmBox && ssnm && ssnm.steps) {
      ssnmBox.innerHTML = ssnm.steps.map((s) => `
        <div class="z-ssnm-step">
          <div class="z-step-pill">${s.step}</div>
          <div style="flex:1;">
            <div style="font-size:12px; font-weight:700; color:#0f172a;">${s.stage}</div>
            <div style="font-size:12px; color:#15803d; font-weight:600; margin:2px 0;">
              สูตรปุ๋ย: <strong>${s.formula}</strong> (อัตรา ${s.rate_kg_rai} กก./ไร่)
            </div>
            <div style="font-size:11px; color:#64748b;">${s.purpose}</div>
          </div>
        </div>
      `).join("");

      if (ssnm.amendment) {
        ssnmBox.innerHTML += `
          <div style="margin-top:8px; padding:8px 10px; background:#fef3c7; border-radius:6px; font-size:11px; color:#78350f;">
            <strong>💡 คำแนะนำปรับปรุงดิน:</strong> ${ssnm.amendment.action} (ช่วยเพิ่มผลผลิตได้อีก ~${ssnm.amendment.yield_boost_kg_rai} กก./ไร่)
          </div>
        `;
      }
    }
  }
};

// เริ่มต้นระบบเมื่อโหลดหน้าเว็บเรียบร้อย
document.addEventListener("DOMContentLoaded", () => {
  SandboxController.init();
});
