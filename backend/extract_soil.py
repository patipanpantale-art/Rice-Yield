import os
import sys
import json
import shutil
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

SOIL_DIR = os.path.join("backend", "data", "soil")
MAPPING_PATH = os.path.join(SOIL_DIR, "province_mapping.json")

if not os.path.exists(MAPPING_PATH):
    print("ไม่พบไฟล์ province_mapping.json")
    sys.exit(1)

with open(MAPPING_PATH, "r", encoding="utf-8") as f:
    mapping_data = json.load(f)

provinces = mapping_data.get("provinces", {})
total = len(provinces)
print(f"--- เริ่มกระบวนการแตกไฟล์ข้อมูลดิน 5 ภูมิภาค ({total} จังหวัด) ---\n")

count = 0
success_count = 0
skipped_count = 0
failed = []

for code, p in provinces.items():
    count += 1
    region = p["region"]
    name_en = p["name_en"]
    name_th = p["name_th"]
    rar_name = p["rar_file"]
    shp_name = p["shp_name"]

    rar_rel = os.path.join(SOIL_DIR, region, rar_name)
    target_rel = os.path.join(SOIL_DIR, region, name_en)
    target_shp = os.path.join(target_rel, shp_name)

    # หากมีไฟล์ .shp อยู่แล้ว ให้ข้าม
    if os.path.exists(target_shp):
        print(f"[{count:02d}/{total}] ({region}) {name_th} ({name_en}): มีไฟล์แล้ว")
        p["status"] = "extracted"
        skipped_count += 1
        continue

    # ตรวจสอบไฟล์ .rar
    if not os.path.exists(rar_rel):
        print(f"[{count:02d}/{total}] ({region}) {name_th} ({name_en}): ไม่พบ {rar_name}")
        failed.append((name_th, "ไม่พบไฟล์ rar"))
        continue

    os.makedirs(target_rel, exist_ok=True)

    try:
        # ใช้ relative path ในการแตกไฟล์ เพื่อเลี่ยงปัญหา non-ascii ในพาธระบบ
        subprocess.run(["tar", "-xf", rar_rel, "-C", target_rel], capture_output=True)

        # ย้ายไฟล์จากโฟลเดอร์ย่อย (เช่น kkn/, ret/) ขึ้นมาไว้ที่ target_rel โดยตรง
        for item in os.listdir(target_rel):
            item_path = os.path.join(target_rel, item)
            if os.path.isdir(item_path):
                for f in os.listdir(item_path):
                    shutil.move(os.path.join(item_path, f), os.path.join(target_rel, f))
                shutil.rmtree(item_path, ignore_errors=True)

        if os.path.exists(target_shp):
            file_count = len(os.listdir(target_rel))
            print(f"[{count:02d}/{total}] ({region}) {name_th} ({name_en}): แตกไฟล์สำเร็จ ({file_count} ไฟล์)")
            p["status"] = "extracted"
            success_count += 1
        else:
            print(f"[{count:02d}/{total}] ({region}) {name_th} ({name_en}): ไม่พบไฟล์ {shp_name}")
            failed.append((name_th, f"ไม่พบ {shp_name}"))

    except Exception as e:
        print(f"[{count:02d}/{total}] ({region}) {name_th} ({name_en}): ผิดพลาด {e}")
        failed.append((name_th, str(e)))

# บันทึกสถานะล่าสุดลง province_mapping.json
with open(MAPPING_PATH, "w", encoding="utf-8") as f:
    json.dump(mapping_data, f, ensure_ascii=False, indent=2)

print("\n================ สรุปผลการดำเนินการ ================")
print(f"จังหวัดทั้งหมด: {total}")
print(f"แตกไฟล์สำเร็จใหม่: {success_count}")
print(f"มีไฟล์อยู่เดิมแล้ว: {skipped_count}")
print(f"ล้มเหลว: {len(failed)}")
if failed:
    print("รายชื่อจังหวัดที่ขัดข้อง:", failed)
print("====================================================")
