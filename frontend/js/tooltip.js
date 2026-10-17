/**
 * Universal Floating Tooltip System
 * มี 2 รูปแบบ:
 *  - data-tooltip : การ์ดคำอธิบายละเอียด (พื้นขาว) สำหรับไอคอน ⓘ อธิบายความหมาย/ที่มาของข้อมูล
 *  - data-hint    : ป้ายสั้นสีเข้ม สำหรับปุ่ม/ตัวควบคุม บอกว่ากดแล้วจะเกิดอะไรขึ้น
 * รองรับการขึ้นบรรทัดใหม่ (\n หรือ <br>) ปรับตำแหน่งอัตโนมัติไม่ให้หลุดขอบจอ และแสดงเมื่อโฟกัสด้วยคีย์บอร์ด
 */
const GlobalTooltip = {
  el: null,
  activeTarget: null,
  showTimer: null,
  pendingTarget: null,

  init() {
    if (this.el) return;

    this.el = document.createElement("div");
    this.el.id = "globalFloatingTooltip";
    this.el.className = "global-floating-tooltip";
    this.el.setAttribute("role", "tooltip");
    document.body.appendChild(this.el);

    const findTarget = (node) => (node && node.closest ? node.closest("[data-tooltip], [data-hint]") : null);

    document.addEventListener("mouseover", (e) => {
      const target = findTarget(e.target);
      if (!target) return;
      if (target === this.activeTarget || target === this.pendingTarget) return;
      this.schedule(target);
    });

    document.addEventListener("mouseout", (e) => {
      const target = findTarget(e.target);
      if (!target) return;
      if (target.contains(e.relatedTarget)) return;
      this.hide();
    });

    document.addEventListener("focusin", (e) => {
      const target = findTarget(e.target);
      if (target && e.target.matches(":focus-visible")) this.schedule(target, 0);
    });
    document.addEventListener("focusout", () => this.hide());
    document.addEventListener("mousedown", () => this.hide(), true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("scroll", () => this.hide(), true);
  },

  schedule(target, delay) {
    clearTimeout(this.showTimer);
    this.pendingTarget = target;
    const isHint = !target.hasAttribute("data-tooltip");
    const wait = delay !== undefined ? delay : (isHint ? 350 : 120);
    this.showTimer = setTimeout(() => {
      this.pendingTarget = null;
      if (target.isConnected) this.show(target);
    }, wait);
  },

  show(target) {
    const isHint = !target.hasAttribute("data-tooltip");
    const rawText = target.getAttribute(isHint ? "data-hint" : "data-tooltip");
    if (!rawText || rawText.trim() === "") return;

    this.activeTarget = target;
    this.el.className = `global-floating-tooltip ${isHint ? "is-hint" : "is-card"}`;
    this.el.innerHTML = rawText.replace(/\\n/g, "<br>").replace(/\n/g, "<br>");
    this.el.style.display = "block";
    this.el.style.visibility = "hidden";
    this.el.style.opacity = "0";

    const rect = target.getBoundingClientRect();
    const tip = this.el.getBoundingClientRect();
    const padding = 10;
    const gap = 8;

    // แสดงด้านบนก่อน ถ้าพื้นที่ไม่พอค่อยแสดงด้านล่าง
    let top = rect.top - tip.height - gap;
    let placement = "top";
    if (top < padding) {
      top = rect.bottom + gap;
      placement = "bottom";
    }
    if (top + tip.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - tip.height - padding);
    }

    let left = rect.left + rect.width / 2 - tip.width / 2;
    left = Math.max(padding, Math.min(left, window.innerWidth - tip.width - padding));

    this.el.dataset.placement = placement;
    this.el.style.top = `${Math.round(top)}px`;
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.visibility = "visible";
    this.el.style.opacity = "1";
  },

  hide() {
    clearTimeout(this.showTimer);
    this.pendingTarget = null;
    if (!this.el) return;
    this.el.style.opacity = "0";
    this.el.style.visibility = "hidden";
    this.activeTarget = null;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  GlobalTooltip.init();
});
