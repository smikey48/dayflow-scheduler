import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i === process.argv.length - 1) throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
}

// ----- Parse args -----
const signedUrl = arg("--url");
const token = arg("--token");
const bucket = arg("--bucket");     // "voice"
const storagePath = arg("--path");  // e.g., "voice/<user>/<job>.m4a" or "<user>/<job>.m4a"
const filePath = arg("--file");

// ----- Derive content type from extension -----
const ext = path.extname(filePath).toLowerCase();
let contentType = "application/octet-stream";
if (ext === ".m4a" || ext === ".mp4") contentType = "audio/mp4";
else if (ext === ".wav") contentType = "audio/wav";
else if (ext === ".webm") contentType = "audio/webm";
else if (ext === ".mp3") contentType = "audio/mpeg";

// ----- uploadToSignedUrl expects the object key WITHOUT the bucket prefix -----
const objectKey = storagePath.startsWith("voice/")
  ? storagePath.replace(/^voice\//, "")
  : storagePath;

// ----- Read file bytes -----
console.log("[upload] reading file:", filePath);
let bytes;
try {
  bytes = fs.readFileSync(filePath);                // Buffer (Uint8Array)
} catch (e) {
  console.error("[upload] failed to read file:", e.message);
  process.exit(1);
}

console.log("[upload] file bytes:", bytes.length, "contentType:", contentType);
console.log("[upload] bucket:", bucket);
console.log("[upload] objectKey:", objectKey);

// ... keep the rest of the script as you have it ...

function argOpt(name, def = undefined) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i < process.argv.length - 1 ? process.argv[i + 1] : def;
}

// Read project URL and anon key (required for uploadToSignedUrl)
const projectUrl = argOpt("--projectUrl", process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey    = argOpt("--anonKey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
if (!projectUrl || !anonKey) {
  console.error("[upload] Missing project URL/anon key. Pass --projectUrl and --anonKey or set env vars.");
  process.exit(1);
}

// ----- Create the client with your real project -----
const supa = createClient(projectUrl, anonKey);

try {
  const { data, error } = await supa
    .storage
    .from(bucket)
    .uploadToSignedUrl(objectKey, token, bytes, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error("[upload] Upload error:", error);
    process.exit(1);
  }
  console.log("[upload] Upload OK:", data);
  process.exit(0);
} catch (e) {
  console.error("[upload] Unexpected failure:", e);
  process.exit(1);
}

