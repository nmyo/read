import { describe, expect, it } from "vitest";

import { buildXiaomiTTSUrl } from "./cloud-tts";
import { DEFAULT_TTS_CONFIG } from "./types";

describe("buildXiaomiTTSUrl", () => {
  it("uses the default Xiaomi MiMo base URL", () => {
    expect(buildXiaomiTTSUrl(DEFAULT_TTS_CONFIG)).toBe(
      "https://api.xiaomimimo.com/v1/chat/completions",
    );
  });

  it("supports Xiaomi Token Plan base URL", () => {
    expect(
      buildXiaomiTTSUrl({
        xiaomiBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1/",
      }),
    ).toBe("https://token-plan-cn.xiaomimimo.com/v1/chat/completions");
  });
});
