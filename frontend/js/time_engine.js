/**
 * กลไกเร่งเวลา, สภาพอากาศอิงตามปีจริง (2022 - 2026) และจำลองผลกระทบภัยพิบัติแบบปรับระดับความรุนแรง 1-10
 *
 * หลักการ:
 * 1. สภาพอากาศของแต่ละวันคำนวณแบบ "ฟังก์ชันบริสุทธิ์" จาก (ปี, ภัยพิบัติที่กำหนด, วันที่) แล้วเก็บเป็นอนุกรมรายวัน
 *    ทำให้เล่นต่อเนื่อง กรอเวลา หรือย้อนกลับ ได้ผลลัพธ์ตรงกันเสมอ
 * 2. ระยะการเติบโตและความเสียหายคิด "รายแปลง" ตามอายุพันธุ์ข้าวของแปลงนั้น
 *    (เช่น กข41 105 วันเก็บเกี่ยวแล้ว มรสุมวันที่ 110 จะไม่กระทบแปลงนั้น)
 * 3. ความยาวไทม์ไลน์ของฟาร์ม (totalDays) = อายุของพันธุ์ที่ยาวที่สุดในฟาร์ม
 */
class TimeEngine {
  constructor() {
    this.currentDay = 1;
    this.totalDays = 120;
    this.plantDate = TimeEngine.parseLocalDate("2026-06-15");
    this.speed = 2;
    this.isPlaying = false;
    this.intervalId = null;
    this.listeners = [];

    // ปีสภาพอากาศจำลอง: "2026", "2025", "2024", "2023", "2022", "baseline"
    this.selectedYear = "2024";

    // สภาพอากาศฉับพลันที่ผู้ใช้กดค้างไว้: 'auto', 'rain', 'flood', 'drought', 'heat'
    this.forcedWeather = "auto";

    // บันทึกภัยพิบัติ: key = วันที่, value = { type, severity, source: "scheduled" | "instant" }
    this.disasterDays = {};
    this.currentDisasterConfig = null;

    this._series = null;

    // 5 ระยะการเจริญเติบโตทางสรีรวิทยาของข้าว (สัดส่วนของอายุพันธุ์)
    this.stages = [
      { id: 1, short: "กล้า", name: "ระยะกล้า (Seedling)", minRatio: 0, maxRatio: 0.17, color: "#86efac", desc: "ข้าวยังเล็ก ต้องการน้ำหล่อเลี้ยงพอเหมาะ" },
      { id: 2, short: "แตกกอ", name: "ระยะแตกกอ (Tillering)", minRatio: 0.17, maxRatio: 0.42, color: "#4ade80", desc: "สร้างหน่อและรวง หากขาดน้ำ/ท่วมกอจะลีบถาวร" },
      { id: 3, short: "ตั้งท้อง", name: "ระยะตั้งท้อง (Booting)", minRatio: 0.42, maxRatio: 0.67, color: "#22c55e", desc: "ระยะวิกฤต! ละอองเกสรอ่อนไหวต่อน้ำและอุณหภูมิที่สุด" },
      { id: 4, short: "ออกรวง", name: "ระยะออกรวง (Heading)", minRatio: 0.67, maxRatio: 0.83, color: "#facc15", desc: "ผสมเกสร หากอากาศร้อนจัด >35°C เมล็ดจะลีบถาวร" },
      { id: 5, short: "สุกแก่", name: "ระยะสุกแก่ (Maturity)", minRatio: 0.83, maxRatio: 1.0, color: "#f59e0b", desc: "สะสมแป้งในเมล็ด เตรียมระบายน้ำเพื่อเก็บเกี่ยว" }
    ];
    this.harvestedStage = { id: 6, short: "เก็บเกี่ยวแล้ว", name: "เก็บเกี่ยวแล้ว (Harvested)", color: "#ca8a04", desc: "ครบอายุพันธุ์ เก็บเกี่ยวผลผลิตเรียบร้อย" };
  }

  /** แปลง "YYYY-MM-DD" เป็นวันที่ตามเวลาท้องถิ่น (ป้องกันวันเลื่อนจากการตีความเป็น UTC) */
  static parseLocalDate(dateString) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  invalidate() {
    this._series = null;
  }

  setVarietyDuration(days) {
    const n = Math.max(1, Math.round(Number(days) || 120));
    if (n === this.totalDays) return;
    this.totalDays = n;
    if (this.currentDay > this.totalDays) this.currentDay = this.totalDays;
    this.invalidate();
    this.notifyUpdate();
  }

  setPlantDate(dateString) {
    const d = TimeEngine.parseLocalDate(dateString);
    if (!d) return false;
    this.plantDate = d;
    this.notifyUpdate();
    return true;
  }

