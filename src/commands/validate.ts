import { doctorCommand } from "./doctor.js";
import type { DoctorOptions } from "./doctor.js";

export async function validateCommand(options: DoctorOptions): Promise<void> {
  await doctorCommand(options);
}
