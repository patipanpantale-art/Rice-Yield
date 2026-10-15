/**
 * จัดการกราฟ Chart.js (ชีวมวลการเจริญเติบโต และกราฟสภาพอากาศ)
 * รองรับการเปรียบเทียบ Process ปัจจุบัน vs Process ก่อนหน้า (Scenario Comparison) ในธีมสว่างมินิมอล
 */
const AnalyticsCharts = {
  growthChart: null,
  weatherChart: null,

  initGrowthChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    const labels = ["กล้า (1-20)", "แตกกอ (21-50)", "ตั้งท้อง (51-80)", "ออกรวง (81-100)", "สุกแก่ (101-120)"];
    const currentData = [10, 35, 70, 92, 100];

    this.growthChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Process ปัจจุบัน",
            data: currentData,
            borderColor: "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.12)",
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "#16a34a",
            pointRadius: 3.5
          },
          {
            label: "Process ก่อนหน้า (เปรียบเทียบ)",
            data: [], // ใส่ข้อมูลเมื่อมีการ Re-run หรือเปลี่ยนเงื่อนไขมรสุม
            borderColor: "#94a3b8",
            borderDash: [5, 4],
            backgroundColor: "transparent",
            borderWidth: 1.8,
            fill: false,
            tension: 0.35,
            pointBackgroundColor: "#94a3b8",
            pointRadius: 2.5,
            hidden: true // เริ่มต้นซ่อนไว้จนกว่าจะมีรอบเปรียบเทียบ
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
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              color: "#64748b",
              font: { size: 10 }
            }
          },
          tooltip: {
            backgroundColor: "#ffffff",
            titleColor: "#0f172a",
            bodyColor: "#334155",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            padding: 8
          }
        },
        scales: {
          x: {
            grid: { color: "#f1f5f9" },
            ticks: { color: "#64748b", font: { size: 9.5 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: "#f1f5f9" },
            ticks: {
              color: "#64748b",
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
            backgroundColor: "rgba(2, 132, 199, 0.25)",
            borderColor: "#0284c7",
            borderWidth: 1.2,
            yAxisID: "yRain",
            borderRadius: 3
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
            pointRadius: 2.5
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
            labels: { color: "#64748b", boxWidth: 8, font: { size: 9.5 } }
          },
          tooltip: {
            backgroundColor: "#ffffff",
            titleColor: "#0f172a",
            bodyColor: "#334155",
            borderColor: "#e2e8f0",
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#64748b", font: { size: 9.5 } }
          },
          yRain: {
            type: "linear",
            position: "left",
            grid: { color: "#f1f5f9" },
            ticks: { color: "#0284c7", font: { size: 9 } }
          },
          yTemp: {
            type: "linear",
            position: "right",
            grid: { display: false },
            ticks: { color: "#f59e0b", font: { size: 9 } },
            min: 20,
            max: 42
          }
        }
      }
    });
  },

  /**
   * อัปเดตเส้นกราฟเปรียบเทียบ Process ปัจจุบัน vs Process ก่อนหน้า
   */
  updateComparison(currentCurve, previousCurve = null) {
    if (!this.growthChart) return;

    this.growthChart.data.datasets[0].data = currentCurve;

    if (previousCurve && previousCurve.length) {
      this.growthChart.data.datasets[1].data = previousCurve;
      this.growthChart.data.datasets[1].hidden = false;
    } else {
      this.growthChart.data.datasets[1].hidden = true;
    }

    this.growthChart.update();
  }
};
