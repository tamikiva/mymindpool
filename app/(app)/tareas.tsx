import { Link, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips } from "@/components/Chips";
import { fetchAreas, type Area } from "@/data/areas";
import { completeTask, createTask, fetchTasks, undoCompleteTask, type Task } from "@/data/tasks";
import { getSupabase } from "@/data/supabase";
import { filterTasks, type TaskView } from "@/domain/taskFilters";
import { useAuth } from "@/features/auth/AuthProvider";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "open", label: "Pendientes" },
  { value: "today", label: "Hoy" },
  { value: "overdue", label: "Vencidas" },
  { value: "upcoming", label: "Futuras" },
  { value: "someday", label: "Más adelante" },
  { value: "completed", label: "Completadas" },
];

const EMPTY: Record<TaskView, string> = {
  open: "No tenés tareas pendientes. Podés descansar o cargar una nueva.",
  today: "No hay tareas para hoy.",
  overdue: "No tenés tareas vencidas.",
  upcoming: "No hay tareas futuras cargadas.",
  someday: "Nada en «Más adelante».",
  completed: "Todavía no completaste tareas.",
};

export default function Tareas() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>("open");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, a] = await Promise.all([fetchTasks(), fetchAreas()]);
      setTasks(t);
      setAreas(a);
    } catch (e) {
      setError(dataErrorMessage(e));
    }
  }, []);
  // Con pestañas las pantallas siguen montadas: se recarga cada vez que vuelven a estar en foco.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(
    () =>
      tasks
        ? filterTasks(
            tasks.map((t) => ({ ...t, areaId: t.area_id, scheduledDate: t.scheduled_date })),
            { view, areaId, search },
            today(),
          )
        : [],
    [tasks, view, areaId, search],
  );
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? "";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      setTasks(await fetchTasks());
    } catch (e) {
      setActionError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  // La entrada rápida necesita un área: la elegida en el filtro o la primera.
  const target = areaId ?? areas[0]?.id ?? null;
  const add = () => {
    if (!target || !session || !draft.trim()) return;
    void run(async () => {
      await createTask(session.user.id, { areaId: target, title: draft, scheduledDate: view === "today" ? today() : null });
      setDraft("");
    });
  };

  if (error) {
    return (
      <Center>
        <Notice kind="error">{error}</Notice>
        <Button label="Reintentar" onPress={load} />
      </Center>
    );
  }
  if (!tasks) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  return (
    <Screen>
      <Title>Tareas</Title>
      <Chips label="Vista" options={VIEWS} value={view} onChange={setView} />
      <Chips<string | null>
        label="Área"
        options={[{ value: null, label: "Todas las áreas" }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
        value={areaId}
        onChange={setAreaId}
      />
      <Field label="Buscar" value={search} onChangeText={setSearch} autoCapitalize="none" />

      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {justDone ? (
        <>
          <Notice kind="info">Completaste «{justDone.title}».</Notice>
          <Button
            label="Deshacer"
            variant="ghost"
            busy={busy}
            onPress={() => void run(async () => { await undoCompleteTask(justDone.id); setJustDone(null); })}
          />
        </>
      ) : null}

      {visible.length === 0 ? <Body>{search.trim() ? "No encontramos tareas con esa búsqueda." : EMPTY[view]}</Body> : null}
      {visible.map((t) => (
        <View key={t.id} style={s.row}>
          <Link href={{ pathname: "/tarea/[id]", params: { id: t.id } }} style={s.main} accessibilityLabel={`Editar ${t.title}`}>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.muted}>
              {"\n"}{areaName(t.area_id)} · {t.weight} pt{t.scheduled_date ? ` · ${t.scheduled_date}` : ""}
              {t.priority !== "normal" ? ` · ${t.priority === "urgent" ? "urgente" : "importante"}` : ""}
            </Text>
          </Link>
          {t.status === "completed" ? (
            <Button label={`Deshacer ${t.title}`} variant="ghost" disabled={busy} onPress={() => void run(() => undoCompleteTask(t.id))} />
          ) : (
            <Button
              label={`Completar ${t.title}`}
              variant="ghost"
              disabled={busy}
              onPress={() => void run(async () => { await completeTask(t.id); setJustDone(t); })}
            />
          )}
        </View>
      ))}

      <View style={s.add}>
        <Field
          label={`Nueva tarea en ${areaName(target ?? "") || "tu primera área"}`}
          value={draft}
          onChangeText={setDraft}
          maxLength={200}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Button label="Agregar" busy={busy} disabled={!draft.trim() || !target} onPress={add} />
      </View>
      <Button label="Cerrar sesión" variant="ghost" onPress={() => void getSupabase().auth.signOut()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 8 },
  main: { paddingVertical: 4 },
  title: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  add: { gap: 8, marginTop: 8 },
});
