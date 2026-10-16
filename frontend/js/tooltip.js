/**
 * Universal Floating Tooltip System
 * รองรับการขึ้นบรรทัดใหม่ (\n หรือ <br>), จัดระยะห่างสวยงาม, 
 * และปรับตำแหน่งอัตโนมัติไม่ให้หลุดขอบจอหรือโดน Header บัง
 */
const GlobalTooltip = {
  el: null,
  activeTarget: null,

  init() {
    if (this.el) return;

    this.el = document.createElement("div");
    this.el.id = "globalFloatingTooltip";
    this.el.className = "global-floating-tooltip";
    document.body.appendChild(this.el);

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        this.show(target);
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target && target === this.activeTarget) {
        this.hide();
      }
    });

    window.addEventListener("scroll", () => this.hide(), true);
  },

  show(target) {
    const rawText = target.getAttribute("data-tooltip");
    if (!rawText || rawText.trim() === "") return;

    this.activeTarget = target;
    
    // แปลง \n หรือ | เป็นการขึ้นบรรทัดใหม่อย่างสวยงาม
    let formattedHtml = rawText
      .replace(/\\n/g, "<br>")
      .replace(/\n/g, "<br>");

    // ถ้ามีเครื่องหมาย bullet หรือ line break ให้จัดระเบียบ
    this.el.innerHTML = formattedHtml;
    this.el.style.display = "block";
    this.el.style.opacity = "0";
    this.el.style.visibility = "hidden";

    const rect = target.getBoundingClientRect();
    const tooltipRect = this.el.getBoundingClientRect();

    const padding = 12;
    let top = 0;
    let left = 0;

    // ถ้าอยู่ใกล้ขอบบน (< 150px) ให้แสดงลงมาด้านล่าง
    if (rect.top < 150) {
      top = rect.bottom + 8;
    } else {
      top = rect.top - tooltipRect.height - 8;
    }

    const inLeftPanel = target.closest("#panelLeft");
    const inRightPanel = target.closest("#panelRight");

    if (inLeftPanel) {
      left = Math.min(rect.left, window.innerWidth - tooltipRect.width - padding);
      if (left < padding) left = padding;
    } else if (inRightPanel) {
      left = rect.right - tooltipRect.width;
      if (left < padding) left = padding;
    } else {
      left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
    }

    // ป้องกันไม่ให้ top ล้นขอบจอบน
    if (top < padding) top = padding;

    this.el.style.top = `${Math.round(top)}px`;
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.visibility = "visible";
    this.el.style.opacity = "1";
  },

  hide() {
    if (!this.el) return;
    this.el.style.opacity = "0";
    this.el.style.visibility = "hidden";
    this.activeTarget = null;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  GlobalTooltip.init();
});
