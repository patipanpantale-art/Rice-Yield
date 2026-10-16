/**
 * แอปพลิเคชันหลัก (Application Orchestrator) - ธีมสว่างมินิมอล อบอุ่น สไตล์ Agritech
 * คุณสมบัติ:
 * 1. รองรับการกำหนดพันธุ์ข้าวรายแปลง (แต่ละแปลงเลือกพันธุ์ต่างกันได้)
 * 2. คำนวณผลผลิตรวมทั้งฟาร์ม (ตัน, ไร่, กก./ไร่) และแจกแจงรายแปลง (Per-Paddy Breakdown)
 * 3. สถานะเริ่มต้น 0 แปลงนา พร้อม Cute Waiting Animation (🌱 ➔ 🌿 ➔ 🌾) บนแผงขวา
 * 4. Gantt Multi-Track แสดงแถบการเติบโตทันทีเมื่อวาดแปลงเสร็จ (Point 6)
 * 5. สไลเดอร์ปรับความรุนแรงมรสุม 1-10 พร้อมคำนวณผลกระทบทางชีวภาพสมจริง (Point 8)
 * 6. ช่องกรอกวันมรสุมจำกัดไม่ให้เกินระยะเวลาของพันธุ์ข้าว (Point 7)
 * 7. สรุปเหตุการณ์ฝน/มรสุมลงในการ์ดผลลัพธ์โดยย่อและเข้าใจง่าย (Point 4)
 * 8. วันที่เริ่มปลูกแสดงผลรูปแบบไทย ว/ด/ป (เช่น 15/06/2569)
 * 9. รายงานวิเคราะห์ผลกระทบมรสุมแบบ Realtime ขณะที่เวลาจำลองกำลังเดิน
 * 10. วิดเจ็ตบนแผนที่ยืดหยุ่น ย้ายป้ายขอบเขตระบบไปที่ header ไม่รกแผนที่ (Point 5)
 */
