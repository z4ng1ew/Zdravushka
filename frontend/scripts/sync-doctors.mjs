// Обновить справочник врачей фронта из бэкенда:
//   node scripts/sync-doctors.mjs ../Zdravushka/data/schedule.json
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2] ?? "../Zdravushka/data/schedule.json";
const data = JSON.parse(readFileSync(src, "utf-8"));
const out = data.doctors.map((x) => ({
  id: Number(x.excel_id.slice(1)), fullName: x.full_name, specialty: x.specialty, department: x.department,
  patients: x.patients, cabinet: String(x.cabinet ?? ""), slotMin: x.slot_min, weekly: x.weekly,
}));
writeFileSync(new URL("../shared/domain/doctors.data.json", import.meta.url), JSON.stringify(out, null, 0));
console.log(`Врачей: ${out.length}`);
