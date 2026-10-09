import { describe, expect, it } from "vitest";
import { authErrorMessage, validateEmail, validatePassword } from "./messages";

describe("mensajes de acceso", () => {
  it("traduce credenciales inválidas sin culpar a la persona", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toMatch(/no coinciden/);
  });
  it("un error desconocido invita a reintentar", () => {
    expect(authErrorMessage({ message: "boom" })).toMatch(/Reintentá/);
  });
  it("valida email y contraseña", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("ab")).not.toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
  });
});