  setYear(year) {
    this.selectedYear = year;
    this.invalidate();
    this.notifyUpdate();
  }

  setSpeed(speedMultiplier) {
    this.speed = speedMultiplier;
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
  }

  play() {
    if (this.isPlaying) return;
    // กดเล่นตอนจบฤดูแล้ว = เริ่มรอบใหม่จากวันแรก
    if (this.currentDay >= this.totalDays) this.currentDay = 1;
    this.isPlaying = true;

    const intervalMs = Math.max(30, 300 / this.speed);
    this.intervalId = setInterval(() => {
      if (this.currentDay < this.totalDays) {
        this.stepDay(1);
      } else {
        this.pause();
      }
    }, intervalMs);

    this.notifyUpdate();
  }

  pause() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyUpdate();
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** กลับไปวันแรก: คงมรสุมที่ตั้งเวลาไว้ แต่ล้างเหตุการณ์ฉับพลันของรอบที่แล้ว */
  reset() {
    this.pause();
    this.currentDay = 1;
    this.forcedWeather = "auto";
    Object.keys(this.disasterDays).forEach((d) => {
      if (this.disasterDays[d].source === "instant") delete this.disasterDays[d];
    });
    this.invalidate();
    this.notifyUpdate();
  }

  seekToDay(day) {
    this.currentDay = Math.max(1, Math.min(Math.round(day) || 1, this.totalDays));
    this.notifyUpdate();
  }

  stepDay(step) {
    this.currentDay = Math.max(1, Math.min(this.currentDay + step, this.totalDays));
    if (this.forcedWeather !== "auto") {
      this.disasterDays[this.currentDay] = { type: this.forcedWeather, severity: 6, source: "instant" };
      this.invalidate();
    }
    this.notifyUpdate();
  }

  /** สลับโหมดสภาพอากาศฉับพลัน (ปุ่มฝน/ท่วม/แล้ง/ร้อน) */
  setWeatherScenario(scenarioType) {
    this.forcedWeather = scenarioType;
    if (scenarioType !== "auto") {
      this.disasterDays[this.currentDay] = { type: scenarioType, severity: 6, source: "instant" };
    }
    this.invalidate();
    this.notifyUpdate();
  }

  /** กำหนดภัยพิบัติล่วงหน้าแบบช่วงเดียว (แทนที่ช่วงเดิม ไม่ซ้อนทับ) */
  scheduleDisasterWindow(type, startDay, endDay, severity = 5) {
    this.clearScheduledDisasters();

    if (type === "none") {
      this.invalidate();
      this.notifyUpdate();
      return null;
    }

    const sDay = Math.max(1, Math.min(parseInt(startDay, 10) || 1, this.totalDays));
    const eDay = Math.max(sDay, Math.min(parseInt(endDay, 10) || this.totalDays, this.totalDays));
    const sev = Math.max(1, Math.min(parseInt(severity, 10) || 5, 10));

    this.currentDisasterConfig = { type, startDay: sDay, endDay: eDay, severity: sev };
    for (let d = sDay; d <= eDay; d++) {
      this.disasterDays[d] = { type, severity: sev, source: "scheduled" };
    }

    this.invalidate();
    this.notifyUpdate();
    return this.currentDisasterConfig;
  }

  clearScheduledDisasters() {
    Object.keys(this.disasterDays).forEach((d) => {
      if (this.disasterDays[d].source !== "instant") delete this.disasterDays[d];
    });
    this.currentDisasterConfig = null;
  }