const App = {
  mapManager: null,
  currentGeometry: null,
  currentArea: { sqMeters: 0, totalRaiFloat: 0, formattedThai: "ยังไม่มีแปลงนา" },

  // ตัวแปรชีวภาพปรับเทียบกับพันธุ์ข้าวไทย (สศก./กรมการข้าว)
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
  previousRun: null,

  // คำแนะนำปฏิทินเพาะปลูกตามสถิติสภาพอากาศ 2022 - 2026 และ Baseline 30 ปี
  yearAdvisories: {
    "2026": {
      badge: "ปี 2026 (พยากรณ์ล่วงหน้า - ลานีญากำลังอ่อน)",
      text: "🌤️ พยากรณ์ปี 2026 ลานีญากำลังอ่อน ฝนต้นฤดูสม่ำเสมอ แนะนำเริ่มปลูกช่วง 5 - 20 มิ.ย. เพื่อรับน้ำฝนแตกกอ",
      recommendedDate: "2026-06-15"
    },
    "2025": {
      badge: "ปี 2025 (สภาวะ ENSO Neutral สมดุล)",
      text: "⚖️ ปี 2025 สภาพอากาศปกติ ฝนตกตามเกณฑ์เฉลี่ย เหมาะสำหรับปลูกตามรอบฤดูกาลปกติ 10 - 25 มิ.ย.",
      recommendedDate: "2025-06-15"
    },
    "2024": {
      badge: "ปี 2024 (ลานีญา - ฝนมาเร็วและชุก)",
      text: "💡 ปี 2024 ฝนเริ่มมาเร็วตั้งแต่กลางเดือน พ.ค. หากเริ่มปลูกช่วง 25 พ.ค. - 10 มิ.ย. ข้าวจะได้น้ำสม่ำเสมอช่วงแตกกอ ควรระวังน้ำท่วมขังช่วง ส.ค.-ก.ย.",
      recommendedDate: "2024-06-01"
    },
    "2023": {
      badge: "ปี 2023 (เอลนีโญ - แล้งทิ้งช่วงกลางฤดู)",
      text: "⚠️ ปี 2023 เกิดสภาวะเอลนีโญ ฝนทิ้งช่วงแล้งจัดในเดือน มิ.ย.-ก.ค. หากเริ่มปลูกเดือน เม.ย.-พ.ค. ข้าวจะขาดน้ำแห้งตาย แนะนำเลื่อนปลูกเป็นกลางเดือน ก.ค. เพื่อรอฝนรอบสอง",
      recommendedDate: "2023-07-15"
    },
    "2022": {
      badge: "ปี 2022 (ลานีญาฝนชุก - ร่องมรสุมต่อเนื่อง)",
      text: "🌧️ ปี 2022 ร่องมรสุมเข้าต่อเนื่อง แปลงดอนได้ผลผลิตสูง แต่แปลงลุ่มเสี่ยงน้ำท่วมขัง ควรเลือกพันธุ์ข้าวทนน้ำท่วมฉับพลัน",
      recommendedDate: "2022-06-15"
    },
    "baseline": {
      badge: "ค่าเฉลี่ยภูมิอากาศ 30 ปี (TMD Normal Baseline)",
      text: "🌤️ สภาพอากาศปกติตามเกณฑ์ 30 ปี กรมอุตุนิยมวิทยา ฝนเริ่มตกปลาย พ.ค. ทิ้งช่วงสั้นๆ ต้น ก.ค. เริ่มปลูกได้ตั้งแต่ 1-15 มิ.ย.",
      recommendedDate: "2026-06-15"
    }
  },

  async init() {
    console.log("[App] เริ่มต้นระบบ Rice Yield Sandbox Simulator...");

    await this.checkBackendStatus();

    // 1. เริ่มต้นแผนที่ Leaflet ที่ซูมระดับจังหวัด (Zoom 9 เห็นภาพรวมจังหวัดขอนแก่น)
    this.mapManager = new MapManager("map");
    this.mapManager.init([16.4322, 102.8236], 9);

    // 2. เริ่มต้นกราฟ
    AnalyticsCharts.initGrowthChart("growthChart");
    AnalyticsCharts.initWeatherChart("weatherChart");

    this.bindEvents();
    this.bindCollapsibleSections();
    this.bindMinimizableTimeline();
    this.bindDisasterModal();
    this.bindDraggableMapWidgets();

    // 3. ดักจับเมื่อผู้ใช้วาดหรือเลือกแปลงนา
    this.mapManager.onPolygonChange((geometry, detectedProv, paddy, landUseInfo) => {
      this.handlePolygonUpdate(geometry, detectedProv, paddy, landUseInfo);
      this.updateDisasterInputLimits();
      this.renderGanttTracks(timeEngine.getState());
    });

    // 4. ดักจับการเปลี่ยนแปลงรายการแปลงนา (Point 6: แสดงผลในแถบ progress ทันที)
    this.mapManager.onPaddyListChange((paddies, activeId) => {
      this.renderPaddyTabs(paddies, activeId);
      this.updateDisasterInputLimits();
      this.renderGanttTracks(timeEngine.getState());
      this.recalculateYield();
    });

    // 5. ดักจับเหตุการณ์จาก TimeEngine
    timeEngine.onUpdate((state) => {
      this.handleTimeUpdate(state);
    });

    this.updateYearAdvisory("2024");
    this.updateDateFormatLabel("2026-06-15");
    this.updatePanelVisibility(0);
    this.updateDisasterInputLimits();
    this.renderResultDisasterSummary();
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
      // Backend ออฟไลน์ ใช้โหมดจำลองในตัว
    }

    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span class="status-dot" style="background:#d97706;"></span> ระบบจำลองในตัว (พร้อมวิเคราะห์ 77 จังหวัด)`;
      badge.style.background = "#fefce8";
      badge.style.color = "#b45309";
    }
  },

  formatThaiDate(dateStr) {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const thaiMonths = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const beYear = y + 543;
    const dd = String(d).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return `${dd}/${mm}/${beYear} (${d} ${thaiMonths[m]} ${beYear})`;
  },

  updateDateFormatLabel(dateStr) {
    const elFormatted = document.getElementById("dispFormattedDate");
    if (elFormatted) {
      elFormatted.innerText = `📅 รูปแบบ ว/ด/ป: ${this.formatThaiDate(dateStr)}`;
    }
  },

  /**
   * สลับหน้าต่างแผงขวา: หากยังไม่มีแปลงนา จะแสดง Cute Empty/Waiting Animation
   */
  updatePanelVisibility(paddyCount) {
    const emptyState = document.getElementById("rightPanelEmptyState");
    const content = document.getElementById("rightPanelContent");
    if (paddyCount === 0) {
      if (emptyState) emptyState.style.display = "flex";
      if (content) content.style.display = "none";
    } else {
      if (emptyState) emptyState.style.display = "none";
      if (content) content.style.display = "block";
    }
  },

  makeDraggable(element, handle) {
    if (!element || !handle) return;
    handle.style.cursor = "grab";
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
      isDragging = true;
      handle.style.cursor = "grabbing";
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      element.style.transform = "none";
      element.style.left = `${initialLeft}px`;
      element.style.top = `${initialTop}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${initialLeft + dx}px`;
      element.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        handle.style.cursor = "grab";
      }
    });
  },

  bindDraggableMapWidgets() {
    const paddyTabsWrapper = document.querySelector(".paddy-tabs-wrapper");
    if (paddyTabsWrapper) {
      this.makeDraggable(paddyTabsWrapper, paddyTabsWrapper);
    }

    const searchBar = document.querySelector(".map-search-bar-container");
    const searchWrap = document.querySelector(".map-search-input-wrap");
    if (searchBar && searchWrap) {
      this.makeDraggable(searchBar, searchWrap);
    }
  },

  /**
   * จำกัดค่าวันมรสุมไม่ให้เกินระยะเวลาของพันธุ์ข้าวที่มีอยู่ในแปลง (Point 7)
   */
  updateDisasterInputLimits() {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const varietyDays = { kdml105: 120, rd6: 130, rd41: 105 };
    let maxDays = 120;
    if (paddies.length > 0) {
      maxDays = Math.max(...paddies.map(p => varietyDays[p.variety] || 120));
    }

    const startInput = document.getElementById("disasterStartDay");
    const endInput = document.getElementById("disasterEndDay");

    if (startInput) {
      startInput.max = maxDays;
      if (parseInt(startInput.value, 10) > maxDays) startInput.value = Math.min(30, maxDays);
    }
    if (endInput) {
      endInput.max = maxDays;
      if (parseInt(endInput.value, 10) > maxDays) endInput.value = maxDays;
    }
  },

  /**
   * แสดงแทร็ก Gantt Chart ทันทีเมื่อมีแปลงนา (Point 6)
   */
  renderGanttTracks(state) {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const ganttBox = document.getElementById("multiVarietyGanttContainer");
    if (!ganttBox) return;

    if (paddies.length === 0) {
      ganttBox.style.display = "none";
      return;
    }

    ganttBox.style.display = "block";
    const varietyNames = {
      kdml105: "ขาวดอกมะลิ 105",
      rd6: "กข6",
      rd41: "กข41"
    };
    const varietyDays = {
      kdml105: 120,
      rd6: 130,
      rd41: 105
    };

    const currentDay = (state && state.currentDay) ? state.currentDay : 1;

    ganttBox.innerHTML = paddies.map((p) => {
      const v = p.variety || "kdml105";
      const totalD = varietyDays[v] || 120;
      const vName = varietyNames[v] || v;
      const prog = Math.min(100, Math.round((currentDay / totalD) * 100));
      const isReady = currentDay >= totalD;
      const statusText = isReady ? "🌾 สุกแก่เก็บเกี่ยวแล้ว" : `${prog}% (${currentDay}/${totalD} วัน)`;
      const barColor = isReady ? "#ca8a04" : "#16a34a";

      return `
        <div class="gantt-paddy-track">
          <div class="gantt-paddy-info">
            <span class="gantt-paddy-name">🌾 ${p.name}: <strong>${vName}</strong> (${totalD} วัน)</span>
            <span class="gantt-paddy-status" style="color:${isReady ? '#b45309' : '#15803d'}; font-weight:600;">${statusText}</span>
          </div>
          <div class="gantt-paddy-bar-bg">
            <div class="gantt-paddy-bar-fill" style="width: ${prog}%; background: ${barColor};"></div>
          </div>
        </div>
      `;
    }).join("");
  },

  /**
   * สรุปเหตุการณ์สภาพอากาศ & มรสุมในแผงผลลัพธ์โดยย่อและเข้าใจง่าย (Point 4)
   */
  renderResultDisasterSummary() {
    const elText = document.getElementById("dispDisasterSummaryText");
    if (!elText) return;

    const disasterDays = timeEngine.disasterDays || {};
    const days = Object.keys(disasterDays).map(Number).sort((a, b) => a - b);

    if (days.length === 0) {
      elText.innerHTML = `🌤️ <strong>สภาพอากาศปกติ:</strong> ตลอดฤดูกาลเพาะปลูกนี้ไม่มีมรสุมหรือภัยธรรมชาติรุนแรง ข้าวเจริญเติบโตเต็มศักยภาพ`;
      return;
    }

    const type = disasterDays[days[0]] ? disasterDays[days[0]].type : "flood";
    const sev = disasterDays[days[0]] ? disasterDays[days[0]].severity : 5;
    const startDay = days[0];
    const endDay = days[days.length - 1];
    const duration = days.length;

    const typeNames = {
      flood: "น้ำท่วมขัง (Flood)",
      drought: "ฝนแล้งทิ้งช่วง (Drought)",
      heat: "คลื่นความร้อน (Heatwave)",
      rain: "ฝนตกชุ่มฉ่ำ"
    };
    const tName = typeNames[type] || type;

    const fullLoss = timeEngine.calculateFullSeasonDisasterLoss();
    const lossPct = Math.round(fullLoss.totalLoss * 100);

    const affectedStages = [];
    if (startDay <= 20 || (startDay <= 20 && endDay >= 1)) affectedStages.push("ระยะต้นกล้า");
    if (startDay <= 50 && endDay >= 21) affectedStages.push("ระยะแตกกอ");
    if (startDay <= 90 && endDay >= 51) affectedStages.push("ระยะตั้งท้อง/สร้างรวง (วิกฤตสูงสุด)");
    if (endDay >= 91) affectedStages.push("ระยะสุกแก่");

    const stageStr = affectedStages.join(" ➔ ");

    elText.innerHTML = `
      🌧️ <strong>มรสุม ${tName}:</strong> วันที่ <strong>${startDay} - ${endDay}</strong> (รวม ${duration} วัน) | ความรุนแรงระดับ <strong>${sev}/10</strong><br>
      • <strong>ช่วงอายุที่กระทบ:</strong> ${stageStr}<br>
      • <strong>ผลต่อผลผลิต:</strong> ${lossPct > 0 ? `สูญเสียผลผลิตสะสมประมาณ <span style="color:#b91c1c; font-weight:700;">-${lossPct}%</span>` : 'กระทบเล็กน้อย ผลผลิตอยู่ในเกณฑ์ปกติ'}
    `;
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

        if (this.mapManager) {
          this.mapManager.updateActivePaddyVariety(val);
        }

        this.updateDisasterInputLimits();
        this.renderGanttTracks(timeEngine.getState());
        this.recalculateYield();
      });
    }

    // 2. ปีสภาพอากาศ
    const climateYearSelect = document.getElementById("climateYearSelect");
    if (climateYearSelect) {
      climateYearSelect.addEventListener("change", (e) => {
        const year = e.target.value;
        this.snapshotCurrentRunAsPrevious();
        timeEngine.setYear(year);
        this.updateYearAdvisory(year);
      });
    }

    const btnApplyAdvisoryDate = document.getElementById("btnApplyAdvisoryDate");
    if (btnApplyAdvisoryDate) {
      btnApplyAdvisoryDate.addEventListener("click", () => {
        const year = climateYearSelect ? climateYearSelect.value : "2024";
        const adv = this.yearAdvisories[year];
        if (adv && adv.recommendedDate) {
          const dateInput = document.getElementById("plantDate");
          if (dateInput) {
            dateInput.value = adv.recommendedDate;
            this.updateDateFormatLabel(adv.recommendedDate);
          }
          timeEngine.setPlantDate(adv.recommendedDate);
        }
      });
    }

    const dateInput = document.getElementById("plantDate");
    if (dateInput) {
      dateInput.addEventListener("change", (e) => {
        timeEngine.setPlantDate(e.target.value);
        this.updateDateFormatLabel(e.target.value);
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

    if (btnPlay) {
      btnPlay.addEventListener("click", () => {
        if (!this.mapManager || this.mapManager.paddies.length === 0) {
          alert("กรุณาใช้เครื่องมือ \"วาดแปลง\" บนแผนที่ก่อนเริ่มการจำลองผลผลิตข้าว!");
          return;
        }
        const varietySelect = document.getElementById("riceVariety");
        if (!varietySelect || !varietySelect.value) {
          alert("กรุณาเลือกชนิดพันธุ์ข้าวก่อนเริ่มการจำลอง!");
          return;
        }
        timeEngine.play();
      });
    }

    if (btnPause) btnPause.addEventListener("click", () => timeEngine.pause());
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious();
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

    // 6. ตัวเลือกสไลเดอร์ระดับความรุนแรง 1 - 10
    const inputSeverity = document.getElementById("inputDisasterSeverity");
    const dispSeverityVal = document.getElementById("dispSeverityVal");
    const dispSeverityDesc = document.getElementById("dispDisasterSeverityDesc");

    const severityDescriptions = {
      1: "🌱 ระดับ 1: ฝนตกปรอยๆ หรือแล้งสั้นๆ ไม่กระทบผลผลิต",
      2: "🌱 ระดับ 2: ฝนตกเบาบาง ข้าวเจริญเติบโตได้ตามปกติ",
      3: "💧 ระดับ 3: ฝนปานกลาง น้ำขังเล็กน้อย ไม่กระทบการแตกกอ",
      4: "💧 ระดับ 4: น้ำท่วมข้อเท้า ข้าวชะงักการเจริญเติบโตเล็กน้อย (~5-10%)",
      5: "🌊 ระดับ 5: น้ำท่วมปานกลาง ท่วมถึงโคนต้น แตกกอลดลง (~15-25%)",
      6: "🌊 ระดับ 6: น้ำท่วมกึ่งเอว หากเกิดช่วงตั้งท้องดอกเริ่มฝ่อ (~25-35%)",
      7: "⚠️ ระดับ 7: มรสุมรุนแรง น้ำท่วมสูงหรือแล้งจัดดินแตก (~40-55%)",
      8: "⚠️ ระดับ 8: พายุพัดถล่ม น้ำท่วมมิดยอดรวง เสียหายรุนแรง (~55-70%)",
      9: "🚨 ระดับ 9: อุทกภัย/ภัยแล้งวิกฤต ต้นข้าวเน่าตายส่วนใหญ่ (>75%)",
      10: "🚨 ระดับ 10: มหันตภัยธรรมชาติขั้นสูงสุด ผลผลิตเสียหายสิ้นเชิง (100%)"
    };

    if (inputSeverity) {
      inputSeverity.addEventListener("input", (e) => {
        const sev = parseInt(e.target.value, 10);
        if (dispSeverityVal) dispSeverityVal.innerText = `ระดับ ${sev} / 10`;
        if (dispSeverityDesc) dispSeverityDesc.innerText = severityDescriptions[sev] || `ระดับ ${sev}`;
      });
    }

    // 7. ช่องกรอกวันและปุ่มบันทึกมรสุมตามช่วงเวลา (Point 7: ป้องกันกรอกเกินระยะเวลาข้าว)
    const startInput = document.getElementById("disasterStartDay");
    const endInput = document.getElementById("disasterEndDay");

    const validateDays = () => {
      const maxAllowed = parseInt(endInput.max, 10) || 120;
      let s = parseInt(startInput.value, 10);
      let e = parseInt(endInput.value, 10);

      if (isNaN(s) || s < 1) s = 1;
      if (s > maxAllowed) s = maxAllowed;
      startInput.value = s;

      if (isNaN(e) || e < 1) e = 1;
      if (e > maxAllowed) e = maxAllowed;
      if (e < s) e = s;
      endInput.value = e;
    };

    if (startInput) {
      startInput.addEventListener("change", validateDays);
      startInput.addEventListener("input", validateDays);
    }
    if (endInput) {
      endInput.addEventListener("change", validateDays);
      endInput.addEventListener("input", validateDays);
    }

    const btnApplyWindow = document.getElementById("btnApplyDisasterWindow");
    if (btnApplyWindow) {
      btnApplyWindow.addEventListener("click", () => {
        validateDays();
        this.snapshotCurrentRunAsPrevious();

        const type = document.getElementById("disasterTypeSelect").value;
        const sDay = parseInt(startInput.value, 10) || 1;
        const eDay = parseInt(endInput.value, 10) || 120;
        const sev = inputSeverity ? parseInt(inputSeverity.value, 10) : 5;

        timeEngine.scheduleDisasterWindow(type, sDay, eDay, sev);

        const badge = document.getElementById("dispDisasterWindowBadge");
        if (badge) {
          if (type === "none") {
            badge.innerText = "ไม่มีภัยพิบัติพิเศษ";
            badge.style.display = "none";
          } else {
            const typeName = type === "flood" ? "น้ำท่วมขัง" : (type === "drought" ? "ฝนแล้งทิ้งช่วง" : "คลื่นความร้อน");
            badge.innerText = `⚠️ จำลอง ${typeName} ในวันที่ ${sDay} ถึง ${eDay} (ความรุนแรงระดับ ${sev}/10)`;
            badge.style.display = "inline-block";
          }
        }

        this.renderResultDisasterSummary();
        this.recalculateYield();
      });
    }

    // 8. ปุ่ม Re-Run
    const btnReRun = document.getElementById("btnReRunScenario");
    if (btnReRun) {
      btnReRun.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious();
        timeEngine.reset();
        timeEngine.play();
      });
    }

    // 9. ปุ่มเลื่อนแท็บแปลงนา
    const btnTabPrev = document.getElementById("btnPaddyTabPrev");
    const btnTabNext = document.getElementById("btnPaddyTabNext");
    const tabsContainer = document.getElementById("paddyTabsContainer");
    if (btnTabPrev && tabsContainer) {
      btnTabPrev.addEventListener("click", () => {
        tabsContainer.scrollBy({ left: -140, behavior: "smooth" });
      });
    }
    if (btnTabNext && tabsContainer) {
      btnTabNext.addEventListener("click", () => {
        tabsContainer.scrollBy({ left: 140, behavior: "smooth" });
      });
    }
  },

  bindCollapsibleSections() {
    document.querySelectorAll(".panel-section.collapsible").forEach((sec) => {
      const heading = sec.querySelector(".panel-heading");
      if (heading) {
        heading.addEventListener("click", (e) => {
          if (e.target.closest(".info-tooltip")) return;
          sec.classList.toggle("collapsed");
        });
      }
    });
  },

  bindMinimizableTimeline() {
    const btnToggle = document.getElementById("btnToggleTimeline");
    const overlay = document.getElementById("timelineOverlay");
    if (btnToggle && overlay) {
      btnToggle.addEventListener("click", () => {
        overlay.classList.toggle("minimized");
      });
    }
  },

  bindDisasterModal() {
    const btnOpen = document.getElementById("btnOpenDisasterReport");
    const btnClose = document.getElementById("btnCloseDisasterReport");
    const modal = document.getElementById("modalDisasterReport");
    const header = document.getElementById("disasterModalHeader");

    if (btnOpen && modal) {
      btnOpen.addEventListener("click", () => {
        this.renderDisasterReport();
        modal.style.display = "block";
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    if (header && modal) {
      this.makeDraggable(modal, header);
    }
  },

  /**
   * เรนเดอร์ข้อมูลในหน้าต่างวิเคราะห์มรสุม (Draggable Modal) แบบสมจริง (Point 8)
   */
  renderDisasterReport() {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const activePaddy = paddies.find((p) => p.id === this.mapManager.activePaddyId) || paddies[0];

    const { H, P, G, W, fertilityFactor } = this.modelParams;
    const areaSqM = activePaddy && activePaddy.areaResult ? activePaddy.areaResult.sqMeters : (this.currentArea.sqMeters || 1600);
    const areaRai = areaSqM / 1600;

    const grainsPerSqM = H * P * G * fertilityFactor;
    const kgPerSqM = ((grainsPerSqM * W) / 1000) / 1000;
    const Ypot = kgPerSqM * areaSqM;

    const { f_soil, f_temp, f_climate, f_ndvi } = this.multipliers;

    // คำนวณค่าสูญเสียตลอดฤดูกาลที่สะท้อนหน้ามรสุมทั้งหมดอย่างแท้จริง
    const disasterImpact = timeEngine.calculateFullSeasonDisasterLoss();
    const effectiveStress = disasterImpact.f_stress;

    // ผลผลิตแบบไม่เจอมรสุม (f_stress = 1.0)
    const baseMult = f_soil * f_temp * f_climate * f_ndvi * 1.0;
    const baseTotalTons = (Ypot * baseMult) / 1000;
    const baseYieldPerRai = Math.round((Ypot * baseMult) / areaRai);

    // ผลผลิตจริงที่เจอมรสุม
    const actualMult = f_soil * f_temp * f_climate * f_ndvi * effectiveStress;
    const actualTotalTons = (Ypot * actualMult) / 1000;
    const actualYieldPerRai = Math.round((Ypot * actualMult) / areaRai);

    const diffKg = actualYieldPerRai - baseYieldPerRai;
    const diffPct = baseYieldPerRai > 0 ? Math.round((diffKg / baseYieldPerRai) * 100) : 0;

    const elBaseY = document.getElementById("dispModalBaseYield");
    const elBaseT = document.getElementById("dispModalBaseTotal");
    const elActY = document.getElementById("dispModalActualYield");
    const elActT = document.getElementById("dispModalActualTotal");
    const elLossBanner = document.getElementById("dispModalLossBanner");
    const elTimeline = document.getElementById("dispModalDisasterTimeline");

    if (elBaseY) elBaseY.innerText = `${baseYieldPerRai} กก./ไร่`;
    if (elBaseT) elBaseT.innerText = `${baseTotalTons.toFixed(2)} ตัน`;
    if (elActY) elActY.innerText = `${actualYieldPerRai} กก./ไร่`;
    if (elActT) elActT.innerText = `${actualTotalTons.toFixed(2)} ตัน`;

    if (elLossBanner) {
      if (diffKg < 0) {
        elLossBanner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> สูญเสียผลผลิต: <strong>${diffKg} กก./ไร่ (${diffPct}%)</strong>`;
        elLossBanner.style.background = "#fee2e2";
        elLossBanner.style.borderColor = "#fecaca";
        elLossBanner.style.color = "#b91c1c";
      } else {
        elLossBanner.innerHTML = `<i class="fa-solid fa-circle-check"></i> ไม่เกิดความเสียหายจากมรสุม: ผลผลิตสมบูรณ์ตามศักยภาพ`;
        elLossBanner.style.background = "#f0fdf4";
        elLossBanner.style.borderColor = "#bbf7d0";
        elLossBanner.style.color = "#15803d";
      }
    }

    if (elTimeline) {
      const disasterDays = timeEngine.disasterDays || {};
      const days = Object.keys(disasterDays).map(Number).sort((a, b) => a - b);

      if (days.length === 0) {
        elTimeline.innerHTML = `<div style="font-size:11px; color:var(--text-muted); padding:8px; text-align:center;">
          ☀️ ตลอดฤดูกาลเพาะปลูกนี้ไม่มีเหตุการณ์มรสุมหรือภัยธรรมชาติรุนแรง
        </div>`;
      } else {
        const ranges = [];
        let curRange = null;

        days.forEach((d) => {
          const item = disasterDays[d];
          const type = item.type;
          const sev = item.severity || 5;
          if (!curRange || curRange.type !== type || d !== curRange.end + 1) {
            if (curRange) ranges.push(curRange);
            curRange = { type, start: d, end: d, severity: sev };
          } else {
            curRange.end = d;
          }
        });
        if (curRange) ranges.push(curRange);

        elTimeline.innerHTML = ranges.map((r) => {
          const typeName = r.type === "flood" ? "น้ำท่วมขัง" : (r.type === "drought" ? "ฝนแล้งทิ้งช่วง" : (r.type === "heat" ? "คลื่นความร้อน" : "ฝนชุ่มฉ่ำ"));
          const typeIcon = r.type === "flood" ? "fa-water" : (r.type === "drought" ? "fa-sun" : "fa-temperature-arrow-up");
          const duration = r.end - r.start + 1;
          const sev = r.severity || 5;

          const affectedStages = [];
          if (r.start <= 20 || (r.start <= 20 && r.end >= 1)) affectedStages.push("ระยะต้นกล้า");
          if (r.start <= 50 && r.end >= 21) affectedStages.push("ระยะแตกกอ");
          if (r.start <= 90 && r.end >= 51) affectedStages.push("ระยะตั้งท้อง/สร้างรวง (วิกฤตสูงสุด)");
          if (r.end >= 91) affectedStages.push("ระยะสุกแก่");

          let stageDesc = affectedStages.join(" ➔ ");
          if (r.start <= 20 && r.end >= 85) {
            stageDesc = "กระทบทั้งฤดูกาลเพาะปลูก (ทุกช่วงการเจริญเติบโต)";
          }

          // ประเมินระดับความเสียหาย 1 - 5 สมจริงตามการเกษตร (Point 8)
          const hitsFlowering = (r.start <= 85 && r.end >= 50);
          const isFullSeason = (r.start <= 20 && r.end >= 85);

          let severityLevel = 1;
          if (isFullSeason || duration >= 50 || sev >= 9) {
            severityLevel = 5; // วิกฤตมหันตภัย สูญเสียผลผลิต >75%
          } else if ((hitsFlowering && (duration >= 14 || sev >= 7)) || (duration >= 30)) {
            severityLevel = 4; // รุนแรงมาก (~50-70%)
          } else if ((hitsFlowering && duration >= 7) || duration >= 20 || sev >= 5) {
            severityLevel = 3; // ปานกลางถึงหนัก (~25-45%)
          } else if (duration >= 10 || sev >= 3) {
            severityLevel = 2; // พอใช้ (~10-20%)
          } else {
            severityLevel = 1; // เล็กน้อย (<10%)
          }

          const sevColors = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
          const sevColor = sevColors[severityLevel - 1];

          return `<div class="disaster-event-item">
            <div>
              <div style="font-weight:600; color:var(--text-primary);">
                <i class="fa-solid ${typeIcon}" style="color:${sevColor};"></i> ${typeName} (วันที่ ${r.start} - ${r.end})
              </div>
              <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                กระทบ: ${stageDesc} (${duration} วัน) | ความรุนแรงที่ตั้งไว้: ระดับ ${sev}/10
              </div>
            </div>
            <div class="disaster-severity-pill" style="background:${sevColor}20; color:${sevColor}; border:1px solid ${sevColor}40;">
              ความเสียหายระดับ ${severityLevel}/5
            </div>
          </div>`;
        }).join("");
      }
    }
  },

  snapshotCurrentRunAsPrevious() {
    const elPerRai = document.getElementById("dispYieldPerRai");
    if (!elPerRai) return;

    const currentYield = parseInt(elPerRai.innerText, 10) || 355;
    const currentStress = this.multipliers.f_stress;

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
      this.renderResultDisasterSummary();
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
      container.innerHTML = `<span class="paddy-tab-empty-hint">🌱 ยังไม่มีแปลงนา (คลิกเครื่องมือวาดแปลงเพื่อเริ่มต้น)</span>`;
      return;
    }

    const varietyShortNames = {
      kdml105: "มะลิ 105",
      rd6: "กข6",
      rd41: "กข41"
    };

    paddies.forEach((p) => {
      const tab = document.createElement("button");
      tab.className = `paddy-tab ${p.id === activeId ? 'active' : ''}`;
      const vTag = varietyShortNames[p.variety] || p.variety || "มะลิ 105";
      
      tab.innerHTML = `🌾 ${p.name} <span style="font-size:10px; opacity:0.85; margin-left:2px;">(${vTag})</span> <span class="paddy-tab-del" title="ลบแปลงนี้">✕</span>`;
      
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
      return { lvl: 1, label: "แย่มาก (>37°C)", desc: "อากาศร้อนจัดวิกฤต เกสรเป็นหมันถาวร เมล็ดข้าวลีบ" };
    } else if (type === "climate") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (น้ำสมบูรณ์)", desc: "ปริมาณน้ำเพียงพอต่อความต้องการตลอดช่วงอายุข้าว (FAO-33)" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (เพียงพอ)", desc: "น้ำในแปลงพอเหมาะ ข้าวเจริญเติบโตได้ดี" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง", desc: "เริ่มมีฝนทิ้งช่วงสั้นๆ อาจกระทบเล็กน้อยหากเป็นข้าวนาดอน" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (ขาดน้ำ)", desc: "ฝนแล้งติดต่อกัน ข้าวเริ่มแสดงอาการใบเหี่ยว" };
      return { lvl: 1, label: "แย่มาก (แล้งวิกฤต)", desc: "แล้งรุนแรง ดินแตกระแหง ข้าวชะงักการสร้างแป้ง" };
    } else if (type === "ndvi") {
      if (val >= 0.95) return { lvl: 5, label: "ดีมาก (ทรงพุ่มแน่น)", desc: "ดัชนีพืชพรรณสูงมาก ทรงพุ่มหนาแน่น สังเคราะห์แสงได้เต็มที่" };
      if (val >= 0.85) return { lvl: 4, label: "ดี (พืชแข็งแรง)", desc: "พืชมีความแข็งแรงและเขียวสดตามเกณฑ์มาตรฐาน" };
      if (val >= 0.70) return { lvl: 3, label: "ปานกลาง", desc: "ทรงพุ่มโปร่งปานกลาง อาจมีการเจริญเติบโตช้าบางส่วน" };
      if (val >= 0.50) return { lvl: 2, label: "พอใช้ (แคระแกร็น)", desc: "พืชมีอาการใบเหลืองหรือแคระแกร็นจากความเครียดสิ่งแวดล้อม" };
      return { lvl: 1, label: "แย่มาก (เสียหาย)", desc: "พืชเสียหายรุนแรง ขาดสารอาหาร หรือโดนโรคแมลงรบกวน" };
    }
    return { lvl: 3, label: "ปานกลาง", desc: "" };
  },

  async handlePolygonUpdate(geometry, detectedProv = null, paddy = null, landUseInfo = null) {
    if (!geometry) {
      this.currentArea = { sqMeters: 0, totalRaiFloat: 0, formattedThai: "ยังไม่มีแปลงนา" };
      this.updatePanelVisibility(this.mapManager ? this.mapManager.paddies.length : 0);
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

    const elLandUseAlert = document.getElementById("dispLandUseAlert");
    if (elLandUseAlert) {
      if (landUseInfo && !landUseInfo.isPaddyArea) {
        elLandUseAlert.style.display = "block";
        elLandUseAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> ${landUseInfo.warning}`;
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

    // Render Gantt Tracks
    this.renderGanttTracks(state);

    const wm = state.weatherMultipliers;
    this.multipliers.f_temp = wm.f_temp;
    this.multipliers.f_climate = wm.f_climate;
    this.multipliers.f_stress = wm.f_stress;

    if (this.mapManager) {
      this.mapManager.renderRiceVisuals(state.stage.id, state.activeEventState);
    }

    const elRain = document.getElementById("dispCurRain");
    const elCumRain = document.getElementById("dispCumulativeRain");
    const elTemp = document.getElementById("dispCurTemp");
    const elCdd = document.getElementById("dispCdd");
    const elCwd = document.getElementById("dispCwd");
    const elWeatherDesc = document.getElementById("dispWeatherDesc");

    if (elRain) elRain.innerText = `${state.rain} มม./วัน`;
    if (elCumRain) elCumRain.innerText = `สะสมใน Process นี้: ${state.cumulativeProcessRain || 0} มม.`;
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

    // อัปเดตหน้าต่างสรุปผลกระทบมรสุมแบบ Realtime
    const modal = document.getElementById("modalDisasterReport");
    if (modal && modal.style.display === "block") {
      this.renderDisasterReport();
    }

    this.renderResultDisasterSummary();

    if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.recalculateYield(state.biomassRatio);
      });
    }
  },

  /**
   * คำนวณผลผลิตรวมทั้งฟาร์ม (ตัน, กก./ไร่) และแจกแจงรายแปลง
   */
  recalculateYield(biomassRatio = 1.0) {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];

    if (paddies.length === 0) {
      this.updatePanelVisibility(0);
      const ganttBox = document.getElementById("multiVarietyGanttContainer");
      if (ganttBox) ganttBox.style.display = "none";
      return;
    }

    this.updatePanelVisibility(paddies.length);

    const varietySpecs = {
      kdml105: { name: "ขาวดอกมะลิ 105", duration: 120, H: 16, P: 8, G: 95, W: 25.5 },
      rd6: { name: "กข6", duration: 130, H: 16, P: 9, G: 100, W: 26.5 },
      rd41: { name: "กข41", duration: 105, H: 20, P: 10, G: 110, W: 27.5 }
    };

    const fertilityFactor = this.modelParams.fertilityFactor || 0.82;
    const { f_soil, f_temp, f_climate, f_ndvi, f_stress } = this.multipliers;
    const totalMultiplier = f_soil * f_temp * f_climate * f_ndvi * f_stress;
    const baseMultNoStress = f_soil * f_temp * f_climate * f_ndvi * 1.0;

    let totalFarmSqM = 0;
    let totalFarmRai = 0;
    let totalFarmTons = 0;
    let totalFarmPotTons = 0;
    let totalFarmFinalKg = 0;
    let totalFarmNoStressKg = 0;

    const breakdownItems = [];

    paddies.forEach((p) => {
      const vKey = p.variety || "kdml105";
      const spec = varietySpecs[vKey] || varietySpecs["kdml105"];
      
      const sqM = (p.areaResult && p.areaResult.sqMeters) ? p.areaResult.sqMeters : (p.geometry ? AreaCalculator.calculateArea(p.geometry).sqMeters : 1600);
      const rai = sqM / 1600;

      // สมการที่ 3: ศักยภาพผลผลิตตามพันธุกรรม (Ypot)
      const grainsPerSqM = spec.H * spec.P * spec.G * fertilityFactor;
      const kgPerSqM = ((grainsPerSqM * spec.W) / 1000) / 1000;
      const paddyYpot = kgPerSqM * sqM;
      const paddyYpotTons = paddyYpot / 1000;

      // สมการที่ 4: ผลผลิตหลังปรับลดด้วยสิ่งแวดล้อมและมรสุม (Yfinal)
      const paddyYfinal = paddyYpot * totalMultiplier;
      const paddyYcurrent = paddyYfinal * biomassRatio;
      const paddyTons = paddyYcurrent / 1000;
      const paddyKgPerRai = rai > 0 ? (paddyYfinal / rai) : 0;
      const paddyNoStressKg = paddyYpot * baseMultNoStress;

      totalFarmSqM += sqM;
      totalFarmRai += rai;
      totalFarmTons += paddyTons;
      totalFarmPotTons += paddyYpotTons;
      totalFarmFinalKg += paddyYfinal;
      totalFarmNoStressKg += paddyNoStressKg;

      const isActive = (p.id === this.mapManager.activePaddyId);
      const formattedArea = p.areaResult ? p.areaResult.formattedThai : `${rai.toFixed(2)} ไร่`;

      breakdownItems.push(`
        <div class="paddy-breakdown-card ${isActive ? 'active' : ''}" onclick="window.App.mapManager.selectPaddy('${p.id}')">
          <div class="paddy-breakdown-header">
            <span class="paddy-breakdown-name">🌾 ${p.name}</span>
            <span class="paddy-breakdown-variety-tag">${spec.name} (${spec.duration} วัน)</span>
          </div>
          <div class="paddy-breakdown-grid">
            <div>
              <span class="paddy-breakdown-lbl">ขนาดพื้นที่:</span>
              <span class="paddy-breakdown-val">${formattedArea} (${rai.toFixed(2)} ไร่)</span>
            </div>
            <div>
              <span class="paddy-breakdown-lbl">ผลผลิตคาดการณ์:</span>
              <span class="paddy-breakdown-val" style="color:var(--rice-green); font-weight:700;">${paddyTons.toFixed(2)} ตัน (${Math.round(paddyKgPerRai)} กก./ไร่)</span>
            </div>
            <div>
              <span class="paddy-breakdown-lbl">ศักยภาพสูงสุด:</span>
              <span class="paddy-breakdown-val">${paddyYpotTons.toFixed(2)} ตัน</span>
            </div>
            <div>
              <span class="paddy-breakdown-lbl">สถานะแปลง:</span>
              <span class="paddy-breakdown-val" style="color:#15803d;">${isActive ? '● กำลังเลือก' : 'ปกติ'}</span>
            </div>
          </div>
        </div>
      `);
    });

    const avgKgPerRai = totalFarmRai > 0 ? (totalFarmFinalKg / totalFarmRai) : 0;
    const avgNoStressKgPerRai = totalFarmRai > 0 ? (totalFarmNoStressKg / totalFarmRai) : 0;

    const elTotal = document.getElementById("dispTotalYield");
    const elPerRai = document.getElementById("dispYieldPerRai");
    const elPot = document.getElementById("dispPotYield");
    const elBench = document.getElementById("dispOaeBenchmark");
    const elBreakdown = document.getElementById("paddyBreakdownList");

    if (elTotal) {
      elTotal.innerText = `${totalFarmTons.toFixed(2)} ตัน`;
    }
    if (elPerRai) {
      elPerRai.innerText = `${Math.round(avgKgPerRai)} กก./ไร่`;
    }
    if (elPot) {
      elPot.innerText = `ศักยภาพรวม: ${totalFarmPotTons.toFixed(2)} ตัน`;
    }

    if (elBreakdown) {
      elBreakdown.innerHTML = breakdownItems.join("");
    }

    // เปรียบเทียบกับค่าเฉลี่ย สศก. (356 กก./ไร่)
    const oaeBenchmark = 356;
    const diffPercent = Math.round(((avgKgPerRai - oaeBenchmark) / oaeBenchmark) * 100);
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

    // Ghost Pill หากไม่เกิดมรสุม
    const elDisasterGhost = document.getElementById("dispDisasterGhostPill");
    if (elDisasterGhost) {
      if (f_stress < 0.99) {
        elDisasterGhost.style.display = "inline-flex";
        elDisasterGhost.innerText = `🌾 หากไม่เกิดมรสุม: ${Math.round(avgNoStressKgPerRai)} กก./ไร่`;
      } else {
        elDisasterGhost.style.display = "none";
      }
    }

    // อัปเดตการเปรียบเทียบกับรอบก่อนหน้า
    const elDiffBadge = document.getElementById("dispCompareDiff");
    if (this.previousRun && elDiffBadge) {
      const diffPrev = Math.round(avgKgPerRai - this.previousRun.yieldPerRai);
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

    this.renderResultDisasterSummary();
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
