import { describe, expect, it } from "vitest";
import { addDays, filterTasks, isValidDate, normalize, type FilterableTask } from "./taskFilters";

const TODAY = "2026-11-03";
const t = (over: Partial<FilterableTask>): FilterableTask => ({
  areaId: "casa", title: "Tarea", status: "pending", scheduledDate: null, someday: false, ...over,
});
const base = { view: "open", areaId: null, search: "" } as const;

describe("filterTasks", () => {
  const tasks = [
    t({ title: "Sin fecha" }),
    t({ title: "Hoy", scheduledDate: TODAY }),
    t({ title: "Vencida", scheduledDate: "2026-11-01" }),
    t({ title: "Futura", scheduledDate: "2026-11-10" }),
    t({ title: "Más adelante", someday: true }),
    t({ title: "Hecha", status: "completed" }),
    t({ title: "Cancelada", status: "cancelled" }),
    t({ title: "En curso", status: "in_progress", areaId: "trabajo" }),
  ];
  const titles = (f: Partial<Parameters<typeof filterTasks>[1]>) =>
    filterTasks(tasks, { ...base, ...f }, TODAY).map((x) => x.title);

  it("«open» incluye pendientes y en curso, no completadas ni canceladas", () => {
    expect(titles({})).toEqual(["Sin fecha", "Hoy", "Vencida", "Futura", "Más adelante", "En curso"]);
  });
  it("«today» solo las de hoy; «overdue» solo vencidas; «upcoming» solo futuras", () => {
    expect(titles({ view: "today" })).toEqual(["Hoy"]);
    expect(titles({ view: "overdue" })).toEqual(["Vencida"]);
    expect(titles({ view: "upcoming" })).toEqual(["Futura"]);
  });
  it("«someday» es una lista aparte y no aparece en hoy/vencidas/futuras", () => {
    expect(titles({ view: "someday" })).toEqual(["Más adelante"]);
    const dated = filterTasks([t({ someday: true, scheduledDate: "2026-11-01" })], { ...base, view: "overdue" }, TODAY);
    expect(dated).toEqual([]);
  });
  it("las completadas tienen su propia vista", () => {
    expect(titles({ view: "completed" })).toEqual(["Hecha"]);
  });
  it("filtra por área y por búsqueda sin distinguir tildes ni mayúsculas", () => {
    expect(titles({ areaId: "trabajo" })).toEqual(["En curso"]);
    expect(titles({ search: "mas adelante" })).toEqual(["Más adelante"]);
    expect(titles({ search: "  VENCIDA " })).toEqual(["Vencida"]);
    expect(titles({ search: "no existe" })).toEqual([]);
  });
});

describe("fechas", () => {
  it("normalize quita tildes", () => expect(normalize("Café")).toBe("cafe"));
  it("isValidDate rechaza fechas imposibles y formatos raros", () => {
    expect(isValidDate("2026-11-03")).toBe(true);
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("3/11/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
  it("addDays cruza fin de mes y de año", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-03", -3)).toBe("2026-10-31");
  });
});
