/**
 * จัดการกราฟ Chart.js (ชีวมวลการเจริญเติบโต และกราฟสภาพอากาศ)
 */
const AnalyticsCharts = {
  growthChart: null,
  weatherChart: null,

  initGrowthChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    // สร้างข้อมูลตั้งต้น 5 ระยะ
    const labels = ["กล้า", "แตกกอ", "ตั้งท้อง", "ออกรวง", "สุกแก่"];
    const biomassData = [10, 35, 70, 92, 100];

    this.growthChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "การสะสมชีวมวล (%)",
            data: biomassData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#10b981",
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleColor: "#34d399",
            bodyColor: "#fff"
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#9ca3af", font: { size: 10 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#9ca3af",
              font: { size: 9 },
              callback: (val) => val + "%"
            }
          }
        }
      }
    });
  },

  initWeatherChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    // ข้อมูลจำลองสภาพอากาศย้อนหลัง 7 วัน
    const days = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
    const rain = [2, 0, 15, 24, 5, 0, 8];
    const temp = [31, 32, 29, 28, 30, 33, 31];

    this.weatherChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: days,
        datasets: [
          {
            type: "bar",
            label: "ปริมาณฝน (มม.)",
            data: rain,
            backgroundColor: "rgba(6, 182, 212, 0.4)",
            borderColor: "#06b6d4",
            borderWidth: 1,
            yAxisID: "yRain",
            borderRadius: 4
          },
          {
            type: "line",
            label: "อุณหภูมิ (°C)",
            data: temp,
            borderColor: "#f59e0b",
            backgroundColor: "#f59e0b",
            borderWidth: 2,
            tension: 0.3,
            yAxisID: "yTemp",
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { color: "#9ca3af", boxWidth: 10, font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#9ca3af", font: { size: 10 } }
          },
          yRain: {
            type: "linear",
            position: "left",
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#06b6d4", font: { size: 9 } }
          },
          yTemp: {
            type: "linear",
            position: "right",
            grid: { display: false },
            ticks: { color: "#f59e0b", font: { size: 9 } },
            min: 20,
            max: 40
          }
        }
      }
    });
  },

  updateGrowth(percent) {
    if (!this.growthChart) return;
    // ปรับจุดไฮไลต์ตามการเร่งเวลา
    this.growthChart.update();
  }
};
