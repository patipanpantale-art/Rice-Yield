/**
 * โครงหน้า K Tonal: เมนูหลัก (rail), แท็บตั้งค่าฤดูปลูก, ชิปสรุปการตั้งค่า,
 * ตัวเลือกแปลงในหน้ารายละเอียด และหน้าต่างค้นหาคำสั่ง (Ctrl K)
 * ทำงานบน DOM เดิมของ App — ไม่เปลี่ยนตรรกะการคำนวณ
 */
// ฟอนต์กราฟให้ตรงกับธีม (ต้องตั้งก่อน App.init สร้างกราฟตอน DOMContentLoaded)
if (window.Chart) {
  Chart.defaults.font.family = "'Sarabun', system-ui, sans-serif";
  Chart.defaults.color = "#424940";
}

const Shell = {
  views: {
    home: { title: "หน้าหลักฟาร์ม", overline: "จำลองผลผลิตข้าว · มข. CS2569" },
    season: { title: "ตั้งค่าฤดูปลูก", overline: "พันธุ์ วันปลูก สภาพอากาศ และภัยธรรมชาติ" },
    paddy: { title: "รายละเอียดแปลง", overline: "ตัวคูณผลผลิต ดิน และที่ตั้ง" },
    weather: { title: "สภาพอากาศ", overline: "ฝนและอุณหภูมิตามปีที่เลือก" },
    growth: { title: "การเติบโตของข้าว", overline: "มวลต้นข้าวเทียบกับศักยภาพ" },
    report: { title: "รายงานความเสียหาย", overline: "สรุปทั้งฟาร์มตลอดฤดู" }
  },

  view: "home",
  storageKey: "rice_sim_view",

  init() {
    this.bindNavigation();
    this.bindSeasonTabs();
    this.bindSheetActions();
    this.bindSettingChips();
    this.bindPaddySwitcher();
    this.bindCommandPalette();
    this.wrapRefresh();

    let saved = null;
    try { saved = localStorage.getItem(this.storageKey); } catch (e) {}
    this.showView(this.views[saved] ? saved : "home", { focus: false });
    this.renderSettingChips();
  },

  /* ---------------------------------------------------------------------- */
  /* เมนูหลัก                                                               */
  /* ---------------------------------------------------------------------- */

  bindNavigation() {
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-view-target]");
      if (!trigger) return;
      this.showView(trigger.getAttribute("data-view-target"));
      const tab = trigger.getAttribute("data-tab");
      if (tab) this.selectSeasonTab(tab);
    });
  },

  showView(name, { focus = true } = {}) {
    if (!this.views[name]) return;
    this.view = name;
    document.body.dataset.view = name;

    document.querySelectorAll(".k-view").forEach((el) => {
      el.hidden = el.getAttribute("data-view") !== name;
    });
    document.querySelectorAll(".k-rail-item[data-view-target]").forEach((el) => {
      if (el.getAttribute("data-view-target") === name) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });

    const meta = this.views[name];
    const title = document.getElementById("kViewTitle");
    const overline = document.getElementById("kViewOverline");
    if (title) title.textContent = meta.title;
    if (overline) overline.textContent = meta.overline;

    const sheet = document.querySelector(".k-sheet");
    if (sheet) sheet.scrollTop = 0;

    try { localStorage.setItem(this.storageKey, name); } catch (e) {}

    if (name === "report" && window.App && App.getPaddies().length > 0) App.renderDisasterReport();
    if (name === "paddy") this.renderPaddySwitcher(true);
    if (focus && title) {
      title.setAttribute("tabindex", "-1");
      title.focus({ preventScroll: true });
    }
  },

  /* ---------------------------------------------------------------------- */
  /* แท็บในหน้าตั้งค่าฤดูปลูก                                                */
  /* ---------------------------------------------------------------------- */

  bindSeasonTabs() {
    const tabs = Array.from(document.querySelectorAll(".k-tab"));
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => this.selectSeasonTab(tab.getAttribute("data-tab")));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        this.selectSeasonTab(next.getAttribute("data-tab"));
        next.focus();
      });
    });
    document.querySelectorAll("[data-tab-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selectSeasonTab(btn.getAttribute("data-tab-next"));
        const sheet = document.querySelector(".k-sheet");
        if (sheet) sheet.scrollTop = 0;
      });
    });
  },

  selectSeasonTab(panelId) {
    document.querySelectorAll(".k-tab").forEach((tab) => {
      const on = tab.getAttribute("data-tab") === panelId;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".k-tabpanel").forEach((panel) => {
      panel.hidden = panel.id !== panelId;
    });
  },

  bindSheetActions() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !window.App) return;
      const action = btn.getAttribute("data-action");
      if (action === "play-from-sheet") App.playSimulation();
      if (action === "print-report") window.print();
    });
  },

  /* ---------------------------------------------------------------------- */
  /* ชิปสรุปการตั้งค่าบนหน้าหลัก                                             */
  /* ---------------------------------------------------------------------- */

  bindSettingChips() {
    ["climateYearSelect", "plantDate", "riceVariety"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => this.renderSettingChips());
    });
    const apply = document.getElementById("btnApplyDisasterWindow");
    if (apply) apply.addEventListener("click", () => setTimeout(() => this.renderSettingChips(), 0));
    const advisory = document.getElementById("btnApplyAdvisoryDate");
    if (advisory) advisory.addEventListener("click", () => setTimeout(() => this.renderSettingChips(), 0));
  },

  renderSettingChips() {
    const box = document.getElementById("kSettingChips");
    if (!box || !window.App) return;
    const year = document.getElementById("climateYearSelect");
    const plant = document.getElementById("plantDate");
    const yearLabel = year ? year.options[year.selectedIndex].text.split(" · ").slice(0, 2).join(" ") : "";
    const plantLabel = plant && plant.value && typeof timeEngine !== "undefined"
      ? timeEngine.formatDate(TimeEngine.parseLocalDate(plant.value))
      : "";

    const chips = [
      `<button type="button" class="k-chip k-chip-tonal" data-view-target="season" data-tab="secInput">${App.escapeHtml(yearLabel)}</button>`,
      `<button type="button" class="k-chip" data-view-target="season" data-tab="secInput">ปลูก ${App.escapeHtml(plantLabel)}</button>`
    ];
    const cfg = typeof timeEngine !== "undefined" ? timeEngine.currentDisasterConfig : null;
    if (cfg && App.eventMeta[cfg.type]) {
      chips.push(`<button type="button" class="k-chip k-chip-blue" data-view-target="season" data-tab="secDisaster">${App.eventMeta[cfg.type].name} วันที่ ${cfg.startDay}–${cfg.endDay} · ระดับ ${cfg.severity}</button>`);
    } else {
      chips.push(`<button type="button" class="k-chip" data-view-target="season" data-tab="secDisaster">+ เพิ่มภัยธรรมชาติ</button>`);
    }
    box.innerHTML = chips.join("");
  },

  /* ---------------------------------------------------------------------- */
  /* ตัวเลือกแปลงในหน้ารายละเอียดแปลง                                        */
  /* ---------------------------------------------------------------------- */

  bindPaddySwitcher() {
    const box = document.getElementById("kPaddySwitcher");
    if (!box) return;
    box.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-paddy-id]");
      if (!chip || !window.App || !App.mapManager) return;
      App.mapManager.selectPaddy(chip.getAttribute("data-paddy-id"), { source: "panel", fly: true });
    });
  },

  renderPaddySwitcher(force = false) {
    const box = document.getElementById("kPaddySwitcher");
    if (!box || !window.App || !App.mapManager) return;
    const paddies = App.getPaddies();
    const activeId = App.mapManager.activePaddyId;
    const sig = paddies.map((p) => `${p.id}:${p.name}:${p.variety}`).join("|") + `#${activeId}`;
    if (!force && sig === this.lastSwitcherSig) return;
    this.lastSwitcherSig = sig;

    box.innerHTML = paddies.map((p) => {
      const on = String(p.id) === String(activeId);
      const color = typeof getVarietySpec === "function" ? getVarietySpec(p.variety).color : "#2E6A3E";
      return `<button type="button" role="tab" aria-selected="${on}" class="k-chip${on ? " k-chip-selected" : ""}" data-paddy-id="${App.escapeHtml(String(p.id))}">
        <span class="k-dot" style="background:${color}"></span>${App.escapeHtml(p.name || "แปลง")}
      </button>`;
    }).join("");
  },

  wrapRefresh() {
    if (!window.App || typeof App.refresh !== "function") return;
    const original = App.refresh;
    App.refresh = function (...args) {
      const out = original.apply(this, args);
      Shell.renderPaddySwitcher();
      return out;
    };
  },

  /* ---------------------------------------------------------------------- */
  /* ค้นหาคำสั่ง (Ctrl K)                                                     */
  /* ---------------------------------------------------------------------- */

  bindCommandPalette() {
    const scrim = document.getElementById("commandPalette");
    const input = document.getElementById("commandInput");
    const list = document.getElementById("commandList");
    const trigger = document.getElementById("btnOpenCommand");
    if (!scrim || !input || !list) return;

    if (trigger) trigger.addEventListener("click", () => this.openCommand());

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (scrim.hidden) this.openCommand();
        else this.closeCommand();
      }
    });

    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) this.closeCommand();
    });

    input.addEventListener("input", () => {
      this.commandIndex = 0;
      this.renderCommands();
    });

    input.addEventListener("keydown", (e) => {
      const count = this.commandItems.length;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.closeCommand();
      } else if (e.key === "ArrowDown" && count) {
        e.preventDefault();
        this.commandIndex = (this.commandIndex + 1) % count;
        this.renderCommands();
      } else if (e.key === "ArrowUp" && count) {
        e.preventDefault();
        this.commandIndex = (this.commandIndex - 1 + count) % count;
        this.renderCommands();
      } else if (e.key === "Enter" && count) {
        e.preventDefault();
        this.runCommand(this.commandItems[this.commandIndex]);
      }
    });

    list.addEventListener("mousemove", (e) => {
      const opt = e.target.closest("[data-index]");
      if (!opt) return;
      const i = Number(opt.getAttribute("data-index"));
      if (i !== this.commandIndex) {
        this.commandIndex = i;
        this.renderCommands();
      }
    });
    list.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-index]");
      if (opt) this.runCommand(this.commandItems[Number(opt.getAttribute("data-index"))]);
    });
  },

  commandItems: [],
  commandIndex: 0,

  openCommand() {
    const scrim = document.getElementById("commandPalette");
    const input = document.getElementById("commandInput");
    this.returnFocus = document.activeElement;
    scrim.hidden = false;
    input.value = "";
    this.commandIndex = 0;
    this.renderCommands();
    input.focus();
  },

  closeCommand() {
    const scrim = document.getElementById("commandPalette");
    if (!scrim || scrim.hidden) return;
    scrim.hidden = true;
    if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus();
  },

  buildCommands() {
    const items = [];
    const playing = typeof timeEngine !== "undefined" && timeEngine.isPlaying;
    const click = (id) => () => { const el = document.getElementById(id); if (el) el.click(); };

    items.push({ group: "คำสั่ง", label: playing ? "หยุดจำลอง" : "เล่นจำลอง", note: "ดูข้าวโตทีละวัน", kbd: "Space",
      run: () => (playing ? timeEngine.pause() : App.playSimulation()) });
    items.push({ group: "คำสั่ง", label: "กลับไปวันแรก", note: "เก็บผลรอบนี้ไว้เปรียบเทียบ", run: click("btnReset") });
    items.push({ group: "คำสั่ง", label: "วาดแปลงตามขอบ", note: "คลิกวางจุดรอบแปลง", run: () => App.startDrawing("polygon") });
    items.push({ group: "คำสั่ง", label: "วาดแปลงสี่เหลี่ยม", note: "คลิก 2 มุมตรงข้ามกัน", run: () => App.startDrawing("rectangle") });
    items.push({ group: "คำสั่ง", label: "ตั้งภัยธรรมชาติตามช่วงวัน", note: "น้ำท่วม แล้ง คลื่นความร้อน", run: () => { this.showView("season"); this.selectSeasonTab("secDisaster"); } });
    [["btnScenarioFlood", "เริ่มน้ำท่วมขังทันที"], ["btnScenarioDrought", "เริ่มแล้งทิ้งช่วงทันที"], ["btnScenarioRain", "เริ่มฝนตกหนักทันที"], ["btnScenarioHeat", "เริ่มคลื่นความร้อนทันที"]]
      .forEach(([id, label]) => items.push({ group: "คำสั่ง", label, note: "เริ่มในวันที่กำลังจำลองอยู่ กดซ้ำเพื่อปิด", run: click(id) }));
    items.push({ group: "คำสั่ง", label: "เปิดรายงานความเสียหาย", note: "สรุปทั้งฤดู", run: click("btnOpenDisasterReport") });

    const year = document.getElementById("climateYearSelect");
    if (year) {
      Array.from(year.options).forEach((opt) => {
        if (opt.selected) return;
        items.push({ group: "สภาพอากาศ", label: `ใช้สภาพอากาศ${opt.text.split(" · ")[0]}`, note: opt.text.split(" · ").slice(1).join(" · "),
          run: () => { year.value = opt.value; year.dispatchEvent(new Event("change", { bubbles: true })); } });
      });
    }

    Object.entries(this.views).forEach(([key, meta]) => {
      items.push({ group: "ไปที่หน้า", label: meta.title, note: meta.overline, run: () => this.showView(key) });
    });

    if (window.App && App.mapManager) {
      App.getPaddies().forEach((p) => {
        const spec = typeof getVarietySpec === "function" ? getVarietySpec(p.variety) : { name: "" };
        items.push({ group: "แปลง", label: `${p.name || "แปลง"} · ${spec.name}`, note: "เลือกและเลื่อนแผนที่ไปที่แปลง",
          run: () => App.mapManager.selectPaddy(p.id, { source: "panel", fly: true }) });
      });
    }
    return items;
  },

  renderCommands() {
    const list = document.getElementById("commandList");
    const input = document.getElementById("commandInput");
    const q = input.value.trim();
    let items = this.buildCommands().filter((it) => !q || `${it.label} ${it.note || ""}`.includes(q));

    if (q && typeof searchProvinces === "function" && window.App && App.mapManager) {
      searchProvinces(q).slice(0, 5).forEach((prov) => {
        items.push({ group: "จังหวัด", label: prov.name_th, note: `ย้ายแผนที่ไปที่จังหวัด · ${prov.region_th}`,
          run: () => {
            const search = document.getElementById("provinceSearchInput");
            if (search) search.value = prov.name_th;
            App.mapManager.highlightAndFlyToProvince(prov);
          } });
      });
    }

    this.commandItems = items;
    if (this.commandIndex >= items.length) this.commandIndex = 0;

    if (items.length === 0) {
      list.innerHTML = `<div class="k-command-empty">ไม่พบ "${App.escapeHtml(q)}" ลองพิมพ์ชื่อจังหวัด หรือคำว่า น้ำท่วม แล้ง รายงาน</div>`;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    let html = "";
    let lastGroup = "";
    items.forEach((it, i) => {
      if (it.group !== lastGroup) {
        html += `<div class="k-command-group" role="presentation">${it.group}</div>`;
        lastGroup = it.group;
      }
      const sel = i === this.commandIndex;
      html += `<div class="k-command-item${sel ? " is-selected" : ""}" role="option" id="cmd-${i}" aria-selected="${sel}" data-index="${i}">
        <span class="k-command-text"><span>${App.escapeHtml(it.label)}</span>${it.note ? `<span class="k-command-note">${App.escapeHtml(it.note)}</span>` : ""}</span>
        ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ""}
      </div>`;
    });
    list.innerHTML = html;
    input.setAttribute("aria-activedescendant", `cmd-${this.commandIndex}`);
    const selEl = document.getElementById(`cmd-${this.commandIndex}`);
    if (selEl) selEl.scrollIntoView({ block: "nearest" });
  },

  runCommand(item) {
    if (!item) return;
    this.closeCommand();
    item.run();
  }
};

window.Shell = Shell;

window.addEventListener("DOMContentLoaded", () => {
  Shell.init();
});
