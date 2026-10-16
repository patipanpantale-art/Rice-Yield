/**
 * กลไกเร่งเวลา, สภาพอากาศอิงตามปีจริง (2022 - 2026) และจำลองผลกระทบภัยพิบัติแบบปรับระดับความรุนแรง 1-10
 * ปรับปรุง:
 * 1. รองรับปีสภาพอากาศ 2022, 2023, 2024, 2025, 2026 และค่าเฉลี่ย 30 ปี
 * 2. เพิ่มฟังก์ชัน setWeatherScenario() สำหรับปุ่มสภาพอากาศฉับพลัน
 * 3. ระบบกำหนดมรสุมพร้อมระดับความรุนแรง 1-10 (ป้องกันการกดสแปมซ้ำซ้อน)
 * 4. ฝนสะสมเริ่มนับจาก 0 มม. ในวันแรกของ Process จำลอง (แก้ข้อสงสัยเรื่องฝนวันแรก)
 */
class TimeEngine {
  constructor() {
    this.currentDay = 1;
    this.totalDays = 120; // ค่าเริ่มต้น ขาวดอกมะลิ 105 (120 วัน)
    this.plantDate = new Date("2026-06-15");
    this.speed = 2;
    this.isPlaying = false;
    this.intervalId = null;
    this.listeners = [];

    // ปีสภาพอากาศจำลอง: "2026", "2025", "2024", "2023", "2022", "baseline"
    this.selectedYear = "2024";

    // สถานะสภาพอากาศที่ผู้ใช้สั่งแทรกแซงแบบพลวัต
    this.forcedWeather = "auto"; // 'auto', 'rain', 'flood', 'drought', 'heat'

    // บันทึกภัยพิบัติ: key = day, value = { type, severity }
    this.disasterDays = {};
    this.currentDisasterConfig = null; // { type, startDay, endDay, severity }

    // ความเสียหายถาวรสะสมแยกตามระยะสรีรวิทยา (FAO-33)
    this.damageByStage = {
      tillering: 0,
      flowering: 0,
      ripening: 0
    };

    // ตัวแปรอุตุนิยมวิทยา
    this.cdd = 0; // Consecutive Dry Days
    this.cwd = 0; // Consecutive Wet Days
    this.currentRain = 12; // มม./วัน
    this.cumulativeProcessRain = 0; // ฝนสะสมเฉพาะใน Process จำลองนี้ (เริ่มต้น 0 มม.)
    this.currentTemp = 29.5; // °C
    this.activeEventState = "normal";

    // 5 ระยะการเจริญเติบโตทางสรีรวิทยาของข้าว
    this.stages = [
      { id: 1, name: "ระยะกล้า (Seedling)", minRatio: 0, maxRatio: 0.17, desc: "ข้าวยังเล็ก ต้องการน้ำหล่อเลี้ยงพอเหมาะ" },
      { id: 2, name: "ระยะแตกกอ (Tillering)", minRatio: 0.17, maxRatio: 0.42, desc: "สร้างหน่อและรวง หากขาดน้ำ/ท่วมกอจะลีบถาวร" },
      { id: 3, name: "ระยะตั้งท้อง (Booting)", minRatio: 0.42, maxRatio: 0.67, desc: "ระยะวิกฤต! ละอองเกสรอ่อนไหวต่อน้ำและอุณหภูมิที่สุด" },
      { id: 4, name: "ระยะออกรวง (Heading)", minRatio: 0.67, maxRatio: 0.83, desc: "ผสมเกสร หากอากาศร้อนจัด >35°C เมล็ดจะลีบถาวร" },
      { id: 5, name: "ระยะสุกแก่ (Maturity)", minRatio: 0.83, maxRatio: 1.0, desc: "สะสมแป้งในเมล็ด เตรียมระบายน้ำเพื่อเก็บเกี่ยว" }
    ];
  }

  setVarietyDuration(days) {
    this.totalDays = days;
    if (this.currentDay > this.totalDays) {
      this.currentDay = this.totalDays;
    }
    this.notifyUpdate();
  }

