/** Traduce errores de Auth a mensajes comprensibles que permiten reintentar. */
export function authErrorMessage(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? "";
  const m = raw.toLowerCase();
  if (m.includes("invalid login")) return "El email o la contraseña no coinciden. Probá de nuevo.";
  if (m.includes("email not confirmed")) return "Todavía falta confirmar tu email. Revisá tu bandeja de entrada.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ya existe una cuenta con ese email. Probá entrar.";
  if (m.includes("password") && (m.includes("least") || m.includes("weak")))
    return "La contraseña es muy corta o débil. Usá al menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Hiciste varios intentos seguidos. Esperá un ratito y probá de nuevo.";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to")) return "No hay conexión. Revisá tu internet y reintentá; lo que escribiste sigue acá.";
  if (m.includes("configurar")) return raw;
  return "Algo no salió como esperábamos. Reintentá en un momento.";
}

export function validateEmail(v: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Revisá el email: parece incompleto.";
}

export function validatePassword(v: string): string | null {
  return v.length >= 8 ? null : "La contraseña necesita al menos 8 caracteres.";
}

/** Errores de datos (tareas, áreas) en lenguaje comprensible; el resto cae en el mensaje general. */
export function dataErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const m = (e?.message ?? "").toLowerCase();
  if (e?.code === "23505" || m.includes("duplicate key")) return "Ya tenés un área con ese nombre. Elegí otro.";
  if (e?.code === "23514" || m.includes("check constraint")) return "Revisá los datos: alguno no es válido.";
  if (e?.code === "23503" || m.includes("foreign key")) return "Esa área ya no está disponible. Actualizá y probá de nuevo.";
  return authErrorMessage(err);
}
