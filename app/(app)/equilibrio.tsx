import { Link, Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { ChevronIcon, GearIcon, MarkIcon, PlusIcon, SproutIcon } from "@/components/icons";
import { fetchAreas, fetchProfile, type Area, type Profile } from "@/data/areas";
import { fetchPlan } from "@/data/dayplan";
import { fetchTodayOccurrenceLoad, syncOccurrences } from "@/data/recurring";
import { fetchOpenRuns, fetchRunStepLoad, type Run } from "@/data/routines";
import { getSupabase } from "@/data/supabase";
import { completeTask, createTask, fetchCompletedToday, fetchOpenTasks, toLoadTask, undoCompleteTask, type Task } from "@/data/tasks";
import { computeBrain, isAllClear, type LoadBand, type LoadTask } from "@/domain/load";
import { suggestNextStep, type StepTask } from "@/domain/nextStep";
import { useAuth } from "@/features/auth/AuthProvider";
import { authErrorMessage } from "@/features/auth/messages";
import type { BrainArea } from "@/features/brain/Brain";
import { Brain3D } from "@/features/brain3d/Brain3D";
import { BrainLegend } from "@/features/brain3d/BrainLegend";
import { areaColors, card, palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD local
const BAND: Record<LoadBand, string> = { low: "Carga baja", manageable: "Carga manejable", high: "Carga alta" };

export default function Equilibrio() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [data, setData] = useState<{ profile: Profile; areas: Area[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runSteps, setRunSteps] = useState<LoadTask[]>([]);
  const [occLoad, setOccLoad] = useState<LoadTask[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [plannedAreaIds, setPlannedAreaIds] = useState<string[]>([]);
  const [completedToday, setCompletedToday] = useState<Record<string, number>>({});
  /** undefined = todavía no eligió: se muestra el área sugerida. */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Task | null>(null);
  const { session } = useAuth();

  const load = useCallback(async () => {
    setError(null);
    try {
      await syncOccurrences(today());
      const [profile, areas, open, steps, openRuns, occ, done, plan] = await Promise.all([
        fetchProfile(), fetchAreas(), fetchOpenTasks(), fetchRunStepLoad(), fetchOpenRuns(), fetchTodayOccurrenceLoad(today()),
        fetchCompletedToday().catch(() => ({}) as Record<string, number>),
        fetchPlan(today()).catch(() => null),
      ]);
      setData({ profile, areas });
      setTasks(open);
      setRunSteps(steps);
      setRuns(openRuns);
      setOccLoad(occ);
      setCompletedToday(done);
      setPlannedAreaIds(plan ? plan.areas.map((a) => a.area_id) : []);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }, []);
  // Con pestañas las pantallas siguen montadas: se recarga cada vez que vuelven a estar en foco.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loads = useMemo(
    () => (data ? computeBrain(data.areas, [...tasks.map(toLoadTask), ...runSteps, ...occLoad], today()) : []),
    [data, tasks, runSteps, occLoad],
  );
  const suggestion = useMemo(() => {
    if (!data) return null;
    const stepTasks: StepTask[] = tasks.map((t) => ({
      id: t.id, areaId: t.area_id, title: t.title, status: t.status, weight: t.weight, priority: t.priority,
      scheduledDate: t.scheduled_date, someday: t.someday, estimateMinutes: t.estimate_minutes ?? null,
    }));
    return suggestNextStep({ today: today(), areas: data.areas, loads, tasks: stepTasks, plannedAreaIds, completedToday });
  }, [data, loads, tasks, plannedAreaIds, completedToday]);
  // El cerebro recibe un arreglo estable: así la escena 3D no se actualiza en cada render.
  const brainAreas = useMemo<BrainArea[]>(
    () =>
      data
        ? data.areas.map((a, i) => {
            const c = areaColors.find((x) => x.key === a.color_key) ?? areaColors[i % areaColors.length];
            return { id: a.id, name: a.name, fill: c.fill, deep: c.deep, level: loads[i]?.level ?? 0 };
          })
        : [],
    [data, loads],
  );

  if (error) {
    return (
      <Center>
        <Notice kind="error">{error}</Notice>
        <Button label="Reintentar" onPress={load} />
      </Center>
    );
  }
  if (!data) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  if (!data.profile.onboarding_completed_at) return <Redirect href="/onboarding" />;

  const selectedId = picked === undefined ? (suggestion?.areaId ?? null) : picked;
  const area = data.areas.find((a) => a.id === selectedId) ?? null;
  const areaIdx = area ? data.areas.indexOf(area) : -1;
  const areaColor = area ? (areaColors.find((x) => x.key === area.color_key) ?? areaColors[areaIdx % areaColors.length]) : null;
  // Tarea chica primero: la lista invita a elegir un paso pequeño.
  const areaTasks = area ? [...tasks.filter((t) => t.area_id === area.id)].sort((a, b) => a.weight - b.weight || (a.estimate_minutes ?? 1e9) - (b.estimate_minutes ?? 1e9)) : [];

  // Una escritura que falla no se anuncia como hecha: se avisa y se conserva lo escrito.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setActionError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    if (!area || !session || !draft.trim()) return;
    void run(async () => {
      await createTask(session.user.id, { areaId: area.id, title: draft });
      setDraft("");
      setAdding(false);
    });
  };
  const done = (t: Task) =>
    void run(async () => {
      await completeTask(t.id);
      setJustDone(t);
    });
  const undo = () => {
    const t = justDone;
    if (!t) return;
    void run(async () => {
      await undoCompleteTask(t.id);
      setJustDone(null);
    });
  };

  const main = (
    <View style={wide ? s.colMain : undefined}>
      <Title>{wide ? "¿Dónde necesita atención tu día?" : "Un paso a la vez"}</Title>
      {wide ? <Text style={s.lead}>Mirá el conjunto. Elegí un paso.</Text> : null}
      <Brain3D areas={brainAreas} selectedId={selectedId} onSelect={setPicked} reduceMotion={data.profile.reduce_motion || undefined} />
      <BrainLegend items={brainAreas} selectedId={selectedId} onSelect={setPicked} />
    </View>
  );

  const side = (
    <View style={[s.side, wide && s.colSide]}>
      {runs.map((r) => (
        <View key={r.id} style={[s.card, s.rowBetween]}>
          <Text style={s.strong}>{r.template_name} {r.status === "paused" ? "(en pausa)" : "en curso"}</Text>
          <Button label={`Continuar ${r.template_name}`} variant="ghost" onPress={() => router.push({ pathname: "/ejecucion/[id]", params: { id: r.id } })} />
        </View>
      ))}

      {isAllClear(loads) ? (
        <View style={[s.suggest, { backgroundColor: "#EEF7F2" }]}>
          <View style={s.suggestIcon}><SproutIcon /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>No hace falta resolver todo hoy.</Text>
            <Text style={s.lead}>Un pequeño paso también cuenta. Todo está despejado: descansá.</Text>
          </View>
        </View>
      ) : suggestion && !dismissed ? (
        <View style={s.suggest}>
          <Pressable
            role="button"
            accessibilityLabel={`${suggestion.headline} ${suggestion.reason}`}
            onPress={() => setPicked(suggestion.areaId)}
            style={s.suggestMain}
          >
            <View style={s.suggestIcon}><SproutIcon /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{suggestion.headline}</Text>
              <Text style={[s.lead, { color: "#2C6B52" }]}>{suggestion.reason}</Text>
            </View>
            <ChevronIcon color="#2C6B52" />
          </Pressable>
          <Pressable role="button" accessibilityLabel="Ahora no" onPress={() => setDismissed(true)} style={s.dismiss}>
            <Text style={s.dismissText}>Ahora no</Text>
          </Pressable>
        </View>
      ) : null}

      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {justDone ? <Notice kind="info">Completaste «{justDone.title}».</Notice> : null}
      {justDone ? <Button label="Deshacer" variant="ghost" busy={busy} onPress={undo} /> : null}

      {area && areaColor ? (
        <View style={s.card}>
          <View style={s.areaHead}>
            <View style={[s.areaDot, { backgroundColor: areaColor.fill }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.areaName}>{area.name}</Text>
              <Text style={s.lead}>{areaTasks.length > 0 ? "Elegí una tarea pequeña" : "No hay pendientes en esta área."}</Text>
            </View>
            <Link href={{ pathname: "/area/[id]", params: { id: area.id } }} accessibilityLabel={`Abrir el área ${area.name}`} style={s.link}>
              Abrir área
            </Link>
          </View>
          {areaTasks.map((t) => (
            <View key={t.id} style={s.taskRow}>
              <Pressable role="button" accessibilityLabel={`Completar ${t.title}`} disabled={busy} onPress={() => done(t)} style={s.check}>
                <View style={s.checkCircle} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{t.title}</Text>
                <Text style={s.muted}>{t.estimate_minutes ? `${t.estimate_minutes} min` : `${t.weight} pt`}</Text>
              </View>
              <Pressable role="link" accessibilityLabel={`Editar ${t.title}`} onPress={() => router.push({ pathname: "/tarea/[id]", params: { id: t.id } })} style={s.check}>
                <ChevronIcon />
              </Pressable>
            </View>
          ))}
          {adding ? (
            <View style={{ gap: 8 }}>
              <Field label="Nueva tarea" value={draft} onChangeText={setDraft} maxLength={200} onSubmitEditing={add} returnKeyType="done" />
              <Button label="Agregar" busy={busy} disabled={!draft.trim()} onPress={add} />
              <Button label="Cancelar" variant="ghost" onPress={() => { setAdding(false); setDraft(""); }} />
            </View>
          ) : (
            <Pressable role="button" accessibilityLabel="Agregar tarea" onPress={() => setAdding(true)} style={s.addBtn}>
              <PlusIcon />
              <Text style={s.addText}>Agregar tarea</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Body>Elegí un área en el cerebro o en la leyenda para ver y agregar sus tareas.</Body>
      )}

      <View style={s.card}>
        <Text style={s.strong}>Carga por área</Text>
        {data.areas.map((a, i) => (
          <View key={a.id} style={s.loadRow}>
            <View style={s.rowBetween}>
              <Text style={s.taskTitle}>{a.name}</Text>
              <Text style={s.muted}>{loads[i].pending} de {a.capacity} puntos pendientes</Text>
            </View>
            <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[s.barFill, { width: `${Math.round(loads[i].level * 100)}%`, backgroundColor: brainAreas[i]?.fill }]} />
            </View>
            <Text style={s.muted}>
              {BAND[loads[i].band]}{loads[i].excess > 0 ? ` · ${loads[i].excess} puntos por encima de tu referencia` : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Screen wide={wide} top>
      <View style={s.header}>
        <View style={s.brand}>
          <MarkIcon />
          <Text style={s.brandText}>My MindPool</Text>
        </View>
        <Pressable role="button" accessibilityLabel="Ajustes" aria-expanded={menu} onPress={() => setMenu((v) => !v)} style={s.gear}>
          <GearIcon />
        </Pressable>
      </View>
      {menu ? (
        <View style={s.card}>
          <Button label="Cerrar sesión" variant="ghost" onPress={() => void getSupabase().auth.signOut()} />
        </View>
      ) : null}
      {wide ? <View style={s.cols}>{main}{side}</View> : <>{main}{side}</>}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { fontSize: 26, fontWeight: "800", color: palette.text },
  gear: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  cols: { flexDirection: "row", gap: 28, alignItems: "flex-start" },
  colMain: { flex: 1.5, gap: 14 },
  colSide: { flex: 1, minWidth: 340, maxWidth: 440 },
  side: { gap: 14 },
  lead: { fontSize: 16, lineHeight: 22, color: palette.textMuted },
  card: { ...card, padding: 16, gap: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  strong: { fontSize: 17, fontWeight: "800", color: palette.text },
  suggest: { backgroundColor: "#E8F6EE", borderRadius: 22, padding: 6 },
  suggestMain: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, minHeight: 64 },
  suggestIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#D8EFE3", alignItems: "center", justifyContent: "center" },
  dismiss: { alignSelf: "flex-end", minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  dismissText: { color: "#2C6B52", fontSize: 14, fontWeight: "700" },
  areaHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  areaDot: { width: 44, height: 44, borderRadius: 22 },
  areaName: { fontSize: 24, fontWeight: "800", color: palette.text },
  link: { color: palette.primary, fontSize: 15, fontWeight: "700", paddingVertical: 8 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: palette.border, borderRadius: 18, paddingVertical: 4, paddingLeft: 4, paddingRight: 8, backgroundColor: "#FFFDFB" },
  check: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  checkCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#B8AFC6" },
  taskTitle: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  addBtn: { minHeight: 52, borderRadius: 26, backgroundColor: palette.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  loadRow: { gap: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: "#F0E9F4", overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
});
