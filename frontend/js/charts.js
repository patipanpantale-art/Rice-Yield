/**
 * จัดการกราฟ Chart.js (ชีวมวลการเจริญเติบโต และกราฟสภาพอากาศ)
 * ข้อมูลทั้งหมดมาจากการจำลองจริงของ TimeEngine (ไม่ใช่ค่าตัวอย่าง)
 */
const AnalyticsCharts = {
  growthChart: null,
  weatherChart: null,

  baseTooltip: {
    backgroundColor: "#ffffff",
    titleColor: "#0f172a",
    bodyColor: "#334155",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    padding: 8,
    titleFont: { family: "Sarabun", size: 11 },
    bodyFont: { family: "Sarabun", size: 11 }
  },

  initGrowthChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    // เส้นแนวตั้งบอก "วันปัจจุบัน"
    const todayLine = {
      id: "todayLine",
      afterDatasetsDraw(chart) {
        const day = chart.options.plugins.todayLine && chart.options.plugins.todayLine.day;
        if (!day) return;
        const x = chart.scales.x.getPixelForValue(day - 1);
        const { top, bottom } = chart.chartArea;
        const c = chart.ctx;
        c.save();
        c.strokeStyle = "rgba(15, 23, 42, 0.35)";
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(x, top);
        c.lineTo(x, bottom);
        c.stroke();
        c.restore();
      }
    };

    this.growthChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "ศักยภาพ (ไม่มีมรสุม)",
            data: [],
            borderColor: "#86efac",
            backgroundColor: "rgba(134, 239, 172, 0.15)",
            borderWidth: 1.5,
            borderDash: [4, 3],
            fill: true,
            tension: 0.3,
            pointRadius: 0
          },
          {
            label: "รอบปัจจุบัน",
            data: [],
            borderColor: "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.18)",
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            spanGaps: false
          },
          {
            label: "รอบก่อนหน้า",
            data: [],
            borderColor: "#94a3b8",
            borderDash: [5, 4],
            backgroundColor: "transparent",
            borderWidth: 1.8,
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            hidden: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          todayLine: { day: 1 },
          legend: {
            display: true,
            position: "top",
            labels: { boxWidth: 8, boxHeight: 8, color: "#424940", font: { size: 12, family: "Sarabun" } }
          },
          tooltip: {
            ...this.baseTooltip,
            callbacks: {
              title: (items) => `วันที่ ${items[0].label}`,
              label: (item) => (item.raw === null ? null : `${item.dataset.label}: ${item.raw}%`)
            }
          }
        },
        scales: {
          x: {
            grid: { color: "#f1f5f9" },
            ticks: {
              color: "#424940",
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: false,
              callback(val, idx) {
                const d = idx + 1;
                return (d === 1 || d % 30 === 0) ? `ว.${d}` : "";
              }
            }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: "#f1f5f9" },
            ticks: { color: "#424940", font: { size: 11 }, callback: (val) => val + "%" }
          }
        }
      },
      plugins: [todayLine]
    });
  },

  initWeatherChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return;

    this.weatherChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            type: "bar",
            label: "ปริมาณฝน (มม.)",
            data: [],
            backgroundColor: "rgba(2, 132, 199, 0.25)",
            borderColor: "#0284c7",
            borderWidth: 1.2,
            yAxisID: "yRain",
            borderRadius: 3
          },
          {
            type: "line",
            label: "อุณหภูมิ (°C)",
            data: [],
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
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { color: "#424940", boxWidth: 8, font: { size: 12, family: "Sarabun" } }
          },
          tooltip: this.baseTooltip
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#424940", font: { size: 11 }, maxRotation: 0, autoSkipPadding: 6 }
          },
          yRain: {
            type: "linear",
            position: "left",
            min: 0,
            suggestedMax: 40,
            grid: { color: "#f1f5f9" },
            ticks: { color: "#0284c7", font: { size: 11 } }
          },
          yTemp: {
            type: "linear",
            position: "right",
            grid: { display: false },
            ticks: { color: "#f59e0b", font: { size: 11 } },
            min: 20,
            max: 42
          }
        }
      }
    });
  },

  /** สภาพอากาศย้อนหลังสูงสุด 21 วันจนถึงวันจำลองปัจจุบัน */
  updateWeather(labels, rain, temp) {
    if (!this.weatherChart) return;
    this.weatherChart.data.labels = labels;
    this.weatherChart.data.datasets[0].data = rain;
    this.weatherChart.data.datasets[1].data = temp;
    this.weatherChart.update("none");
  },

  /** เส้นชีวมวลสะสม (%) ของแปลงที่เลือก */
  updateGrowth(labels, potential, actual, previous, currentDay) {
    if (!this.growthChart) return;
    const ds = this.growthChart.data.datasets;
    this.growthChart.data.labels = labels;
    ds[0].data = potential;
    ds[1].data = actual;
    if (previous && previous.length) {
      ds[2].data = previous.slice(0, labels.length);
      ds[2].hidden = false;
    } else {
      ds[2].data = [];
      ds[2].hidden = true;
    }
    this.growthChart.options.plugins.todayLine.day = Math.min(currentDay, labels.length);
    this.growthChart.update("none");
  }
};
