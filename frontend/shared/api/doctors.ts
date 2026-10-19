// Справочник врачей: GET /api/doctors → список врачей с кабинетами и недельным графиком.

import type { Doctor } from "../types/doctor";
import { request } from "./http";
import { list } from "./parse";
import { parseDoctor } from "./parseStaff";

export const getDoctors = (): Promise<Doctor[]> =>
  request("GET", "/api/doctors", "справочник врачей", { parse: (raw) => list(raw, parseDoctor, "врачи") });
