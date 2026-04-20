import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function toPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function readRootEnv(rootEnvPath: string): Record<string, string> {
  if (!fs.existsSync(rootEnvPath)) {
    return {};
  }

  const env: Record<string, string> = {};
  const lines = fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

export default defineConfig(() => {
  const rootEnvPath = path.resolve(process.cwd(), "..", ".env");
  const rootEnv = readRootEnv(rootEnvPath);
  const devPort = toPort(rootEnv.VITE_DEV_PORT ?? process.env.VITE_DEV_PORT, 5173);
  const backendPort = toPort(rootEnv.PORT ?? process.env.PORT, 3000);
  const backendBaseUrl = `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    server: {
      port: devPort,
      proxy: {
        "/api": backendBaseUrl,
        "/media": backendBaseUrl,
        "/thumbnails": backendBaseUrl,
        "/health": backendBaseUrl,
      },
    },
  };
});
