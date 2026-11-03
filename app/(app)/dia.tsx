import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips, MultiChips } from "@/components/Chips";
import { fetchAreas, type Area } from "@/data/areas";
import { closeDay, fetchPlan, savePlan, type Plan } from "@/data/dayplan";
import { fetchOpenRuns, fetchTemplates, startRun, type Run, type Template } from "@/data/routines";
import { completeTask, fetchOpenTasks, undoCompleteTask, type Task } from "@/data/tasks";
import {
  MOMENTS, plannableTasks, planHasErrors, planTimeSummary, toggleArea, toggleId, validatePlan,
  type Moment, type PlanDraft,
} from "@/domain/dayPlan";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");
const MOMENT_ORDER: Record<string, number> = { morning: 0, midday: 1, afternoon: 2, night: 3 };
const MOMENT_LABEL = Object.fromEntries(MOMENTS.map((m) => [m.value, m.label]));

const emptyDraft = (): PlanDraft => ({ available: "", areas: [], taskIds: [], routineIds: [] });

export default function MiDia() {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "close">("view");
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [carry, setCarry] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, a, t, tp, r] = await Promise.all([fetchPlan(today()), fetchAreas(), fetchOpenTasks(), fetchTemplates(), fetchOpenRuns()]);
      setPlan(p);
      setAreas(a);
      setTasks(t);
      setTemplates(tp);
      setRuns(r);
    } catch (e) {
      setError(dataErrorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error) {
    return (
      <Center>
        <Notice kind="error">{error}</Notice>
        <Button label="Reintentar" onPress={load} />
      </Center>
    );
  }
  if (plan === undefined) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? "";
  const editing = mode === "edit" || (!plan && mode === "view");
  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
      after?.();
    } catch (e) {
      setActionError(dataErrorMessage(e)); // lo escrito se conserva
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Elegir y editar el plan ----------------
  if (editing) {
    const d = draft ?? (plan ? draftFromPlan(plan) : emptyDraft());
    const set = (patch: Partial<PlanDraft>) => setDraft({ ...d, ...patch });
    const chosen = d.areas.map((a) => a.areaId);
    const taskArea = new Map(tasks.map((t) => [t.id, t.area_id as string | null]));
    const routineArea = new Map(templates.map((t) => [t.id, t.default_area_id]));
    const offered = plannableTasks(
      tasks.map((t) => ({ ...t, areaId: t.area_id, scheduledDate: t.scheduled_date })),
      chosen,
      today(),
    );
    const offeredRoutines = templates.filter((t) => !t.default_area_id || chosen.includes(t.default_area_id));
    const errors = validatePlan(d);
    const time = planTimeSummary(d);
    const closed = !!plan?.closed_at;

    return (
      <Screen>
        <Title>Mi día</Title>
        {closed ? <Notice kind="info">Este día ya está cerrado y no se puede editar.</Notice> : null}
        <Body>¿Qué áreas querés atender hoy? No hace falta atenderlas todas: elegí las que sí.</Body>
        <MultiChips
          label="Áreas de hoy"
          options={areas.map((a) => ({ value: a.id, label: a.name }))}
          values={chosen}
          onToggle={(id) => setDraft(toggleArea(d, id, taskArea, routineArea))}
        />
        {showErrors && errors.areas ? <Notice kind="error">{errors.areas}</Notice> : null}
        {d.areas.map((pa) => (
          <View key={pa.areaId} style={s.card}>
            <Text style={s.strong}>{areaName(pa.areaId)}</Text>
            <Chips<string>
              label={`Momento para ${areaName(pa.areaId)}`}
              options={MOMENTS.map((m) => ({ value: m.value, label: m.label }))}
              value={pa.moment ?? "none"}
              onChange={(v) => set({ areas: d.areas.map((x) => (x.areaId === pa.areaId ? { ...x, moment: v === "none" ? null : (v as Moment) } : x)) })}
            />
            <Field
              label={`Minutos para ${areaName(pa.areaId)} (opcional)`}
              value={pa.minutes}
              keyboardType="number-pad"
              onChangeText={(minutes) => set({ areas: d.areas.map((x) => (x.areaId === pa.areaId ? { ...x, minutes } : x)) })}
              error={showErrors ? errors.area[pa.areaId] : null}
            />
          </View>
        ))}
        <Field label="Tiempo disponible hoy, en minutos (opcional)" value={d.available} keyboardType="number-pad" onChangeText={(available) => set({ available })} error={showErrors ? errors.available : null} />
        {d.areas.length > 0 ? (
          <Body>
            Tiempo previsto: {time.planned} min{time.available !== null ? ` de ${time.available} disponibles` : ""}
            {time.unestimated > 0 ? ` (${time.unestimated} área${time.unestimated === 1 ? "" : "s"} sin estimar)` : ""}.
          </Body>
        ) : null}
        {time.over > 0 ? <Notice kind="info">Tu plan supera lo que tenés disponible por {time.over} min. Podés ajustarlo o seguir así: es tu decisión.</Notice> : null}

        {d.areas.length > 0 ? (
          <>
            <Text style={s.h}>Tareas para hoy</Text>
            {offered.length === 0 ? <Body>No hay tareas pendientes en estas áreas. Podés planificar sin tareas.</Body> : null}
            <MultiChips label="Tareas de hoy" options={offered.map((t) => ({ value: t.id, label: t.title }))} values={d.taskIds} onToggle={(id) => set({ taskIds: toggleId(d.taskIds, id) })} />
            {offeredRoutines.length > 0 ? (
              <>
                <Text style={s.h}>Rutinas para hoy</Text>
                <MultiChips label="Rutinas de hoy" options={offeredRoutines.map((t) => ({ value: t.id, label: t.name }))} values={d.routineIds} onToggle={(id) => set({ routineIds: toggleId(d.routineIds, id) })} />
              </>
            ) : null}
          </>
        ) : null}

        {actionError ? <Notice kind="error">{actionError}</Notice> : null}
        <Button
          label="Guardar mi día"
          busy={busy}
          disabled={closed}
          onPress={() => {
            setShowErrors(true);
            if (planHasErrors(errors)) return;
            void run(() => savePlan(today(), d).then(() => undefined), () => { setDraft(null); setShowErrors(false); setMode("view"); });
          }}
        />
        {plan ? <Button label="Cancelar los cambios" variant="ghost" onPress={() => { setDraft(null); setShowErrors(false); setMode("view"); }} /> : null}
      </Screen>
    );
  }

  // ---------------- Cierre del día ----------------
  if (mode === "close" && plan) {
    const pending = plan.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    return (
      <Screen>
        <Title>Cerrar el día</Title>
        <Body>Elegí qué querés pasar a mañana. Lo que no elijas queda como estaba: no se mueve nada solo.</Body>
        {pending.length === 0 ? <Body>No quedaron tareas del plan sin resolver.</Body> : null}
        <MultiChips label="Pasar a mañana" options={pending.map((t) => ({ value: t.id, label: t.title }))} values={carry} onToggle={(id) => setCarry(toggleId(carry, id))} />
        {actionError ? <Notice kind="error">{actionError}</Notice> : null}
        <Button label="Cerrar el día" busy={busy} onPress={() => void run(() => closeDay(today(), carry), () => { setCarry([]); setMode("view"); })} />
        <Button label="Volver sin cerrar" variant="ghost" onPress={() => setMode("view")} />
      </Screen>
    );
  }

  // ---------------- Ver el plan de hoy ----------------
  const p = plan!;
  const doneCount = p.tasks.filter((t) => t.status === "completed").length;
  const orderedAreas = [...p.areas].sort((a, b) => (MOMENT_ORDER[a.moment ?? ""] ?? 9) - (MOMENT_ORDER[b.moment ?? ""] ?? 9));
  const startOrContinue = async (t: { id: string }) => {
    const open = runs.find((r) => r.template_id === t.id);
    setBusy(true);
    setActionError(null);
    try {
      const id = open ? open.id : await startRun(t.id, "full", today());
      router.push({ pathname: "/ejecucion/[id]", params: { id } });
    } catch (e) {
      setActionError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Mi día</Title>
      {p.closed_at ? <Notice kind="info">Cerraste este día. Mañana empezás de nuevo, sin culpa.</Notice> : null}
      {p.available_minutes !== null ? <Text style={s.muted}>Tiempo disponible: {p.available_minutes} min</Text> : null}
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {orderedAreas.map((pa) => {
        const aTasks = p.tasks.filter((t) => t.area_id === pa.area_id);
        const aRoutines = p.routines.filter((r) => templates.find((t) => t.id === r.id)?.default_area_id === pa.area_id);
        return (
          <View key={pa.area_id} style={s.card}>
            <Text style={s.strong}>{areaName(pa.area_id)}</Text>
            <Text style={s.muted}>
              {pa.moment ? MOMENT_LABEL[pa.moment] : "Sin momento"}{pa.planned_minutes !== null ? ` · ${pa.planned_minutes} min` : ""}
            </Text>
            {aTasks.length === 0 && aRoutines.length === 0 ? <Text style={s.muted}>Sin tareas elegidas: atención libre.</Text> : null}
            {aTasks.map((t) => (
              <View key={t.id} style={s.row}>
                <Text style={[s.rowTitle, t.status === "completed" && s.done]}>{t.status === "completed" ? "✓ " : "• "}{t.title}</Text>
                {t.status === "completed" ? (
                  <Button label={`Deshacer ${t.title}`} variant="ghost" disabled={busy || !!p.closed_at} onPress={() => void run(() => undoCompleteTask(t.id))} />
                ) : (
                  <Button label={`Completar ${t.title}`} variant="ghost" disabled={busy} onPress={() => void run(() => completeTask(t.id))} />
                )}
              </View>
            ))}
            {aRoutines.map((r) => (
              <View key={r.id} style={s.row}>
                <Text style={s.rowTitle}>↻ {r.name}</Text>
                <Button label={`${runs.some((x) => x.template_id === r.id) ? "Continuar" : "Empezar"} ${r.name}`} variant="ghost" disabled={busy} onPress={() => void startOrContinue(r)} />
              </View>
            ))}
          </View>
        );
      })}
      {p.routines.filter((r) => !templates.find((t) => t.id === r.id)?.default_area_id).map((r) => (
        <View key={r.id} style={s.card}>
          <Text style={s.rowTitle}>↻ {r.name}</Text>
          <Button label={`${runs.some((x) => x.template_id === r.id) ? "Continuar" : "Empezar"} ${r.name}`} variant="ghost" disabled={busy} onPress={() => void startOrContinue(r)} />
        </View>
      ))}
      <Body>{doneCount} de {p.tasks.length} tareas del plan resueltas.</Body>
      {!p.closed_at ? (
        <>
          <Button label="Editar mi plan" variant="ghost" disabled={busy} onPress={() => { setDraft(draftFromPlan(p)); setMode("edit"); }} />
          <Button label="Cerrar el día" disabled={busy} onPress={() => setMode("close")} />
        </>
      ) : null}
    </Screen>
  );
}

function draftFromPlan(p: Plan): PlanDraft {
  return {
    available: p.available_minutes === null ? "" : String(p.available_minutes),
    areas: p.areas.map((a) => ({ areaId: a.area_id, moment: a.moment, minutes: a.planned_minutes === null ? "" : String(a.planned_minutes) })),
    taskIds: p.tasks.map((t) => t.id),
    routineIds: p.routines.map((r) => r.id),
  };
}

const s = StyleSheet.create({
  h: { fontSize: 18, fontWeight: "800", color: palette.text, marginTop: 8 },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 8 },
  strong: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  row: { gap: 6 },
  rowTitle: { fontSize: 16, color: palette.text },
  done: { color: palette.textMuted, textDecorationLine: "line-through" },
});