  /** สภาพอากาศพื้นฐานตามโปรไฟล์ปี (ยังไม่รวมภัยพิบัติที่ผู้ใช้กำหนด) */
  baseWeather(d) {
    let rain = 0;
    let temp = 29;
    let event = "normal";
    const y = this.selectedYear;

    if (y === "2026") {
      // ลานีญากำลังอ่อน: ฝนมาสม่ำเสมอต้นฤดู ปลายฤดูแดดดี
      if (d <= 40) { rain = (d % 3 === 0) ? 24 : 5; temp = 28.5; }
      else if (d <= 85) { rain = (d % 2 === 0) ? 22 : 6; temp = 28.0; }
      else { rain = (d % 4 === 0) ? 10 : 0; temp = 27.0; }
    } else if (y === "2025") {
      // ENSO กลาง: ฝนตกตามฤดูกาลปกติ
      if (d <= 35) { rain = (d % 3 === 0) ? 18 : 2; temp = 29.5; }
      else if (d <= 80) { rain = (d % 2 === 0) ? 25 : 5; temp = 28.5; }
      else { rain = (d % 5 === 0) ? 8 : 0; temp = 27.5; }
    } else if (y === "2024") {
      // ลานีญา: ฝนมาเร็ว เสี่ยงน้ำท่วมช่วงออกรวง
      if (d <= 30) { rain = (d % 2 === 0) ? 22 : 4; temp = 29; }
      else if (d <= 75) { rain = (d % 3 === 0) ? 28 : 8; temp = 28.5; }
      else if (d <= 100) {
        rain = (d % 2 === 0 || d % 5 === 0) ? 45 : 12; temp = 27.5;
        if (d >= 80 && d <= 88) event = "flood";
      } else { rain = 0; temp = 26.5; }
    } else if (y === "2023") {
      // เอลนีโญ: แล้งทิ้งช่วง DAP 20-60 อุณหภูมิร้อนจัด
      if (d <= 20) { rain = (d % 4 === 0) ? 10 : 0; temp = 33; }
      else if (d <= 60) { rain = 0; temp = 36.5; event = (d >= 35) ? "drought" : "heat"; }
      else if (d <= 95) { rain = (d % 3 === 0) ? 20 : 0; temp = 31; }
      else { rain = 0; temp = 28; }
    } else if (y === "2022") {
      // ลานีญาฝนชุก: ร่องมรสุมเข้าต่อเนื่อง
      if (d <= 80) { rain = (d % 2 === 0) ? 30 : 15; temp = 28; }
      else { rain = (d % 5 === 0) ? 12 : 2; temp = 27; }
    } else {
      // Baseline 30 ปี TMD Normal
      if (d <= 30) { rain = (d % 3 === 0) ? 14 : 0; temp = 31; }
      else if (d <= 75) { rain = (d % 2 === 0) ? 20 : 5; temp = 29.5; }
      else if (d <= 100) { rain = (d % 3 === 0) ? 26 : 0; temp = 28.5; }
      else { rain = 0; temp = 27.5; }
    }

    return { rain, temp, event, severity: 5, source: event === "normal" ? null : "year" };
  }

  /** สภาพอากาศของวันที่ d รวมภัยพิบัติที่กำหนด */
  weatherForDay(d) {
    const dis = this.disasterDays[d];
    if (!dis) return this.baseWeather(d);

    const sev = dis.severity || 5;
    if (dis.type === "flood") return { rain: 70 + sev * 4, temp: 26, event: "flood", severity: sev, source: dis.source };
    if (dis.type === "rain") return { rain: 30 + sev * 3, temp: 27.5, event: "rain", severity: sev, source: dis.source };
    if (dis.type === "drought") return { rain: 0, temp: 33 + sev * 0.4, event: "drought", severity: sev, source: dis.source };
    if (dis.type === "heat") return { rain: 0, temp: 36 + sev * 0.5, event: "heat", severity: sev, source: dis.source };
    return this.baseWeather(d);
  }

  /** อนุกรมสภาพอากาศรายวัน (index = วันที่) พร้อมดัชนี CDD/CWD และฝนสะสม */
  getSeries() {
    if (this._series && this._series.length === this.totalDays + 1) return this._series;

    const series = [null];
    let cdd = 0;
    let cwd = 0;
    let cum = 0;
    for (let d = 1; d <= this.totalDays; d++) {
      const w = this.weatherForDay(d);
      if (w.rain >= 1.0) { cwd++; cdd = 0; } else { cdd++; cwd = 0; }
      cum += w.rain;
      // ฝนตกต่อเนื่องเกิน 8 วันจากปุ่มฝนชุ่มฉ่ำ จะกลายเป็นน้ำท่วมขัง
      const event = (w.event === "rain" && cwd >= 8) ? "flood" : w.event;
      series.push({ day: d, rain: w.rain, temp: w.temp, event, severity: w.severity, source: w.source, cdd, cwd, cumRain: cum });
    }
    this._series = series;
    return series;
  }

  dayInfo(day) {
    const series = this.getSeries();
    const d = Math.max(1, Math.min(Math.round(day) || 1, this.totalDays));
    return series[d];
  }

  /** ระยะการเติบโตของแปลงที่มีอายุพันธุ์ duration ณ วันที่ day */
  stageFor(day, duration = this.totalDays) {
    if (day > duration) return this.harvestedStage;
    const ratio = day / duration;
    for (const stage of this.stages) {
      if (ratio >= stage.minRatio && ratio <= stage.maxRatio) return stage;
    }
    return this.stages[this.stages.length - 1];
  }

  stageIdByRatio(ratio) {
    if (ratio > 0.83) return 5;
    if (ratio > 0.67) return 4;
    if (ratio > 0.42) return 3;
    if (ratio > 0.17) return 2;
    return 1;
  }

