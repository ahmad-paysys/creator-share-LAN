import { describe, expect, it } from "vitest";
import { isLanIp } from "./lan";

describe("isLanIp", () => {
  it("accepts local/private IPv4 addresses", () => {
    expect(isLanIp("127.0.0.1")).toBe(true);
    expect(isLanIp("10.1.2.3")).toBe(true);
    expect(isLanIp("192.168.1.20")).toBe(true);
    expect(isLanIp("172.16.5.2")).toBe(true);
    expect(isLanIp("172.31.255.255")).toBe(true);
  });

  it("accepts local/private IPv6 addresses", () => {
    expect(isLanIp("::1")).toBe(true);
    expect(isLanIp("fe80::1")).toBe(true);
    expect(isLanIp("fd12::abcd")).toBe(true);
    expect(isLanIp("fc00::9")).toBe(true);
  });

  it("accepts IPv4-mapped LAN addresses", () => {
    expect(isLanIp("::ffff:192.168.1.7")).toBe(true);
  });

  it("rejects public addresses", () => {
    expect(isLanIp("8.8.8.8")).toBe(false);
    expect(isLanIp("2001:4860:4860::8888")).toBe(false);
  });
});


