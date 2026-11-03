import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips } from "@/components/Chips";
import { fetchAreas, type Area } from "@/data/areas";
import { deleteTask, fetchTask, updateTask, type Task } from "@/data/tasks";
import type { TaskWeight } from "@/domain/load";
import { addDays, isValidDate } from "@/domain/taskFilters";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");

const WEIGHTS: { value: TaskWeight; label: string }[] = [
  { value: 1, label: "Pequeña (1)" },
  { value: 2, label: "Mediana (2)" },
  { value: 3, label: "Grande (3)" },
];
const PRIORITIES: { value: Task["priority"]; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Importante" },
  { value: "urgent", label: "Urgente" },
];

export default function EditarTarea() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [areaId, setAreaId] = useState("");
  const [weight, setWeight] = useState<TaskWeight>(1);
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [date, setDate] = useState("");
  const [someday, setSomeday] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, a] = await Promise.all([fetchTask(String(id)), fetchAreas()]);
      setAreas(a);
      setTask(t);
      if (t) {
        setTitle(t.title);
        setNote(t.note ?? "");
        setAreaId(t.area_id);
        setWeight(t.weight);
        setPriority(t.priority);
        setDate(t.scheduled_date ?? "");
        setSomeday(t.someday);
      }
    } catch (e) {
      setError(dataErrorMessage(e));
    }
  }, [id]);
  // Con pestañas las pantallas siguen montadas: se recarga cada vez que vuelven a estar en foco.
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
  if (task === undefined) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  if (task === null) {
    return (
      <Center>
        <Body>Esta tarea ya no existe.</Body>
        <Button label="Volver a Tareas" onPress={() => router.replace("/tareas")} />
      </Center>
    );
  }

  const dateError = date.trim() && !isValidDate(date.trim()) ? "Usá el formato AAAA-MM-DD, por ejemplo 2026-11-20." : null;
  const titleError = title.trim() ? null : "Poné un título.";

  // Si falla, se queda en la pantalla con lo escrito y un mensaje; no se anuncia como guardado.
  const run = async (fn: () => Promise<void>, then: () => void) => {
    setBusy(true);
    setSaveError(null);
    try {
      await fn();
      then();
    } catch (e) {
      setSaveError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const back = () => router.replace("/tareas");
  const save = () =>
    void run(
      () =>
        updateTask(task.id, {
          title: title.trim(),
          note: note.trim() || null,
          area_id: areaId,
          weight,
          priority,
          scheduled_date: date.trim() || null,
          someday,
        }),
      back,
    );

  return (
    <Screen>
      <Title>Editar tarea</Title>
      {task.status === "completed" ? <Notice kind="info">Esta tarea está completada. Podés deshacerlo desde la lista de Completadas.</Notice> : null}
      {task.status === "cancelled" ? <Notice kind="info">Esta tarea está cancelada y no cuenta para el agua.</Notice> : null}
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={200} error={titleError} />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} maxLength={2000} multiline />
      <Body>Área</Body>
      <Chips label="Área" options={areas.map((a) => ({ value: a.id, label: a.name }))} value={areaId} onChange={setAreaId} />
      <Body>Tamaño</Body>
      <Chips label="Tamaño" options={WEIGHTS} value={weight} onChange={setWeight} />
      <Body>Prioridad</Body>
      <Chips label="Prioridad" options={PRIORITIES} value={priority} onChange={setPriority} />
      <Field label="Fecha (AAAA-MM-DD, opcional)" value={date} onChangeText={setDate} autoCapitalize="none" error={dateError} />
      <Chips<string>
        label="Atajos de fecha"
        options={[
          { value: "none", label: "Sin fecha" },
          { value: "today", label: "Hoy" },
          { value: "tomorrow", label: "Mañana" },
        ]}
        value={date === "" ? "none" : date === today() ? "today" : date === addDays(today(), 1) ? "tomorrow" : ""}
        onChange={(v) => setDate(v === "none" ? "" : v === "today" ? today() : addDays(today(), 1))}
      />
      <Chips<string>
        label="Más adelante"
        options={[{ value: "off", label: "En mis pendientes" }, { value: "on", label: "Más adelante" }]}
        value={someday ? "on" : "off"}
        onChange={(v) => setSomeday(v === "on")}
      />
      {saveError ? <Notice kind="error">{saveError}</Notice> : null}
      <Button label="Guardar" busy={busy} disabled={!!dateError || !!titleError} onPress={save} />
      {task.status === "cancelled" ? (
        <Button label="Reabrir tarea" variant="ghost" disabled={busy} onPress={() => void run(() => updateTask(task.id, { status: "pending" }), back)} />
      ) : task.status !== "completed" ? (
        <Button label="Cancelar tarea" variant="ghost" disabled={busy} onPress={() => void run(() => updateTask(task.id, { status: "cancelled" }), back)} />
      ) : null}
      {confirmDelete ? (
        <>
          <Notice kind="error">Se elimina para siempre y no se puede deshacer. ¿Seguro?</Notice>
          <Button label="Sí, eliminar" busy={busy} onPress={() => void run(() => deleteTask(task.id), back)} />
          <Button label="No, conservar" variant="ghost" onPress={() => setConfirmDelete(false)} />
        </>
      ) : (
        <Button label="Eliminar" variant="ghost" disabled={busy} onPress={() => setConfirmDelete(true)} />
      )}
      <Button label="Volver sin guardar" variant="ghost" onPress={back} />
    </Screen>
  );
}