  /**
   * ความเสียหายถาวรสะสม (FAO-33) ของแปลงอายุ duration นับถึงวันที่ uptoDay
   * วันหลังเก็บเกี่ยวจะไม่ถูกนับ
   */
  damageFor(duration, uptoDay = this.currentDay) {
    const series = this.getSeries();
    const last = Math.min(uptoDay, duration, this.totalDays);
    let tillering = 0;
    let flowering = 0;
    let ripening = 0;

    for (let d = 1; d <= last; d++) {
      const info = series[d];
      if (!info || (info.event !== "flood" && info.event !== "drought" && info.event !== "heat")) continue;
      const severityFactor = (info.severity || 5) / 5;
      const stageId = this.stageIdByRatio(d / duration);
      if (stageId === 2) {
        tillering = Math.min(0.40, tillering + 0.008 * severityFactor);
      } else if (stageId === 3 || stageId === 4) {
        flowering = Math.min(0.65, flowering + 0.018 * severityFactor);
      } else if (stageId === 5) {
        ripening = Math.min(0.25, ripening + 0.006 * severityFactor);
      }
    }

    const total = tillering + flowering + ripening;
    return {
      tillering,
      flowering,
      ripening,
      total,
      f_stress: Math.round(Math.max(0.20, 1.0 - total) * 100) / 100
    };
  }

  /** ตัวคูณอุณหภูมิและน้ำ ณ วันที่ day */
  multipliersAt(day) {
    const info = this.dayInfo(day);
    let f_temp = 0.98;
    let f_climate = 0.95;

    if (info.temp > 35) {
      f_temp = Math.max(0.60, 0.95 - (info.temp - 35) * 0.09);
    } else if (info.temp < 22) {
      f_temp = 0.82;
    }

    if (info.event === "drought" || info.cdd >= 7) {
      f_climate = Math.max(0.35, 0.92 - (info.cdd * 0.04));
    } else if (info.rain > 25) {
      f_climate = 1.0;
    }

    return {
      f_temp: Math.round(f_temp * 100) / 100,
      f_climate: Math.round(f_climate * 100) / 100
    };
  }

  /** สัดส่วนชีวมวลสะสม 0..1 (sigmoid ปรับให้เริ่ม 0 และครบ 1 ในวันเก็บเกี่ยว) */
  biomassRatio(day, duration = this.totalDays) {
    if (day >= duration) return 1;
    const s = (t) => 1 / (1 + Math.exp(-10 * (t - 0.5)));
    const t = Math.max(0, day / duration);
    return (s(t) - s(0)) / (s(1) - s(0));
  }

  getDateForDay(day) {
    const d = new Date(this.plantDate);
    d.setDate(d.getDate() + (day - 1));
    return d;
  }

  formatDate(date, opts = { year: "numeric", month: "short", day: "numeric" }) {
    return date.toLocaleDateString("th-TH", opts);
  }

  getSimulatedDate(day = this.currentDay) {
    return this.formatDate(this.getDateForDay(day));
  }

  /** ช่วงเหตุการณ์สภาพอากาศรุนแรงตลอดฤดู (รวมวันที่ต่อเนื่องเป็นช่วง) */
  getEventRanges() {
    const series = this.getSeries();
    const ranges = [];
    let cur = null;
    for (let d = 1; d <= this.totalDays; d++) {
      const info = series[d];
      const isEvent = info.event !== "normal";
      if (!isEvent) { cur = null; continue; }
      if (cur && cur.type === info.event && cur.source === info.source && cur.end === d - 1) {
        cur.end = d;
      } else {
        cur = { type: info.event, start: d, end: d, severity: info.severity || 5, source: info.source };
        ranges.push(cur);
      }
    }
    return ranges;
  }

  getState() {
    const info = this.dayInfo(this.currentDay);
    const mults = this.multipliersAt(this.currentDay);
    const damage = this.damageFor(this.totalDays, this.currentDay);

    return {
      currentDay: this.currentDay,
      totalDays: this.totalDays,
      percent: Math.round((this.currentDay / this.totalDays) * 100),
      stage: this.stageFor(this.currentDay, this.totalDays),
      simulatedDate: this.getSimulatedDate(),
      biomassRatio: this.biomassRatio(this.currentDay, this.totalDays),
      isPlaying: this.isPlaying,
      selectedYear: this.selectedYear,
      forcedWeather: this.forcedWeather,
      activeEventState: info.event,
      rain: info.rain,
      cumulativeRain: Math.round(info.cumRain),
      temp: Math.round(info.temp * 10) / 10,
      cdd: info.cdd,
      cwd: info.cwd,
      weatherMultipliers: { ...mults, f_stress: damage.f_stress }
    };
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notifyUpdate() {
    const state = this.getState();
    for (const cb of this.listeners) {
      cb(state);
    }
  }
}

// ประกาศเป็น global ของ window อย่างชัดเจน (const ระดับบนสุดไม่ได้ผูกกับ window อัตโนมัติ)
const timeEngine = new TimeEngine();
window.timeEngine = timeEngine;
