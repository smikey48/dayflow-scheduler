// lib/loadPrompt.ts
import { promises as fs } from "fs";
import path from "path";

export async function loadSystemPrompt() {
  const p = path.join(process.cwd(), "prompts", "d2_voice_task_system.md");
  return fs.readFile(p, "utf8");
}

export async function loadUserTemplate() {
  const p = path.join(process.cwd(), "prompts", "d2_voice_task_user_template.txt");
  return fs.readFile(p, "utf8");
}