  setPlantDate(dateString) {
    this.plantDate = new Date(dateString);
    this.notifyUpdate();
  }

  setYear(year) {
    this.selectedYear = year;
    this.calculateWeatherForCurrentDay();
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

  reset() {
    this.pause();
    this.currentDay = 1;
    this.cdd = 0;
    this.cwd = 0;
    this.cumulativeProcessRain = 0;
    this.forcedWeather = "auto";
    this.damageByStage = { tillering: 0, flowering: 0, ripening: 0 };
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  seekToDay(day) {
    const targetDay = Math.max(1, Math.min(day, this.totalDays));
    this.currentDay = targetDay;
    this.recalculateCumulativeStats();
    this.calculateWeatherForCurrentDay();
    this.recomputeAllDamage();
    this.notifyUpdate();
  }

  stepDay(step) {
    this.currentDay = Math.max(1, Math.min(this.currentDay + step, this.totalDays));

    // หากเปิดโหมดมรสุมฉับพลันค้างไว้
    if (this.forcedWeather !== "auto") {
      this.disasterDays[this.currentDay] = { type: this.forcedWeather, severity: 6 };
    }

    this.calculateWeatherForCurrentDay();
    this.cumulativeProcessRain += this.currentRain;
    this.accumulateStageDamage();
    this.notifyUpdate();
  }

  /**
   * สลับโหมดสภาพอากาศฉับพลัน (Instant Weather Button)
   */
  setWeatherScenario(scenarioType) {
    this.forcedWeather = scenarioType;
    if (scenarioType !== "auto") {
      this.disasterDays[this.currentDay] = { type: scenarioType, severity: 6 };
    }
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  /**
   * กำหนดภัยพิบัติล่วงหน้าแบบ Single Config พร้อมระดับความรุนแรง 1 - 10 (ไม่สแปมซ้ำซ้อน)
   */
  scheduleDisasterWindow(type, startDay, endDay, severity = 5) {
    // ล้างช่วงเดิมก่อนเพื่อป้องกันการทับซ้อนซ้ำๆ จนผลผลิตลดฮวบรัวๆ
    this.clearDisasterWindow();

    if (type === "none") {
      this.currentDisasterConfig = null;
      this.recomputeAllDamage();
      this.notifyUpdate();
      return;
    }

    const sDay = Math.max(1, Math.min(parseInt(startDay, 10) || 1, this.totalDays));
    const eDay = Math.max(sDay, Math.min(parseInt(endDay, 10) || this.totalDays, this.totalDays));
    const sev = Math.max(1, Math.min(parseInt(severity, 10) || 5, 10));

    this.currentDisasterConfig = { type, startDay: sDay, endDay: eDay, severity: sev };

    for (let d = sDay; d <= eDay; d++) {
      this.disasterDays[d] = { type, severity: sev };
    }

    this.recomputeAllDamage();
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  calculateFullSeasonDisasterLoss() {
    let tillering = 0, flowering = 0, ripening = 0;
    const days = Object.keys(this.disasterDays).map(Number);
    if (days.length === 0) {
      return { totalLoss: 0, f_stress: 1.0, tillering: 0, flowering: 0, ripening: 0 };
    }

    days.forEach((d) => {
      const dis = this.disasterDays[d];
      if (dis && (dis.type === "flood" || dis.type === "drought" || dis.type === "heat")) {
        const ratio = d / this.totalDays;
        let stageId = 1;
        if (ratio > 0.83) stageId = 5;
        else if (ratio > 0.67) stageId = 4;
        else if (ratio > 0.42) stageId = 3;
        else if (ratio > 0.17) stageId = 2;

        const severityFactor = (dis.severity || 5) / 5;

        if (stageId === 2) {
          tillering = Math.min(0.40, tillering + 0.015 * severityFactor);
        } else if (stageId === 3 || stageId === 4) {
          flowering = Math.min(0.70, flowering + 0.035 * severityFactor);
        } else if (stageId === 5) {
          ripening = Math.min(0.30, ripening + 0.012 * severityFactor);
        }
      }
    });

    const totalLoss = Math.min(0.95, tillering + flowering + ripening);
    const f_stress = Math.max(0.05, 1.0 - totalLoss);
    return {
      totalLoss: Math.round(totalLoss * 100) / 100,
      f_stress: Math.round(f_stress * 100) / 100,
      tillering,
      flowering,
      ripening
    };
  }

  clearDisasterWindow() {
    this.disasterDays = {};
    this.currentDisasterConfig = null;
    this.damageByStage = { tillering: 0, flowering: 0, ripening: 0 };
  }

  recalculateCumulativeStats() {
    this.cumulativeProcessRain = 0;
    this.cwd = 0;
    this.cdd = 0;
    for (let d = 1; d <= this.currentDay; d++) {
      const rain = this.estimateRainForDay(d);
      this.cumulativeProcessRain += rain;
      if (rain >= 1.0) {
        this.cwd++;
        this.cdd = 0;
      } else {
        this.cdd++;
        this.cwd = 0;
      }
    }
  }

  estimateRainForDay(d) {
    const dis = this.disasterDays[d];
    if (dis) {
      if (dis.type === "flood") return 80 + (dis.severity * 4);
      if (dis.type === "rain") return 35 + (dis.severity * 2);
      if (dis.type === "drought" || dis.type === "heat") return 0;
    }
    return 10;
  }

  /**
   * คำนวณสภาพอากาศประจำวัน อิงตามปีจำลอง (2022 - 2026) และเหตุการณ์ภัยพิบัติ
   */
  calculateWeatherForCurrentDay() {
    const d = this.currentDay;
    const recordedDisaster = this.disasterDays[d] ? this.disasterDays[d].type : this.forcedWeather;
    const severity = this.disasterDays[d] ? this.disasterDays[d].severity : 5;

    // 1. ตรวจสอบภัยพิบัติที่กำหนด
    if (recordedDisaster === "flood") {
      this.currentRain = 70 + (severity * 4);
      this.currentTemp = 26;
      this.cwd += 1;
      this.cdd = 0;
      this.activeEventState = "flood";
      return;
    }

    if (recordedDisaster === "rain") {
      this.currentRain = 30 + (severity * 3);
      this.currentTemp = 27.5;
      this.cwd += 1;
      this.cdd = 0;
      this.activeEventState = (this.cwd >= 8) ? "flood" : "rain";
      return;
    }

    if (recordedDisaster === "drought") {
      this.currentRain = 0;
      this.currentTemp = 33 + (severity * 0.4);
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "drought";
      return;
    }

    if (recordedDisaster === "heat") {
      this.currentRain = 0;
      this.currentTemp = 36 + (severity * 0.5);
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "heat";
      return;
    }

    // 2. สภาพอากาศตามโปรไฟล์ปี 2022 - 2026
    this.activeEventState = "normal";

    if (this.selectedYear === "2026") {
      // ปี 2026 (พยากรณ์ล่วงหน้า - ลานีญากำลังอ่อน): ฝนมาสม่ำเสมอต้นฤดู ปลายฤดูแดดดี
      if (d <= 40) {
        this.currentRain = (d % 3 === 0) ? 24 : 5;
        this.currentTemp = 28.5;
      } else if (d <= 85) {
        this.currentRain = (d % 2 === 0) ? 22 : 6;
        this.currentTemp = 28.0;
      } else {
        this.currentRain = (d % 4 === 0) ? 10 : 0;
        this.currentTemp = 27.0;
      }
    } else if (this.selectedYear === "2025") {
      // ปี 2025 (ENSO กลาง - สภาพอากาศสมดุลตามเกณฑ์): ฝนตกตามฤดูกาลปกติ
      if (d <= 35) {
        this.currentRain = (d % 3 === 0) ? 18 : 2;
        this.currentTemp = 29.5;
      } else if (d <= 80) {
        this.currentRain = (d % 2 === 0) ? 25 : 5;
        this.currentTemp = 28.5;
      } else {
        this.currentRain = (d % 5 === 0) ? 8 : 0;
        this.currentTemp = 27.5;
      }
    } else if (this.selectedYear === "2024") {
      // ปี 2024 (ลานีญา): ฝนมาเร็ว พ.ค.-มิ.ย. ส.ค.-ก.ย. เสี่ยงน้ำท่วมช่วงออกรวง
      if (d <= 30) {
        this.currentRain = (d % 2 === 0) ? 22 : 4;
        this.currentTemp = 29;
      } else if (d <= 75) {
        this.currentRain = (d % 3 === 0) ? 28 : 8;
        this.currentTemp = 28.5;
      } else if (d <= 100) {
        this.currentRain = (d % 2 === 0 || d % 5 === 0) ? 45 : 12;
        this.currentTemp = 27.5;
        if (d >= 80 && d <= 88) this.activeEventState = "flood";
      } else {
        this.currentRain = 0;
        this.currentTemp = 26.5;
      }
    } else if (this.selectedYear === "2023") {
      // ปี 2023 (เอลนีโญ): แล้งทิ้งช่วง มิ.ย.-ก.ค. (DAP 20-55) อุณหภูมิร้อนจัด
      if (d <= 20) {
        this.currentRain = (d % 4 === 0) ? 10 : 0;
        this.currentTemp = 33;
      } else if (d <= 60) {
        this.currentRain = 0;
        this.currentTemp = 36.5;
        this.activeEventState = (d >= 35) ? "drought" : "heat";
      } else if (d <= 95) {
        this.currentRain = (d % 3 === 0) ? 20 : 0;
        this.currentTemp = 31;
      } else {
        this.currentRain = 0;
        this.currentTemp = 28;
      }
    } else if (this.selectedYear === "2022") {
      // ปี 2022 (ลานีญา ฝนชุก): ร่องมรสุมเข้าต่อเนื่อง
      if (d <= 80) {
        this.currentRain = (d % 2 === 0) ? 30 : 15;
        this.currentTemp = 28;
      } else {
        this.currentRain = (d % 5 === 0) ? 12 : 2;
        this.currentTemp = 27;
      }
    } else {
      // Baseline 30 ปี TMD Normal
      if (d <= 30) {
        this.currentRain = (d % 3 === 0) ? 14 : 0;
        this.currentTemp = 31;
      } else if (d <= 75) {
        this.currentRain = (d % 2 === 0) ? 20 : 5;
        this.currentTemp = 29.5;
      } else if (d <= 100) {
        this.currentRain = (d % 3 === 0) ? 26 : 0;
        this.currentTemp = 28.5;
      } else {
        this.currentRain = 0;
        this.currentTemp = 27.5;
      }
    }

    if (this.currentRain >= 1.0) {
      this.cwd += 1;
      this.cdd = 0;
    } else {
      this.cdd += 1;
      this.cwd = 0;
    }
  }

  /**
   * คำนวณความเสียหายถาวรตามระดับความรุนแรง 1-10 และระยะสรีรวิทยาข้าว
   */
  accumulateStageDamage() {
    const stage = this.getCurrentStage().id;
    const event = this.activeEventState;
    const dis = this.disasterDays[this.currentDay];
    const severityFactor = dis ? (dis.severity / 5) : 1.0;

    if (event === "flood" || event === "drought" || event === "heat") {
      if (stage === 2) {
        // ระยะแตกกอ: รวงต่อกอ P ลดลงถาวร
        this.damageByStage.tillering = Math.min(0.40, this.damageByStage.tillering + 0.008 * severityFactor);
      } else if (stage === 3 || stage === 4) {
        // ระยะตั้งท้อง/ออกดอก (วิกฤตที่สุด!): ละอองเกสรเป็นหมัน เมล็ดลีบถาวร
        this.damageByStage.flowering = Math.min(0.65, this.damageByStage.flowering + 0.018 * severityFactor);
      } else if (stage === 5) {
        // ระยะสุกแก่: น้ำท่วมทำให้เมล็ดเน่า/ร่วง
        this.damageByStage.ripening = Math.min(0.25, this.damageByStage.ripening + 0.006 * severityFactor);
      }
    }
  }

  recomputeAllDamage() {
    this.damageByStage = { tillering: 0, flowering: 0, ripening: 0 };
    for (let d = 1; d <= this.currentDay; d++) {
      const dis = this.disasterDays[d];
      if (dis && (dis.type === "flood" || dis.type === "drought" || dis.type === "heat")) {
        const ratio = d / this.totalDays;
        let stageId = 1;
        if (ratio > 0.83) stageId = 5;
        else if (ratio > 0.67) stageId = 4;
        else if (ratio > 0.42) stageId = 3;
        else if (ratio > 0.17) stageId = 2;

        const severityFactor = dis.severity / 5;

        if (stageId === 2) {
          this.damageByStage.tillering = Math.min(0.40, this.damageByStage.tillering + 0.008 * severityFactor);
        } else if (stageId === 3 || stageId === 4) {
          this.damageByStage.flowering = Math.min(0.65, this.damageByStage.flowering + 0.018 * severityFactor);
        } else if (stageId === 5) {
          this.damageByStage.ripening = Math.min(0.25, this.damageByStage.ripening + 0.006 * severityFactor);
        }
      }
    }
  }

  getCurrentStage() {
    const ratio = this.currentDay / this.totalDays;
    for (const stage of this.stages) {
      if (ratio >= stage.minRatio && ratio <= stage.maxRatio) {
        return stage;
      }
    }
    return this.stages[this.stages.length - 1];
  }

  getSimulatedDate() {
    const simDate = new Date(this.plantDate);
    simDate.setDate(simDate.getDate() + (this.currentDay - 1));
    return simDate.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  getBiomassRatio() {
    const t = this.currentDay / this.totalDays;
    return 1 / (1 + Math.exp(-10 * (t - 0.5)));
  }

  getWeatherMultipliers() {
    let f_temp = 0.98;
    let f_climate = 0.95;

    if (this.currentTemp > 35) {
      f_temp = Math.max(0.60, 0.95 - (this.currentTemp - 35) * 0.09);
    } else if (this.currentTemp < 22) {
      f_temp = 0.82;
    }

    if (this.activeEventState === "drought" || this.cdd >= 7) {
      f_climate = Math.max(0.35, 0.92 - (this.cdd * 0.04));
    } else if (this.currentRain > 25) {
      f_climate = 1.0;
    }

    const totalPermanentLoss = this.damageByStage.tillering + this.damageByStage.flowering + this.damageByStage.ripening;
    const f_stress = Math.max(0.20, 1.0 - totalPermanentLoss);

    return {
      f_temp: Math.round(f_temp * 100) / 100,
      f_climate: Math.round(f_climate * 100) / 100,
      f_stress: Math.round(f_stress * 100) / 100,
      damageReport: {
        tilleringLoss: Math.round(this.damageByStage.tillering * 100),
        floweringLoss: Math.round(this.damageByStage.flowering * 100),
        ripeningLoss: Math.round(this.damageByStage.ripening * 100),
        totalLossPercent: Math.round(totalPermanentLoss * 100)
      }
    };
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notifyUpdate() {
    const stage = this.getCurrentStage();
    const weatherMults = this.getWeatherMultipliers();

    const state = {
      currentDay: this.currentDay,
      totalDays: this.totalDays,
      percent: Math.round((this.currentDay / this.totalDays) * 100),
      stage: stage,
      simulatedDate: this.getSimulatedDate(),
      biomassRatio: this.getBiomassRatio(),
      isPlaying: this.isPlaying,
      selectedYear: this.selectedYear,
      forcedWeather: this.forcedWeather,
      activeEventState: this.activeEventState || "normal",
      rain: this.currentRain,
      cumulativeRain: Math.round(this.cumulativeProcessRain),
      temp: Math.round(this.currentTemp * 10) / 10,
      cdd: this.cdd,
      cwd: this.cwd,
      weatherMultipliers: weatherMults
    };

    for (const cb of this.listeners) {
      cb(state);
    }
  }
}

const timeEngine = new TimeEngine();
