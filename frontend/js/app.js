/**
 * แอปพลิเคชันหลัก (Application Orchestrator)
 * ปรับจูนสูตรผลผลิตสมจริงเทียบ สศก., ควบคุมไทม์ไลน์ และผูกระบบสภาพอากาศสุดวิสัย
 */
const App = {
  mapManager: null,
  currentGeometry: null,
  currentArea: { sqMeters: 15806, totalRaiFloat: 9.878, formattedThai: "9 ไร่ 3 งาน 52 ตร.วา" },

  // ตัวแปรชีวภาพปรับเทียบกับพันธุ์ข้าวไทย (สศก. ภาคอีสาน)
  modelParams: {
    variety: "kdml105",
    durationDays: 120,
    plantDate: "2026-06-15",
    H: 16,      // กอต่อ ตร.ม. (ปกติข้าวปักดำอีสาน 16 กอ)
    P: 8,       // รวงต่อกอ (ปกติ 7-10 รวง)
    G: 95,      // เมล็ดดีต่อรวง (ปกติ 80-110 เมล็ด)
    W: 25.5,    // น้ำหนัก 1,000 เมล็ด ขาวดอกมะลิ 105 (~25-26 กรัม)
    fertilityFactor: 0.82 // สัดส่วนเมล็ดติดจริงและการรอดตายทางธรรมชาติ (Grain Filling Rate)
  },

  // ตัวคูณสภาวะแวดล้อม (Multipliers)
  multipliers: {
    f_soil: 0.85,
    f_temp: 0.95,
    f_climate: 0.92,
    f_ndvi: 0.96,
    f_stress: 1.0 // ตัวคูณลดทอนจากน้ำท่วม/แล้งจัด
  },

  soilInfo: {
    found: true,
    province: "นครพนม",
    district: "เมืองนครพนม",
    subdistrict: "อาจสามารถ",
    soil_group: "17",
    suitability_name: "เหมาะสมปานกลาง (S2)",
    topsoil_texture: "ดินร่วนปนทราย",
    topsoil_pH: "5.5 - 6.5"
  },

  backendOnline: false,
  backendUrl: "http://localhost:8000",

  async init() {
    console.log("[App] เริ่มต้นระบบ Sandbox Simulator...");

    // 1. ตรวจสอบสถานะ Backend API
    await this.checkBackendStatus();

    // 2. สร้างแผนที่ Leaflet และ Visual Engine
    this.mapManager = new MapManager("map");
    this.mapManager.init([16.0678, 103.6578], 14);

    // 3. เริ่มต้นกราฟ
    AnalyticsCharts.initGrowthChart("growthChart");
    AnalyticsCharts.initWeatherChart("weatherChart");

    // 4. ผูกการทำงานปุ่มและ Sliders ทั้งหมด
    this.bindEvents();

    // 5. ดักจับเมื่อผู้ใช้วาดหรือเปลี่ยนแปลงนา
    this.mapManager.onPolygonChange((geometry) => {
      this.handlePolygonUpdate(geometry);
    });

    // 6. ดักจับเหตุการณ์จาก TimeEngine
    timeEngine.onUpdate((state) => {
      this.handleTimeUpdate(state);
    });

    // คำนวณผลผลิตรอบแรก
    this.recalculateYield();
  },

  async checkBackendStatus() {
    const badge = document.getElementById("backendStatusBadge");
    try {
      const res = await fetch(`${this.backendUrl}/health`, { method: "GET" });
      if (res.ok) {
        this.backendOnline = true;
        if (badge) {
          badge.innerHTML = `<span class="status-dot"></span> Backend API: เชื่อมต่อสำเร็จ (77 จังหวัด)`;
          badge.style.borderColor = "rgba(56, 161, 105, 0.4)";
          badge.style.color = "#68d391";
        }
        return;
      }
    } catch (e) {
      // Backend ยังไม่ได้รัน
    }

    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span class="status-dot" style="background:#d4af37; box-shadow:0 0 8px #d4af37;"></span> โหมดจำลองในตัว (รัน main.py เพื่อดึงดินจริง)`;
      badge.style.borderColor = "rgba(212, 175, 55, 0.4)";
      badge.style.color = "#f6e05e";
    }
  },

  bindEvents() {
    // การเลือกพันธุ์ข้าว
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect) {
      varietySelect.addEventListener("change", (e) => {
        const val = e.target.value;
        this.modelParams.variety = val;
        let days = 120, w = 25.5, g = 95;
        if (val === "kdml105") { days = 120; w = 25.5; g = 95; }
        else if (val === "rd6") { days = 130; w = 26.5; g = 100; }
        else if (val === "rd41") { days = 105; w = 27.5; g = 110; }

        this.modelParams.durationDays = days;
        this.modelParams.W = w;
        this.modelParams.G = g;

        document.getElementById("inputWeight").value = w;
        document.getElementById("dispWeight").innerText = w + " กรัม";
        document.getElementById("inputGrains").value = g;
        document.getElementById("dispGrains").innerText = g;

        timeEngine.setVarietyDuration(days);
        this.recalculateYield();
      });
    }

    // วันเริ่มปลูก
    const dateInput = document.getElementById("plantDate");
    if (dateInput) {
      dateInput.addEventListener("change", (e) => {
        timeEngine.setPlantDate(e.target.value);
      });
    }

    // Sliders ตัวแปรชีวภาพ
    this.bindRangeInput("inputHills", "dispHills", (val) => { this.modelParams.H = parseFloat(val); });
    this.bindRangeInput("inputPanicles", "dispPanicles", (val) => { this.modelParams.P = parseFloat(val); });
    this.bindRangeInput("inputGrains", "dispGrains", (val) => { this.modelParams.G = parseFloat(val); });
    this.bindRangeInput("inputWeight", "dispWeight", (val) => { this.modelParams.W = parseFloat(val); });

    // ปุ่มควบคุมการเร่งเวลา
    const btnPlay = document.getElementById("btnPlay");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");
    const speedSelect = document.getElementById("simSpeedSelect");

    if (btnPlay) btnPlay.addEventListener("click", () => timeEngine.play());
    if (btnPause) btnPause.addEventListener("click", () => timeEngine.pause());
    if (btnReset) btnReset.addEventListener("click", () => timeEngine.reset());
    if (speedSelect) speedSelect.addEventListener("change", (e) => timeEngine.setSpeed(parseFloat(e.target.value)));

    // แถบเลื่อนเวลาแบบ Scrubbing (ลากไปหน้า-ย้อนหลัง)
    const timelineScrubber = document.getElementById("timelineScrubber");
    if (timelineScrubber) {
      timelineScrubber.addEventListener("input", (e) => {
        timeEngine.seekToDay(parseInt(e.target.value, 10));
      });
    }

    // ปุ่มจำลองสภาพอากาศสุดวิสัย (Weather Stress Sandbox)
    this.bindScenarioBtn("btnScenarioRain", "rain");
    this.bindScenarioBtn("btnScenarioFlood", "flood");
    this.bindScenarioBtn("btnScenarioDrought", "drought");
    this.bindScenarioBtn("btnScenarioHeat", "heat");
  },

  bindScenarioBtn(btnId, scenarioType) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener("click", () => {
      // สลับสถานะของปุ่ม
      const wasActive = btn.classList.contains(`active-${scenarioType}`);
      document.querySelectorAll(".scenario-btn").forEach((b) => {
        b.className = "scenario-btn";
      });

      if (!wasActive) {
        btn.classList.add(`active-${scenarioType}`);
        timeEngine.setWeatherScenario(scenarioType);
      } else {
        timeEngine.setWeatherScenario("auto");
      }
    });
  },

  bindRangeInput(inputId, displayId, updateCallback) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    if (!input) return;

    input.addEventListener("input", (e) => {
      const val = e.target.value;
      if (display) display.innerText = val;
      updateCallback(val);
      this.recalculateYield();
    });
  },

  async handlePolygonUpdate(geometry) {
    if (!geometry) {
      this.currentArea = { sqMeters: 0, totalRaiFloat: 0, formattedThai: "ยังไม่ได้วาดแปลง" };
      this.recalculateYield();
      return;
    }

    this.currentGeometry = geometry;
    const areaResult = AreaCalculator.calculateArea(geometry);
    this.currentArea = areaResult;

    // อัปเดตข้อมูลพื้นที่บนหน้าจอ
    const elAreaThai = document.getElementById("dispAreaThai");
    const elAreaSqM = document.getElementById("dispAreaSqM");
    if (elAreaThai) elAreaThai.innerText = areaResult.formattedThai;
    if (elAreaSqM) elAreaSqM.innerText = `${areaResult.sqMeters.toLocaleString()} ตร.ม.`;

    // ถ้าต่อ Backend อยู่ ส่งไปทำ Spatial Join ดินจริง
    if (this.backendOnline) {
      try {
        const res = await fetch(`${this.backendUrl}/api/soil`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geometry })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          this.soilInfo = d;
          this.multipliers.f_soil = d.f_soil;
          this.updateSoilUI(d);
        }
      } catch (err) {
        console.warn("[App] เชื่อมต่อดินไม่สำเร็จ:", err);
      }
    } else {
      this.updateSoilUI(this.soilInfo);
    }

    this.recalculateYield();
  },

  updateSoilUI(soil) {
    const elLoc = document.getElementById("dispLocation");
    const elSoil = document.getElementById("dispSoilGroup");
    const elSuit = document.getElementById("dispSuitability");
    const elPh = document.getElementById("dispSoilPh");
    const elFsoil = document.getElementById("dispFsoil");

    if (elLoc) elLoc.innerText = `${soil.province} / ${soil.district}`;
    if (elSoil) elSoil.innerText = `กลุ่มที่ ${soil.soil_group_number || soil.soil_group || '17'}`;
    if (elSuit) elSuit.innerText = `${soil.suitability_name || 'เหมาะสมปานกลาง (S2)'}`;
    if (elPh) elPh.innerText = soil.topsoil_pH || "5.5 - 6.5";
    if (elFsoil) elFsoil.innerText = `× ${this.multipliers.f_soil.toFixed(2)}`;
  },

  handleTimeUpdate(state) {
    // 1. อัปเดตแถบไทม์ไลน์และ Scrubber
    const scrubber = document.getElementById("timelineScrubber");
    const dispSimDate = document.getElementById("dispSimDate");
    const dispDap = document.getElementById("dispDap");
    const dispStageName = document.getElementById("dispStageName");
    const dispPercent = document.getElementById("dispPercent");

    if (scrubber) {
      scrubber.max = state.totalDays;
      scrubber.value = state.currentDay;
    }
    if (dispSimDate) dispSimDate.innerText = state.simulatedDate;
    if (dispDap) dispDap.innerText = `วันที่ ${state.currentDay} / ${state.totalDays}`;
    if (dispStageName) dispStageName.innerText = state.stage.name;
    if (dispPercent) dispPercent.innerText = `${state.percent}%`;

    // อัปเดตไฮไลต์ระยะ 1-5 บนแถบ
    document.querySelectorAll(".stage-item-label").forEach((el, idx) => {
      if (idx + 1 === state.stage.id) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });

    // 2. อัปเดตตัวคูณสภาพอากาศจาก TimeEngine
    const wm = state.weatherMultipliers;
    this.multipliers.f_temp = wm.f_temp;
    this.multipliers.f_climate = wm.f_climate;
    this.multipliers.f_stress = wm.f_stress;

    // 3. สั่งให้ Visual Engine วาดต้นข้าวและเอฟเฟกต์สภาพอากาศในแปลงนา
    if (this.mapManager) {
      this.mapManager.renderRiceVisuals(state.stage.id, state.activeEventState);
    }

    // 4. อัปเดตการแสดงผลสภาพอากาศ
    const elRain = document.getElementById("dispCurRain");
    const elTemp = document.getElementById("dispCurTemp");
    const elCdd = document.getElementById("dispCdd");
    const elCwd = document.getElementById("dispCwd");
    const elWeatherDesc = document.getElementById("dispWeatherDesc");

    if (elRain) elRain.innerText = `${state.rain} มม./วัน`;
    if (elTemp) elTemp.innerText = `${state.temp} °C`;
    if (elCdd) elCdd.innerText = `${state.cdd} วัน`;
    if (elCwd) elCwd.innerText = `${state.cwd} วัน`;

    if (elWeatherDesc) {
      if (state.activeEventState === "flood") {
        elWeatherDesc.innerText = "⚠️ ฝนตกสะสมหนัก น้ำท่วมขังแปลงนา!";
        elWeatherDesc.style.color = "#63b3ed";
      } else if (state.activeEventState === "drought") {
        elWeatherDesc.innerText = "☀️ ฝนแล้งทิ้งช่วง ข้าวขาดน้ำ!";
        elWeatherDesc.style.color = "#feb2b2";
      } else if (state.activeEventState === "heat") {
        elWeatherDesc.innerText = "🔥 อากาศร้อนจัด เสี่ยงเกสรลีบ!";
        elWeatherDesc.style.color = "#fbd38d";
      } else if (state.activeEventState === "rain") {
        elWeatherDesc.innerText = "🌧️ ฝนตกชุ่มฉ่ำ น้ำเพียงพอ";
        elWeatherDesc.style.color = "#90e0ef";
      } else {
        elWeatherDesc.innerText = "🌤️ สภาพอากาศปกติตามฤดูกาล";
        elWeatherDesc.style.color = "#68d391";
      }
    }

    // 5. คำนวณผลผลิตแบบเรียลไทม์
    this.recalculateYield(state.biomassRatio);
  },

  /**
   * คำนวณแบบจำลองสูตรผสมผสาน (สมการ 3 ถึง 7)
   * ได้รับการปรับจูนค่ามาตรฐานให้อยู่ในช่วง 300 - 400 กก./ไร่ (สอดคล้องกับ สศก. 356 กก./ไร่)
   */
  recalculateYield(biomassRatio = 1.0) {
    const { H, P, G, W, fertilityFactor } = this.modelParams;
    const areaSqM = this.currentArea.sqMeters || 15806;
    const areaRai = this.currentArea.totalRaiFloat || (areaSqM / 1600);

    if (areaSqM <= 0) return;

    // สมการที่ 3: ผลผลิตศักยภาพ (Ypot) หน่วย กก.
    // คิดอัตราการติดเมล็ดจริง (Grain Fertility ~82%) เพื่อให้ตรงกับสภาพนาจริงของไทย
    const grainsPerSqM = H * P * G * fertilityFactor;
    const gramsPerSqM = (grainsPerSqM * W) / 1000;
    const kgPerSqM = gramsPerSqM / 1000;
    const Ypot = kgPerSqM * areaSqM;

    // สมการที่ 4: ผลผลิตที่ปรับด้วยตัวคูณสิ่งแวดล้อมและภัยพิบัติ (Yfinal)
    // Yfinal = Ypot * Fsoil * Ftemp * Fclimate * FNDVI * Fstress
    const { f_soil, f_temp, f_climate, f_ndvi, f_stress } = this.multipliers;
    const totalMultiplier = f_soil * f_temp * f_climate * f_ndvi * f_stress;
    const YfinalFull = Ypot * totalMultiplier;

    // คำนวณผลผลิตสะสมตามเวลาปัจจุบัน (Biomass Growth)
    const Ycurrent = YfinalFull * biomassRatio;

    // สมการที่ 5: ผลผลิตต่อไร่ (Yrai) หน่วย กก./ไร่
    const Yrai = areaRai > 0 ? YfinalFull / areaRai : 0;

    // อัปเดตตัวเลขผลผลิตบนการ์ด
    const elTotal = document.getElementById("dispTotalYield");
    const elPerRai = document.getElementById("dispYieldPerRai");
    const elPot = document.getElementById("dispPotYield");
    const elBench = document.getElementById("dispOaeBenchmark");

    if (elTotal) {
      const tons = (Ycurrent / 1000).toFixed(2);
      elTotal.innerText = `${tons} ตัน`;
    }
    if (elPerRai) {
      elPerRai.innerText = `${Math.round(Yrai)} กก./ไร่`;
    }
    if (elPot) {
      elPot.innerText = `ศักยภาพ: ${(Ypot / 1000).toFixed(2)} ตัน`;
    }

    // เปรียบเทียบกับสถิติ สศก. (ค่าเฉลี่ยข้าวนาปีอีสาน สศก. = 356 กก./ไร่)
    const oaeBenchmark = 356;
    const diffPercent = Math.round(((Yrai - oaeBenchmark) / oaeBenchmark) * 100);
    if (elBench) {
      const sign = diffPercent >= 0 ? "+" : "";
      elBench.innerText = `${sign}${diffPercent}% เทียบ สศก. (${oaeBenchmark} กก./ไร่)`;
      if (diffPercent >= 0) {
        elBench.style.color = "#68d391";
      } else if (diffPercent >= -20) {
        elBench.style.color = "#ecc94b";
      } else {
        elBench.style.color = "#feb2b2"; // เสียหายจากภัยพิบัติ
      }
    }

    // อัปเดตตัวคูณแต่ละด้าน
    const elFsoil = document.getElementById("dispFsoil");
    const elFtemp = document.getElementById("dispFtemp");
    const elFclim = document.getElementById("dispFclimate");
    const elFndvi = document.getElementById("dispFndvi");
    const elFstress = document.getElementById("dispFstress");

    if (elFsoil) elFsoil.innerText = `× ${f_soil.toFixed(2)}`;
    if (elFtemp) elFtemp.innerText = `× ${f_temp.toFixed(2)}`;
    if (elFclim) elFclim.innerText = `× ${f_climate.toFixed(2)}`;
    if (elFndvi) elFndvi.innerText = `× ${f_ndvi.toFixed(2)}`;
    if (elFstress) elFstress.innerText = `× ${f_stress.toFixed(2)}`;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
