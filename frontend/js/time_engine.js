/**
 * กลไกเร่งเวลาและจำลองสภาพอากาศสุดวิสัย (Time & Weather Stress Sandbox Engine)
 * รองรับการกรอเวลาไปหน้า-ย้อนหลัง (Scrubbing) และการสะสมดัชนี CDD / CWD
 */
class TimeEngine {
  constructor() {
    this.currentDay = 1;
    this.totalDays = 120; // ค่าเริ่มต้น ขาวดอกมะลิ 105 (120 วัน)
    this.plantDate = new Date("2026-06-15");
    this.speed = 2; // ตัวคูณความเร็ว
    this.isPlaying = false;
    this.intervalId = null;
    this.listeners = [];

    // สถานะสภาพอากาศที่ถูกสั่งจำลอง (Manual Overrides)
    // 'auto' = ตามธรรมชาติ, 'rain' = บังคับฝนตก, 'flood' = น้ำท่วมขัง, 'drought' = ฝนแล้ง, 'heat' = ร้อนจัด
    this.forcedWeather = "auto";

    // ตัวแปรสะสมทางอุตุนิยมวิทยา
    this.cdd = 0; // Consecutive Dry Days
    this.cwd = 0; // Consecutive Wet Days
    this.currentRain = 12; // ปริมาณฝนประจำวัน (มม.)
    this.currentTemp = 29.5; // อุณหภูมิประจำวัน (°C)

    // 5 ระยะการเจริญเติบโตสรีรวิทยาข้าว
    this.stages = [
      { id: 1, name: "ระยะกล้า (Seedling)", minRatio: 0, maxRatio: 0.17 },
      { id: 2, name: "ระยะแตกกอ (Tillering)", minRatio: 0.17, maxRatio: 0.42 },
      { id: 3, name: "ระยะตั้งท้อง (Booting)", minRatio: 0.42, maxRatio: 0.67 },
      { id: 4, name: "ระยะออกรวง (Heading)", minRatio: 0.67, maxRatio: 0.83 },
      { id: 5, name: "ระยะสุกแก่ (Maturity)", minRatio: 0.83, maxRatio: 1.0 }
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
    this.forcedWeather = "auto";
    this.notifyUpdate();
  }

  /**
   * กรองหรือเลื่อนเวลาไปยังวันใดก็ได้ (Scrubbing / Seeking)
   */
  seekToDay(day) {
    const targetDay = Math.max(1, Math.min(day, this.totalDays));
    this.currentDay = targetDay;
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  stepDay(step) {
    this.currentDay = Math.max(1, Math.min(this.currentDay + step, this.totalDays));
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  /**
   * จำลองสภาพอากาศตามธรรมชาติและเงื่อนไขสะสม CDD / CWD
   */
  calculateWeatherForCurrentDay() {
    const d = this.currentDay;

    // 1. ตรวจสอบการแทรกแซงจากผู้ใช้ (Forced Scenario)
    if (this.forcedWeather === "rain") {
      this.currentRain = 35 + Math.round(Math.random() * 20);
      this.currentTemp = 27 + Math.random() * 2;
      this.cwd += 1;
      this.cdd = 0;
      // หากเปิดฝนตกชุ่มติดต่อกันเกิน 7 วัน จะเกิดสภาวะ "น้ำท่วมขัง" อัตโนมัติ!
      if (this.cwd >= 8) {
        this.activeEventState = "flood";
      } else {
        this.activeEventState = "rain";
      }
      return;
    }

    if (this.forcedWeather === "flood") {
      this.currentRain = 75 + Math.round(Math.random() * 30);
      this.currentTemp = 26;
      this.cwd += 1;
      this.cdd = 0;
      this.activeEventState = "flood";
      return;
    }

    if (this.forcedWeather === "drought") {
      this.currentRain = 0;
      this.currentTemp = 34 + Math.random() * 2;
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "drought";
      return;
    }

    if (this.forcedWeather === "heat") {
      this.currentRain = 0;
      this.currentTemp = 37.5 + Math.random() * 2;
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "heat";
      return;
    }

    // 2. โหมดอัตโนมัติตามธรรมชาติของฤดูกาลนาปีไทย (Default Auto Mode)
    this.activeEventState = "normal";

    if (d <= 25) {
      // ต้นฤดู (มิ.ย.): ฝนตกสลับแดด
      const isRain = (d % 3 === 0);
      this.currentRain = isRain ? (10 + (d % 5) * 4) : 0;
      this.currentTemp = isRain ? 29 : 32;
    } else if (d <= 65) {
      // กลางฤดู (ก.ค. - ส.ค.): ฝนตกสม่ำเสมอ แตกกอสมบูรณ์
      const isRain = (d % 2 === 0 || d % 5 === 0);
      this.currentRain = isRain ? (18 + (d % 4) * 6) : 2;
      this.currentTemp = 29.5;
    } else if (d <= 90) {
      // มรสุมเข้า (ส.ค. - ก.ย.): ฝนตกชุก อาจมีช่วงน้ำเอิ่ง
      const isRain = (d % 4 !== 0);
      this.currentRain = isRain ? (30 + (d % 7) * 8) : 0;
      this.currentTemp = 28;
    } else {
      // ปลายฤดูสุกแก่ (ต.ค. - พ.ย.): ปลายฝนต้นหนาว ฝนหยุด ข้าวสุกทอง
      this.currentRain = (d % 10 === 0) ? 5 : 0;
      this.currentTemp = 27.5;
    }

    if (this.currentRain >= 1.0) {
      this.cwd += 1;
      this.cdd = 0;
    } else {
      this.cdd += 1;
      this.cwd = 0;
    }
  }

  setWeatherScenario(scenarioType) {
    if (this.forcedWeather === scenarioType) {
      // หากกดปุ่มเดิมซ้ำ ให้ยกเลิกกลับสู่โหมดอัตโนมัติ
      this.forcedWeather = "auto";
    } else {
      this.forcedWeather = scenarioType;
    }
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
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

  /**
   * คำนวณตัวคูณผลกระทบจากสภาพอากาศและภัยพิบัติต่อแบบจำลองสูตรผสมผสาน
   */
  getWeatherMultipliers() {
    let f_temp = 0.95;
    let f_climate = 0.92;
    let f_stress = 1.0; // ตัวคูณลดทอนจากภัยสุดวิสัย

    // 1. ผลของอุณหภูมิ (อิง Islam & Hasan 2021)
    if (this.currentTemp > 35) {
      // อากาศร้อนจัด เกสรลีบ
      f_temp = Math.max(0.65, 0.95 - (this.currentTemp - 35) * 0.08);
    } else if (this.currentTemp < 22) {
      // อากาศหนาวเกินไป
      f_temp = 0.85;
    } else {
      f_temp = 0.98;
    }

    // 2. ผลของภาวะขาดน้ำ (FAO-33)
    if (this.activeEventState === "drought" || this.cdd >= 7) {
      f_climate = Math.max(0.40, 0.92 - (this.cdd * 0.04));
    } else if (this.currentRain > 15) {
      f_climate = 1.0; // น้ำเต็มอิ่ม
    }

    // 3. ผลของน้ำท่วมขัง (CWD เกินพิกัด)
    if (this.activeEventState === "flood" || this.cwd >= 8) {
      const stage = this.getCurrentStage().id;
      // ถ้าน้ำท่วมในระยะตั้งท้องหรือออกรวง ข้าวจะเสียหายหนักมาก
      if (stage === 3 || stage === 4) {
        f_stress = 0.65;
      } else {
        f_stress = 0.80;
      }
    }

    return {
      f_temp: Math.round(f_temp * 100) / 100,
      f_climate: Math.round(f_climate * 100) / 100,
      f_stress: Math.round(f_stress * 100) / 100
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
      forcedWeather: this.forcedWeather,
      activeEventState: this.activeEventState || "normal",
      rain: this.currentRain,
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
