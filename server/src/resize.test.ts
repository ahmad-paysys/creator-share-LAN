import { describe, expect, it } from "vitest";
import { estimateResizeDimensions } from "./resize";

describe("estimateResizeDimensions", () => {
  it("reduces dimensions when target size is smaller", () => {
    const result = estimateResizeDimensions(6000, 4000, 20 * 1024 * 1024, 2);
    expect(result.width).toBeLessThan(6000);
    expect(result.height).toBeLessThan(4000);
  });

  it("never returns unusably small dimensions", () => {
    const result = estimateResizeDimensions(500, 300, 5 * 1024 * 1024, 0.2);
    expect(result.width).toBeGreaterThanOrEqual(320);
    expect(result.height).toBeGreaterThanOrEqual(240);
  });
});

