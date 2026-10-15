/**
 * Universal Floating Tooltip System
 * แสดง Tooltip ลอยเหนือแผนที่และองค์ประกอบทั้งหมด (z-index สูงสุด เกาะกับ document.body)
 * แก้ปัญหา: Tooltip โดนแผนที่ทับ, โดน Header บัง, และตัดปัญหา Scrollbar แนวนอนใน Panel ฝั่งซ้าย
 */
const GlobalTooltip = {
  el: null,
  activeTarget: null,

  init() {
    if (this.el) return;

    // สร้าง Element Tooltip ตัวเดียวเกาะที่ body
    this.el = document.createElement("div");
    this.el.id = "globalFloatingTooltip";
    this.el.className = "global-floating-tooltip";
    document.body.appendChild(this.el);

    // ดักจับ mouseover / mouseout ทั่วทั้งเอกสาร (Event Delegation)
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

    // ซ่อนเมื่อ scroll หรือคลิก
    window.addEventListener("scroll", () => this.hide(), true);
  },

  show(target) {
    const text = target.getAttribute("data-tooltip");
    if (!text || text.trim() === "") return;

    this.activeTarget = target;
    this.el.innerHTML = text;
    this.el.style.display = "block";
    this.el.style.opacity = "0";
    this.el.style.visibility = "hidden";

    // คำนวณตำแหน่งที่เหมาะสมที่สุด
    const rect = target.getBoundingClientRect();
    const tooltipRect = this.el.getBoundingClientRect();

    const padding = 10;
    let top = 0;
    let left = 0;

    // ตรวจสอบว่าอยู่ใกล้ขอบบนหรือไม่ (ถ้าใกล้ Header < 140px ให้แสดง "ด้านล่าง" ของไอคอน)
    if (rect.top < 150) {
      top = rect.bottom + 8; // แสดงด้านล่าง
      this.el.classList.add("arrow-top");
      this.el.classList.remove("arrow-bottom");
    } else {
      top = rect.top - tooltipRect.height - 8; // แสดงด้านบน
      this.el.classList.add("arrow-bottom");
      this.el.classList.remove("arrow-top");
    }

    // จัดตำแหน่งแนวนอน
    // ถ้าเป้าหมายอยู่ใน Panel ซ้าย ให้ Tooltip ขยับไปทางขวา (ยื่นเหนือแผนที่ได้อย่างอิสระ)
    const inLeftPanel = target.closest("#panelLeft");
    const inRightPanel = target.closest("#panelRight");

    if (inLeftPanel) {
      left = Math.min(rect.left, window.innerWidth - tooltipRect.width - padding);
      if (left < padding) left = padding;
    } else if (inRightPanel) {
      // ชิดขวาแต่ไม่หลุดจอ
      left = rect.right - tooltipRect.width;
      if (left < padding) left = padding;
    } else {
      // กึ่งกลาง
      left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
    }

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
