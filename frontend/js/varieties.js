/**
 * ข้อมูลพันธุ์ข้าวอ้างอิง (กรมการข้าว / สศก.) — แหล่งข้อมูลเดียวที่ทุกโมดูลใช้ร่วมกัน
 * duration = อายุเก็บเกี่ยว (วัน), H/P/G/W = ตัวแปรชีวภาพตั้งต้นของสมการผลผลิต
 */
const RICE_VARIETIES = {
  kdml105: { key: "kdml105", name: "ขาวดอกมะลิ 105", short: "มะลิ 105", duration: 120, H: 16, P: 8, G: 95, W: 25.5, color: "#16a34a" },
  rd6: { key: "rd6", name: "กข6", short: "กข6", duration: 130, H: 16, P: 9, G: 100, W: 26.5, color: "#7c3aed" },
  rd41: { key: "rd41", name: "กข41", short: "กข41", duration: 105, H: 20, P: 10, G: 110, W: 27.5, color: "#0284c7" }
};

const DEFAULT_FERTILITY = 0.82;

function getVarietySpec(key) {
  return RICE_VARIETIES[key] || RICE_VARIETIES.kdml105;
}

/** สร้างชุดพารามิเตอร์ตั้งต้นของแปลงจากพันธุ์ข้าว */
function buildPaddyParams(key, fertilityFactor = DEFAULT_FERTILITY) {
  const spec = getVarietySpec(key);
  return {
    variety: spec.key,
    durationDays: spec.duration,
    H: spec.H,
    P: spec.P,
    G: spec.G,
    W: spec.W,
    fertilityFactor
  };
}

/** อายุเก็บเกี่ยวของแปลง (วัน) */
function getPaddyDuration(paddy) {
  const key = (paddy && paddy.params && paddy.params.variety) || (paddy && paddy.variety);
  const d = paddy && paddy.params ? Number(paddy.params.durationDays) : NaN;
  return d > 0 ? d : getVarietySpec(key).duration;
}
