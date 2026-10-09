import { describe, expect, it } from "vitest";
import { defaultDraft, parseDraft, validateAreas } from "./draft";

describe("borrador de onboarding", () => {
  it("por defecto propone Casa, Trabajo, Salud y Vida social", () => {
    expect(defaultDraft().areas.map((a) => a.name)).toEqual(["Casa", "Trabajo", "Salud", "Vida social"]);
  });
  it("valida cantidad, vacíos, largo y duplicados", () => {
    const a = (name: string) => ({ name, color_key: "lila" });
    expect(validateAreas([a("A")])).not.toBeNull();
    expect(validateAreas([a("A"), a(" ")])).not.toBeNull();
    expect(validateAreas([a("A"), a("x".repeat(41))])).not.toBeNull();
    expect(validateAreas([a("Casa"), a(" casa ")])).not.toBeNull();
    expect(validateAreas([a("Casa"), a("Trabajo")])).toBeNull();
  });
  it("descarta borradores corruptos", () => {
    expect(parseDraft({ displayName: 1, areas: [] })).toBeNull();
    expect(parseDraft({ displayName: "", areas: [{ name: "x", color_key: "nope" }] })).toBeNull();
  });
});
