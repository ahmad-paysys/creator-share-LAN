function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, "").trim();
}

function isIpv4Private(ip: string): boolean {
  if (ip === "127.0.0.1") {
    return true;
  }

  if (ip.startsWith("10.")) {
    return true;
  }

  if (ip.startsWith("192.168.")) {
    return true;
  }

  const match = ip.match(/^172\.(\d{1,3})\./);
  if (match) {
    const second = Number(match[1]);
    return second >= 16 && second <= 31;
  }

  return false;
}

function isIpv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") {
    return true;
  }

  if (lower.startsWith("fe80:")) {
    return true;
  }

  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

export function isLanIp(ip: string | null | undefined): boolean {
  if (!ip) {
    return false;
  }

  const normalized = normalizeIp(ip);
  if (normalized.includes(":")) {
    return isIpv6Private(normalized);
  }

  return isIpv4Private(normalized);
}
