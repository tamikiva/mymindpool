import { Link, router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips } from "@/components/Chips";
import { fetchAreas, updateArea, type Area } from "@/data/areas";
import { fetchTodayOccurrenceLoad, syncOccurrences } from "@/data/recurring";
import { fetchRunStepLoad } from "@/data/routines";
import { completeTask, createTask, fetchOpenTasks, moveOpenTasks, type Task, toLoadTask } from "@/data/tasks";
import { computeAreaLoad, type LoadBand, type LoadTask } from "@/domain/load";
import { useAuth } from "@/features/auth/AuthProvider";
import { dataErrorMessage } from "@/features/auth/messages";
import { areaColors, palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");
const BAND: Record<LoadBand, string> = { low: "Carga baja", manageable: "Carga manejable", high: "Carga alta" };

export default function AreaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runSteps, setRunSteps] = useState<LoadTask[]>([]);
  const [occLoad, setOccLoad] = useState<LoadTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [archiving, setArchiving] = useState(false);
  const [dest, setDest] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await syncOccurrences(today());
      const [a, t, steps, occ] = await Promise.all([fetchAreas(), fetchOpenTasks(), fetchRunStepLoad(), fetchTodayOccurrenceLoad(today())]);
      setAreas(a);
      setTasks(t);
      setRunSteps(steps);
      setOccLoad(occ);
      const me = a.find((x) => x.id === id);
      if (me) {
        setName(me.name);
        setColor(me.color_key);
        setCapacity(String(me.capacity));
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
  if (!areas) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  const area = areas.find((a) => a.id === id);
  if (!area) {
    return (
      <Center>
        <Body>Esta área ya no está activa.</Body>
        <Button label="Volver a Equilibrio" onPress={() => router.replace("/equilibrio")} />
      </Center>
    );
  }

  const mine = tasks.filter((t) => t.area_id === area.id);
  const load_ = computeAreaLoad(area.id, area.capacity, [...tasks.map(toLoadTask), ...runSteps, ...occLoad], today());
  const routineSteps = runSteps.filter((r) => r.areaId === area.id).length;
  const repeatsToday = occLoad.filter((r) => r.areaId === area.id).length;
  const others = areas.filter((a) => a.id !== area.id);
  const cap = Number(capacity);
  const capError = Number.isInteger(cap) && cap >= 1 && cap <= 100 ? null : "Usá un número entero entre 1 y 100.";
  const nameError = name.trim() && name.trim().length <= 40 ? null : "El nombre debe tener entre 1 y 40 caracteres.";
  // Siempre quedan al menos 2 áreas activas (PRD §7).
  const canArchive = areas.length > 2;

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (e) {
      setActionError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{area.name}</Title>
      <View style={s.card}>
        <Text style={s.strong}>{BAND[load_.band]}</Text>
        <Text style={s.muted}>{load_.pending} de {area.capacity} puntos pendientes</Text>
        {load_.excess > 0 ? <Text style={s.muted}>{load_.excess} puntos por encima de tu referencia</Text> : null}
        {routineSteps > 0 ? <Text style={s.muted}>Incluye {routineSteps} paso{routineSteps === 1 ? "" : "s"} de rutinas en curso</Text> : null}
        {repeatsToday > 0 ? <Text style={s.muted}>Incluye {repeatsToday} tarea{repeatsToday === 1 ? "" : "s"} repetida{repeatsToday === 1 ? "" : "s"} de hoy</Text> : null}
        {load_.pending === 0 ? <Text style={s.muted}>Sin pendientes: esta área está despejada.</Text> : null}
        <Text style={s.muted}>Tiempo registrado: sin registro</Text>
      </View>

      {actionError ? <Notice kind="error">{actionError}</Notice> : null}

      <Text style={s.strong}>Pendientes</Text>
      {mine.length === 0 ? <Body>No hay pendientes en esta área.</Body> : null}
      {mine.map((t) => (
        <View key={t.id} style={s.card}>
          <Link href={{ pathname: "/tarea/[id]", params: { id: t.id } }} accessibilityLabel={`Editar ${t.title}`}>
            <Text style={s.strong}>{t.title} · {t.weight} pt</Text>
          </Link>
          <Button label={`Completar ${t.title}`} variant="ghost" disabled={busy} onPress={() => void run(() => completeTask(t.id))} />
        </View>
      ))}
      <Field label="Nueva tarea" value={draft} onChangeText={setDraft} maxLength={200} />
      <Button
        label="Agregar"
        busy={busy}
        disabled={!draft.trim() || !session}
        onPress={() => void run(async () => { await createTask(session!.user.id, { areaId: area.id, title: draft }); setDraft(""); })}
      />

      <Text style={s.strong}>Editar área</Text>
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={40} error={nameError} />
      <Chips label="Color" options={areaColors.map((c) => ({ value: c.key as string, label: c.key }))} value={color} onChange={setColor} />
      <Field label="Referencia de carga manejable (puntos)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" error={capError} />
      <Body>Es lo que vos considerás manejable; no crece sola al agregar tareas.</Body>
      <Button
        label="Guardar cambios"
        busy={busy}
        disabled={!!nameError || !!capError}
        onPress={() => void run(() => updateArea(area.id, { name: name.trim(), color_key: color, capacity: cap }))}
      />

      {archiving ? (
        <View style={s.card}>
          {mine.length > 0 ? (
            <>
              <Body>Tiene {mine.length} pendiente{mine.length === 1 ? "" : "s"}. Elegí a qué área pasarlos antes de archivar.</Body>
              <Chips<string | null> label="Área de destino" options={others.map((a) => ({ value: a.id, label: a.name }))} value={dest} onChange={setDest} />
            </>
          ) : (
            <Body>El historial se conserva. Podés dejar de ver esta área sin perder nada.</Body>
          )}
          <Button
            label="Archivar área"
            busy={busy}
            disabled={mine.length > 0 && !dest}
            onPress={() =>
              void run(
                async () => {
                  if (mine.length > 0 && dest) await moveOpenTasks(area.id, dest);
                  await updateArea(area.id, { archived_at: new Date().toISOString() });
                },
                () => router.replace("/equilibrio"),
              )
            }
          />
          <Button label="No archivar" variant="ghost" onPress={() => setArchiving(false)} />
        </View>
      ) : (
        <>
          <Button label="Archivar área" variant="ghost" disabled={!canArchive} onPress={() => setArchiving(true)} />
          {!canArchive ? <Body>Necesitás al menos 2 áreas activas, así que esta no se puede archivar.</Body> : null}
        </>
      )}
      <Button label="Volver a Equilibrio" variant="ghost" onPress={() => router.replace("/equilibrio")} />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 6 },
  strong: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
});
