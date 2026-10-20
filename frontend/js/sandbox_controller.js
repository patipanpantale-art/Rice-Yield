/**
 * SandboxController - ควบคุมการทำงานของระบบ 3 ส่วน (Input - Map - Output)
 * ขั้นตอน: (1) วาดแปลง → (2) ตั้งค่า → (3) ดูผล
 */
const SandboxController = {
  backendUrl: "http://localhost:8000",
  backendOnline: false,

  // สถานะแปลงที่เลือก
  currentPolygon: null,
  currentLayer: null,
  currentAreaRai: 0,
  currentSqMeters: 0,
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
    "KDML105": { name_th: "ขาวดอกมะลิ 105", ceiling: 550, price_per_ton: 17000.0 },
    "RD6": { name_th: "กข6", ceiling: 800, price_per_ton: 12500.0 },
    "RD43": { name_th: "กข43", ceiling: 700, price_per_ton: 8800.0 }
  },

  // สีแปลงตามระดับความเหมาะสมของดิน
  suitabilityColors: {
    S1: { stroke: "#15803d", fill: "#22c55e", label: "เหมาะสมมาก" },
    S2: { stroke: "#65a30d", fill: "#a3e635", label: "เหมาะสมปานกลาง" },
    S3: { stroke: "#d97706", fill: "#fbbf24", label: "เหมาะสมน้อย" },
    N: { stroke: "#dc2626", fill: "#f87171", label: "ไม่เหมาะสม" }
  },

  // ค่าปัจจัยและส่วนปรับต้นทุน (ตรงกับ backend/services/yield_engine.py และสมการที่ 2 ในเล่ม)
  waterMap: { irrigated: 1.0, rainfed_pond: 0.88, pure_rainfed: 0.72 },
  fertMap: { ssnm_3split: 1.0, standard_2split: 0.88, farmer_habit: 0.75, none: 0.58 },
  methodMap: { transplanting: 1.0, wet_broadcast: 0.94, dry_broadcast: 0.88 },
  fertCostAdd: { ssnm_3split: 350.0, standard_2split: 0.0, farmer_habit: -200.0, none: -800.0 },
  methodCostAdd: { transplanting: 300.0, wet_broadcast: 0.0, dry_broadcast: -200.0 },
  baseCostPerRai: 4926.01,

  async init() {
    console.log("[SandboxController] เริ่มต้นระบบ 3-Zone Khon Kaen Sandbox");
    this.initMap();
    this.captureDefaults();
    this.bindInputs();
    this.bindDrawTools();
    this.bindStepper();
    this.updateAccordionSummaries();
    this.setStep(1);
    await this.checkBackend();
    this.loadAmphoesGeoJSON();
  },

  /* ---------------------------------------------------------------------- */
  /* ตัวช่วยจัดรูปแบบตัวเลข                                                  */
  /* ---------------------------------------------------------------------- */
  fmt1(n) {
    return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },
  fmt0(n) {
    return Math.round(Number(n)).toLocaleString("th-TH");
  },
  fmtF(n) {
    return Number(n).toFixed(2);
  },
  signed(n, digits = 1) {
    const v = Number(n);
    const s = digits === 0 ? this.fmt0(Math.abs(v)) : this.fmt1(Math.abs(v));
    return `${v >= 0 ? "+" : "−"}${s}`;
  },

  /* ---------------------------------------------------------------------- */
  /* สถานะเซิร์ฟเวอร์ (จุดสี + tooltip)                                       */
  /* ---------------------------------------------------------------------- */
  async checkBackend() {
    const badge = document.getElementById("zBackendStatus");
    try {
      const res = await fetch(`${this.backendUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        this.backendOnline = true;
        if (badge) {
          badge.className = "z-status online";
          badge.dataset.tip = "เชื่อมต่อเซิร์ฟเวอร์แล้ว · ตรวจดินและการใช้ที่ดินจากข้อมูล LDD";
        }
        return;
      }
    } catch (e) {
      console.warn("[SandboxController] Backend ออฟไลน์ ใช้การคำนวณในเบราว์เซอร์");
    }
    this.backendOnline = false;
    if (badge) {
      badge.className = "z-status offline";
      badge.dataset.tip = "คำนวณในเบราว์เซอร์ · ใช้ค่าดินเริ่มต้น (กลุ่มดิน 35, S3)";
    }
  },

  /* ---------------------------------------------------------------------- */
  /* แถบขั้นตอน 1-2-3                                                        */
  /* ---------------------------------------------------------------------- */
  bindStepper() {
    document.querySelectorAll("#zStepper .z-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = btn.dataset.step;
        if (step === "1") {
          const btnPoly = document.getElementById("zToolDrawPoly");
          if (btnPoly && !this.currentPolygon) this.startDrawMode("polygon", btnPoly);
        } else if (step === "2") {
          const panel = document.getElementById("zoneInput");
          if (panel) panel.scrollTo({ top: 0, behavior: "smooth" });
        } else if (step === "3") {
          const panel = document.getElementById("zoneOutput");
          if (panel) panel.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  },

  // step 1 = ยังไม่มีแปลง, step 3 = มีแปลงและแสดงผลแล้ว
  setStep(n) {
    document.querySelectorAll("#zStepper .z-step").forEach((btn) => {
      const s = parseInt(btn.dataset.step, 10);
      btn.classList.remove("current", "done");
      if (n === 1) {
        if (s === 1) btn.classList.add("current");
      } else {
        if (s === 1) btn.classList.add("done");
        if (s === 2) btn.classList.add("done");
        if (s === 3) btn.classList.add("current");
      }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* แผนที่และเลเยอร์ 26 อำเภอ                                                */
  /* ---------------------------------------------------------------------- */
  initMap() {
    if (!window.L) {
      console.error("[SandboxController] ไม่พบไลบรารี Leaflet");
      return;
    }

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

    // ค่าเริ่มต้น: ภาพดาวเทียม
    this.baseMaps = {
      satellite: L.layerGroup([satTile, labelTile]),
      street: streetTile
    };

    this.map = L.map("map", {
      center: [16.4322, 102.8236],
      zoom: 10,
      minZoom: 8,
      maxZoom: 18,
      layers: [this.baseMaps.satellite],
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
        layer.bindTooltip(`<b>อ.${name}</b>`, { sticky: true, className: "amphoe-tooltip" });
        layer.on("click", () => {
          if (this.activeDrawHandler) return; // กำลังวาด ไม่ต้องซูม
          this.map.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 13 });
          if (this.currentPolygon) {
            this.currentAmphoe = name;
            this.updateAmphoeBadge(name);
            this.runSimulation();
          }
        });
      }
    });
    this.map.addLayer(this.amphoeLayer);
  },

  async loadAmphoesGeoJSON() {
    try {
      const res = await fetch("data/khon_kaen_amphoes.geojson");
      if (res.ok) {
        this.amphoesGeoJSON = await res.json();
        this.amphoeLayer.addData(this.amphoesGeoJSON);
      }
    } catch (e) {
      console.warn("[SandboxController] โหลด khon_kaen_amphoes.geojson ไม่สำเร็จ:", e);
    }
  },

  /* ---------------------------------------------------------------------- */
  /* เครื่องมือวาดแปลง                                                        */
  /* ---------------------------------------------------------------------- */
  bindDrawTools() {
    const btnPoly = document.getElementById("zToolDrawPoly");
    const btnRect = document.getElementById("zToolDrawRect");
    const btnClear = document.getElementById("zToolClear");
    const btnFocus = document.getElementById("zToolFocus");
    const btnLayerSat = document.getElementById("zToolLayerSat");
    const btnLayerStreet = document.getElementById("zToolLayerStreet");
    const guideClose = document.getElementById("zMapGuideClose");

    if (btnPoly) btnPoly.addEventListener("click", () => this.startDrawMode("polygon", btnPoly));
    if (btnRect) btnRect.addEventListener("click", () => this.startDrawMode("rectangle", btnRect));
    if (btnClear) btnClear.addEventListener("click", () => this.clearPlot());
    if (btnFocus) btnFocus.addEventListener("click", () => this.map.setView([16.4322, 102.8236], 10));
    if (guideClose) guideClose.addEventListener("click", () => this.showGuide(false));

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

    this.map.on(L.Draw.Event.CREATED, (e) => {
      this.drawnItems.clearLayers();
      const layer = e.layer;
      this.drawnItems.addLayer(layer);
      this.currentLayer = layer;
      this.currentPolygon = layer.toGeoJSON().geometry;
      this.stopDrawMode();
      this.showGuide(false);
      this.handleDrawnPolygon(layer);
    });
  },

  startDrawMode(mode, triggerBtn) {
    this.stopDrawMode();
    triggerBtn.classList.add("active");
    const shapeOptions = { color: "#16a34a", weight: 3, fillColor: "#22c55e", fillOpacity: 0.35 };
    if (mode === "polygon") {
      this.activeDrawHandler = new L.Draw.Polygon(this.map, { shapeOptions });
    } else {
      this.activeDrawHandler = new L.Draw.Rectangle(this.map, { shapeOptions });
    }
    this.activeDrawHandler.enable();
  },

  stopDrawMode() {
    if (this.activeDrawHandler) {
      this.activeDrawHandler.disable();
      this.activeDrawHandler = null;
    }
    ["zToolDrawPoly", "zToolDrawRect"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.classList.remove("active");
    });
  },

  clearPlot() {
    this.stopDrawMode();
    this.drawnItems.clearLayers();
    this.currentPolygon = null;
    this.currentLayer = null;
    this.currentAreaRai = 0;
    this.currentSqMeters = 0;
    this.updatePaddyInfoUI(null);
    this.showResults(false);
    this.showGuide(true);
    this.setStep(1);
  },

  showGuide(visible) {
    const guide = document.getElementById("zMapGuide");
    if (guide) guide.hidden = !visible;
  },

  showResults(visible) {
    const empty = document.getElementById("zOutputEmpty");
    const results = document.getElementById("zOutputResults");
    const legend = document.getElementById("zSoilLegend");
    if (empty) empty.hidden = visible;
    if (results) results.hidden = !visible;
    if (legend) legend.hidden = !visible;
  },

  async handleDrawnPolygon(layer) {
    const geojson = layer.toGeoJSON();

    // 1. คำนวณขนาดพื้นที่ด้วย Turf.js
    let sqMeters = 0;
    if (window.turf) sqMeters = turf.area(geojson);
    this.currentSqMeters = sqMeters;
    this.currentAreaRai = Math.max(0.01, Math.round((sqMeters / 1600.0) * 100) / 100);

    // 2. ตรวจอำเภอ ดิน และการใช้ที่ดิน
    if (this.backendOnline) {
      try {
        const res = await fetch(`${this.backendUrl}/api/khon-kaen/inspect-polygon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geojson.geometry })
        });
        const json = await res.json();
        if (json.success) {
          if (json.amphoe && json.amphoe.amphoe_th) this.currentAmphoe = json.amphoe.amphoe_th;
          if (json.soil) {
            this.currentSoilGroup = json.soil.soil_group_number || "35";
            this.currentFSoil = json.soil.f_soil || 0.85;
            this.currentSuitability = json.soil.suitability_level || "S3";
          }
          if (json.landuse) this.currentLandUse = json.landuse;
        }
      } catch (err) {
        console.warn("[SandboxController] ตรวจสอบแปลงเชิงพื้นที่ไม่สำเร็จ:", err);
      }
    } else if (this.amphoesGeoJSON && window.turf) {
      const centroid = turf.centroid(geojson);
      for (const feat of this.amphoesGeoJSON.features) {
        if (turf.booleanPointInPolygon(centroid, feat)) {
          this.currentAmphoe = feat.properties.AMP_NAME || feat.properties.AMPHOE_T;
          break;
        }
      }
    }

    this.stylePlot(layer);
    this.updatePaddyInfoUI(sqMeters);
    this.runSimulation();
  },

  // แปลง ตร.ม. เป็นข้อความ ไร่-งาน-วา
  areaText(sqMeters) {
    const totalWah = sqMeters / 4.0;
    const rai = Math.floor(totalWah / 400);
    const ngan = Math.floor((totalWah % 400) / 100);
    const wah = Math.round(totalWah % 100);
    return `${rai} ไร่ ${ngan} งาน ${wah} วา`;
  },

  // ระบายสีแปลงตามความเหมาะสมของดิน และติดป้ายพื้นที่บนแปลง
  stylePlot(layer) {
    const lvl = (this.currentSuitability || "S3").toUpperCase();
    const c = this.suitabilityColors[lvl] || this.suitabilityColors.S3;
    layer.setStyle({ color: c.stroke, weight: 3, fillColor: c.fill, fillOpacity: 0.4 });
    layer.unbindTooltip();
    layer.bindTooltip(
      `<div class="z-plot-label-area">${this.areaText(this.currentSqMeters)}</div>` +
      `<div class="z-plot-label-soil" style="color:${c.stroke}">ดิน ${lvl} · ${c.label}</div>`,
      { permanent: true, direction: "center", className: "z-plot-label" }
    ).openTooltip();
  },

  updatePaddyInfoUI(sqMeters) {
    const empty = document.getElementById("zPlotEmpty");
    const info = document.getElementById("zPlotInfo");
    if (!sqMeters) {
      if (empty) empty.hidden = false;
      if (info) info.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (info) info.hidden = false;

    const elArea = document.getElementById("zDispArea");
    const elAmphoe = document.getElementById("zDispAmphoe");
    const elSoil = document.getElementById("zDispSoil");
    const elLandUse = document.getElementById("zDispLandUse");
    const lvl = (this.currentSuitability || "S3").toUpperCase();
    const c = this.suitabilityColors[lvl] || this.suitabilityColors.S3;

    if (elArea) elArea.innerHTML = `${this.areaText(sqMeters)} <span class="z-muted">(${this.fmt1(this.currentAreaRai)} ไร่)</span>`;
    if (elAmphoe) elAmphoe.innerText = `อ.${this.currentAmphoe}`;
    if (elSoil) {
      elSoil.innerHTML = `<span class="z-tag" style="background:${c.fill}33; color:${c.stroke};">กลุ่มที่ ${this.currentSoilGroup} · ${lvl}</span>`;
    }
    if (elLandUse) {
      elLandUse.innerHTML = this.currentLandUse.is_rice
        ? `<span class="z-tag" style="background:#dcfce7; color:#14532d;">✓ นาข้าว (${this.currentLandUse.lu_code})</span>`
        : `<span class="z-tag" style="background:#fee2e2; color:#991b1b;">⚠ ไม่ใช่นาข้าว (${this.currentLandUse.lu_name_th})</span>`;
    }
  },

  updateAmphoeBadge(name) {
    const elAmphoe = document.getElementById("zDispAmphoe");
    if (elAmphoe) elAmphoe.innerText = `อ.${name}`;
  },

  /* ---------------------------------------------------------------------- */
  /* Input Controls ทางซ้าย                                                  */
  /* ---------------------------------------------------------------------- */
  captureDefaults() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    const radio = (name) => { const el = document.querySelector(`input[name='${name}']:checked`); return el ? el.value : null; };
    this.defaults = {
      variety: val("zInputVariety"),
      target: val("zNumTarget"),
      water: radio("zWater"),
      fert: radio("zFert"),
      method: radio("zMethod"),
      disasterType: val("zInputDisasterType"),
      disasterDays: val("zSliderDisasterDays"),
      disasterStage: val("zInputDisasterStage")
    };
  },

  resetInputs() {
    const d = this.defaults;
    if (!d) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set("zInputVariety", d.variety);
    set("zNumTarget", d.target);
    set("zSliderTarget", d.target);
    set("zInputDisasterType", d.disasterType);
    set("zSliderDisasterDays", d.disasterDays);
    set("zInputDisasterStage", d.disasterStage);
    const days = document.getElementById("zNumDisasterDays");
    if (days) days.innerText = `${d.disasterDays} วัน`;
    [["zWater", d.water], ["zFert", d.fert], ["zMethod", d.method]].forEach(([name, v]) => {
      document.querySelectorAll(`input[name='${name}']`).forEach((r) => {
        r.checked = r.value === v;
        r.closest(".z-radio-card").classList.toggle("active", r.checked);
      });
    });
    this.updateCeiling();
    this.onInputChanged();
  },

  updateCeiling() {
    const sel = document.getElementById("zInputVariety");
    const spec = this.varieties[sel ? sel.value : "KDML105"] || this.varieties.KDML105;
    const ceilingEl = document.getElementById("zDispCeiling");
    if (ceilingEl) ceilingEl.innerText = `${spec.ceiling} กก./ไร่`;
  },

  // ข้อความสรุปที่หัวแต่ละหมวด (เห็นค่าที่เลือกโดยไม่ต้องกางออก)
  updateAccordionSummaries() {
    const shortOf = (name) => {
      const r = document.querySelector(`input[name='${name}']:checked`);
      if (!r) return "-";
      const t = r.closest(".z-radio-card").querySelector(".z-radio-title");
      return t ? (t.dataset.short || t.innerText) : "-";
    };
    const sel = document.getElementById("zInputVariety");
    const spec = this.varieties[sel ? sel.value : "KDML105"] || this.varieties.KDML105;
    const target = document.getElementById("zNumTarget");
    const setText = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };

    setText("zAccVariety", `${spec.name_th} · เป้า ${target ? target.value : "-"}`);
    setText("zAccWater", shortOf("zWater"));
    setText("zAccFert", shortOf("zFert"));
    setText("zAccMethod", shortOf("zMethod"));

    const type = document.getElementById("zInputDisasterType");
    const days = document.getElementById("zSliderDisasterDays");
    if (!type || type.value === "none") {
      setText("zAccDisaster", "ไม่มี");
    } else {
      const name = type.value === "flood" ? "น้ำท่วม" : "ฝนทิ้งช่วง";
      setText("zAccDisaster", `${name} ${days ? days.value : 0} วัน`);
    }
  },

  onInputChanged() {
    this.updateAccordionSummaries();
    if (this.currentPolygon) this.runSimulation();
  },

  bindInputs() {
    const selVariety = document.getElementById("zInputVariety");
    const sliderTarget = document.getElementById("zSliderTarget");
    const numTarget = document.getElementById("zNumTarget");
    const btnReset = document.getElementById("zBtnReset");

    if (selVariety) {
      selVariety.addEventListener("change", () => {
        this.updateCeiling();
        this.onInputChanged();
      });
    }

    if (sliderTarget && numTarget) {
      sliderTarget.addEventListener("input", (e) => {
        numTarget.value = e.target.value;
        this.onInputChanged();
      });
      numTarget.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        if (!v || v <= 0) return; // รอให้พิมพ์ครบก่อน
        sliderTarget.value = e.target.value;
        this.onInputChanged();
      });
    }

    ["zWater", "zFert", "zMethod"].forEach((name) => {
      document.querySelectorAll(`input[name='${name}']`).forEach((r) => {
        r.addEventListener("change", () => {
          document.querySelectorAll(`input[name='${name}']`).forEach((el) => el.closest(".z-radio-card").classList.remove("active"));
          r.closest(".z-radio-card").classList.add("active");
          this.onInputChanged();
        });
      });
    });

    const selDisaster = document.getElementById("zInputDisasterType");
    const sliderDisasterDays = document.getElementById("zSliderDisasterDays");
    const numDisasterDays = document.getElementById("zNumDisasterDays");
    const selDisasterStage = document.getElementById("zInputDisasterStage");

    if (selDisaster) selDisaster.addEventListener("change", () => this.onInputChanged());
    if (sliderDisasterDays && numDisasterDays) {
      sliderDisasterDays.addEventListener("input", (e) => {
        numDisasterDays.innerText = `${e.target.value} วัน`;
        this.onInputChanged();
      });
    }
    if (selDisasterStage) selDisasterStage.addEventListener("change", () => this.onInputChanged());

    if (btnReset) btnReset.addEventListener("click", () => this.resetInputs());
  },

  /* ---------------------------------------------------------------------- */
  /* คำนวณและประมวลผล                                                        */
  /* ---------------------------------------------------------------------- */
  async runSimulation() {
    if (!this.currentPolygon) return;

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
      target_yield_kg_rai: parseFloat(numTarget ? numTarget.value : 450) || 450,
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
          this.renderOutput(json, payload);
          return;
        }
      } catch (err) {
        console.warn("[SandboxController] Simulation API ขัดข้อง ใช้การคำนวณในเบราว์เซอร์:", err);
      }
    }

    this.runClientSimulation(payload);
  },

  runClientSimulation(p) {
    const spec = this.varieties[p.variety_id] || this.varieties.KDML105;
    const y_genetic = spec.ceiling;

    const fw = this.waterMap[p.water_system] ?? 0.88;
    const ff = this.fertMap[p.fertilizer_management] ?? 0.88;
    const fm = this.methodMap[p.planting_method] ?? 0.88;

    let d_disaster = 0.0;
    if (p.disaster_type === "flood" && p.disaster_days > 2) {
      d_disaster = Math.min((p.disaster_days - 2) * 0.15, 1.0);
    } else if (p.disaster_type === "drought" && p.disaster_days > 7) {
      d_disaster = Math.min((p.disaster_days - 7) * 0.05, 0.8);
    }

    const current_yield = Math.min(y_genetic * p.f_soil * fw * ff * fm * (1.0 - d_disaster), y_genetic);
    const optimal_water = p.water_system === "irrigated" ? 1.0 : 0.95;
    const optimal_yield = Math.min(y_genetic * p.f_soil * optimal_water, y_genetic);
    const oae_baseline = (p.water_system === "irrigated" || ["เมืองขอนแก่น", "น้ำพอง", "ชุมแพ", "หนองเรือ"].includes(p.amphoe_name)) ? 345.0 : 310.0;

    const total_prod_kg = current_yield * p.area_rai;
    const total_prod_tons = total_prod_kg / 1000.0;
    const price_per_ton = spec.price_per_ton;
    const cost_per_rai = this.baseCostPerRai
      + (this.fertCostAdd[p.fertilizer_management] ?? 0)
      + (this.methodCostAdd[p.planting_method] ?? 0);
    const total_cost = cost_per_rai * p.area_rai;
    const gross_rev = total_prod_tons * price_per_ton;
    const net_profit = gross_rev - total_cost;

    const gap = p.target_yield_kg_rai - current_yield;
    const feasibility = Math.min(Math.max((current_yield / p.target_yield_kg_rai) * 100.0, 0), 100);
    const exceeds = p.target_yield_kg_rai > y_genetic;

    const data = {
      inputs: {
        variety: { name_th: spec.name_th, genetic_yield_potential_max_kg_rai: y_genetic },
        f_soil: p.f_soil,
        water_system: { f_water: fw },
        fertilizer_management: { f_fert: ff },
        planting_method: { f_method: fm },
        disaster: { type: p.disaster_type, days: p.disaster_days, damage_rate_pct: Math.round(d_disaster * 1000) / 10 }
      },
      results: {
        yield_kg_rai: Math.round(current_yield * 10) / 10,
        total_production_kg: Math.round(total_prod_kg * 10) / 10,
        total_production_tons: Math.round(total_prod_tons * 100) / 100,
        target_yield_kg_rai: p.target_yield_kg_rai,
        yield_gap_kg_rai: Math.round(gap * 10) / 10,
        feasibility_pct: Math.round(feasibility * 10) / 10,
        feasibility_label: exceeds
          ? `เป้าหมายเกินผลผลิตสูงสุดของ ${spec.name_th}`
          : (feasibility >= 95 ? "บรรลุเป้าหมายได้" : (feasibility >= 80 ? "ใกล้เคียงเป้าหมาย" : "ต่ำกว่าเป้าหมาย")),
        exceeds_genetic_ceiling: exceeds
      },
      scenarios: [
        { case_id: "case_1_oae", name_th: `สถิติจริง สศก. (อ.${p.amphoe_name})`, yield_kg_rai: oae_baseline, status_label: "ค่าเฉลี่ยเกษตรกรทั่วไป", diff_from_target_kg_rai: oae_baseline - p.target_yield_kg_rai },
        { case_id: "case_2_current", name_th: "การจัดการของคุณ", yield_kg_rai: Math.round(current_yield * 10) / 10, status_label: "ตามตัวเลือกปัจจุบัน", diff_from_target_kg_rai: Math.round((current_yield - p.target_yield_kg_rai) * 10) / 10 },
        { case_id: "case_3_ssnm", name_th: "ปรับเป็นปุ๋ย SSNM", yield_kg_rai: Math.round(optimal_yield * 10) / 10, status_label: "แนวทางที่แนะนำ", diff_from_target_kg_rai: Math.round((optimal_yield - p.target_yield_kg_rai) * 10) / 10 },
        { case_id: "case_4_genetic", name_th: `ผลผลิตสูงสุดของพันธุ์ (${spec.name_th})`, yield_kg_rai: y_genetic, status_label: "ขีดจำกัดของพันธุ์", diff_from_target_kg_rai: y_genetic - p.target_yield_kg_rai }
      ],
      economics: {
        price_per_ton: price_per_ton,
        cost_per_rai: Math.round(cost_per_rai * 10) / 10,
        total_cost: Math.round(total_cost),
        gross_revenue: Math.round(gross_rev),
        net_profit: Math.round(net_profit),
        profit_per_rai: Math.round(net_profit / p.area_rai),
        roi_pct: Math.round((net_profit / total_cost) * 1000) / 10
      },
      ssnm_recommendations: {
        steps: [
          { step: 1, stage: "ระยะรองพื้น (15-20 วัน)", formula: "16-16-8", rate_kg_rai: 25, purpose: "สร้างรากและเร่งแตกกอ" },
          { step: 2, stage: "ระยะแตกกอสูงสุด (30-40 วัน)", formula: "46-0-0 (ยูเรีย)", rate_kg_rai: 15, purpose: "เพิ่มจำนวนต้นต่อกอและใบรับแสง" },
          { step: 3, stage: "ระยะสร้างรวงอ่อน (ก่อนออกดอก 30 วัน)", formula: "0-0-60 หรือ 15-15-15", rate_kg_rai: 10, purpose: "บำรุงเมล็ด เพิ่มน้ำหนักรวง ลดเมล็ดลีบ" }
        ],
        amendment: { action: "ใส่ปุ๋ยคอก/ปุ๋ยหมัก 1,000 กก./ไร่ เพื่อปรับโครงสร้างดินทราย", yield_boost_kg_rai: 80 }
      }
    };

    this.renderOutput(data, p);
  },

  /* ---------------------------------------------------------------------- */
  /* แสดงผลใน ZONE 3                                                        */
  /* ---------------------------------------------------------------------- */
  renderOutput(data, payload) {
    const res = data.results;
    const eco = data.economics;
    const scenarios = data.scenarios || [];
    const ssnm = data.ssnm_recommendations;

    this.showResults(true);
    this.setStep(3);

    // (1) ผลผลิตคาดการณ์
    this.setText("zDispYieldVal", this.fmt1(res.yield_kg_rai));
    this.setText("zDispTotalTons", `ทั้งแปลง ${this.fmt1(this.currentAreaRai)} ไร่ ≈ ${res.total_production_tons.toLocaleString("th-TH")} ตัน (${this.fmt0(res.total_production_kg)} กก.)`);
    this.renderBreakdown(data, payload, res.yield_kg_rai);

    // (2) เทียบเป้าหมายและช่องว่างผลผลิต
    // ป้ายสถานะอิงช่องว่างผลผลิต เพื่อให้ตรงกับข้อความด้านล่างเสมอ
    const feas = res.feasibility_pct;
    const reached = res.yield_gap_kg_rai <= 0;
    let feasLabel, feasColor;
    if (res.exceeds_genetic_ceiling) { feasLabel = "เป้าหมายสูงเกินพันธุ์นี้"; feasColor = "#b91c1c"; }
    else if (reached) { feasLabel = "บรรลุเป้าหมาย"; feasColor = "#15803d"; }
    else if (feas >= 80) { feasLabel = "ใกล้เคียงเป้าหมาย"; feasColor = "#b45309"; }
    else { feasLabel = "ต่ำกว่าเป้าหมาย (ควรปรับการจัดการ)"; feasColor = "#b91c1c"; }
    const elFeasProgress = document.getElementById("zDispFeasProgress");
    if (elFeasProgress) {
      elFeasProgress.style.width = `${feas}%`;
      elFeasProgress.style.background = feasColor;
    }
    const elFeasPct = document.getElementById("zDispFeasPct");
    if (elFeasPct) { elFeasPct.innerText = `${this.fmt1(feas)}%`; elFeasPct.style.color = feasColor; }
    const elFeasLabel = document.getElementById("zDispFeasLabel");
    if (elFeasLabel) { elFeasLabel.innerText = feasLabel; elFeasLabel.style.color = feasColor; }

    const elGapText = document.getElementById("zDispGapText");
    if (elGapText) {
      if (res.exceeds_genetic_ceiling) {
        elGapText.innerHTML = `⚠ เป้าหมาย ${this.fmt0(res.target_yield_kg_rai)} กก./ไร่ <strong>สูงกว่าผลผลิตสูงสุดของพันธุ์นี้</strong> ลองลดเป้าหรือเปลี่ยนพันธุ์`;
        elGapText.style.color = "#b91c1c";
      } else if (res.yield_gap_kg_rai > 0) {
        elGapText.innerHTML = `ช่องว่างผลผลิต: ขาดอีก <strong>${this.fmt1(res.yield_gap_kg_rai)} กก./ไร่</strong> จากเป้า ${this.fmt0(res.target_yield_kg_rai)} กก./ไร่`;
        elGapText.style.color = "#b45309";
      } else {
        elGapText.innerHTML = `✓ <strong>ถึงเป้าแล้ว</strong> เกินเป้า ${this.fmt1(Math.abs(res.yield_gap_kg_rai))} กก./ไร่`;
        elGapText.style.color = "#15803d";
      }
    }

    // (3) ตาราง 4 ฉากทัศน์ พร้อมแถบกราฟ
    this.renderScenarios(scenarios, res.target_yield_kg_rai);

    // (4) เศรษฐศาสตร์
    this.renderEconomics(eco, res.yield_kg_rai);

    // (5) แผนปุ๋ย SSNM
    const ssnmBox = document.getElementById("zDispSsnmSteps");
    if (ssnmBox && ssnm && ssnm.steps) {
      let html = ssnm.steps.map((s) => `
        <div class="z-ssnm-step">
          <div class="z-step-pill">${s.step}</div>
          <div style="flex:1;">
            <div style="font-size:12px; font-weight:700; color:#0f172a;">${s.stage}</div>
            <div style="font-size:12px; color:#15803d; font-weight:600; margin:2px 0;">
              ${s.formula} · ${s.rate_kg_rai} กก./ไร่
            </div>
            <div style="font-size:11px; color:#64748b;">${s.purpose}</div>
          </div>
        </div>
      `).join("");
      if (ssnm.amendment) {
        html += `
          <div class="z-note">
            <strong>💡 ปรับปรุงดิน:</strong> ${ssnm.amendment.action} (เพิ่มได้อีกราว ${ssnm.amendment.yield_boost_kg_rai} กก./ไร่)
          </div>`;
      }
      ssnmBox.innerHTML = html;
    }
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  },

  // แถบแจกแจงตัวคูณ: Y_genetic × F_soil × F_water × F_fert × F_method × (1 − D) = Y
  renderBreakdown(data, payload, yieldVal) {
    const box = document.getElementById("zDispBreakdown");
    if (!box) return;
    const inp = data.inputs || {};
    const spec = this.varieties[payload.variety_id] || this.varieties.KDML105;
    const yg = (inp.variety && inp.variety.genetic_yield_potential_max_kg_rai) || spec.ceiling;
    const fs = inp.f_soil ?? payload.f_soil;
    const fw = (inp.water_system && inp.water_system.f_water) ?? this.waterMap[payload.water_system];
    const ff = (inp.fertilizer_management && inp.fertilizer_management.f_fert) ?? this.fertMap[payload.fertilizer_management];
    const fm = (inp.planting_method && inp.planting_method.f_method) ?? this.methodMap[payload.planting_method];
    const dPct = (inp.disaster && inp.disaster.damage_rate_pct) || 0;

    const chip = (label, value, isFactor) => {
      const low = isFactor && Number(value) < 1;
      return `<span class="z-chip ${low ? "low" : ""}"><small>${label}</small>${value}</span>`;
    };
    const parts = [
      chip("พันธุ์", this.fmt0(yg), false),
      "×", chip("ดิน", this.fmtF(fs), true),
      "×", chip("น้ำ", this.fmtF(fw), true),
      "×", chip("ปุ๋ย", this.fmtF(ff), true),
      "×", chip("วิธีปลูก", this.fmtF(fm), true)
    ];
    if (dPct > 0) parts.push("×", chip("ภัย", this.fmtF(1 - dPct / 100), true));
    parts.push("=", `<span class="z-chip result"><small>ผลผลิต</small>${this.fmt1(yieldVal)}</span>`);
    box.innerHTML = parts.map((p) => (p.length === 1 ? `<span class="z-op">${p}</span>` : p)).join("");
  },

  renderScenarios(scenarios, target) {
    const tableBody = document.getElementById("zTableScenariosBody");
    if (!tableBody) return;
    const maxVal = Math.max(target, ...scenarios.map((c) => c.yield_kg_rai)) * 1.08;
    const targetPct = (target / maxVal) * 100;
    this.setText("zDispTargetLegend", this.fmt0(target));

    tableBody.innerHTML = scenarios.map((c) => {
      const isCurrent = c.case_id === "case_2_current";
      const diff = c.diff_from_target_kg_rai;
      const diffColor = diff >= 0 ? "#15803d" : "#b45309";
      const w = Math.max(2, (c.yield_kg_rai / maxVal) * 100);
      return `
        <tr class="${isCurrent ? "highlight" : ""}">
          <td>
            <div style="font-weight:700;">${c.name_th}</div>
            <div class="z-muted">${c.status_label}</div>
          </td>
          <td>
            <div class="z-bar-track">
              <div class="z-bar-fill ${isCurrent ? "current" : ""}" style="width:${w}%"></div>
              <div class="z-bar-target" style="left:${targetPct}%"></div>
            </div>
            <div class="z-bar-val">${this.fmt1(c.yield_kg_rai)}</div>
          </td>
          <td style="text-align:right; font-weight:700; color:${diffColor}; white-space:nowrap;">${this.signed(diff)}</td>
        </tr>`;
    }).join("");
  },

  renderEconomics(eco, yieldVal) {
    const isProfit = eco.net_profit >= 0;
    const elBadge = document.getElementById("zDispProfitBadge");
    if (elBadge) {
      elBadge.className = `z-profit-badge ${isProfit ? "profit" : "loss"}`;
      elBadge.innerHTML = `<i class="fa-solid ${isProfit ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i>
        ${isProfit ? "กำไรสุทธิ" : "ขาดทุนสุทธิ"} ${this.fmt0(Math.abs(eco.net_profit))} บาท
        <span class="z-badge-sub">(${this.signed(eco.profit_per_rai, 0)} บาท/ไร่)</span>`;
    }
    this.setText("zDispPrice", `${this.fmt0(eco.price_per_ton)} บาท/ตัน`);
    this.setText("zDispGrossRev", `${this.fmt0(eco.gross_revenue)} บาท`);
    this.setText("zDispTotalCost", `${this.fmt0(eco.total_cost)} บาท`);

    const elRoi = document.getElementById("zDispRoi");
    if (elRoi) {
      elRoi.innerText = `${eco.roi_pct >= 0 ? "+" : "−"}${this.fmt1(Math.abs(eco.roi_pct))}%`;
      elRoi.style.color = eco.roi_pct >= 0 ? "#15803d" : "#b91c1c";
    }

    // จุดคุ้มทุน: Y_break-even = Cost_total ÷ Price_kg (สมการที่ 5)
    const priceKg = eco.price_per_ton / 1000.0;
    const bep = priceKg > 0 ? eco.cost_per_rai / priceKg : 0;
    const margin = yieldVal - bep;
    const elBep = document.getElementById("zDispBep");
    if (elBep) {
      elBep.innerHTML = `<span>จุดคุ้มทุน</span> <strong>${this.fmt1(bep)} กก./ไร่</strong>
        <span class="z-bep-note" style="color:${margin >= 0 ? "#15803d" : "#b91c1c"};">
          ${margin >= 0 ? `สูงกว่าจุดคุ้มทุน ${this.fmt1(margin)} กก./ไร่` : `ต่ำกว่าจุดคุ้มทุน ${this.fmt1(Math.abs(margin))} กก./ไร่`}
        </span>`;
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  SandboxController.init();
});
