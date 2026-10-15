/**
 * แอปพลิเคชันหลัก (Application Orchestrator) - ธีมสว่างมินิมอล อบอุ่น
 * ระบบเปรียบเทียบผลลัพธ์ Before vs After (Scenario Comparison), ตรวจจับที่ดินนาข้าวจริง,
 * และจัดการหลายแปลงแบบกระชับ ไม่ดันจอ
 */
const App = {
  mapManager: null,
  currentGeometry: null,
  currentArea: { sqMeters: 15806, totalRaiFloat: 9.878, formattedThai: "9 ไร่ 3 งาน 52 ตร.วา" },

  // ตัวแปรชีวภาพปรับเทียบกับพันธุ์ข้าวไทย (สศก.)
  modelParams: {
    variety: "kdml105",
    durationDays: 120,
    plantDate: "2026-06-15",
    H: 16,      // กอต่อ ตร.ม. (ระยะปักดำ 25x25 ซม.)
    P: 8,       // รวงต่อกอ (ปกติ 7-10 รวง)
    G: 95,      // เมล็ดดีต่อรวง (ปกติ 80-110 เมล็ด)
    W: 25.5,    // น้ำหนัก 1,000 เมล็ด ขาวดอกมะลิ 105 (~25.5 กรัม)
    fertilityFactor: 0.82 // สัดส่วนเมล็ดติดจริงและการรอดตายทางธรรมชาติ
  },

  // ตัวคูณสภาวะแวดล้อม
  multipliers: {
    f_soil: 0.85,
    f_temp: 0.95,
    f_climate: 0.92,
    f_ndvi: 0.96,
    f_stress: 1.0 // ตัวคูณลดทอนจากมรสุม/ภัยแล้ง
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

  landUseInfo: null,
  backendOnline: false,
  backendUrl: "http://localhost:8000",
  rafPending: false,

  // ระบบเก็บบันทึกเปรียบเทียบผลลัพธ์รอบก่อนหน้า (Scenario Comparison State)
  previousRun: null, // { yieldPerRai, totalYield, scenarioName, curve }

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

    await this.checkBackendStatus();

    // เริ่มต้นแผนที่ Leaflet
    this.mapManager = new MapManager("map");
    this.mapManager.init([16.4322, 102.8236], 13);

    // เริ่มต้นกราฟ
    AnalyticsCharts.initGrowthChart("growthChart");
    AnalyticsCharts.initWeatherChart("weatherChart");

    this.bindEvents();

    // ดักจับเมื่อผู้ใช้วาดหรือเลือกแปลงนา
    this.mapManager.onPolygonChange((geometry, detectedProv, paddy, landUseInfo) => {
      this.handlePolygonUpdate(geometry, detectedProv, paddy, landUseInfo);
    });

    // ดักจับการเปลี่ยนแปลงรายการแปลงนา
    this.mapManager.onPaddyListChange((paddies, activeId) => {
      this.renderPaddyTabs(paddies, activeId);
    });

    // ดักจับเหตุการณ์จาก TimeEngine
    timeEngine.onUpdate((state) => {
      this.handleTimeUpdate(state);
    });

    this.updateYearAdvisory("2024");
    this.recalculateYield();
  },

  async checkBackendStatus() {
    const badge = document.getElementById("backendStatusBadge");
    try {
      const res = await fetch(`${this.backendUrl}/health`, { method: "GET" });
      if (res.ok) {
        this.backendOnline = true;
        if (badge) {
          badge.innerHTML = `<span class="status-dot"></span> เชื่อมต่อระบบวิเคราะห์ดิน 77 จังหวัด`;
          badge.style.background = "#f0fdf4";
          badge.style.color = "#15803d";
        }
        return;
      }
    } catch (e) {
      // Backend ออฟไลน์
    }

    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span class="status-dot" style="background:#d97706;"></span> ระบบจำลองในตัว (พร้อมวิเคราะห์ 77 จังหวัด)`;
      badge.style.background = "#fefce8";
      badge.style.color = "#b45309";
    }
  },

  bindEvents() {
    // 1. พันธุ์ข้าว
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

    // 2. ปีสภาพอากาศ
    const yearSelect = document.getElementById("climateYearSelect");
    if (yearSelect) {
      yearSelect.addEventListener("change", (e) => {
        const yr = e.target.value;
        timeEngine.setYear(yr);
        this.updateYearAdvisory(yr);
      });
    }

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

    const dateInput = document.getElementById("plantDate");
    if (dateInput) {
      dateInput.addEventListener("change", (e) => {
        timeEngine.setPlantDate(e.target.value);
      });
    }

    // 3. Sliders ตัวแปรชีวภาพ
    this.bindRangeInput("inputHills", "dispHills", (val) => { this.modelParams.H = parseFloat(val); });
    this.bindRangeInput("inputPanicles", "dispPanicles", (val) => { this.modelParams.P = parseFloat(val); });
    this.bindRangeInput("inputGrains", "dispGrains", (val) => { this.modelParams.G = parseFloat(val); });
    this.bindRangeInput("inputWeight", "dispWeight", (val) => { this.modelParams.W = parseFloat(val); });

    // 4. ปุ่มเร่งเวลา
    const btnPlay = document.getElementById("btnPlay");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");
    const speedSelect = document.getElementById("simSpeedSelect");

    if (btnPlay) btnPlay.addEventListener("click", () => timeEngine.play());
    if (btnPause) btnPause.addEventListener("click", () => timeEngine.pause());
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious(); // บันทึกผลลัพธ์รอบก่อนหน้านี้ไว้เปรียบเทียบ
        timeEngine.reset();
      });
    }
    if (speedSelect) speedSelect.addEventListener("change", (e) => timeEngine.setSpeed(parseFloat(e.target.value)));

    // แถบ Scrubbing
    const timelineScrubber = document.getElementById("timelineScrubber");
    if (timelineScrubber) {
      timelineScrubber.addEventListener("input", (e) => {
        timeEngine.seekToDay(parseInt(e.target.value, 10));
      });
    }

    // 5. ปุ่มมรสุมฉับพลัน
    this.bindScenarioBtn("btnScenarioRain", "rain");
    this.bindScenarioBtn("btnScenarioFlood", "flood");
    this.bindScenarioBtn("btnScenarioDrought", "drought");
    this.bindScenarioBtn("btnScenarioHeat", "heat");

    // 6. ปุ่มกำหนดภัยพิบัติตามช่วงเวลา (Disaster Window) พร้อม Re-Run เปรียบเทียบ
    const btnApplyWindow = document.getElementById("btnApplyDisasterWindow");
    if (btnApplyWindow) {
      btnApplyWindow.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious(); // บันทึกรอบเดิมไว้ก่อนเริ่มมรสุมใหม่

        const type = document.getElementById("disasterTypeSelect").value;
        const startDay = parseInt(document.getElementById("disasterStartDay").value, 10) || 30;
        const endDay = parseInt(document.getElementById("disasterEndDay").value, 10) || 75;
        timeEngine.scheduleDisasterWindow(type, startDay, endDay);

        const badge = document.getElementById("dispDisasterWindowBadge");
        if (badge) {
          if (type === "none") {
            badge.innerText = "ไม่มีภัยพิบัติพิเศษ";
            badge.style.display = "none";
          } else {
            const typeName = type === "flood" ? "น้ำท่วมขัง" : (type === "drought" ? "ฝนแล้งทิ้งช่วง" : "คลื่นความร้อน");
            badge.innerText = `⚠️ จำลอง ${typeName} ในวันที่ ${startDay} ถึง ${endDay}`;
            badge.style.display = "inline-block";
          }
        }
      });
    }

    // ปุ่ม Re-Run จำลองใหม่พร้อมเปรียบเทียบ
    const btnReRun = document.getElementById("btnReRunScenario");
    if (btnReRun) {
      btnReRun.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious();
        timeEngine.reset();
        timeEngine.play();
      });
    }

    // กล่องคู่มือชีวภาพ
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

  /**
   * บันทึกค่าผลผลิตของรอบปัจจุบันเป็น "รอบก่อนหน้า" (Previous Run) เพื่อแสดงผลเปรียบเทียบสีจางลง
   */
  snapshotCurrentRunAsPrevious() {
    const elPerRai = document.getElementById("dispYieldPerRai");
    if (!elPerRai) return;

    const currentYield = parseInt(elPerRai.innerText, 10) || 355;
    const currentStress = this.multipliers.f_stress;

    // คำนวณเส้นกราฟรอบเดิม
    const curve = [
      10,
      Math.round(35 * (currentStress >= 0.8 ? 1 : currentStress)),
      Math.round(70 * currentStress),
      Math.round(92 * currentStress),
      Math.round(100 * currentStress)
    ];

    this.previousRun = {
      yieldPerRai: currentYield,
      curve: curve
    };

    const compEl = document.getElementById("dispComparisonPill");
    if (compEl) {
      compEl.style.display = "inline-flex";
      compEl.innerHTML = `รอบก่อนหน้า: <strong>${currentYield} กก./ไร่</strong>`;
    }

    AnalyticsCharts.updateComparison([10, 35, 70, 92, 100], curve);
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
      this.snapshotCurrentRunAsPrevious();

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
      container.innerHTML = `<span style="font-size:11px; color:var(--text-muted); padding:4px 8px;">ยังไม่มีแปลงนา (คลิกปุ่มวาดแปลงด้านล่างเพื่อเริ่มต้น)</span>`;
      return;
    }

    paddies.forEach((p) => {
      const tab = document.createElement("button");
      tab.className = `paddy-tab ${p.id === activeId ? 'active' : ''}`;
      
      tab.innerHTML = `🌾 ${p.name} <span class="paddy-tab-del" title="ลบแปลงนี้">✕</span>`;
      
      // คลิกที่แท็บเพื่อเลือกแปลง
      tab.addEventListener("click", (e) => {
        if (e.target.classList.contains("paddy-tab-del")) {
          e.stopPropagation();
          if (this.mapManager) this.mapManager.deletePaddy(p.id);
        } else {
          if (this.mapManager) this.mapManager.selectPaddy(p.id);
        }
      });

      container.appendChild(tab);
    });
  },

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

  async handlePolygonUpdate(geometry, detectedProv = null, paddy = null, landUseInfo = null) {
    if (!geometry) {
      this.currentArea = { sqMeters: 0, totalRaiFloat: 0, formattedThai: "ยังไม่ได้วาดแปลง" };
      this.recalculateYield();
      return;
    }

    this.currentGeometry = geometry;
    const areaResult = AreaCalculator.calculateArea(geometry);
    this.currentArea = areaResult;
    this.landUseInfo = landUseInfo;

    const elAreaThai = document.getElementById("dispAreaThai");
    const elAreaSqM = document.getElementById("dispAreaSqM");
    if (elAreaThai) elAreaThai.innerText = areaResult.formattedThai;
    if (elAreaSqM) elAreaSqM.innerText = `${areaResult.sqMeters.toLocaleString()} ตร.ม.`;

    // แจ้งเตือนการใช้ประโยชน์ที่ดิน (Land-Use check)
    const elLandUseAlert = document.getElementById("dispLandUseAlert");
    if (elLandUseAlert) {
      if (landUseInfo && !landUseInfo.isPaddyArea) {
        elLandUseAlert.style.display = "block";
        elLandUseAlert.innerText = landUseInfo.warning;
      } else {
        elLandUseAlert.style.display = "none";
      }
    }

    if (detectedProv) {
      this.soilInfo.province = detectedProv.name_th;
      this.soilInfo.district = `อ.เมือง${detectedProv.name_th}`;
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

    if (this.mapManager) {
      this.mapManager.renderRiceVisuals(state.stage.id, state.activeEventState);
    }

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
        elWeatherDesc.innerText = "⚠️ ฝนตกสะสมหนัก เกิดน้ำท่วมขังแปลงนา!";
        elWeatherDesc.style.color = "#0284c7";
      } else if (state.activeEventState === "drought") {
        elWeatherDesc.innerText = "☀️ ฝนแล้งทิ้งช่วง ข้าวขาดน้ำ!";
        elWeatherDesc.style.color = "#ea580c";
      } else if (state.activeEventState === "heat") {
        elWeatherDesc.innerText = "🔥 อากาศร้อนจัด เสี่ยงเกสรลีบถาวร!";
        elWeatherDesc.style.color = "#dc2626";
      } else if (state.activeEventState === "rain") {
        elWeatherDesc.innerText = "🌧️ ฝนตกชุ่มฉ่ำ น้ำในแปลงเพียงพอ";
        elWeatherDesc.style.color = "#0284c7";
      } else {
        elWeatherDesc.innerText = "🌤️ สภาพอากาศปกติตามฤดูกาล";
        elWeatherDesc.style.color = "#16a34a";
      }
    }

    if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.recalculateYield(state.biomassRatio);
      });
    }
  },

  recalculateYield(biomassRatio = 1.0) {
    const { H, P, G, W, fertilityFactor } = this.modelParams;
    const areaSqM = this.currentArea.sqMeters || 15806;
    const areaRai = this.currentArea.totalRaiFloat || (areaSqM / 1600);

    if (areaSqM <= 0) return;

    // สมการที่ 3: ผลผลิตศักยภาพ (Ypot)
    const grainsPerSqM = H * P * G * fertilityFactor;
    const gramsPerSqM = (grainsPerSqM * W) / 1000;
    const kgPerSqM = gramsPerSqM / 1000;
    const Ypot = kgPerSqM * areaSqM;

    // สมการที่ 4: ผลผลิตปรับด้วยตัวคูณสิ่งแวดล้อมและมรสุม (Yfinal)
    const { f_soil, f_temp, f_climate, f_ndvi, f_stress } = this.multipliers;
    const totalMultiplier = f_soil * f_temp * f_climate * f_ndvi * f_stress;
    const YfinalFull = Ypot * totalMultiplier;

    const Ycurrent = YfinalFull * biomassRatio;
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
        elBench.style.color = "#15803d";
      } else if (diffPercent >= -20) {
        elBench.style.color = "#ca8a04";
      } else {
        elBench.style.color = "#b91c1c";
      }
    }

    // อัปเดตการเปรียบเทียบกับรอบก่อนหน้า (Process Comparison Diff)
    const elDiffBadge = document.getElementById("dispCompareDiff");
    if (this.previousRun && elDiffBadge) {
      const diffPrev = Math.round(Yrai - this.previousRun.yieldPerRai);
      const diffPctPrev = Math.round((diffPrev / this.previousRun.yieldPerRai) * 100);
      const sign = diffPrev >= 0 ? "+" : "";
      elDiffBadge.innerText = `${sign}${diffPrev} กก. (${sign}${diffPctPrev}%)`;
      elDiffBadge.className = diffPrev >= 0 ? "comparison-diff-badge gain" : "comparison-diff-badge drop";
    }

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
