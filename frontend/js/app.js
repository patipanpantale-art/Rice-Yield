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
    this.bindPopups();

    // 3. ดักจับเมื่อผู้ใช้วาดหรือเลือกแปลงนา (Point 4, 6: แสดงผลในแถบ progress และหน้าต่างขวาทันที)
    this.mapManager.onPolygonChange((geometry, detectedProv, paddy, landUseInfo) => {
      this.handlePolygonUpdate(geometry, detectedProv, paddy, landUseInfo);
      this.updatePanelVisibility(this.mapManager ? this.mapManager.paddies.length : (geometry ? 1 : 0));
      this.syncMaxFarmDuration();
      this.updateDisasterInputLimits();
      this.renderGanttTracks(timeEngine.getState());
      this.recalculateYield();
    });

    // 4. ดักจับการเปลี่ยนแปลงรายการแปลงนา (Point 4, 6)
    this.mapManager.onPaddyListChange((paddies, activeId) => {
      this.renderPaddyTabs(paddies, activeId);
      this.updatePanelVisibility(paddies ? paddies.length : 0);
      this.syncMaxFarmDuration();
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
    this.syncMaxFarmDuration();
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

  /**
   * ระบบแจ้งเตือนภายในหน้าเว็บ (In-App Alert Popup) แทนเบราว์เซอร์ alert (Point 2)
   */
  showAlert(title, message, type = "warning") {
    const modal = document.getElementById("appAlertModal");
    const elTitle = document.getElementById("appAlertTitle");
    const elMsg = document.getElementById("appAlertMessage");
    const elIcon = document.getElementById("appAlertIcon");
    const elWrap = document.getElementById("appAlertIconWrap");

    if (!modal) {
      alert(`${title}\n${message}`);
      return;
    }

    if (elTitle) elTitle.innerText = title;
    if (elMsg) elMsg.innerText = message;

    if (elIcon && elWrap) {
      if (type === "warning") {
        elIcon.className = "fa-solid fa-triangle-exclamation";
        elWrap.className = "app-popup-icon warning";
      } else if (type === "info") {
        elIcon.className = "fa-solid fa-circle-info";
        elWrap.className = "app-popup-icon info";
      } else if (type === "success") {
        elIcon.className = "fa-solid fa-circle-check";
        elWrap.className = "app-popup-icon success";
      }
    }

    modal.style.display = "flex";
  },

  closeAlert() {
    const modal = document.getElementById("appAlertModal");
    if (modal) modal.style.display = "none";
  },

  /**
   * ผูกเหตุการณ์ Modal แจ้งเตือน และ Modal คำชี้แจงเพื่อการศึกษา (Point 2, 3)
   */
  bindPopups() {
    // 1. In-App Alert Popup
    const alertModal = document.getElementById("appAlertModal");
    const btnCloseAlert = document.getElementById("btnAppAlertClose");
    if (btnCloseAlert) {
      btnCloseAlert.addEventListener("click", () => this.closeAlert());
    }
    if (alertModal) {
      alertModal.addEventListener("click", (e) => {
        if (e.target === alertModal) this.closeAlert();
      });
    }

    // 2. Welcome Disclaimer Modal (คำชี้แจงเพื่อการศึกษา & ขอบเขตประเทศไทย)
    const welcomeModal = document.getElementById("welcomeDisclaimerModal");
    const btnAccept = document.getElementById("btnWelcomeAccept");
    const btnOpenAbout = document.getElementById("btnOpenAboutModal");

    const closeWelcome = () => {
      if (welcomeModal) welcomeModal.style.display = "none";
      try {
        sessionStorage.setItem("rice_sim_welcome_seen", "true");
      } catch (e) {}
    };

    if (btnAccept) {
      btnAccept.addEventListener("click", closeWelcome);
    }

    if (btnOpenAbout) {
      btnOpenAbout.addEventListener("click", () => {
        if (welcomeModal) welcomeModal.style.display = "flex";
      });
    }

    if (welcomeModal) {
      welcomeModal.addEventListener("click", (e) => {
        if (e.target === welcomeModal) closeWelcome();
      });
    }

    // เปิด Welcome Modal อัตโนมัติเมื่อเข้าใช้งานครั้งแรกใน Session
    try {
      const hasSeen = sessionStorage.getItem("rice_sim_welcome_seen");
      if (!hasSeen && welcomeModal) {
        welcomeModal.style.display = "flex";
      }
    } catch (e) {
      if (welcomeModal) welcomeModal.style.display = "flex";
    }

    // กด ESC เพื่อปิด Modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAlert();
        if (welcomeModal) welcomeModal.style.display = "none";
      }
    });
  },

  bindDraggableMapWidgets() {
    // ปิดการลากแถบควบคุมบนแผนที่ ล็อกให้อยู่กับที่ถาวร ไม่หายเมื่อคลิกหรือพิมพ์ (Point 1, 3)
  },

  getActivePaddy() {
    if (!this.mapManager || !this.mapManager.paddies) return null;
    return this.mapManager.paddies.find((p) => String(p.id) === String(this.mapManager.activePaddyId)) || null;
  },

  /**
   * ซิงก์ระยะเวลาของทั้งฟาร์ม ให้ Progress Bar และ TimeEngine อิงจากพันธุ์ข้าวที่ใช้เวลาเติบโตนานสุด (Point 3)
   */
  syncMaxFarmDuration() {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const varietyDays = { kdml105: 120, rd6: 130, rd41: 105 };
    let maxDays = 120;

    if (paddies.length > 0) {
      const allDays = paddies.map((p) => {
        const v = (p.params && p.params.variety) || p.variety || "kdml105";
        const d = (p.params && Number(p.params.durationDays)) || varietyDays[v] || 120;
        return (isNaN(d) || d <= 0) ? 120 : d;
      });
      maxDays = Math.max(...allDays);
    } else {
      const varietySelect = document.getElementById("riceVariety");
      const currentVariety = varietySelect ? varietySelect.value : "kdml105";
      maxDays = varietyDays[currentVariety] || 120;
    }

    if (window.timeEngine) {
      timeEngine.setVarietyDuration(maxDays);
    }

    const scrubber = document.getElementById("timelineScrubber");
    if (scrubber) {
      scrubber.max = maxDays;
      if (Number(scrubber.value) > maxDays) scrubber.value = maxDays;
    }

    const dispDap = document.getElementById("dispDap");
    if (dispDap && window.timeEngine) {
      dispDap.innerText = `วันที่ ${timeEngine.currentDay} / ${maxDays}`;
    }

    const dispPercent = document.getElementById("dispPercent");
    if (dispPercent && window.timeEngine) {
      const pct = Math.min(100, Math.round((timeEngine.currentDay / maxDays) * 100));
      dispPercent.innerText = `${pct}%`;
    }

    return maxDays;
  },

  /**
   * จำกัดค่าวันมรสุมไม่ให้เกินระยะเวลาของพันธุ์ข้าวที่มีอยู่ในแปลง (Point 7)
   */
  updateDisasterInputLimits() {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const varietyDays = { kdml105: 120, rd6: 130, rd41: 105 };
    let maxDays = 120;
    if (paddies.length > 0) {
      const allDays = paddies.map((p) => {
        const v = (p.params && p.params.variety) || p.variety || "kdml105";
        const d = (p.params && Number(p.params.durationDays)) || varietyDays[v] || 120;
        return (isNaN(d) || d <= 0) ? 120 : d;
      });
      maxDays = Math.max(...allDays);
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
   * แสดงแทร็ก Gantt Chart ทันทีเมื่อมีแปลงนา พร้อมซิงก์แถบมรสุมบน Progress Bar (Point 3)
   * ปรับสัดส่วนแทร็กตามพันธุ์ข้าวที่ใช้เวลาเติบโตมากสุดในฟาร์ม
   */
  renderGanttTracks(state) {
    const paddies = (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
    const ganttBox = document.getElementById("multiVarietyGanttContainer");
    if (!ganttBox) return;

    if (paddies.length === 0) {
      ganttBox.style.display = "none";
      const highlight = document.getElementById("timelineDisasterHighlight");
      if (highlight) highlight.style.display = "none";
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

    const getPaddyDuration = (p) => {
      const v = (p.params && p.params.variety) || p.variety || "kdml105";
      return (p.params && Number(p.params.durationDays)) || varietyDays[v] || 120;
    };

    const currentDay = (state && state.currentDay) ? state.currentDay : (timeEngine ? timeEngine.currentDay : 1);
    const maxFarmDays = (timeEngine && timeEngine.totalDays) ? timeEngine.totalDays : (paddies.length > 0 ? Math.max(...paddies.map(getPaddyDuration)) : 120);

    // ซิงก์แถบ Disaster Highlight บน Scrubber Slider ทันที
    const disasterHighlight = document.getElementById("timelineDisasterHighlight");
    const disasterDays = timeEngine.disasterDays || {};
    const dDays = Object.keys(disasterDays).map(Number).sort((a, b) => a - b);

    if (disasterHighlight) {
      if (dDays.length > 0) {
        const s = dDays[0];
        const e = dDays[dDays.length - 1];
        const leftPct = ((s - 1) / maxFarmDays) * 100;
        const widthPct = Math.max(3, ((e - s + 1) / maxFarmDays) * 100);
        disasterHighlight.style.display = "block";
        disasterHighlight.style.left = `${leftPct}%`;
        disasterHighlight.style.width = `${widthPct}%`;
        disasterHighlight.title = `🌧️ ช่วงมรสุม: วันที่ ${s} - ${e} (รวม ${dDays.length} วัน)`;
      } else {
        disasterHighlight.style.display = "none";
      }
    }

    ganttBox.innerHTML = paddies.map((p) => {
      const v = (p.params && p.params.variety) || p.variety || "kdml105";
      const paddyDays = getPaddyDuration(p);
      const vName = varietyNames[v] || v;

      // สัดส่วนความกว้างของแทร็กเทียบกับระยะเวลาสูงสุดของทั้งฟาร์ม
      const spanPct = Math.min(100, Math.max(10, Math.round((paddyDays / maxFarmDays) * 100)));

      // ความก้าวหน้าของการเติบโตของแปลงนี้
      const prog = Math.min(100, Math.round((currentDay / paddyDays) * 100));
      const isReady = currentDay >= paddyDays;
      const isUnderDisaster = disasterDays[currentDay] !== undefined;

      const statusText = isReady
        ? `🌾 สุกแก่เก็บเกี่ยวแล้ว (${paddyDays} วัน)`
        : (isUnderDisaster ? `⚠️ วันที่ ${currentDay}: กำลังเจอมรสุม!` : `${prog}% (${currentDay}/${paddyDays} วัน)`);
      const barColor = isReady ? "#ca8a04" : (isUnderDisaster ? "#ea580c" : "#16a34a");

      return `
        <div class="gantt-paddy-track">
          <div class="gantt-paddy-info">
            <span class="gantt-paddy-name">🌾 <strong>${p.name}</strong>: ${vName} (${paddyDays} วัน)</span>
            <span class="gantt-paddy-status" style="color:${isReady ? '#b45309' : (isUnderDisaster ? '#c2410c' : '#15803d')};">${statusText}</span>
          </div>
          <div class="gantt-timeline-track-wrap" title="${p.name} อายุ ${paddyDays} วัน (จากทั้งฟาร์ม ${maxFarmDays} วัน)">
            <div class="gantt-variety-span" style="width: ${spanPct}%;">
              <div class="gantt-paddy-bar-fill" style="width: ${prog}%; background: ${barColor};"></div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  /**
   * สรุปเหตุการณ์สภาพอากาศ & มรสุมในแผงผลลัพธ์โดยย่อและซิงก์กับไทม์ไลน์ (Point 4, 5)
   */
  renderResultDisasterSummary() {
    const elText = document.getElementById("dispDisasterSummaryText");
    if (!elText) return;

    const disasterDays = timeEngine.disasterDays || {};
    const days = Object.keys(disasterDays).map(Number).sort((a, b) => a - b);
    const curDay = timeEngine ? timeEngine.currentDay : 1;

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

    const isNowDisaster = disasterDays[curDay] !== undefined;
    const liveStatusBadge = isNowDisaster
      ? `<span style="background:#fee2e2; color:#b91c1c; padding:2px 7px; border-radius:10px; font-weight:700; font-size:10.5px; border:1px solid #fca5a5;">🚨 วันนี้ (วันที่ ${curDay}): อยู่ในช่วงมรสุม ${tName}</span>`
      : `<span style="background:#f0fdf4; color:#15803d; padding:2px 7px; border-radius:10px; font-weight:600; font-size:10.5px; border:1px solid #bbf7d0;">🌤️ วันนี้ (วันที่ ${curDay}): อากาศปกติ</span>`;

    elText.innerHTML = `
      <div style="margin-bottom: 4px;">${liveStatusBadge}</div>
      🌧️ <strong>มรสุม ${tName}:</strong> ช่วงวันที่ <strong>${startDay} - ${endDay}</strong> (รวม ${duration} วัน) | ความรุนแรงระดับ <strong>${sev}/10</strong><br>
      • <strong>ช่วงอายุที่กระทบ:</strong> ${stageStr}<br>
      • <strong>ผลต่อผลผลิต:</strong> ${lossPct > 0 ? `สูญเสียผลผลิตสะสมประมาณ <span style="color:#b91c1c; font-weight:700;">-${lossPct}%</span>` : 'กระทบเล็กน้อย ผลผลิตอยู่ในเกณฑ์ปกติ'}
    `;
  },

  bindEvents() {
    // 1. พันธุ์ข้าวประจำแปลงที่เลือก (Point 2: ซิงก์กับแปลงปัจจุบัน)
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect) {
      varietySelect.addEventListener("change", (e) => {
        const val = e.target.value;
        const varietySpecs = {
          kdml105: { name: "ขาวดอกมะลิ 105", duration: 120, H: 16, P: 8, G: 95, W: 25.5 },
          rd6: { name: "กข6", duration: 130, H: 16, P: 9, G: 100, W: 26.5 },
          rd41: { name: "กข41", duration: 105, H: 20, P: 10, G: 110, W: 27.5 }
        };
        const spec = varietySpecs[val] || varietySpecs["kdml105"];

        this.modelParams = {
          ...this.modelParams,
          variety: val,
          durationDays: spec.duration,
          H: spec.H,
          P: spec.P,
          G: spec.G,
          W: spec.W
        };

        // ซิงก์สไลเดอร์ชีวภาพบนหน้าจอให้ตรงกับพันธุ์ใหม่ทันที
        const elH = document.getElementById("inputHills");
        const elDispH = document.getElementById("dispHills");
        const elP = document.getElementById("inputPanicles");
        const elDispP = document.getElementById("dispPanicles");
        const elG = document.getElementById("inputGrains");
        const elDispG = document.getElementById("dispGrains");
        const elW = document.getElementById("inputWeight");
        const elDispW = document.getElementById("dispWeight");

        if (elH) { elH.value = spec.H; if (elDispH) elDispH.innerText = spec.H; }
        if (elP) { elP.value = spec.P; if (elDispP) elDispP.innerText = spec.P; }
        if (elG) { elG.value = spec.G; if (elDispG) elDispG.innerText = spec.G; }
        if (elW) { elW.value = spec.W; if (elDispW) elDispW.innerText = spec.W + " กรัม"; }

        // อัปเดตสเปกชีวภาพให้แปลงที่กำลังโฟกัสอยู่ (เฉพาะเมื่อไม่ได้อยู่ในโหมดวาดแปลงใหม่)
        const isDrawingMode = this.mapManager && (this.mapManager.currentMode === "draw_poly" || this.mapManager.currentMode === "draw_rect");
        const activePaddy = this.getActivePaddy();
        if (activePaddy && !isDrawingMode) {
          activePaddy.variety = val;
          activePaddy.params = {
            variety: val,
            durationDays: spec.duration,
            H: spec.H,
            P: spec.P,
            G: spec.G,
            W: spec.W,
            fertilityFactor: (activePaddy.params && activePaddy.params.fertilityFactor) || 0.82
          };
          if (this.mapManager) {
            this.mapManager.updateActivePaddyVariety(val);
          }
        }

        // ซิงก์ระยะเวลาของทั้งฟาร์มโดยอิงจากพันธุ์ข้าวที่โตนานสุดเสมอ (Point 3)
        this.syncMaxFarmDuration();
        this.updateDisasterInputLimits();
        this.renderGanttTracks(timeEngine ? timeEngine.getState() : null);
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

    // 3. Sliders ตัวแปรชีวภาพ (Point 2: ผูกตรงกับแปลงที่เลือกอยู่)
    this.bindRangeInput("inputHills", "dispHills", (val) => {
      const v = parseFloat(val);
      this.modelParams.H = v;
      const p = this.getActivePaddy();
      if (p && p.params) p.params.H = v;
    });
    this.bindRangeInput("inputPanicles", "dispPanicles", (val) => {
      const v = parseFloat(val);
      this.modelParams.P = v;
      const p = this.getActivePaddy();
      if (p && p.params) p.params.P = v;
    });
    this.bindRangeInput("inputGrains", "dispGrains", (val) => {
      const v = parseFloat(val);
      this.modelParams.G = v;
      const p = this.getActivePaddy();
      if (p && p.params) p.params.G = v;
    });
    this.bindRangeInput("inputWeight", "dispWeight", (val) => {
      const v = parseFloat(val);
      this.modelParams.W = v;
      const p = this.getActivePaddy();
      if (p && p.params) p.params.W = v;
    });

    // 4. ปุ่มเร่งเวลา
    const btnPlay = document.getElementById("btnPlay");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");
    const speedSelect = document.getElementById("simSpeedSelect");

    if (btnPlay) {
      btnPlay.addEventListener("click", () => {
        if (!this.mapManager || this.mapManager.paddies.length === 0) {
          this.showAlert(
            "ยังไม่ได้วาดแปลงนา",
            "กรุณาใช้เครื่องมือ \"วาดแปลง\" บนแถบเครื่องมือเพื่อวาดแปลงนาบนแผนที่ก่อนเริ่มการจำลองผลผลิตข้าว",
            "warning"
          );
          return;
        }
        const varietySelect = document.getElementById("riceVariety");
        if (!varietySelect || !varietySelect.value) {
          this.showAlert(
            "ยังไม่ได้เลือกพันธุ์ข้าว",
            "กรุณาเลือกชนิดพันธุ์ข้าวก่อนเริ่มการจำลองผลผลิต",
            "warning"
          );
          return;
        }
        // บังคับคำนวณและซิงก์ระยะเวลาสูงสุดของทั้งฟาร์มก่อนเริ่มรันเสมอ
        this.syncMaxFarmDuration();
        timeEngine.play();
      });
    }

    if (btnPause) btnPause.addEventListener("click", () => timeEngine.pause());
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious();
        timeEngine.reset();
        this.syncMaxFarmDuration();
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

  /**
   * เปลี่ยนพันธุ์ข้าวเฉพาะแปลงที่ต้องการโดยตรงจากการ์ดแสดงผลฝั่งขวา (Point 1, 2, 3)
   */
  handlePaddyCardVarietyChange(paddyId, newVariety, event) {
    if (event) event.stopPropagation();
    if (!this.mapManager || !this.mapManager.paddies) return;

    const paddy = this.mapManager.paddies.find((p) => String(p.id) === String(paddyId));
    if (!paddy) return;

    const varietySpecs = {
      kdml105: { name: "ขาวดอกมะลิ 105", duration: 120, H: 16, P: 8, G: 95, W: 25.5 },
      rd6: { name: "กข6", duration: 130, H: 16, P: 9, G: 100, W: 26.5 },
      rd41: { name: "กข41", duration: 105, H: 20, P: 10, G: 110, W: 27.5 }
    };
    const spec = varietySpecs[newVariety] || varietySpecs["kdml105"];

    paddy.variety = newVariety;
    paddy.params = {
      variety: newVariety,
      durationDays: spec.duration,
      H: spec.H,
      P: spec.P,
      G: spec.G,
      W: spec.W,
      fertilityFactor: (paddy.params && paddy.params.fertilityFactor) || 0.82
    };

    // หากแปลงนี้กำลังเป็นแปลงที่ถูกเลือก ให้ซิงก์ตัวเลือกและสไลเดอร์แผงซ้ายให้ตรงกัน
    if (String(this.mapManager.activePaddyId) === String(paddyId)) {
      const varietySelect = document.getElementById("riceVariety");
      if (varietySelect) varietySelect.value = newVariety;
      this.modelParams = { ...this.modelParams, ...paddy.params };

      const elH = document.getElementById("inputHills");
      const elDispH = document.getElementById("dispHills");
      const elP = document.getElementById("inputPanicles");
      const elDispP = document.getElementById("dispPanicles");
      const elG = document.getElementById("inputGrains");
      const elDispG = document.getElementById("dispGrains");
      const elW = document.getElementById("inputWeight");
      const elDispW = document.getElementById("dispWeight");

      if (elH) { elH.value = spec.H; if (elDispH) elDispH.innerText = spec.H; }
      if (elP) { elP.value = spec.P; if (elDispP) elDispP.innerText = spec.P; }
      if (elG) { elG.value = spec.G; if (elDispG) elDispG.innerText = spec.G; }
      if (elW) { elW.value = spec.W; if (elDispW) elDispW.innerText = spec.W + " กรัม"; }
    }

    // ซิงก์ระยะเวลาสูงสุดของทั้งฟาร์มทันที (Max Duration)
    this.syncMaxFarmDuration();
    this.updateDisasterInputLimits();
    this.renderGanttTracks(timeEngine ? timeEngine.getState() : null);
    this.recalculateYield();
    if (this.mapManager && typeof this.mapManager.updatePaddyBadges === "function") {
      this.mapManager.updatePaddyBadges();
    }
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
    // ฟังก์ชันนี้ไม่จำเป็นต้องใช้แท็บด้านบนอีกต่อไปแล้ว (Point 1: ใช้การ์ดแผงขวาแทน)
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

    // แสดงหน้าต่างผลลัพธ์ทันทีเมื่อมีแปลงนา (Point 4)
    this.updatePanelVisibility(this.mapManager ? this.mapManager.paddies.length : 1);

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

    if (paddy && paddy.params) {
      // ซิงก์ข้อมูลตัวแปรชีวภาพของแปลงที่เลือกไปยังแผงควบคุมซ้ายมือ (Point 2)
      const pParams = paddy.params;
      this.modelParams = { ...this.modelParams, ...pParams };

      const varietySelect = document.getElementById("riceVariety");
      if (varietySelect && pParams.variety) {
        varietySelect.value = pParams.variety;
      }

      const elH = document.getElementById("inputHills");
      const elDispH = document.getElementById("dispHills");
      const elP = document.getElementById("inputPanicles");
      const elDispP = document.getElementById("dispPanicles");
      const elG = document.getElementById("inputGrains");
      const elDispG = document.getElementById("dispGrains");
      const elW = document.getElementById("inputWeight");
      const elDispW = document.getElementById("dispWeight");

      if (elH && pParams.H !== undefined) { elH.value = pParams.H; if (elDispH) elDispH.innerText = pParams.H; }
      if (elP && pParams.P !== undefined) { elP.value = pParams.P; if (elDispP) elDispP.innerText = pParams.P; }
      if (elG && pParams.G !== undefined) { elG.value = pParams.G; if (elDispG) elDispG.innerText = pParams.G; }
      if (elW && pParams.W !== undefined) { elW.value = pParams.W; if (elDispW) elDispW.innerText = pParams.W + " กรัม"; }
    }

    if (paddy && (paddy.amphoeProp || paddy.locationStr)) {
      this.soilInfo.province = (paddy.amphoeProp && paddy.amphoeProp.pro_th) || (detectedProv ? detectedProv.name_th : "ขอนแก่น");
      const aName = paddy.amphoeProp ? (paddy.amphoeProp.amp_th.startsWith("อ.") ? paddy.amphoeProp.amp_th : `อ.${paddy.amphoeProp.amp_th}`) : (detectedProv ? `อ.เมือง${detectedProv.name_th}` : "อ.เมือง");
      this.soilInfo.district = aName;
    } else if (detectedProv) {
      this.soilInfo.province = detectedProv.name_th;
      this.soilInfo.district = `อ.เมือง${detectedProv.name_th}`;
    }

    if (detectedProv || paddy) {
      const region = (detectedProv && detectedProv.region) || "northeast";
      if (region === "northeast") {
        this.soilInfo.soil_group = "17";
        this.soilInfo.suitability_name = "เหมาะสมปานกลาง (S2)";
        this.soilInfo.topsoil_texture = "ดินร่วนปนทราย";
        this.multipliers.f_soil = 0.85;
      } else if (region === "central") {
        this.soilInfo.soil_group = "2";
        this.soilInfo.suitability_name = "เหมาะสมสูง (S1)";
        this.soilInfo.topsoil_texture = "ดินเหนียวที่ราบลุ่ม";
        this.multipliers.f_soil = 0.95;
      } else if (region === "north") {
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

    // Point 4: ให้ช่องเริ่มมรสุมวันที่ (#disasterStartDay) ขยับวันตาม progress แบบเรียลไทม์
    const startInput = document.getElementById("disasterStartDay");
    const endInput = document.getElementById("disasterEndDay");
    if (startInput && document.activeElement !== startInput) {
      startInput.value = state.currentDay;
      if (endInput && document.activeElement !== endInput) {
        const curEnd = parseInt(endInput.value, 10);
        if (isNaN(curEnd) || curEnd <= state.currentDay) {
          endInput.value = Math.min(state.totalDays, state.currentDay + 15);
        }
      }
    }

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

      // ล้างข้อมูลผลลัพธ์และรายการแปลงทั้งฟาร์มออกทั้งหมด (Point 1)
      const elTotal = document.getElementById("dispTotalYield");
      const elPerRai = document.getElementById("dispYieldPerRai");
      const elPot = document.getElementById("dispPotYield");
      const elLoss = document.getElementById("dispYieldLossDesc");
      const elBreakdown = document.getElementById("paddyBreakdownList");
      const elAreaThai = document.getElementById("dispAreaThai");
      const elAreaSqM = document.getElementById("dispAreaSqM");
      const elLocation = document.getElementById("dispLocation");

      if (elTotal) elTotal.innerText = "0.00 ตัน";
      if (elPerRai) elPerRai.innerText = "0 กก./ไร่";
      if (elPot) elPot.innerText = "ศักยภาพรวม: 0.00 ตัน";
      if (elLoss) elLoss.style.display = "none";
      if (elBreakdown) elBreakdown.innerHTML = "";
      if (elAreaThai) elAreaThai.innerText = "-";
      if (elAreaSqM) elAreaSqM.innerText = "-";
      if (elLocation) elLocation.innerText = "-";

      return;
    }

    this.updatePanelVisibility(paddies.length);

    const varietySpecs = {
      kdml105: { name: "ขาวดอกมะลิ 105", duration: 120, H: 16, P: 8, G: 95, W: 25.5 },
      rd6: { name: "กข6", duration: 130, H: 16, P: 9, G: 100, W: 26.5 },
      rd41: { name: "กข41", duration: 105, H: 20, P: 10, G: 110, W: 27.5 }
    };

    const defaultFertility = this.modelParams.fertilityFactor || 0.82;
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
      const vKey = (p.params && p.params.variety) || p.variety || "kdml105";
      const spec = varietySpecs[vKey] || varietySpecs["kdml105"];
      
      const pH = (p.params && p.params.H !== undefined) ? p.params.H : spec.H;
      const pP = (p.params && p.params.P !== undefined) ? p.params.P : spec.P;
      const pG = (p.params && p.params.G !== undefined) ? p.params.G : spec.G;
      const pW = (p.params && p.params.W !== undefined) ? p.params.W : spec.W;
      const pDuration = (p.params && p.params.durationDays) || spec.duration;
      const pFertility = (p.params && p.params.fertilityFactor) || defaultFertility;

      const sqM = (p.areaResult && p.areaResult.sqMeters) ? p.areaResult.sqMeters : (p.geometry ? AreaCalculator.calculateArea(p.geometry).sqMeters : 1600);
      const rai = sqM / 1600;

      // สมการที่ 3: ศักยภาพผลผลิตตามพันธุกรรม (Ypot) ของแปลงนี้
      const grainsPerSqM = pH * pP * pG * pFertility;
      const kgPerSqM = ((grainsPerSqM * pW) / 1000) / 1000;
      const paddyYpot = kgPerSqM * sqM;
      const paddyYpotTons = paddyYpot / 1000;

      // สมการที่ 4: ผลผลิตหลังปรับลดด้วยสิ่งแวดล้อมและมรสุม (Yfinal) ของแปลงนี้
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

      const isActive = (String(p.id) === String(this.mapManager.activePaddyId));
      const formattedArea = p.areaResult ? p.areaResult.formattedThai : `${rai.toFixed(2)} ไร่`;

      breakdownItems.push(`
        <div class="paddy-breakdown-card ${isActive ? 'active' : ''}" id="paddyCard_${p.id}" data-paddy-id="${p.id}" onclick="window.App.mapManager.selectPaddy('${p.id}')">
          <div class="paddy-breakdown-header">
            <div class="paddy-breakdown-header-left">
              <span class="paddy-breakdown-name">🌾 ${p.name}</span>
              <select class="paddy-card-variety-select" title="เลือกพันธุ์ข้าวเฉพาะแปลงนี้" onchange="window.App.handlePaddyCardVarietyChange('${p.id}', this.value, event)" onclick="event.stopPropagation();">
                <option value="kdml105" ${vKey === 'kdml105' ? 'selected' : ''}>ขาวดอกมะลิ 105 (120 วัน)</option>
                <option value="rd6" ${vKey === 'rd6' ? 'selected' : ''}>กข6 (130 วัน)</option>
                <option value="rd41" ${vKey === 'rd41' ? 'selected' : ''}>กข41 (105 วัน)</option>
              </select>
            </div>
            <div class="paddy-breakdown-header-right">
              ${isActive ? '<span class="active-paddy-badge"><i class="fa-solid fa-crosshairs"></i> กำลังเลือก</span>' : '<span class="select-paddy-hint">คลิกเลือก</span>'}
              <button class="paddy-card-del-btn" title="ลบแปลงนี้" onclick="event.stopPropagation(); window.App.mapManager.deletePaddy('${p.id}');">✕</button>
            </div>
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
              <span class="paddy-breakdown-lbl">ที่ตั้งแปลง:</span>
              <span class="paddy-breakdown-val" style="color:#15803d; font-weight:600;"><i class="fa-solid fa-location-dot" style="font-size:10px;"></i> ${p.locationStr || 'จ.ขอนแก่น อ.เมือง'}</span>
            </div>
          </div>
          <div class="paddy-breakdown-bio-row" title="ตัวแปรชีวภาพเฉพาะแปลงนี้ (ปรับเปลี่ยนได้ที่แผงซ้ายมือ)">
            <span><i class="fa-solid fa-dna" style="color:var(--rice-green); font-size:9.5px;"></i> <strong>ชีวภาพ:</strong> H=${pH} | P=${pP} | G=${pG} | W=${pW}g</span>
          </div>
        </div>
      `);
    });

    if (this.mapManager && this.mapManager.activePaddyId) {
      setTimeout(() => {
        const activeCard = document.getElementById(`paddyCard_${this.mapManager.activePaddyId}`);
        if (activeCard && activeCard.parentElement) {
          activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 40);
    }

    const avgKgPerRai = totalFarmRai > 0 ? (totalFarmFinalKg / totalFarmRai) : 0;
    const avgNoStressKgPerRai = totalFarmRai > 0 ? (totalFarmNoStressKg / totalFarmRai) : 0;

    const elTotal = document.getElementById("dispTotalYield");
    const elPerRai = document.getElementById("dispYieldPerRai");
    const elPot = document.getElementById("dispPotYield");
    const elLoss = document.getElementById("dispYieldLossDesc");
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

    if (elLoss) {
      const lossTons = Math.max(0, totalFarmPotTons - totalFarmTons);
      const lossPct = totalFarmPotTons > 0 ? Math.round((lossTons / totalFarmPotTons) * 100) : 0;
      if (lossTons > 0.005) {
        elLoss.innerHTML = `🔻 สูญเสีย: <strong>${lossTons.toFixed(2)} ตัน (-${lossPct}%)</strong> จากศักยภาพรวม`;
        elLoss.style.display = "block";
      } else {
        elLoss.innerHTML = `<span style="color:#15803d;">✨ ได้ผลผลิตเต็มศักยภาพสูงสุด (100%)</span>`;
        elLoss.style.display = "block";
      }
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
