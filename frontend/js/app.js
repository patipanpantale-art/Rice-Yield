/**
 * แอปพลิเคชันหลัก (Application Orchestrator)
 * ปรับจูนสูตรผลผลิตสมจริงเทียบ สศก., คำอธิบายศัพท์เทคนิค 5 ขั้น, ตรวจจับ 77 จังหวัด,
 * ระบบหลายแปลง (Multi-Paddy), และจำลองภัยพิบัติตามระยะการเจริญเติบโต (60 FPS Optimized)
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
    H: 16,      // กอต่อ ตร.ม. (ระยะปักดำ 25x25 ซม.)
    P: 8,       // รวงต่อกอ (ปกติ 7-10 รวง)
    G: 95,      // เมล็ดดีต่อรวง (ปกติ 80-110 เมล็ด)
    W: 25.5,    // น้ำหนัก 1,000 เมล็ด (มาตรฐาน ขาวดอกมะลิ 105 ~25.5 กรัม)
    fertilityFactor: 0.82 // สัดส่วนเมล็ดติดจริงและการรอดตายทางธรรมชาติ (Grain Filling Rate)
  },

  // ตัวคูณสภาวะแวดล้อม (สมการที่ 4)
  multipliers: {
    f_soil: 0.85,
    f_temp: 0.95,
    f_climate: 0.92,
    f_ndvi: 0.96,
    f_stress: 1.0 // ตัวคูณลดทอนจากน้ำท่วม/แล้งจัดถาวร
  },

  soilInfo: {
    found: true,
    province: "ขอนแก่น",
    district: "เมืองขอนแก่น",
    subdistrict: "ในเมือง",
    soil_group: "17",
    suitability_name: "เหมาะสมปานกลาง (S2)",
    topsoil_texture: "ดินร่วนปนทราย",
    topsoil_pH: "5.5 - 6.5"
  },

  backendOnline: false,
  backendUrl: "http://localhost:8000",
  rafPending: false,

  // คำแนะนำปฏิทินเพาะปลูกแยกตามสภาพอากาศแต่ละปี
  yearAdvisories: {
    "2024": {
      badge: "ปีลานีญา (ฝนมาเร็วและชุก)",
      text: "💡 ปี 2024 ฝนเริ่มมาเร็วตั้งแต่กลางเดือน พ.ค. หากเริ่มปลูกช่วง 25 พ.ค. - 10 มิ.ย. ข้าวจะได้น้ำสม่ำเสมอช่วงแตกกอ ควรระวังน้ำท่วมขังช่วง ส.ค.-ก.ย.",
      recommendedDate: "2024-06-01"
    },
    "2023": {
      badge: "ปีเอลนีโญ (แล้งทิ้งช่วงกลางฤดู)",
      text: "⚠️ ปี 2023 เกิดสภาวะเอลนีโญ ฝนทิ้งช่วงแล้งจัดในเดือน มิ.ย.-ก.ค. หากเริ่มปลูกเดือน เม.ย.-พ.ค. ข้าวจะขาดน้ำแห้งตาย แนะนำเลื่อนปลูกเป็นกลางเดือน ก.ค. เพื่อรอฝนรอบสอง",
      recommendedDate: "2023-07-15"
    },
    "2022": {
      badge: "ปีลานีญาฝนชุก (มรสุมต่อเนื่อง)",
      text: "🌧️ ปี 2022 ร่องมรสุมเข้าต่อเนื่อง แปลงดอนได้ผลผลิตสูง แต่แปลงลุ่มเสี่ยงน้ำท่วมขัง ควรเลือกพันธุ์ข้าวทนน้ำท่วมฉับพลัน",
      recommendedDate: "2022-06-15"
    },
    "baseline": {
      badge: "ค่าเฉลี่ยภูมิอากาศ 30 ปี (TMD Normal)",
      text: "🌤️ สภาพอากาศปกติตามเกณฑ์ 30 ปี กรมอุตุนิยมวิทยา ฝนเริ่มตกปลาย พ.ค. ทิ้งช่วงสั้นๆ ต้น ก.ค. เริ่มปลูกได้ตั้งแต่ 1-15 มิ.ย.",
      recommendedDate: "2026-06-15"
    }
  },

  async init() {
    console.log("[App] เริ่มต้นระบบ Rice Yield Sandbox Simulator...");

    // 1. ตรวจสอบสถานะ Backend API
    await this.checkBackendStatus();

    // 2. สร้างแผนที่ Leaflet และ Visual Engine
    this.mapManager = new MapManager("map");
    this.mapManager.init([16.4322, 102.8236], 13); // เริ่มต้นที่ขอนแก่น แปลงทดสอบ

    // 3. เริ่มต้นกราฟ
    AnalyticsCharts.initGrowthChart("growthChart");
    AnalyticsCharts.initWeatherChart("weatherChart");

    // 4. ผูกการทำงานปุ่มและ Sliders ทั้งหมด
    this.bindEvents();

    // 5. ดักจับเมื่อผู้ใช้วาดหรือเปลี่ยนแปลงแปลงนา
    this.mapManager.onPolygonChange((geometry, detectedProv, paddy) => {
      this.handlePolygonUpdate(geometry, detectedProv, paddy);
    });

    // ดักจับการเปลี่ยนแปลงรายการแปลงนา (Multi-paddy)
    this.mapManager.onPaddyListChange((paddies, activeId) => {
      this.renderPaddyTabs(paddies, activeId);
    });

    // 6. ดักจับเหตุการณ์จาก TimeEngine
    timeEngine.onUpdate((state) => {
      this.handleTimeUpdate(state);
    });

    // แสดงคำแนะนำปฏิทินเพาะปลูกเริ่มต้น
    this.updateYearAdvisory("2024");

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
      // Backend ยังไม่ได้รันบนพอร์ต 8000
    }

    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span class="status-dot" style="background:#d4af37; box-shadow:0 0 8px #d4af37;"></span> ตรวจจับ 77 จังหวัดในตัว (รัน run_dev.bat เพื่อต่อ LDD Shapefiles)`;
      badge.style.borderColor = "rgba(212, 175, 55, 0.4)";
      badge.style.color = "#f6e05e";
    }
  },

  bindEvents() {
    // 1. การเลือกพันธุ์ข้าว
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

        const elW = document.getElementById("inputWeight");
        const elDispW = document.getElementById("dispWeight");
        const elG = document.getElementById("inputGrains");
        const elDispG = document.getElementById("dispGrains");

        if (elW) elW.value = w;
        if (elDispW) elDispW.innerText = w + " กรัม";
        if (elG) elG.value = g;
        if (elDispG) elDispG.innerText = g;

        timeEngine.setVarietyDuration(days);
        this.recalculateYield();
      });
    }

    // 2. การเลือกปีสภาพอากาศจำลอง
    const yearSelect = document.getElementById("climateYearSelect");
    if (yearSelect) {
      yearSelect.addEventListener("change", (e) => {
        const yr = e.target.value;
        timeEngine.setYear(yr);
        this.updateYearAdvisory(yr);
      });
    }

    // ปุ่มตั้งค่าวันปลูกตามคำแนะนำปฏิทิน
    const btnApplyDate = document.getElementById("btnApplyAdvisoryDate");
    if (btnApplyDate) {
      btnApplyDate.addEventListener("click", () => {
        const curYr = document.getElementById("climateYearSelect") ? document.getElementById("climateYearSelect").value : "2024";
        const adv = this.yearAdvisories[curYr];
        if (adv && adv.recommendedDate) {
          const dateInput = document.getElementById("plantDate");
          if (dateInput) dateInput.value = adv.recommendedDate;
          timeEngine.setPlantDate(adv.recommendedDate);
        }
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

    // แถบเลื่อนเวลาแบบ Scrubbing
    const timelineScrubber = document.getElementById("timelineScrubber");
    if (timelineScrubber) {
      timelineScrubber.addEventListener("input", (e) => {
        timeEngine.seekToDay(parseInt(e.target.value, 10));
      });
    }

    // ปุ่มจำลองสภาพอากาศฉับพลัน
    this.bindScenarioBtn("btnScenarioRain", "rain");
    this.bindScenarioBtn("btnScenarioFlood", "flood");
    this.bindScenarioBtn("btnScenarioDrought", "drought");
    this.bindScenarioBtn("btnScenarioHeat", "heat");

    // ปุ่มตั้งเวลาภัยพิบัติตามช่วงเวลา (Disaster Window)
    const btnApplyWindow = document.getElementById("btnApplyDisasterWindow");
    if (btnApplyWindow) {
      btnApplyWindow.addEventListener("click", () => {
        const type = document.getElementById("disasterTypeSelect").value;
        const startDay = parseInt(document.getElementById("disasterStartDay").value, 10) || 30;
        const endDay = parseInt(document.getElementById("disasterEndDay").value, 10) || 75;
        timeEngine.scheduleDisasterWindow(type, startDay, endDay);

        const badge = document.getElementById("dispDisasterWindowBadge");
        if (badge) {
          if (type === "none") {
            badge.innerText = "ไม่มีภัยพิบัติตามช่วงเวลา";
            badge.style.display = "none";
          } else {
            const typeName = type === "flood" ? "น้ำท่วมขัง" : (type === "drought" ? "ฝนแล้งทิ้งช่วง" : "คลื่นความร้อน");
            badge.innerText = `⚠️ จำลอง ${typeName} ในวันที่ ${startDay} ถึง ${endDay}`;
            badge.style.display = "inline-block";
          }
        }
      });
    }

    // กล่องคู่มือชีวภาพข้าวไทย (พับ-ขยาย)
    const guideHeader = document.getElementById("guideHeader");
    const guideContent = document.getElementById("guideContent");
    if (guideHeader && guideContent) {
      guideHeader.addEventListener("click", () => {
        guideContent.classList.toggle("open");
        const icon = guideHeader.querySelector(".fa-chevron-down");
        if (icon) {
          icon.style.transform = guideContent.classList.contains("open") ? "rotate(180deg)" : "rotate(0)";
        }
      });
    }
  },

  updateYearAdvisory(yearKey) {
    const adv = this.yearAdvisories[yearKey] || this.yearAdvisories["baseline"];
    const elBadge = document.getElementById("dispAdvisoryBadge");
    const elText = document.getElementById("dispAdvisoryText");
    const btnApply = document.getElementById("btnApplyAdvisoryDate");

    if (elBadge) elBadge.innerText = adv.badge;
    if (elText) elText.innerText = adv.text;
    if (btnApply && adv.recommendedDate) {
      btnApply.innerHTML = `<i class="fa-regular fa-calendar-check"></i> ตั้งวันเริ่มปลูกเป็น ${adv.recommendedDate}`;
    }
  },

  bindScenarioBtn(btnId, scenarioType) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener("click", () => {
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

  renderPaddyTabs(paddies, activeId) {
    const container = document.getElementById("paddyTabsContainer");
    if (!container) return;

    container.innerHTML = "";
    if (!paddies || paddies.length === 0) {
      container.innerHTML = `<span style="font-size:11px; color:var(--text-muted); padding:4px 8px;">ยังไม่มีแปลงนา (คลิกปุ่มวาดแปลงเพื่อเริ่มต้น)</span>`;
      return;
    }

    paddies.forEach((p) => {
      const tab = document.createElement("button");
      tab.className = `paddy-tab ${p.id === activeId ? 'active' : ''}`;
      
      const area = AreaCalculator.calculateArea(p.geometry);
      tab.innerHTML = `🌾 ${p.name} <span style="opacity:0.75; font-size:10px;">(${area.formattedThai})</span>`;
      
      tab.addEventListener("click", () => {
        if (this.mapManager) this.mapManager.selectPaddy(p.id);
      });

      container.appendChild(tab);
    });
  },

  /**
   * ฟังก์ชันให้เกรดและคำอธิบาย 5 ขั้น (จาก แย่มาก ถึง ดีมาก) อิงมาตรฐาน FAO & กรมพัฒนาที่ดิน
   */
  getQualitativeRating(val, type) {
    if (type === "soil") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (S1)", desc: "ดินมีความอุดมสมบูรณ์สูงมาก โครงสร้างดินร่วน/เหนียวกักเก็บน้ำดีเยี่ยม เหมาะสมต่อข้าวสูงสุด" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (S2-สูง)", desc: "ดินมีความเหมาะสมดี ดินร่วนปานกลาง กักเก็บน้ำได้ดี ให้ผลผลิตได้เกณฑ์สูง" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง (S2-ต่ำ)", desc: "ดินเหมาะสมปานกลาง อาจเป็นดินร่วนปนทรายหรือมีการชะล้าง ต้องการปุ๋ยบำรุง" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (S3)", desc: "ดินเหมาะสมเล็กน้อย ดินทรายจัด อุ้มน้ำได้น้อย เสี่ยงต่อการขาดน้ำ" };
      return { lvl: 1, label: "แย่มาก (N)", desc: "ดินไม่เหมาะสมต่อการปลูกข้าว โครงสร้างดินแน่นทึบ/ทรายล้วน ข้าวเสี่ยงยืนต้นตาย" };
    } else if (type === "temp") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (25-30°C)", desc: "อุณหภูมิเหมาะสมสูงสุด การสังเคราะห์แสงและสร้างแป้งสมดุล" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (เกณฑ์ปกติ)", desc: "อุณหภูมิอยู่ในเกณฑ์ดี ข้าวเจริญเติบโตได้ตามปกติ" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง", desc: "อากาศเริ่มร้อนหรือเย็นเล็กน้อย ส่งผลให้ข้าวโตช้าลงเล็กน้อย" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (ร้อนจัด)", desc: "อากาศร้อนจัด (34-36°C) เริ่มกระทบต่อการสร้างละอองเกสร" };
      return { lvl: 1, label: "แย่มาก (วิกฤต)", desc: "อุณหภูมิวิกฤต (>37°C หรือ <15°C) ละอองเกสรเป็นหมัน รวงข้าวลีบถาวร" };
    } else if (type === "climate") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (น้ำสมบูรณ์)", desc: "ปริมาณน้ำฝนและสมดุลน้ำดีเยี่ยม ระดับน้ำในนาสม่ำเสมอ" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (เพียงพอ)", desc: "น้ำเพียงพอต่อความต้องการของข้าว ไม่เกิดสภาวะแล้ง" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง", desc: "มีฝนทิ้งช่วงสั้นๆ ดินเริ่มหมาดแต่ยังไม่แห้งแล้งรุนแรง" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (แล้ง/ท่วม)", desc: "ฝนแล้งทิ้งช่วงต่อเนื่อง หรือมีน้ำขังสูงเริ่มกระทบกอข้าว" };
      return { lvl: 1, label: "แย่มาก (วิกฤต)", desc: "น้ำท่วมมิดต้นข้าวนานเกิน 7 วัน หรือแล้งรุนแรงดินแตกระแหง" };
    } else if (type === "ndvi") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (ทรงพุ่มแน่น)", desc: "พืชเขียวชอุ่มหนาแน่นมาก การเจริญเติบโตสมบูรณ์เต็ม 100%" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (พืชแข็งแรง)", desc: "พืชมีความแข็งแรงและเขียวสดตามเกณฑ์มาตรฐาน" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง", desc: "ทรงพุ่มโปร่งปานกลาง อาจมีการเจริญเติบโตช้าบางส่วน" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (แคระแกร็น)", desc: "พืชมีอาการใบเหลืองหรือแคระแกร็นจากความเครียดสิ่งแวดล้อม" };
      return { lvl: 1, label: "แย่มาก (เสียหาย)", desc: "พืชเสียหายรุนแรง ขาดสารอาหาร หรือโดนโรคแมลงรบกวน" };
    }
    return { lvl: 3, label: "ปานกลาง", desc: "" };
  },

  async handlePolygonUpdate(geometry, detectedProv = null, paddy = null) {
    if (!geometry) {
      this.currentArea = { sqMeters: 0, totalRaiFloat: 0, formattedThai: "ยังไม่ได้วาดแปลง" };
      this.recalculateYield();
      return;
    }

    this.currentGeometry = geometry;
    const areaResult = AreaCalculator.calculateArea(geometry);
    this.currentArea = areaResult;

    const elAreaThai = document.getElementById("dispAreaThai");
    const elAreaSqM = document.getElementById("dispAreaSqM");
    if (elAreaThai) elAreaThai.innerText = areaResult.formattedThai;
    if (elAreaSqM) elAreaSqM.innerText = `${areaResult.sqMeters.toLocaleString()} ตร.ม.`;

    // 1. ตรวจจับจังหวัดอัตโนมัติฝั่ง Client ทันที (แก้ปัญหาจังหวัดไม่ตรง / นครพนมค้าง)
    if (detectedProv) {
      this.soilInfo.province = detectedProv.name_th;
      this.soilInfo.district = `อ.เมือง${detectedProv.name_th}`;
      // กำหนดค่าชุดดินเริ่มต้นตามภูมิภาค
      if (detectedProv.region === "northeast") {
        this.soilInfo.soil_group = "17";
        this.soilInfo.suitability_name = "เหมาะสมปานกลาง (S2)";
        this.soilInfo.topsoil_texture = "ดินร่วนปนทราย";
        this.multipliers.f_soil = 0.85;
      } else if (detectedProv.region === "central") {
        this.soilInfo.soil_group = "2";
        this.soilInfo.suitability_name = "เหมาะสมสูง (S1)";
        this.soilInfo.topsoil_texture = "ดินเหนียวที่ราบลุ่ม";
        this.multipliers.f_soil = 0.95;
      } else if (detectedProv.region === "north") {
        this.soilInfo.soil_group = "33";
        this.soilInfo.suitability_name = "เหมาะสมปานกลาง (S2)";
        this.soilInfo.topsoil_texture = "ดินร่วนปนตะกอน";
        this.multipliers.f_soil = 0.88;
      } else {
        this.soilInfo.soil_group = "18";
        this.soilInfo.suitability_name = "เหมาะสมปานกลาง (S2)";
        this.soilInfo.topsoil_texture = "ดินร่วนเหนียว";
        this.multipliers.f_soil = 0.86;
      }
      this.updateSoilUI(this.soilInfo);
    }

    // 2. ถ้าต่อ Backend อยู่ ส่งไปทำ Spatial Join ดินจริงในระดับแปลง
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
        console.warn("[App] เชื่อมต่อดินไม่สำเร็จ ใช้การตรวจจับในตัว:", err);
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
    const elSoilQual = document.getElementById("dispSoilQual");

    if (elLoc) elLoc.innerText = `${soil.province} / ${soil.district || 'พื้นที่เพาะปลูก'}`;
    if (elSoil) elSoil.innerText = `กลุ่มที่ ${soil.soil_group_number || soil.soil_group || '17'}`;
    if (elSuit) elSuit.innerText = `${soil.suitability_name || 'เหมาะสมปานกลาง (S2)'}`;
    if (elPh) elPh.innerText = soil.topsoil_pH || "5.5 - 6.5";
    if (elFsoil) elFsoil.innerText = `× ${this.multipliers.f_soil.toFixed(2)}`;

    const q = this.getQualitativeRating(this.multipliers.f_soil, "soil");
    if (elSoilQual) {
      elSoilQual.className = `qual-badge lvl-${q.lvl}`;
      elSoilQual.innerText = q.label;
      elSoilQual.title = q.desc;
    }
  },

  handleTimeUpdate(state) {
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

    const wm = state.weatherMultipliers;
    this.multipliers.f_temp = wm.f_temp;
    this.multipliers.f_climate = wm.f_climate;
    this.multipliers.f_stress = wm.f_stress;

    // ส่งให้ Visual Engine วาดต้นข้าว (มีระบบ Caching ไม่วาดซ้ำเพื่อความลื่นไหล)
    if (this.mapManager) {
      this.mapManager.renderRiceVisuals(state.stage.id, state.activeEventState);
    }

    // อัปเดตการแสดงผลสภาพอากาศ
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

    // อัปเดตตัวเลขผลผลิต (ใช้ requestAnimationFrame เพื่อความลื่นไหล 60 FPS)
    if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.recalculateYield(state.biomassRatio);
      });
    }
  },

  /**
   * คำนวณแบบจำลองสูตรผสมผสาน (สมการ 3 ถึง 7)
   */
  recalculateYield(biomassRatio = 1.0) {
    const { H, P, G, W, fertilityFactor } = this.modelParams;
    const areaSqM = this.currentArea.sqMeters || 15806;
    const areaRai = this.currentArea.totalRaiFloat || (areaSqM / 1600);

    if (areaSqM <= 0) return;

    // สมการที่ 3: ผลผลิตศักยภาพ (Ypot) หน่วย กก.
    const grainsPerSqM = H * P * G * fertilityFactor;
    const gramsPerSqM = (grainsPerSqM * W) / 1000;
    const kgPerSqM = gramsPerSqM / 1000;
    const Ypot = kgPerSqM * areaSqM;

    // สมการที่ 4: ผลผลิตที่ปรับด้วยตัวคูณสิ่งแวดล้อมและภัยพิบัติ (Yfinal)
    const { f_soil, f_temp, f_climate, f_ndvi, f_stress } = this.multipliers;
    const totalMultiplier = f_soil * f_temp * f_climate * f_ndvi * f_stress;
    const YfinalFull = Ypot * totalMultiplier;

    // คำนวณผลผลิตสะสมตามเวลาปัจจุบัน (Biomass Growth)
    const Ycurrent = YfinalFull * biomassRatio;

    // สมการที่ 5: ผลผลิตต่อไร่ (Yrai) หน่วย กก./ไร่
    const Yrai = areaRai > 0 ? YfinalFull / areaRai : 0;

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

    // เปรียบเทียบกับค่าเฉลี่ย สศก. (356 กก./ไร่)
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

    // อัปเดตตัวคูณและเกรด 5 ขั้น
    this.updateMultiplierBadge("dispFsoil", "dispSoilQual", f_soil, "soil");
    this.updateMultiplierBadge("dispFtemp", "dispTempQual", f_temp, "temp");
    this.updateMultiplierBadge("dispFclimate", "dispClimateQual", f_climate, "climate");
    this.updateMultiplierBadge("dispFndvi", "dispNdviQual", f_ndvi, "ndvi");

    const elFstress = document.getElementById("dispFstress");
    if (elFstress) elFstress.innerText = `× ${f_stress.toFixed(2)}`;
  },

  updateMultiplierBadge(badgeId, qualId, val, type) {
    const elBadge = document.getElementById(badgeId);
    const elQual = document.getElementById(qualId);
    if (elBadge) elBadge.innerText = `× ${val.toFixed(2)}`;

    if (elQual) {
      const q = this.getQualitativeRating(val, type);
      elQual.className = `qual-badge lvl-${q.lvl}`;
      elQual.innerText = q.label;
      elQual.title = q.desc;
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
