/**
 * กลไกเร่งเวลา, สภาพอากาศอิงตามปีจริง และจำลองผลกระทบภัยพิบัติตามระยะการเจริญเติบโต (Stage-Specific Disaster Engine)
 * อิงหลักวิชาการ FAO-33 (Yield Response to Water) และชีววิทยาข้าว กรมการข้าว
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

    // ปีสภาพอากาศจำลอง: "2024" (ลานีญา), "2023" (เอลนีโญ), "2022" (ฝนชุก), "baseline" (เฉลี่ย 30 ปี)
    this.selectedYear = "2024";

    // สถานะสภาพอากาศที่ผู้ใช้สั่งแทรกแซงแบบพลวัต
    this.forcedWeather = "auto"; // 'auto', 'rain', 'flood', 'drought', 'heat'

    // บันทึกประวัติภัยพิบัติในแต่ละวัน (Disaster History Map)
    // Key: day (1-120), Value: 'flood' | 'drought' | 'heat' | 'rain'
    this.disasterDays = {};

    // ความเสียหายถาวรสะสมแยกตามระยะสรีรวิทยา (Stage-Specific Permanent Damage)
    this.damageByStage = {
      tillering: 0, // กระทบการแตกกอ (รวงต่อกอลดลงถาวร)
      flowering: 0, // วิกฤตที่สุด! กระทบการติดเกสร (เมล็ดลีบถาวร ไม่สามารถฟื้นฟูได้)
      ripening: 0   // กระทบน้ำหนักเมล็ดช่วงสุกแก่
    };

    // ตัวแปรสะสมทางอุตุนิยมวิทยา
    this.cdd = 0; // Consecutive Dry Days
    this.cwd = 0; // Consecutive Wet Days
    this.currentRain = 12; // มม./วัน
    this.currentTemp = 29.5; // °C

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
    this.forcedWeather = "auto";
    this.disasterDays = {};
    this.damageByStage = { tillering: 0, flowering: 0, ripening: 0 };
    this.notifyUpdate();
  }

  seekToDay(day) {
    const targetDay = Math.max(1, Math.min(day, this.totalDays));
    this.currentDay = targetDay;
    this.calculateWeatherForCurrentDay();
    this.notifyUpdate();
  }

  stepDay(step) {
    this.currentDay = Math.max(1, Math.min(this.currentDay + step, this.totalDays));

    // หากเปิดโหมดมรสุมค้างไว้ขณะเล่น ให้บันทึกภัยพิบัติของวันนี้
    if (this.forcedWeather !== "auto") {
      this.disasterDays[this.currentDay] = this.forcedWeather;
    }

    this.calculateWeatherForCurrentDay();
    this.accumulateStageDamage();
    this.notifyUpdate();
  }

  /**
   * กำหนดช่วงเวลาเกิดภัยพิบัติล่วงหน้า (Disaster Window) เช่น วันที่ 30-70
   */
  scheduleDisasterWindow(type, startDay, endDay) {
    for (let d = startDay; d <= endDay; d++) {
      if (d >= 1 && d <= this.totalDays) {
        if (type === "none") {
          delete this.disasterDays[d];
        } else {
          this.disasterDays[d] = type;
        }
      }
    }
    this.calculateWeatherForCurrentDay();
    this.recomputeAllDamage();
    this.notifyUpdate();
  }

  /**
   * คำนวณสภาพอากาศประจำวัน อิงตามปีที่เลือกและภัยพิบัติที่บันทึกไว้
   */
  calculateWeatherForCurrentDay() {
    const d = this.currentDay;
    const recordedDisaster = this.disasterDays[d] || this.forcedWeather;

    // 1. ตรวจสอบภัยพิบัติที่ส่งผลในวันนี้
    if (recordedDisaster === "flood") {
      this.currentRain = 85;
      this.currentTemp = 26;
      this.cwd += 1;
      this.cdd = 0;
      this.activeEventState = "flood";
      return;
    }

    if (recordedDisaster === "rain") {
      this.currentRain = 40;
      this.currentTemp = 27.5;
      this.cwd += 1;
      this.cdd = 0;
      this.activeEventState = (this.cwd >= 8) ? "flood" : "rain";
      return;
    }

    if (recordedDisaster === "drought") {
      this.currentRain = 0;
      this.currentTemp = 34.5;
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "drought";
      return;
    }

    if (recordedDisaster === "heat") {
      this.currentRain = 0;
      this.currentTemp = 38.0;
      this.cdd += 1;
      this.cwd = 0;
      this.activeEventState = "heat";
      return;
    }

    // 2. สภาพอากาศตามโปรไฟล์ปีที่เลือก (Yearly Meteorological Curves)
    this.activeEventState = "normal";

    if (this.selectedYear === "2024") {
      // ปี 2024 (ลานีญา): ฝนมาเร็ว พ.ค.-มิ.ย. ปลายฤดู ส.ค.-ก.ย. ฝนตกหนักเสี่ยงท่วม
      if (d <= 30) {
        this.currentRain = (d % 2 === 0) ? 22 : 4;
        this.currentTemp = 29;
      } else if (d <= 75) {
        this.currentRain = (d % 3 === 0) ? 28 : 8;
        this.currentTemp = 28.5;
      } else if (d <= 100) {
        this.currentRain = (d % 2 === 0 || d % 5 === 0) ? 45 : 12; // เสี่ยงน้ำท่วมช่วงออกรวง
        this.currentTemp = 27.5;
        if (d >= 80 && d <= 88) this.activeEventState = "flood";
      } else {
        this.currentRain = 0;
        this.currentTemp = 26.5;
      }
    } else if (this.selectedYear === "2023") {
      // ปี 2023 (เอลนีโญ): ฝนทิ้งช่วงแล้งจัด มิ.ย.-ก.ค. (DAP 20-55) อุณหภูมิร้อนจัด
      if (d <= 20) {
        this.currentRain = (d % 4 === 0) ? 10 : 0;
        this.currentTemp = 33;
      } else if (d <= 60) {
        // แล้งทิ้งช่วงรุนแรง ข้าวขาดน้ำ
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
      // ปี 2022 (ลานีญา ฝนชุก): ฝนตกต่อเนื่องตลอดฤดู น้ำเต็มแปลง
      if (d <= 80) {
        this.currentRain = (d % 2 === 0) ? 30 : 15;
        this.currentTemp = 28;
      } else {
        this.currentRain = (d % 5 === 0) ? 12 : 2;
        this.currentTemp = 27;
      }
    } else {
      // ค่าเฉลี่ย 30 ปี (Baseline TMD Normal)
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
   * คำนวณความเสียหายถาวรตามระยะการเจริญเติบโตสรีรวิทยา (FAO-33 Yield Response)
   * ข้าวที่เสียหายในระยะออกดอก/ตั้งท้อง จะสูญเสียผลผลิตถาวร ไม่สามารถฟื้นฟูกลับมาได้
   */
  accumulateStageDamage() {
    const d = this.currentDay;
    const stage = this.getCurrentStage().id;
    const event = this.activeEventState;

    if (event === "flood" || event === "drought" || event === "heat") {
      if (stage === 2) {
        // ระยะแตกกอ: รวงต่อกอ P ลดลงถาวร (สะสมวันละ 0.8%)
        this.damageByStage.tillering = Math.min(0.35, this.damageByStage.tillering + 0.008);
      } else if (stage === 3 || stage === 4) {
        // ระยะตั้งท้อง/ออกดอก (วิกฤตที่สุด!): ละอองเกสรเป็นหมัน เมล็ดลีบถาวร (สะสมวันละ 1.8%)
        this.damageByStage.flowering = Math.min(0.60, this.damageByStage.flowering + 0.018);
      } else if (stage === 5) {
        // ระยะสุกแก่: น้ำท่วมทำให้เมล็ดเน่า/ร่วง
        this.damageByStage.ripening = Math.min(0.20, this.damageByStage.ripening + 0.006);
      }
    }
  }

  recomputeAllDamage() {
    this.damageByStage = { tillering: 0, flowering: 0, ripening: 0 };
    for (let d = 1; d <= this.currentDay; d++) {
      const event = this.disasterDays[d];
      if (event === "flood" || event === "drought" || event === "heat") {
        const ratio = d / this.totalDays;
        let stageId = 1;
        if (ratio > 0.83) stageId = 5;
        else if (ratio > 0.67) stageId = 4;
        else if (ratio > 0.42) stageId = 3;
        else if (ratio > 0.17) stageId = 2;

        if (stageId === 2) {
          this.damageByStage.tillering = Math.min(0.35, this.damageByStage.tillering + 0.008);
        } else if (stageId === 3 || stageId === 4) {
          this.damageByStage.flowering = Math.min(0.60, this.damageByStage.flowering + 0.018);
        } else if (stageId === 5) {
          this.damageByStage.ripening = Math.min(0.20, this.damageByStage.ripening + 0.006);
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

  /**
   * คำนวณตัวคูณสภาพอากาศและตัวคูณความเสียหายถาวร (สมการ 3 ถึง 7)
   */
  getWeatherMultipliers() {
    let f_temp = 0.98;
    let f_climate = 0.95;

    // 1. ผลของอุณหภูมิเฉลี่ย
    if (this.currentTemp > 35) {
      f_temp = Math.max(0.60, 0.95 - (this.currentTemp - 35) * 0.09);
    } else if (this.currentTemp < 22) {
      f_temp = 0.82;
    }

    // 2. ผลของภาวะน้ำ
    if (this.activeEventState === "drought" || this.cdd >= 7) {
      f_climate = Math.max(0.35, 0.92 - (this.cdd * 0.04));
    } else if (this.currentRain > 25) {
      f_climate = 1.0;
    }

    // 3. ความเสียหายสะสมทางชีววิทยา (Permanent Yield Response Factor)
    // ผลกระทบรวมที่ข้าวเสียหายไปแล้ว ไม่สามารถฟื้นฟูกลับมาได้
    const totalPermanentLoss = this.damageByStage.tillering + this.damageByStage.flowering + this.damageByStage.ripening;
    const f_stress = Math.max(0.25, 1.0 - totalPermanentLoss);

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
