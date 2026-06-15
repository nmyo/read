import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  parseAccessProfile,
  profileHasScope,
  PROFILE_SCOPES,
} from "./profiles.js";

describe("profiles", () => {
  it("defaults to readonly", () => {
    expect(parseAccessProfile(undefined)).toBe(DEFAULT_PROFILE);
  });

  it("rejects unknown profiles", () => {
    expect(() => parseAccessProfile("root")).toThrow("Unknown ReadAny access profile");
  });

  it("keeps readonly profile read-only", () => {
    expect(profileHasScope("readonly", "book.read")).toBe(true);
    expect(profileHasScope("readonly", "epub.export")).toBe(false);
    expect(profileHasScope("readonly", "sync.run")).toBe(false);
  });

  it("builds publisher on editor scopes", () => {
    for (const scope of PROFILE_SCOPES.editor) {
      expect(PROFILE_SCOPES.publisher).toContain(scope);
    }
    expect(PROFILE_SCOPES.publisher).toContain("epub.export");
  });
});
