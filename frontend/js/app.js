/**
 * แอปพลิเคชันหลัก (Application Orchestrator)
 * คุณสมบัติ:
 * 1. แปลงนาบนแผนที่ ↔ การ์ดแผงขวา ↔ แถบไทม์ไลน์ ซิงก์กันทุกทิศทาง
 *    (คลิกแปลงบนแผนที่ = โฟกัสการ์ด, คลิกการ์ด = แผนที่บินไปกึ่งกลางแปลง, ชี้เมาส์ = ไฮไลต์คู่กัน)
 * 2. ลบแปลงจากการ์ดฝั่งขวาได้ทันที พร้อมปุ่ม "เลิกทำ"
 * 3. คำนวณผลผลิต "รายแปลง" ตามอายุพันธุ์ของแปลงนั้น (ระยะการเติบโต ความเสียหาย ชีวมวล ดิน)
 * 4. ไทม์ไลน์/Gantt ยาวตามพันธุ์ที่อายุยาวที่สุดในฟาร์ม (เช่น มะลิ 120 + กข6 130 = 130 วัน)
 * 5. กราฟสภาพอากาศและชีวมวลใช้ข้อมูลจริงจากการจำลอง
 */
const App = {
  mapManager: null,

  // ตัวแปรชีวภาพสำหรับแปลงถัดไปที่จะวาด (เมื่อยังไม่มีแปลงที่เลือก)
  modelParams: buildPaddyParams("kdml105"),

  // ตัวคูณที่ไม่ขึ้นกับแปลง/วัน
  multipliers: {
    f_ndvi: 0.96
  },

  backendOnline: false,
  backendUrl: "http://localhost:8000",
  rafPending: false,
  lastState: null,
  previousRun: null,
  _cardSignature: "",
  _ganttSignature: "",

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

  eventMeta: {
    flood: { name: "น้ำท่วมขัง", icon: "fa-water", emoji: "🌊", color: "#2563eb" },
    drought: { name: "ฝนแล้งทิ้งช่วง", icon: "fa-sun", emoji: "☀️", color: "#ea580c" },
    heat: { name: "คลื่นความร้อน", icon: "fa-temperature-arrow-up", emoji: "🔥", color: "#dc2626" },
    rain: { name: "ฝนตกชุ่มฉ่ำ", icon: "fa-cloud-showers-heavy", emoji: "🌧️", color: "#0284c7" }
  },

  init() {
    console.log("[App] เริ่มต้นระบบ Rice Yield Sandbox Simulator...");

    // ไม่ต้องรอ backend ก่อนแสดงแผนที่ (หาก backend ปิดอยู่จะไม่ค้างหน้าเว็บ)
    this.checkBackendStatus();

    this.mapManager = new MapManager("map");
    this.mapManager.onPolygonChange((geometry, detectedProv, paddy, landUseInfo, source) => {
      this.handlePolygonUpdate(geometry, detectedProv, paddy, landUseInfo, source);
    });
    this.mapManager.onPaddyListChange((paddies, activeId, source) => {
      this.handlePaddiesChanged(source);
    });
    this.mapManager.onHoverChangeCallback = (paddyId) => this.syncHoverHighlight(paddyId);
    this.mapManager.onPaddyDeletedCallback = (removed) => this.handlePaddiesDeleted(removed);
    this.mapManager.init([16.4322, 102.8236], 9);

    AnalyticsCharts.initGrowthChart("growthChart");
    AnalyticsCharts.initWeatherChart("weatherChart");

    this.bindEvents();
    this.bindPaddyList();
    this.bindGantt();
    this.bindCollapsibleSections();
    this.bindMinimizableTimeline();
    this.bindDisasterModal();
    this.bindPopups();
    this.bindKeyboardShortcuts();

    timeEngine.onUpdate((state) => this.handleTimeUpdate(state));

    this.updateYearAdvisory(timeEngine.selectedYear);
    this.updateDateFormatLabel(document.getElementById("plantDate").value);
    this.updateVarietyTargetHint();
    this.handlePaddiesChanged("init");
    timeEngine.notifyUpdate();
  },

  async checkBackendStatus() {
    const badge = document.getElementById("backendStatusBadge");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.backendUrl}/health`, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        this.backendOnline = true;
        if (badge) {
          badge.innerHTML = `<span class="status-dot"></span> เชื่อมต่อระบบวิเคราะห์ดิน 77 จังหวัด`;
          badge.classList.remove("offline");
          badge.setAttribute("data-hint", "เชื่อมต่อ Backend สำเร็จ ข้อมูลดินดึงจากฐานข้อมูลกรมพัฒนาที่ดินจริง");
        }
        // แปลงที่วาดไว้ก่อน backend ตอบกลับ ให้ดึงข้อมูลดินจริงใหม่
        if (this.mapManager) {
          this.mapManager.paddies.forEach((p) => {
            if (p.soil && p.soil.source !== "backend") {
              p.soil = null;
              this.ensurePaddySoil(p);
            }
          });
        }
        return;
      }
    } catch (e) {
      // Backend ออฟไลน์ ใช้โหมดจำลองในตัว
    }

    this.backendOnline = false;
    if (badge) {
      badge.innerHTML = `<span class="status-dot"></span> โหมดจำลองในตัว (ไม่ได้เชื่อม Backend)`;
      badge.classList.add("offline");
      badge.setAttribute("data-hint", "ไม่พบ Backend ที่ localhost:8000 ระบบจะประมาณค่าดินตามภูมิภาคแทน (ผลยังใช้งานได้)");
    }
  },

  /* ---------------------------------------------------------------------- */
  /* Utilities                                                              */
  /* ---------------------------------------------------------------------- */

  formatThaiDate(dateStr) {
    const date = TimeEngine.parseLocalDate(dateStr);
    if (!date) return "-";
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = date.getDate();
    const m = date.getMonth();
    const beYear = date.getFullYear() + 543;
    return `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${beYear} (${d} ${thaiMonths[m]} ${beYear})`;
  },

  formatShortDate(date) {
    return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  },

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  updateDateFormatLabel(dateStr) {
    const elFormatted = document.getElementById("dispFormattedDate");
    if (elFormatted) elFormatted.innerText = `📅 ${this.formatThaiDate(dateStr)}`;
  },

  getPaddies() {
    return (this.mapManager && this.mapManager.paddies) ? this.mapManager.paddies : [];
  },

  getActivePaddy() {
    if (!this.mapManager) return null;
    return this.getPaddies().find((p) => String(p.id) === String(this.mapManager.activePaddyId)) || null;
  },

  /** แผงขวา: ถ้ายังไม่มีแปลงนา แสดงหน้าจอเริ่มต้นพร้อมขั้นตอนใช้งาน */
  updatePanelVisibility(paddyCount) {
    const emptyState = document.getElementById("rightPanelEmptyState");
    const content = document.getElementById("rightPanelContent");
    if (emptyState) emptyState.style.display = paddyCount === 0 ? "flex" : "none";
    if (content) content.style.display = paddyCount === 0 ? "none" : "block";
    // หน้าอื่นในเมนู (แปลงนา/อากาศ/การเติบโต/รายงาน) แสดงข้อความว่างเมื่อยังไม่มีแปลง
    document.body.classList.toggle("no-paddies", paddyCount === 0);
  },

  /* ---------------------------------------------------------------------- */
  /* Popups & Toasts                                                        */
  /* ---------------------------------------------------------------------- */

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

    const icons = { warning: "fa-triangle-exclamation", info: "fa-circle-info", success: "fa-circle-check" };
    if (elIcon && elWrap) {
      elIcon.className = `fa-solid ${icons[type] || icons.warning}`;
      elWrap.className = `app-popup-icon ${type}`;
    }

    modal.style.display = "flex";
    const btn = document.getElementById("btnAppAlertClose");
    if (btn) btn.focus();
  },

  closeAlert() {
    const modal = document.getElementById("appAlertModal");
    if (modal) modal.style.display = "none";
  },

  /**
   * แจ้งเตือนแบบ Toast มุมล่างขวา (ไม่บังการใช้งาน) พร้อมปุ่มทำงาน เช่น "เลิกทำ"
   */
  toast(message, { type = "info", action = null, duration = 4000 } = {}) {
    const region = document.getElementById("toastRegion");
    if (!region) return;

    const icons = { info: "fa-circle-info", success: "fa-circle-check", warning: "fa-triangle-exclamation", danger: "fa-trash-can" };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.setAttribute("role", "status");
    el.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
      <div class="toast-msg"></div>
      ${action ? `<button type="button" class="toast-action"></button>` : ""}
      <button type="button" class="toast-close" aria-label="ปิด">✕</button>
      <div class="toast-timer" style="animation-duration:${duration}ms"></div>`;
    el.querySelector(".toast-msg").textContent = message;

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 200);
    };
    if (action) {
      const btn = el.querySelector(".toast-action");
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        action.onClick();
        dismiss();
      });
    }
    el.querySelector(".toast-close").addEventListener("click", dismiss);

    region.appendChild(el);
    while (region.children.length > 3) region.firstElementChild.remove();
    timer = setTimeout(dismiss, duration);
    el.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      el.classList.add("paused");
    });
    el.addEventListener("mouseleave", () => {
      el.classList.remove("paused");
      timer = setTimeout(dismiss, 1800);
    });
  },

  bindPopups() {
    const alertModal = document.getElementById("appAlertModal");
    const btnCloseAlert = document.getElementById("btnAppAlertClose");
    if (btnCloseAlert) btnCloseAlert.addEventListener("click", () => this.closeAlert());
    if (alertModal) {
      alertModal.addEventListener("click", (e) => {
        if (e.target === alertModal) this.closeAlert();
      });
    }

    const welcomeModal = document.getElementById("welcomeDisclaimerModal");
    const btnAccept = document.getElementById("btnWelcomeAccept");
    const btnOpenAbout = document.getElementById("btnOpenAboutModal");

    const closeWelcome = () => {
      if (welcomeModal) welcomeModal.style.display = "none";
      try {
        sessionStorage.setItem("rice_sim_welcome_seen", "true");
      } catch (e) {}
    };

    if (btnAccept) btnAccept.addEventListener("click", closeWelcome);
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

    try {
      if (!sessionStorage.getItem("rice_sim_welcome_seen") && welcomeModal) welcomeModal.style.display = "flex";
    } catch (e) {
      if (welcomeModal) welcomeModal.style.display = "flex";
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAlert();
        if (welcomeModal && welcomeModal.style.display !== "none") closeWelcome();
      }
    });

    // ปุ่มลัดเริ่มวาดแปลงจากหน้าจอว่างฝั่งขวา
    document.querySelectorAll("[data-start-draw]").forEach((btn) => {
      btn.addEventListener("click", () => this.startDrawing(btn.getAttribute("data-start-draw")));
    });
  },

  startDrawing(mode) {
    if (!this.mapManager) return;
    const toolbar = document.getElementById("customMapToolbar");
    if (toolbar && toolbar.classList.contains("collapsed")) {
      document.getElementById("toolbarToggleHandle").click();
    }
    const btn = document.getElementById(mode === "rectangle" ? "toolDrawRect" : "toolDrawPoly");
    this.mapManager.setMode(mode, btn);
  },

  bindKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag) || e.target.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (timeEngine.isPlaying) timeEngine.pause();
        else this.playSimulation();
      } else if (e.key === "ArrowRight" && !timeEngine.isPlaying) {
        timeEngine.seekToDay(timeEngine.currentDay + (e.shiftKey ? 10 : 1));
      } else if (e.key === "ArrowLeft" && !timeEngine.isPlaying) {
        timeEngine.seekToDay(timeEngine.currentDay - (e.shiftKey ? 10 : 1));
      }
    });
  },

  /* ---------------------------------------------------------------------- */
  /* Paddy list changes / selection sync                                    */
  /* ---------------------------------------------------------------------- */

  /** เรียกเมื่อรายการแปลง/แปลงที่เลือก/พันธุ์ข้าวเปลี่ยน */
  handlePaddiesChanged(source) {
    const paddies = this.getPaddies();
    this.updatePanelVisibility(paddies.length);
    this.syncMaxFarmDuration();
    this.updateDisasterInputLimits();
    this.updateVarietyTargetHint();
    this.refresh();

    // คลิกแปลงบนแผนที่ → แผงขวาเลื่อนไปโฟกัสการ์ดของแปลงนั้น
    if (source === "map" || source === "draw" || source === "restore") {
      this.revealActiveCard();
    }
  },

  handlePaddiesDeleted(removed) {
    if (!removed || removed.length === 0) return;
    const label = removed.length > 1 ? `ลบแปลงทั้งหมด ${removed.length} แปลงแล้ว` : `ลบ${removed[0].name} แล้ว`;
    this.toast(label, {
      type: "danger",
      duration: 6000,
      action: { label: "เลิกทำ", onClick: () => this.mapManager.restorePaddies(removed) }
    });
  },

  revealActiveCard() {
    const activeId = this.mapManager && this.mapManager.activePaddyId;
    if (!activeId) return;
    const sec = document.getElementById("secYield");
    if (sec && sec.classList.contains("collapsed")) sec.classList.remove("collapsed");
    const card = document.getElementById(`paddyCard_${activeId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
  },

  syncHoverHighlight(paddyId) {
    document.querySelectorAll(".paddy-breakdown-card, .gantt-row").forEach((el) => {
      el.classList.toggle("is-hover", paddyId !== null && el.getAttribute("data-paddy-id") === String(paddyId));
    });
  },

  /** ระยะเวลาไทม์ไลน์ของฟาร์ม = อายุพันธุ์ที่ยาวที่สุดในฟาร์ม */
  getFarmDuration() {
    const paddies = this.getPaddies();
    if (paddies.length > 0) return Math.max(...paddies.map(getPaddyDuration));
    const varietySelect = document.getElementById("riceVariety");
    return getVarietySpec(varietySelect ? varietySelect.value : "kdml105").duration;
  },

  syncMaxFarmDuration() {
    const maxDays = this.getFarmDuration();
    timeEngine.setVarietyDuration(maxDays);
    const scrubber = document.getElementById("timelineScrubber");
    if (scrubber) scrubber.max = maxDays;
    return maxDays;
  },

  /** จำกัดค่าวันมรสุมไม่ให้เกินความยาวฤดูของฟาร์ม */
  updateDisasterInputLimits() {
    const maxDays = this.getFarmDuration();
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
    const hint = document.getElementById("dispDisasterDayRange");
    if (hint) hint.innerText = `(1 - ${maxDays})`;
  },

  /** ข้อความใต้ตัวเลือกพันธุ์: บอกว่าการเปลี่ยนจะมีผลกับแปลงไหน */
  updateVarietyTargetHint() {
    const el = document.getElementById("dispVarietyTarget");
    if (!el) return;
    const active = this.getActivePaddy();
    const drawing = this.mapManager && this.mapManager.isDrawingMode();
    if (active && !drawing) {
      el.innerHTML = `<i class="fa-solid fa-crosshairs"></i> กำลังแก้ไข: <strong>${this.escapeHtml(active.name)}</strong> (แปลงที่เลือก)`;
    } else {
      el.innerHTML = `<i class="fa-solid fa-pen-ruler"></i> ใช้กับ <strong>แปลงใหม่</strong> ที่จะวาด`;
    }
  },

  setBioSliders(params) {
    const map = [
      ["inputHills", "dispHills", params.H, ""],
      ["inputPanicles", "dispPanicles", params.P, ""],
      ["inputGrains", "dispGrains", params.G, ""],
      ["inputWeight", "dispWeight", params.W, " กรัม"]
    ];
    map.forEach(([inputId, dispId, val, suffix]) => {
      if (val === undefined) return;
      const input = document.getElementById(inputId);
      const disp = document.getElementById(dispId);
      if (input) input.value = val;
      if (disp) disp.innerText = `${val}${suffix}`;
    });
  },

  /* ---------------------------------------------------------------------- */
  /* Event binding                                                          */
  /* ---------------------------------------------------------------------- */

  bindEvents() {
    // 1. พันธุ์ข้าว: เปลี่ยนให้แปลงที่เลือก (หรือแปลงใหม่ถ้ายังไม่ได้เลือก/กำลังวาด)
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect) {
      varietySelect.addEventListener("change", (e) => {
        const key = getVarietySpec(e.target.value).key;
        const activePaddy = this.getActivePaddy();
        const isDrawing = this.mapManager && this.mapManager.isDrawingMode();

        if (activePaddy && !isDrawing) {
          this.mapManager.setPaddyVariety(activePaddy.id, key);
          this.setBioSliders(activePaddy.params);
          this.toast(`${activePaddy.name} เปลี่ยนเป็น ${getVarietySpec(key).name} (${getVarietySpec(key).duration} วัน)`, { type: "success", duration: 2500 });
        } else {
          this.modelParams = buildPaddyParams(key);
          this.setBioSliders(this.modelParams);
          this.handlePaddiesChanged("variety");
        }
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
          if (dateInput) dateInput.value = adv.recommendedDate;
          this.updateDateFormatLabel(adv.recommendedDate);
          timeEngine.setPlantDate(adv.recommendedDate);
          this.toast(`ตั้งวันเริ่มปลูกเป็น ${this.formatThaiDate(adv.recommendedDate)}`, { type: "success", duration: 2500 });
        }
      });
    }

    const dateInput = document.getElementById("plantDate");
    if (dateInput) {
      dateInput.addEventListener("change", (e) => {
        if (timeEngine.setPlantDate(e.target.value)) {
          this.updateDateFormatLabel(e.target.value);
          this._ganttSignature = "";
        }
      });
    }

    // 3. ตัวแปรชีวภาพ: ผูกกับแปลงที่เลือกอยู่ (หรือค่าตั้งต้นของแปลงใหม่)
    const bindBio = (inputId, displayId, key, suffix = "") => {
      const input = document.getElementById(inputId);
      const display = document.getElementById(displayId);
      if (!input) return;
      input.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        if (display) display.innerText = `${e.target.value}${suffix}`;
        const p = this.getActivePaddy();
        if (p && p.params && !(this.mapManager && this.mapManager.isDrawingMode())) p.params[key] = v;
        else this.modelParams[key] = v;
        this.scheduleRefresh();
      });
    };
    bindBio("inputHills", "dispHills", "H");
    bindBio("inputPanicles", "dispPanicles", "P");
    bindBio("inputGrains", "dispGrains", "G");
    bindBio("inputWeight", "dispWeight", "W", " กรัม");

    // 4. ปุ่มเร่งเวลา
    const btnPlay = document.getElementById("btnPlay");
    const btnPause = document.getElementById("btnPause");
    const btnReset = document.getElementById("btnReset");
    const speedSelect = document.getElementById("simSpeedSelect");

    if (btnPlay) btnPlay.addEventListener("click", () => this.playSimulation());
    if (btnPause) btnPause.addEventListener("click", () => timeEngine.pause());
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        this.snapshotCurrentRunAsPrevious();
        this.clearScenarioButtons();
        timeEngine.reset();
      });
    }
    if (speedSelect) speedSelect.addEventListener("change", (e) => timeEngine.setSpeed(parseFloat(e.target.value)));

    const timelineScrubber = document.getElementById("timelineScrubber");
    if (timelineScrubber) {
      timelineScrubber.addEventListener("input", (e) => timeEngine.seekToDay(parseInt(e.target.value, 10)));
    }

    // 5. ปุ่มสภาพอากาศฉับพลัน
    this.bindScenarioBtn("btnScenarioRain", "rain");
    this.bindScenarioBtn("btnScenarioFlood", "flood");
    this.bindScenarioBtn("btnScenarioDrought", "drought");
    this.bindScenarioBtn("btnScenarioHeat", "heat");

    // 6. ระดับความรุนแรง 1 - 10
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
      10: "🚨 ระดับ 10: มหันตภัยธรรมชาติขั้นสูงสุด ผลผลิตเสียหายเกือบทั้งหมด"
    };
    if (inputSeverity) {
      inputSeverity.addEventListener("input", (e) => {
        const sev = parseInt(e.target.value, 10);
        if (dispSeverityVal) dispSeverityVal.innerText = `ระดับ ${sev} / 10`;
        if (dispSeverityDesc) dispSeverityDesc.innerText = severityDescriptions[sev] || `ระดับ ${sev}`;
      });
    }

    // 7. ช่วงวันมรสุม (ไม่ให้เกินความยาวฤดู และวันจบต้องไม่น้อยกว่าวันเริ่ม)
    const startInput = document.getElementById("disasterStartDay");
    const endInput = document.getElementById("disasterEndDay");
    const validateDays = () => {
      const maxAllowed = parseInt(endInput.max, 10) || timeEngine.totalDays;
      let s = parseInt(startInput.value, 10);
      let e = parseInt(endInput.value, 10);
      if (isNaN(s) || s < 1) s = 1;
      if (s > maxAllowed) s = maxAllowed;
      if (isNaN(e) || e < 1) e = s;
      if (e > maxAllowed) e = maxAllowed;
      if (e < s) e = s;
      startInput.value = s;
      endInput.value = e;
    };
    // ตรวจค่าเมื่อพิมพ์เสร็จ (change) เท่านั้น เพื่อไม่ให้ตัวเลขเด้งระหว่างพิมพ์
    if (startInput) startInput.addEventListener("change", validateDays);
    if (endInput) endInput.addEventListener("change", validateDays);

    const disasterTypeSelect = document.getElementById("disasterTypeSelect");
    const btnApplyWindow = document.getElementById("btnApplyDisasterWindow");
    if (btnApplyWindow) {
      btnApplyWindow.addEventListener("click", () => {
        validateDays();
        this.snapshotCurrentRunAsPrevious();

        const type = disasterTypeSelect.value;
        const sDay = parseInt(startInput.value, 10) || 1;
        const eDay = parseInt(endInput.value, 10) || timeEngine.totalDays;
        const sev = inputSeverity ? parseInt(inputSeverity.value, 10) : 5;

        const config = timeEngine.scheduleDisasterWindow(type, sDay, eDay, sev);
        this.updateDisasterBadge(config);
        if (config) {
          this.toast(`ตั้งค่า${this.eventMeta[type].name} วันที่ ${config.startDay}-${config.endDay} แล้ว`, { type: "success", duration: 3000 });
        } else {
          this.toast("ล้างภัยพิบัติที่กำหนดไว้แล้ว", { type: "info", duration: 2500 });
        }
      });
    }

    // 8. จำลองใหม่ & เปรียบเทียบ
    const btnReRun = document.getElementById("btnReRunScenario");
    if (btnReRun) {
      btnReRun.addEventListener("click", () => {
        if (!this.ensureCanPlay()) return;
        this.snapshotCurrentRunAsPrevious();
        this.clearScenarioButtons();
        timeEngine.reset();
        timeEngine.play();
      });
    }
  },

  ensureCanPlay() {
    if (this.getPaddies().length === 0) {
      this.showAlert(
        "ยังไม่ได้วาดแปลงนา",
        "กรุณาใช้เครื่องมือ \"วาดแปลง\" บนแผนที่เพื่อสร้างแปลงนาอย่างน้อย 1 แปลง ก่อนเริ่มการจำลองผลผลิตข้าว",
        "warning"
      );
      return false;
    }
    return true;
  },

  playSimulation() {
    if (!this.ensureCanPlay()) return;
    this.syncMaxFarmDuration();
    timeEngine.play();
  },

  updateDisasterBadge(config) {
    const badge = document.getElementById("dispDisasterWindowBadge");
    if (!badge) return;
    if (!config) {
      badge.style.display = "none";
      return;
    }
    badge.innerText = `⚠️ ตั้งค่าแล้ว: ${this.eventMeta[config.type].name} วันที่ ${config.startDay} ถึง ${config.endDay} (ความรุนแรงระดับ ${config.severity}/10)`;
    badge.style.display = "block";
  },

  clearScenarioButtons() {
    document.querySelectorAll(".scenario-btn").forEach((b) => {
      b.className = "scenario-btn";
      b.setAttribute("aria-pressed", "false");
    });
  },

  bindScenarioBtn(btnId, scenarioType) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.setAttribute("aria-pressed", "false");

    btn.addEventListener("click", () => {
      this.snapshotCurrentRunAsPrevious();
      const wasActive = btn.classList.contains(`active-${scenarioType}`);
      this.clearScenarioButtons();

      if (!wasActive) {
        btn.classList.add(`active-${scenarioType}`);
        btn.setAttribute("aria-pressed", "true");
        timeEngine.setWeatherScenario(scenarioType);
        this.toast(`เปิด${this.eventMeta[scenarioType].name}ตั้งแต่วันที่ ${timeEngine.currentDay} (กดซ้ำเพื่อปิด)`, { type: "info", duration: 2500 });
      } else {
        timeEngine.setWeatherScenario("auto");
      }
    });
  },

  bindCollapsibleSections() {
    document.querySelectorAll(".panel-section.collapsible").forEach((sec) => {
      const heading = sec.querySelector(".panel-heading");
      if (!heading) return;
      heading.setAttribute("role", "button");
      heading.setAttribute("tabindex", "0");
      const toggle = () => {
        sec.classList.toggle("collapsed");
        heading.setAttribute("aria-expanded", String(!sec.classList.contains("collapsed")));
      };
      heading.setAttribute("aria-expanded", String(!sec.classList.contains("collapsed")));
      heading.addEventListener("click", (e) => {
        if (e.target.closest(".info-tooltip")) return;
        toggle();
      });
      heading.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  },

  bindMinimizableTimeline() {
    const btnToggle = document.getElementById("btnToggleTimeline");
    const overlay = document.getElementById("timelineOverlay");
    if (btnToggle && overlay) {
      btnToggle.addEventListener("click", () => overlay.classList.toggle("minimized"));
    }
  },

  /**
   * การ์ดแปลงฝั่งขวา: ใช้ event delegation (ไม่ใช้ onclick ในสตริง HTML)
   */
  bindPaddyList() {
    const list = document.getElementById("paddyBreakdownList");
    if (!list) return;

    const cardOf = (el) => el && el.closest ? el.closest(".paddy-breakdown-card") : null;

    list.addEventListener("click", (e) => {
      const card = cardOf(e.target);
      if (!card) return;
      const id = card.getAttribute("data-paddy-id");
      if (e.target.closest("[data-action='delete']")) {
        e.stopPropagation();
        this.mapManager.deletePaddy(id);
        return;
      }
      if (e.target.closest("[data-action='zoom']")) {
        const paddy = this.getPaddies().find((p) => String(p.id) === id);
        if (paddy) {
          this.mapManager.flyToPaddy(paddy);
          this.mapManager.pulsePaddy(paddy);
        }
        return;
      }
      if (e.target.closest("select")) return;
      this.mapManager.selectPaddy(id, { source: "panel", fly: true });
    });

    list.addEventListener("keydown", (e) => {
      const card = cardOf(e.target);
      if (!card || e.target !== card) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.mapManager.selectPaddy(card.getAttribute("data-paddy-id"), { source: "panel", fly: true });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.mapManager.deletePaddy(card.getAttribute("data-paddy-id"));
      }
    });

    list.addEventListener("change", (e) => {
      const select = e.target.closest(".paddy-card-variety-select");
      const card = cardOf(e.target);
      if (!select || !card) return;
      this.handlePaddyCardVarietyChange(card.getAttribute("data-paddy-id"), select.value);
    });

    list.addEventListener("mouseover", (e) => {
      const card = cardOf(e.target);
      if (card && !card.contains(e.relatedTarget)) this.mapManager.setHoverPaddy(card.getAttribute("data-paddy-id"), "panel");
    });
    list.addEventListener("mouseout", (e) => {
      const card = cardOf(e.target);
      if (card && !card.contains(e.relatedTarget)) this.mapManager.setHoverPaddy(null, "panel");
    });
  },

  handlePaddyCardVarietyChange(paddyId, newVariety) {
    const paddy = this.mapManager.setPaddyVariety(paddyId, newVariety);
    if (!paddy) return;
    if (String(this.mapManager.activePaddyId) === String(paddyId)) {
      const varietySelect = document.getElementById("riceVariety");
      if (varietySelect) varietySelect.value = paddy.variety;
      this.setBioSliders(paddy.params);
    }
    const spec = getVarietySpec(newVariety);
    this.toast(`${paddy.name} เปลี่ยนเป็น ${spec.name} (${spec.duration} วัน)`, { type: "success", duration: 2500 });
  },

  bindGantt() {
    const box = document.getElementById("multiVarietyGanttContainer");
    if (!box) return;
    box.addEventListener("click", (e) => {
      const row = e.target.closest(".gantt-row");
      if (row) this.mapManager.selectPaddy(row.getAttribute("data-paddy-id"), { source: "panel", fly: true });
    });
    box.addEventListener("mouseover", (e) => {
      const row = e.target.closest(".gantt-row");
      if (row && !row.contains(e.relatedTarget)) this.mapManager.setHoverPaddy(row.getAttribute("data-paddy-id"), "panel");
    });
    box.addEventListener("mouseout", (e) => {
      const row = e.target.closest(".gantt-row");
      if (row && !row.contains(e.relatedTarget)) this.mapManager.setHoverPaddy(null, "panel");
    });
  },

  bindDisasterModal() {
    // รายงานเป็นหน้าหนึ่งในเมนูหลัก (shell.js) ปุ่มนี้แค่พาไปหน้านั้น
    const btnOpen = document.getElementById("btnOpenDisasterReport");
    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        if (this.getPaddies().length === 0) {
          this.toast("วาดแปลงนาอย่างน้อย 1 แปลงก่อน เพื่อดูรายงานผลกระทบ", { type: "warning" });
          return;
        }
        if (window.Shell) window.Shell.showView("report");
      });
    }
  },

  isReportVisible() {
    return document.body.dataset.view === "report";
  },

  updateYearAdvisory(yearKey) {
    const adv = this.yearAdvisories[yearKey] || this.yearAdvisories["baseline"];
    const elBadge = document.getElementById("dispAdvisoryBadge");
    const elText = document.getElementById("dispAdvisoryText");
    const btnApply = document.getElementById("btnApplyAdvisoryDate");

    if (elBadge) elBadge.innerText = adv.badge;
    if (elText) elText.innerText = adv.text;
    if (btnApply && adv.recommendedDate) {
      btnApply.innerHTML = `<i class="fa-regular fa-calendar-check"></i> ใช้วันปลูกที่แนะนำ (${this.formatThaiDate(adv.recommendedDate).split(" (")[0]})`;
    }
  },

  /* ---------------------------------------------------------------------- */
  /* Paddy detail / soil                                                    */
  /* ---------------------------------------------------------------------- */

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

  /** ค่าดินประมาณการตามภูมิภาค (ใช้เมื่อไม่มี backend หรือระหว่างรอผล) */
  regionalSoilEstimate(paddy) {
    const prov = paddy.detectedProv;
    const region = (prov && prov.region) || "northeast";
    const byRegion = {
      northeast: { soil_group: "17", suitability_name: "เหมาะสมปานกลาง (S2)", topsoil_texture: "ดินร่วนปนทราย", f_soil: 0.85 },
      central: { soil_group: "2", suitability_name: "เหมาะสมสูง (S1)", topsoil_texture: "ดินเหนียวที่ราบลุ่ม", f_soil: 0.95 },
      north: { soil_group: "33", suitability_name: "เหมาะสมปานกลาง (S2)", topsoil_texture: "ดินร่วนปนตะกอน", f_soil: 0.88 }
    };
    const base = byRegion[region] || { soil_group: "18", suitability_name: "เหมาะสมปานกลาง (S2)", topsoil_texture: "ดินร่วนเหนียว", f_soil: 0.86 };
    const amp = paddy.amphoeProp;
    return {
      ...base,
      topsoil_pH: "5.5 - 6.5",
      province: (amp && amp.pro_th) || (prov ? prov.name_th : "ไม่ทราบจังหวัด"),
      district: amp ? (amp.amp_th.startsWith("อ.") ? amp.amp_th : `อ.${amp.amp_th}`) : "-",
      source: "estimate"
    };
  },

  /** ข้อมูลดินเก็บ "รายแปลง" (แปลงคนละภาคจะได้ F_soil ต่างกัน) และดึงจาก backend เพียงครั้งเดียวต่อแปลง */
  async ensurePaddySoil(paddy) {
    if (!paddy) return;
    if (!paddy.soil) paddy.soil = this.regionalSoilEstimate(paddy);
    if (!this.backendOnline || paddy.soil.source === "backend" || paddy._soilLoading) return;

    paddy._soilLoading = true;
    try {
      const res = await fetch(`${this.backendUrl}/api/soil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: paddy.geometry })
      });
      const json = await res.json();
      if (json.success && json.data && typeof json.data.f_soil === "number") {
        paddy.soil = { ...json.data, source: "backend" };
      }
    } catch (err) {
      console.warn("[App] เชื่อมต่อดินไม่สำเร็จ ใช้การประมาณตามภูมิภาค:", err);
    } finally {
      paddy._soilLoading = false;
    }

    // ผลลัพธ์อาจกลับมาหลังผู้ใช้เปลี่ยนไปเลือกแปลงอื่นแล้ว: อัปเดตเฉพาะเมื่อยังเป็นแปลงเดิม
    if (this.getActivePaddy() === paddy) this.updateSoilUI(paddy);
    this.scheduleRefresh();
  },

  handlePolygonUpdate(geometry, detectedProv = null, paddy = null, landUseInfo = null) {
    if (!geometry || !paddy) {
      ["dispAreaThai", "dispAreaSqM", "dispLocation", "dispSoilGroup", "dispSuitability", "dispSoilPh"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerText = "-";
      });
      this.setBioSliders(this.modelParams);
      this.updateVarietyTargetHint();
      return;
    }

    const areaResult = paddy.areaResult || AreaCalculator.calculateArea(geometry);
    const elAreaThai = document.getElementById("dispAreaThai");
    const elAreaSqM = document.getElementById("dispAreaSqM");
    if (elAreaThai) elAreaThai.innerText = areaResult.formattedThai;
    if (elAreaSqM) elAreaSqM.innerText = `${areaResult.sqMeters.toLocaleString()} ตร.ม.`;

    const elLandUseAlert = document.getElementById("dispLandUseAlert");
    if (elLandUseAlert) {
      if (landUseInfo && !landUseInfo.isPaddyArea && landUseInfo.warning) {
        elLandUseAlert.style.display = "block";
        elLandUseAlert.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i> ${landUseInfo.warning}`;
      } else {
        elLandUseAlert.style.display = "none";
      }
    }

    // ซิงก์พันธุ์และตัวแปรชีวภาพของแปลงที่เลือกไปยังแผงซ้าย
    const varietySelect = document.getElementById("riceVariety");
    if (varietySelect && paddy.variety) varietySelect.value = paddy.variety;
    if (paddy.params) this.setBioSliders(paddy.params);
    this.updateVarietyTargetHint();

    const title = document.getElementById("dispSoilPaddyName");
    if (title) title.innerText = paddy.name;

    if (!paddy.soil) paddy.soil = this.regionalSoilEstimate(paddy);
    this.updateSoilUI(paddy);
    this.ensurePaddySoil(paddy);
  },

  updateSoilUI(paddy) {
    const soil = paddy.soil || this.regionalSoilEstimate(paddy);
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };
    set("dispLocation", paddy.locationStr || `${soil.province} / ${soil.district || "-"}`);
    set("dispSoilGroup", `กลุ่มที่ ${soil.soil_group_number || soil.soil_group || "-"}${soil.source === "estimate" ? " (ประมาณตามภูมิภาค)" : ""}`);
    set("dispSuitability", soil.suitability_name || "-");
    set("dispSoilPh", soil.topsoil_pH || "-");
  },

  /* ---------------------------------------------------------------------- */
  /* Time updates & yield calculation                                       */
  /* ---------------------------------------------------------------------- */

  scheduleRefresh() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.refresh();
    });
  },

  handleTimeUpdate(state) {
    this.lastState = state;

    const scrubber = document.getElementById("timelineScrubber");
    if (scrubber) {
      scrubber.max = state.totalDays;
      scrubber.value = state.currentDay;
      scrubber.setAttribute("aria-valuetext", `วันที่ ${state.currentDay} จาก ${state.totalDays}`);
    }
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };
    set("dispSimDate", state.simulatedDate);
    set("dispDap", `วันที่ ${state.currentDay} / ${state.totalDays}`);
    set("dispPercent", `${state.percent}%`);

    const btnPlay = document.getElementById("btnPlay");
    const btnPause = document.getElementById("btnPause");
    if (btnPlay) btnPlay.classList.toggle("is-active", state.isPlaying);
    if (btnPause) btnPause.classList.toggle("is-active", !state.isPlaying && state.currentDay > 1);

    // ช่องวันเริ่มมรสุมขยับตามวันจำลองเฉพาะตอนกำลังเล่น (ไม่ทับค่าที่ผู้ใช้พิมพ์ไว้ตอนหยุด)
    const startInput = document.getElementById("disasterStartDay");
    const endInput = document.getElementById("disasterEndDay");
    if (state.isPlaying && startInput && document.activeElement !== startInput && document.activeElement !== endInput) {
      startInput.value = state.currentDay;
      const curEnd = parseInt(endInput.value, 10);
      if (isNaN(curEnd) || curEnd <= state.currentDay) {
        endInput.value = Math.min(state.totalDays, state.currentDay + 15);
      }
    }

    // ปุ่มสภาพอากาศฉับพลันต้องสะท้อนสถานะจริงของ engine
    if (state.forcedWeather === "auto" && document.querySelector(".scenario-btn[aria-pressed='true']")) {
      this.clearScenarioButtons();
    }

    set("dispCurRain", `${state.rain} มม./วัน`);
    set("dispCumulativeRain", `สะสมตั้งแต่วันปลูก: ${state.cumulativeRain.toLocaleString()} มม.`);
    set("dispCurTemp", `${state.temp} °C`);
    set("dispCdd", `${state.cdd} วัน`);

    const elWeatherDesc = document.getElementById("dispWeatherDesc");
    if (elWeatherDesc) {
      const desc = {
        flood: ["⚠️ ฝนตกสะสมหนัก เกิดน้ำท่วมขังแปลงนา!", "#0284c7"],
        drought: ["☀️ ฝนแล้งทิ้งช่วง ข้าวขาดน้ำ!", "#ea580c"],
        heat: ["🔥 อากาศร้อนจัด เสี่ยงเกสรลีบถาวร!", "#dc2626"],
        rain: ["🌧️ ฝนตกชุ่มฉ่ำ น้ำในแปลงเพียงพอ", "#0284c7"]
      }[state.activeEventState] || ["🌤️ สภาพอากาศปกติตามฤดูกาล", "#16a34a"];
      elWeatherDesc.innerText = `วันที่ ${state.currentDay}: ${desc[0]}`;
      elWeatherDesc.style.color = desc[1];
    }

    this.scheduleRefresh();
  },

  /**
   * ผลผลิตของแปลงเดียว ณ วันที่ day
   * - ใช้ระยะ/ความเสียหาย/ชีวมวลตามอายุพันธุ์ของแปลงนั้น
   * - แปลงที่เก็บเกี่ยวแล้วจะตรึงค่าไว้ที่วันเก็บเกี่ยว ไม่เปลี่ยนตามสภาพอากาศหลังจากนั้น
   */
  computePaddyResult(p, day) {
    const spec = getVarietySpec(p.variety);
    const prm = { ...buildPaddyParams(spec.key), ...(p.params || {}) };
    const duration = getPaddyDuration(p);
    const effDay = Math.max(1, Math.min(day, duration));
    const stage = timeEngine.stageFor(day, duration);
    const harvested = day >= duration;

    const sqM = (p.areaResult && p.areaResult.sqMeters) ? p.areaResult.sqMeters : AreaCalculator.calculateArea(p.geometry).sqMeters;
    const rai = sqM / 1600;

    // สมการที่ 3: ศักยภาพผลผลิตตามพันธุกรรม (กก.)
    const ypotKg = (prm.H * prm.P * prm.G * prm.fertilityFactor * prm.W / 1e6) * sqM;

    const wm = timeEngine.multipliersAt(effDay);
    const damage = timeEngine.damageFor(duration, effDay);
    const seasonDamage = timeEngine.damageFor(duration, duration);
    const f_soil = (p.soil && typeof p.soil.f_soil === "number") ? p.soil.f_soil : this.regionalSoilEstimate(p).f_soil;
    const f_ndvi = this.multipliers.f_ndvi;

    // สมการที่ 4: ผลผลิตหลังปรับลดด้วยสิ่งแวดล้อมและมรสุม
    const envMult = f_soil * wm.f_temp * wm.f_climate * f_ndvi;
    const finalKg = ypotKg * envMult * damage.f_stress;
    const noStressKg = ypotKg * envMult;
    const seasonKg = ypotKg * envMult * seasonDamage.f_stress;
    const biomass = timeEngine.biomassRatio(day, duration);

    return {
      paddy: p,
      spec,
      params: prm,
      duration,
      effDay,
      stage,
      harvested,
      sqM,
      rai,
      ypotKg,
      finalKg,
      noStressKg,
      seasonKg,
      currentKg: finalKg * biomass,
      biomass,
      kgPerRai: rai > 0 ? finalKg / rai : 0,
      damage,
      seasonDamage,
      mult: { f_soil, f_temp: wm.f_temp, f_climate: wm.f_climate, f_ndvi, f_stress: damage.f_stress },
      harvestDate: timeEngine.getDateForDay(duration),
      eventToday: harvested ? "normal" : timeEngine.dayInfo(day).event
    };
  },

  /** คำนวณและอัปเดตทุกส่วนที่ขึ้นกับแปลงและเวลา */
  refresh() {
    const paddies = this.getPaddies();
    const day = timeEngine.currentDay;

    if (paddies.length === 0) {
      this.updatePanelVisibility(0);
      this.renderGanttTracks([]);
      const elBreakdown = document.getElementById("paddyBreakdownList");
      if (elBreakdown) elBreakdown.innerHTML = "";
      this._cardSignature = "";
      const stageTag = document.getElementById("dispStageName");
      if (stageTag) stageTag.innerText = "ยังไม่มีแปลงนา";
      if (this.mapManager) this.mapManager.renderRiceVisuals(1, "normal");
      this.updateWeatherChart();
      return;
    }

    this.updatePanelVisibility(paddies.length);
    const results = paddies.map((p) => this.computePaddyResult(p, day));
    const activeId = String(this.mapManager.activePaddyId);
    const active = results.find((r) => String(r.paddy.id) === activeId) || results[0];

    this.renderFarmSummary(results);
    this.renderPaddyCards(results, activeId);
    this.renderMultipliers(active);
    this.renderGanttTracks(results);
    this.renderResultDisasterSummary(active);

    // ป้ายระยะการเติบโตบนแถบไทม์ไลน์ = ระยะของแปลงที่เลือก
    const stageTag = document.getElementById("dispStageName");
    if (stageTag) {
      stageTag.innerText = `${active.paddy.name} · ${active.stage.name}`;
      stageTag.style.setProperty("--stage-color", active.stage.color);
      stageTag.setAttribute("data-hint", `${active.stage.desc}\nอายุพันธุ์ ${active.duration} วัน · เก็บเกี่ยว ${this.formatShortDate(active.harvestDate)}`);
    }

    if (this.mapManager) {
      this.mapManager.renderRiceVisuals(active.stage.id, active.eventToday);
    }

    this.updateWeatherChart();
    this.updateGrowthChart(active);

    if (this.isReportVisible()) this.renderDisasterReport(results);
  },

  renderFarmSummary(results) {
    let rai = 0, finalKg = 0, currentKg = 0, ypotKg = 0, noStressKg = 0;
    results.forEach((r) => {
      rai += r.rai;
      finalKg += r.finalKg;
      currentKg += r.currentKg;
      ypotKg += r.ypotKg;
      noStressKg += r.noStressKg;
    });
    const avgKgPerRai = rai > 0 ? finalKg / rai : 0;
    const avgNoStress = rai > 0 ? noStressKg / rai : 0;
    this.lastFarmYieldPerRai = avgKgPerRai;

    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };
    set("dispTotalYield", `${(finalKg / 1000).toFixed(2)} ตัน`);
    set("dispAccumYield", `สะสมแล้ว ณ วันนี้: ${(currentKg / 1000).toFixed(2)} ตัน`);
    set("dispPotYield", `ศักยภาพสูงสุด: ${(ypotKg / 1000).toFixed(2)} ตัน · ${rai.toFixed(2)} ไร่`);
    set("dispYieldPerRai", `${Math.round(avgKgPerRai)} กก./ไร่`);

    const elLoss = document.getElementById("dispYieldLossDesc");
    if (elLoss) {
      const lossKg = Math.max(0, ypotKg - finalKg);
      const lossPct = ypotKg > 0 ? Math.round((lossKg / ypotKg) * 100) : 0;
      elLoss.innerHTML = lossPct > 0
        ? `🔻 ต่ำกว่าศักยภาพ ${(lossKg / 1000).toFixed(2)} ตัน (-${lossPct}%)`
        : `<span style="color:#15803d;">✨ ได้ผลผลิตเต็มศักยภาพ</span>`;
      elLoss.setAttribute("data-hint", "ส่วนต่างระหว่างศักยภาพทางพันธุกรรมกับผลผลิตคาดการณ์\nเกิดจากดิน อุณหภูมิ น้ำ ดาวเทียม และความเสียหายจากมรสุมรวมกัน");
    }

    const oaeBenchmark = 356;
    const diffPercent = Math.round(((avgKgPerRai - oaeBenchmark) / oaeBenchmark) * 100);
    const elBench = document.getElementById("dispOaeBenchmark");
    if (elBench) {
      elBench.innerText = `${diffPercent >= 0 ? "+" : ""}${diffPercent}% เทียบ สศก. (${oaeBenchmark} กก./ไร่)`;
      elBench.style.color = diffPercent >= 0 ? "#15803d" : (diffPercent >= -20 ? "#ca8a04" : "#b91c1c");
    }

    const elGhost = document.getElementById("dispDisasterGhostPill");
    if (elGhost) {
      const hasStress = results.some((r) => r.mult.f_stress < 0.99);
      elGhost.style.display = hasStress ? "inline-flex" : "none";
      elGhost.innerText = `🌾 หากไม่เกิดมรสุม: ${Math.round(avgNoStress)} กก./ไร่`;
    }

    const elDiff = document.getElementById("dispCompareDiff");
    if (elDiff) {
      if (this.previousRun && this.previousRun.yieldPerRai > 0) {
        const diffPrev = Math.round(avgKgPerRai - this.previousRun.yieldPerRai);
        const pct = Math.round((diffPrev / this.previousRun.yieldPerRai) * 100);
        const sign = diffPrev >= 0 ? "+" : "";
        elDiff.innerText = `${sign}${diffPrev} กก. (${sign}${pct}%)`;
        elDiff.className = diffPrev >= 0 ? "comparison-diff-badge gain" : "comparison-diff-badge drop";
        elDiff.style.display = "inline-flex";
      } else {
        elDiff.style.display = "none";
      }
    }
  },

  renderMultipliers(r) {
    const title = document.getElementById("dispMultiplierPaddy");
    if (title) title.innerText = r.paddy.name;
    this.updateMultiplierBadge("dispFsoil", "dispSoilQual", r.mult.f_soil, "soil");
    this.updateMultiplierBadge("dispFtemp", "dispTempQual", r.mult.f_temp, "temp");
    this.updateMultiplierBadge("dispFclimate", "dispClimateQual", r.mult.f_climate, "climate");
    this.updateMultiplierBadge("dispFndvi", "dispNdviQual", r.mult.f_ndvi, "ndvi");
    const elFstress = document.getElementById("dispFstress");
    if (elFstress) elFstress.innerText = `× ${r.mult.f_stress.toFixed(2)}`;
  },

  updateMultiplierBadge(badgeId, qualId, val, type) {
    const elBadge = document.getElementById(badgeId);
    const elQual = document.getElementById(qualId);
    if (elBadge) elBadge.innerText = `× ${val.toFixed(2)}`;
    if (elQual) {
      const q = this.getQualitativeRating(val, type);
      elQual.className = `qual-badge lvl-${q.lvl}`;
      elQual.innerText = q.label;
      elQual.setAttribute("data-hint", q.desc);
    }
  },

  /**
   * การ์ดรายแปลง: สร้างโครงใหม่เฉพาะเมื่อรายการแปลงเปลี่ยน
   * ระหว่างเล่นเวลาจะอัปเดตเฉพาะตัวเลข (dropdown ไม่ปิดเอง และหน้าไม่กระตุก)
   */
  renderPaddyCards(results, activeId) {
    const list = document.getElementById("paddyBreakdownList");
    if (!list) return;

    const signature = results.map((r) => `${r.paddy.id}|${r.paddy.name}|${r.paddy.variety}`).join(",") + `#${activeId}`;
    if (signature !== this._cardSignature) {
      this._cardSignature = signature;
      list.innerHTML = results.map((r) => this.paddyCardTemplate(r, String(r.paddy.id) === activeId)).join("");
      this.syncHoverHighlight(this.mapManager.hoverPaddyId);
    }

    results.forEach((r) => {
      const card = document.getElementById(`paddyCard_${r.paddy.id}`);
      if (!card) return;
      const f = (name) => card.querySelector(`[data-field="${name}"]`);
      const progress = Math.min(100, Math.round((timeEngine.currentDay / r.duration) * 100));
      const ev = this.eventMeta[r.eventToday];

      const stageEl = f("stage");
      stageEl.textContent = r.harvested ? "🌾 พร้อมเก็บเกี่ยว" : `${r.stage.id}. ${r.stage.short}`;
      stageEl.style.setProperty("--stage-color", r.stage.color);
      stageEl.setAttribute("data-hint", r.stage.desc);

      f("progressFill").style.width = `${progress}%`;
      f("progressFill").classList.toggle("warn", !!ev && r.eventToday !== "rain");
      f("progressText").textContent = r.harvested
        ? `ครบ ${r.duration} วัน · เก็บเกี่ยว ${this.formatShortDate(r.harvestDate)}`
        : `วันที่ ${timeEngine.currentDay}/${r.duration} (${progress}%) · เก็บเกี่ยว ${this.formatShortDate(r.harvestDate)}`;
      f("event").innerHTML = ev && r.eventToday !== "rain" ? `<span class="card-event-chip" style="--ev:${ev.color}">${ev.emoji} ${ev.name}</span>` : "";

      f("yield").textContent = `${(r.finalKg / 1000).toFixed(2)} ตัน`;
      f("yieldPerRai").textContent = `${Math.round(r.kgPerRai)} กก./ไร่`;
      f("pot").textContent = `${(r.ypotKg / 1000).toFixed(2)} ตัน`;
      f("bio").textContent = `H=${r.params.H} · P=${r.params.P} · G=${r.params.G} · W=${r.params.W}g · ดิน ×${r.mult.f_soil.toFixed(2)}`;
    });
  },

  paddyCardTemplate(r, isActive) {
    const p = r.paddy;
    const options = Object.values(RICE_VARIETIES).map((v) =>
      `<option value="${v.key}" ${v.key === p.variety ? "selected" : ""}>${v.name} (${v.duration} วัน)</option>`
    ).join("");
    const area = p.areaResult ? p.areaResult.formattedThai : `${r.rai.toFixed(2)} ไร่`;
    const name = this.escapeHtml(p.name);

    return `
      <div class="paddy-breakdown-card ${isActive ? "active" : ""}" id="paddyCard_${p.id}" data-paddy-id="${p.id}"
           tabindex="0" role="button" aria-pressed="${isActive}" aria-label="${name} คลิกเพื่อเลือกและเลื่อนแผนที่ไปยังแปลง">
        <div class="paddy-breakdown-header">
          <div class="paddy-breakdown-header-left">
            <span class="paddy-breakdown-name">🌾 ${name}</span>
            <span class="paddy-stage-chip" data-field="stage"></span>
          </div>
          <div class="paddy-breakdown-header-right">
            ${isActive ? `<span class="active-paddy-badge"><i class="fa-solid fa-crosshairs"></i> กำลังเลือก</span>` : `<span class="select-paddy-hint">คลิกเพื่อดูบนแผนที่</span>`}
            <button type="button" class="paddy-card-icon-btn" data-action="zoom" data-hint="ซูมแผนที่ไปที่แปลงนี้" aria-label="ซูมไปที่${name}"><i class="fa-solid fa-location-crosshairs"></i></button>
            <button type="button" class="paddy-card-del-btn" data-action="delete" data-hint="ลบแปลงนี้ (กดเลิกทำได้)" aria-label="ลบ${name}"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="paddy-card-variety-row">
          <select class="paddy-card-variety-select" aria-label="พันธุ์ข้าวของ${name}" data-hint="เปลี่ยนพันธุ์ข้าวเฉพาะแปลงนี้\\nตัวแปรชีวภาพจะรีเซ็ตเป็นค่ามาตรฐานของพันธุ์">${options}</select>
          <span data-field="event"></span>
        </div>
        <div class="paddy-card-progress" data-hint="ความคืบหน้าการเติบโตของแปลงนี้ตามอายุพันธุ์">
          <div class="paddy-card-progress-track"><div class="paddy-card-progress-fill" data-field="progressFill"></div></div>
          <div class="paddy-card-progress-text" data-field="progressText"></div>
        </div>
        <div class="paddy-breakdown-grid">
          <div>
            <span class="paddy-breakdown-lbl">ผลผลิตคาดการณ์</span>
            <span class="paddy-breakdown-val strong" data-field="yield"></span>
            <span class="paddy-breakdown-sub" data-field="yieldPerRai"></span>
          </div>
          <div>
            <span class="paddy-breakdown-lbl">ศักยภาพสูงสุด</span>
            <span class="paddy-breakdown-val" data-field="pot"></span>
          </div>
          <div>
            <span class="paddy-breakdown-lbl">ขนาดพื้นที่</span>
            <span class="paddy-breakdown-val">${area}</span>
          </div>
          <div>
            <span class="paddy-breakdown-lbl">ที่ตั้งแปลง</span>
            <span class="paddy-breakdown-val loc"><i class="fa-solid fa-location-dot"></i> ${this.escapeHtml(p.locationStr || "-")}</span>
          </div>
        </div>
        <div class="paddy-breakdown-bio-row" data-hint="ตัวแปรชีวภาพเฉพาะแปลงนี้ ปรับได้ที่แผงซ้าย (เมื่อเลือกแปลงนี้อยู่)">
          <i class="fa-solid fa-dna"></i> <span data-field="bio"></span>
        </div>
      </div>`;
  },

  /**
   * Gantt รายแปลง: ความยาวแถบตามอายุพันธุ์จริงเทียบกับฤดูของฟาร์ม (พันธุ์ยาวสุด)
   * แสดงช่วงระยะการเติบโต 5 ระยะ, เส้นวันปัจจุบัน, ธงวันเก็บเกี่ยว และช่วงภัยพิบัติ
   */
  renderGanttTracks(results) {
    const box = document.getElementById("multiVarietyGanttContainer");
    const highlight = document.getElementById("timelineDisasterHighlight");
    if (!box) return;

    if (!results || results.length === 0) {
      box.style.display = "none";
      box.innerHTML = "";
      this._ganttSignature = "";
      if (highlight) highlight.style.display = "none";
      return;
    }

    const maxDays = timeEngine.totalDays;
    const day = timeEngine.currentDay;
    const ranges = timeEngine.getEventRanges().filter((r) => r.type !== "rain" || r.source !== "year");
    const activeId = String(this.mapManager.activePaddyId);

    // แถบมรสุมบน scrubber: เฉพาะที่ผู้ใช้กำหนด
    if (highlight) {
      const userRanges = ranges.filter((r) => r.source === "scheduled" || r.source === "instant");
      if (userRanges.length > 0) {
        const s = Math.min(...userRanges.map((r) => r.start));
        const e = Math.max(...userRanges.map((r) => r.end));
        highlight.style.display = "block";
        highlight.style.left = `${((s - 1) / maxDays) * 100}%`;
        highlight.style.width = `${Math.max(1.5, ((e - s + 1) / maxDays) * 100)}%`;
      } else {
        highlight.style.display = "none";
      }
    }

    const pct = (d) => `${(d / maxDays) * 100}%`;
    const signature = [
      maxDays,
      timeEngine.plantDate.getTime(),
      activeId,
      results.map((r) => `${r.paddy.id}|${r.paddy.name}|${r.duration}`).join(","),
      ranges.map((r) => `${r.type}${r.start}-${r.end}`).join(",")
    ].join("#");

    if (signature !== this._ganttSignature) {
      this._ganttSignature = signature;
      this._ganttJustBuilt = true;
      box.style.display = "block";

      const step = maxDays <= 60 ? 15 : 30;
      const ticks = [];
      for (let d = 0; d < maxDays; d += step) ticks.push(d);
      if (maxDays - ticks[ticks.length - 1] >= step * 0.4) ticks.push(maxDays);
      else ticks[ticks.length - 1] = maxDays;

      const stageLegend = timeEngine.stages.map((s) => `<span class="gantt-legend-item"><i style="background:${s.color}"></i>${s.short}</span>`).join("");

      const rows = results.map((r) => {
        const p = r.paddy;
        const segs = timeEngine.stages.map((s) => {
          const from = Math.round(s.minRatio * r.duration);
          const to = Math.round(s.maxRatio * r.duration);
          const start = timeEngine.getDateForDay(Math.max(1, from));
          const end = timeEngine.getDateForDay(Math.max(1, to));
          return `<div class="gantt-seg" style="width:${(s.maxRatio - s.minRatio) * 100}%; background:${s.color};"
            data-hint="<strong>${s.name}</strong><br>วันที่ ${Math.max(1, from)}-${to} (${this.formatShortDate(start)} - ${this.formatShortDate(end)})<br>${s.desc}"></div>`;
        }).join("");
        return `
          <div class="gantt-row ${String(p.id) === activeId ? "active" : ""}" data-paddy-id="${p.id}">
            <div class="gantt-label">
              <span class="gantt-variety-dot" style="background:${r.spec.color}"></span>
              <span class="gantt-name">${this.escapeHtml(p.name)}</span>
              <span class="gantt-variety">${r.spec.short} · ${r.duration} วัน</span>
            </div>
            <div class="gantt-track">
              <div class="gantt-span" style="width:${pct(r.duration)};">
                ${segs}
                <div class="gantt-fill" data-field="fill"></div>
              </div>
              <div class="gantt-harvest-flag" style="left:${pct(r.duration)};"
                data-hint="<strong>🌾 วันเก็บเกี่ยว ${p.name}</strong><br>วันที่ ${r.duration} · ${timeEngine.formatDate(r.harvestDate, { day: "numeric", month: "long", year: "numeric" })}">
                <i class="fa-solid fa-flag-checkered"></i>
              </div>
            </div>
            <div class="gantt-status" data-field="status"></div>
          </div>`;
      }).join("");

      const bands = ranges.map((r) => {
        const meta = this.eventMeta[r.type] || this.eventMeta.flood;
        const src = r.source === "year" ? `สภาพอากาศตามปี ${timeEngine.selectedYear}` : (r.source === "instant" ? "กดปุ่มฉับพลัน" : "กำหนดเอง");
        return `<div class="gantt-band" style="left:${pct(r.start - 1)}; width:${pct(r.end - r.start + 1)}; --band:${meta.color};"
          data-hint="<strong>${meta.emoji} ${meta.name}</strong><br>วันที่ ${r.start}-${r.end} (${r.end - r.start + 1} วัน) · ระดับ ${r.severity}/10<br>ที่มา: ${src}"></div>`;
      }).join("");

      box.innerHTML = `
        <div class="gantt-head">
          <span class="gantt-title" data-hint="แต่ละแถบยาวตามอายุพันธุ์ของแปลงนั้น<br>ไทม์ไลน์รวมยาว ${maxDays} วัน ตามพันธุ์ที่อายุยาวที่สุดในฟาร์ม<br>คลิกแถวเพื่อเลือกแปลงและเลื่อนแผนที่">
            <i class="fa-solid fa-bars-progress"></i> ไทม์ไลน์รายแปลง (${maxDays} วัน)
          </span>
          <span class="gantt-legend">${stageLegend}</span>
        </div>
        <div class="gantt-scroll">
          <div class="gantt-grid">
            <div class="gantt-axis">
              ${ticks.map((t) => `<span class="gantt-tick" style="left:${pct(t)}">${t}</span>`).join("")}
            </div>
            ${rows}
            <div class="gantt-overlay">
              ${bands}
              <div class="gantt-today" data-field="today"><span data-field="todayLabel"></span></div>
            </div>
          </div>
        </div>`;
    }

    box.style.display = "block";
    if (this._ganttJustBuilt) {
      this._ganttJustBuilt = false;
      this.syncHoverHighlight(this.mapManager.hoverPaddyId);
    }
    const today = box.querySelector('[data-field="today"]');
    if (today) {
      today.style.left = pct(Math.max(0, day - 0.5));
      today.querySelector('[data-field="todayLabel"]').textContent = `วันที่ ${day}`;
    }

    results.forEach((r) => {
      const row = box.querySelector(`.gantt-row[data-paddy-id="${r.paddy.id}"]`);
      if (!row) return;
      const progress = Math.min(100, (day / r.duration) * 100);
      row.querySelector('[data-field="fill"]').style.width = `${progress}%`;
      const status = row.querySelector('[data-field="status"]');
      const ev = this.eventMeta[r.eventToday];
      if (r.harvested) {
        status.innerHTML = `<span class="gantt-status-chip done">✅ เก็บเกี่ยวได้</span>`;
      } else if (ev && r.eventToday !== "rain") {
        status.innerHTML = `<span class="gantt-status-chip warn" style="--ev:${ev.color}">${ev.emoji} ${ev.name}</span>`;
      } else {
        status.innerHTML = `<span class="gantt-status-chip" style="--stage-color:${r.stage.color}">${r.stage.short} · ${Math.round(progress)}%</span>`;
      }
    });
  },

  /** หมวดของช่วงการเติบโตที่ช่วงวัน [start, end] ไปกระทบ (สำหรับแปลงอายุ duration) */
  describeAffectedStages(start, end, duration) {
    const names = [];
    timeEngine.stages.forEach((s) => {
      const from = Math.max(1, Math.floor(s.minRatio * duration) + 1);
      const to = Math.round(s.maxRatio * duration);
      if (start <= to && end >= from && start <= duration) names.push(s.id === 3 ? `${s.short} (วิกฤต)` : s.short);
    });
    if (start > duration) return "หลังเก็บเกี่ยวแล้ว (ไม่กระทบ)";
    return names.join(" ➔ ") || "-";
  },

  renderResultDisasterSummary(active) {
    const elText = document.getElementById("dispDisasterSummaryText");
    if (!elText || !active) return;

    const ranges = timeEngine.getEventRanges().filter((r) => r.type !== "rain");
    const day = timeEngine.currentDay;
    const todayEv = this.eventMeta[active.eventToday];

    if (ranges.length === 0) {
      elText.innerHTML = `🌤️ <strong>สภาพอากาศปกติ:</strong> ตลอดฤดูนี้ไม่มีมรสุมหรือภัยธรรมชาติรุนแรง ข้าวเจริญเติบโตเต็มศักยภาพ`;
      return;
    }

    const live = todayEv && active.eventToday !== "rain"
      ? `<span class="summary-live danger">🚨 วันที่ ${day}: ${todayEv.name}</span>`
      : `<span class="summary-live ok">🌤️ วันที่ ${day}: อากาศปกติ</span>`;

    const items = ranges.slice(0, 4).map((r) => {
      const meta = this.eventMeta[r.type];
      const src = r.source === "year" ? `ตามสภาพอากาศปี ${timeEngine.selectedYear}` : (r.source === "instant" ? "ปุ่มฉับพลัน" : "กำหนดเอง");
      return `<li>${meta.emoji} <strong>${meta.name}</strong> วันที่ ${r.start}-${r.end} · ระดับ ${r.severity}/10 <span class="summary-src">(${src})</span><br>
        <span class="summary-sub">กระทบ${this.escapeHtml(active.paddy.name)}: ${this.describeAffectedStages(r.start, r.end, active.duration)}</span></li>`;
    }).join("");
    const more = ranges.length > 4 ? `<li class="summary-sub">และอีก ${ranges.length - 4} เหตุการณ์ (ดูในรายงานผลกระทบ)</li>` : "";

    const seasonLoss = Math.round(active.seasonDamage.total * 100);
    elText.innerHTML = `
      <div style="margin-bottom:4px;">${live}</div>
      <ul class="summary-list">${items}${more}</ul>
      <div class="summary-sub">ผลต่อ${this.escapeHtml(active.paddy.name)}ทั้งฤดู: ${seasonLoss > 0 ? `<strong style="color:#b91c1c;">เสียหายถาวร -${seasonLoss}%</strong>` : "กระทบเล็กน้อย อยู่ในเกณฑ์ปกติ"}</div>`;
  },

  /** หน้าต่างรายงานผลกระทบมรสุม (ทั้งฟาร์ม หากฤดูดำเนินไปจนครบ) */
  renderDisasterReport(results = null) {
    const paddies = this.getPaddies();
    if (paddies.length === 0) return;
    const rs = results || paddies.map((p) => this.computePaddyResult(p, timeEngine.currentDay));
    const active = rs.find((r) => String(r.paddy.id) === String(this.mapManager.activePaddyId)) || rs[0];

    let rai = 0, baseKg = 0, actualKg = 0;
    rs.forEach((r) => {
      rai += r.rai;
      baseKg += r.noStressKg;
      actualKg += r.seasonKg;
    });
    const basePerRai = rai > 0 ? Math.round(baseKg / rai) : 0;
    const actualPerRai = rai > 0 ? Math.round(actualKg / rai) : 0;
    const diffKg = actualPerRai - basePerRai;
    const diffPct = basePerRai > 0 ? Math.round((diffKg / basePerRai) * 100) : 0;

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };
    set("dispModalBaseYield", `${basePerRai} กก./ไร่`);
    set("dispModalBaseTotal", `${(baseKg / 1000).toFixed(2)} ตัน`);
    set("dispModalActualYield", `${actualPerRai} กก./ไร่`);
    set("dispModalActualTotal", `${(actualKg / 1000).toFixed(2)} ตัน`);

    const elLossBanner = document.getElementById("dispModalLossBanner");
    if (elLossBanner) {
      if (diffKg < 0) {
        elLossBanner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> สูญเสียผลผลิตทั้งฟาร์ม: <strong>${diffKg} กก./ไร่ (${diffPct}%)</strong>`;
        elLossBanner.className = "disaster-diff-banner loss";
      } else {
        elLossBanner.innerHTML = `<i class="fa-solid fa-circle-check"></i> ไม่เกิดความเสียหายจากมรสุม: ผลผลิตสมบูรณ์ตามศักยภาพ`;
        elLossBanner.className = "disaster-diff-banner ok";
      }
    }

    const elTimeline = document.getElementById("dispModalDisasterTimeline");
    if (!elTimeline) return;
    const ranges = timeEngine.getEventRanges().filter((r) => r.type !== "rain");
    if (ranges.length === 0) {
      elTimeline.innerHTML = `<div class="empty-note">☀️ ตลอดฤดูกาลเพาะปลูกนี้ไม่มีเหตุการณ์มรสุมหรือภัยธรรมชาติรุนแรง</div>`;
      return;
    }

    const sevColors = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
    elTimeline.innerHTML = ranges.map((r) => {
      const meta = this.eventMeta[r.type];
      const duration = r.end - r.start + 1;
      const D = active.duration;
      const hitsFlowering = r.start <= 0.83 * D && r.end >= 0.42 * D;
      const isFullSeason = r.start <= 0.17 * D && r.end >= 0.71 * D;

      let level = 1;
      if (r.start > D) level = 1;
      else if (isFullSeason || duration >= 50 || r.severity >= 9) level = 5;
      else if ((hitsFlowering && (duration >= 14 || r.severity >= 7)) || duration >= 30) level = 4;
      else if ((hitsFlowering && duration >= 7) || duration >= 20 || r.severity >= 5) level = 3;
      else if (duration >= 10 || r.severity >= 3) level = 2;
      const color = sevColors[level - 1];
      const src = r.source === "year" ? `ตามสภาพอากาศปี ${timeEngine.selectedYear}` : (r.source === "instant" ? "ปุ่มฉับพลัน" : "กำหนดเอง");

      return `<div class="disaster-event-item">
        <div>
          <div style="font-weight:600; color:var(--text-primary);">
            <i class="fa-solid ${meta.icon}" style="color:${color};"></i> ${meta.name} (วันที่ ${r.start} - ${r.end})
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
            ${duration} วัน · ระดับ ${r.severity}/10 · ${src}<br>กระทบ${this.escapeHtml(active.paddy.name)}: ${this.describeAffectedStages(r.start, r.end, D)}
          </div>
        </div>
        <div class="disaster-severity-pill" style="background:${color}20; color:${color}; border:1px solid ${color}40;">
          ความเสียหาย ${level}/5
        </div>
      </div>`;
    }).join("");
  },

  /* ---------------------------------------------------------------------- */
  /* Charts                                                                 */
  /* ---------------------------------------------------------------------- */

  updateWeatherChart() {
    const day = timeEngine.currentDay;
    const from = Math.max(1, day - 20);
    const labels = [], rain = [], temp = [];
    for (let d = from; d <= day; d++) {
      const info = timeEngine.dayInfo(d);
      labels.push(`ว.${d}`);
      rain.push(info.rain);
      temp.push(info.temp);
    }
    AnalyticsCharts.updateWeather(labels, rain, temp);
  },

  /** เส้นชีวมวลของแปลงที่เลือก: ศักยภาพ vs จริง (หลังความเสียหาย) และรอบก่อนหน้า */
  growthSeries(r) {
    const potential = [], actual = [], labels = [];
    for (let d = 1; d <= r.duration; d++) {
      labels.push(d);
      const b = timeEngine.biomassRatio(d, r.duration) * 100;
      potential.push(Math.round(b * 10) / 10);
      actual.push(d <= timeEngine.currentDay ? Math.round(b * timeEngine.damageFor(r.duration, d).f_stress * 10) / 10 : null);
    }
    return { labels, potential, actual };
  },

  updateGrowthChart(r) {
    const key = `${r.paddy.id}|${r.duration}|${timeEngine.currentDay}|${r.mult.f_stress}|${timeEngine.selectedYear}|${this.previousRun ? this.previousRun.id : ""}`;
    if (key === this._growthKey) return;
    this._growthKey = key;
    const s = this.growthSeries(r);
    const prev = this.previousRun && this.previousRun.curve ? this.previousRun.curve : null;
    AnalyticsCharts.updateGrowth(s.labels, s.potential, s.actual, prev, timeEngine.currentDay);
  },

  /** บันทึกผลลัพธ์ปัจจุบันไว้เปรียบเทียบกับรอบถัดไป */
  snapshotCurrentRunAsPrevious() {
    if (this.getPaddies().length === 0) return;
    const active = this.getActivePaddy() || this.getPaddies()[0];
    const r = this.computePaddyResult(active, timeEngine.currentDay);
    const yieldPerRai = Math.round(this.lastFarmYieldPerRai || 0);
    if (yieldPerRai <= 0) return;

    const s = this.growthSeries(r);
    this.previousRun = { id: Date.now(), yieldPerRai, curve: s.actual.slice(0, timeEngine.currentDay) };

    const compEl = document.getElementById("dispComparisonPill");
    if (compEl) {
      compEl.style.display = "inline-flex";
      compEl.innerHTML = `รอบก่อนหน้า: <strong>${yieldPerRai} กก./ไร่</strong>`;
    }
    this._growthKey = "";
  }
};

// ประกาศเป็น global ของ window อย่างชัดเจน (const ระดับบนสุดไม่ได้ผูกกับ window อัตโนมัติ)
window.App = App;

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
