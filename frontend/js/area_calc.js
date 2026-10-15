/**
 * คำนวณขนาดพื้นที่เชิงภูมิศาสตร์ (Geodesic Polygon Area)
 * ด้วย Turf.js และแปลงหน่วยเป็น ไร่ - งาน - ตารางวา
 */
const AreaCalculator = {
  /**
   * คำนวณพื้นที่จาก GeoJSON Polygon
   * @param {Object} geojson - GeoJSON Geometry หรือ Feature
   * @returns {Object} ขนาดพื้นที่ในหน่วย ตร.ม. และ ไร่-งาน-วา
   */
  calculateArea(geojson) {
    if (!geojson || !window.turf) {
      return {
        sqMeters: 0,
        totalRaiFloat: 0,
        rai: 0,
        ngan: 0,
        sqWa: 0,
        formattedThai: "0 ไร่ 0 งาน 0 ตร.วา"
      };
    }

    try {
      // คำนวณพื้นที่เชิงระนาบโค้งผิวโลก (Geodesic Area)
      const sqMeters = turf.area(geojson);

      // แปลงหน่วยไทย:
      // 1 ไร่ = 1,600 ตารางเมตร
      // 1 งาน = 400 ตารางเมตร
      // 1 ตารางวา = 4 ตารางเมตร
      const totalRaiFloat = sqMeters / 1600;

      const rai = Math.floor(sqMeters / 1600);
      const remainingAfterRai = sqMeters % 1600;

      const ngan = Math.floor(remainingAfterRai / 400);
      const remainingAfterNgan = remainingAfterRai % 400;

      const sqWa = Math.round((remainingAfterNgan / 4) * 10) / 10;

      const formattedThai = `${rai.toLocaleString()} ไร่ ${ngan} งาน ${sqWa} ตร.วา`;

      return {
        sqMeters: Math.round(sqMeters),
        totalRaiFloat: totalRaiFloat,
        rai: rai,
        ngan: ngan,
        sqWa: sqWa,
        formattedThai: formattedThai
      };
    } catch (err) {
      console.error("[AreaCalculator] คำนวณพื้นที่ผิดพลาด:", err);
      return {
        sqMeters: 0,
        totalRaiFloat: 0,
        rai: 0,
        ngan: 0,
        sqWa: 0,
        formattedThai: "0 ไร่ 0 งาน 0 ตร.วา"
      };
    }
  }
};
