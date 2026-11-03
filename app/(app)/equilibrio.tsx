import { Link, Redirect, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { completeTask, createTask, fetchOpenTasks, toLoadTask, undoCompleteTask, type Task } from "@/data/tasks";
import { useAuth } from "@/features/auth/AuthProvider";
import { fetchAreas, fetchProfile, type Area, type Profile } from "@/data/areas";
import { getSupabase } from "@/data/supabase";
import { computeBrain, isAllClear } from "@/domain/load";
import { Brain, type BrainArea } from "@/features/brain/Brain";
import { authErrorMessage } from "@/features/auth/messages";
import { areaColors, palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD local

export default function Equilibrio() {
  const [data, setData] = useState<{ profile: Profile; areas: Area[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Task | null>(null);
  const { session } = useAuth();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profile, areas, open] = await Promise.all([fetchProfile(), fetchAreas(), fetchOpenTasks()]);
      setData({ profile, areas });
      setTasks(open);
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

  const loads = computeBrain(data.areas, tasks.map(toLoadTask), today());
  const brainAreas: BrainArea[] = data.areas.map((a, i) => {
    const c = areaColors.find((x) => x.key === a.color_key) ?? areaColors[i % areaColors.length];
    return { id: a.id, name: a.name, fill: c.fill, deep: c.deep, level: loads[i].level };
  });
  const name = data.profile.display_name;
  const area = data.areas.find((a) => a.id === selected) ?? null;
  const areaTasks = area ? tasks.filter((t) => t.area_id === area.id) : [];

  // Una escritura que falla no se anuncia como hecha: se avisa y se conserva lo escrito.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      setTasks(await fetchOpenTasks());
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

  return (
    <Screen>
      <Title>{name ? `Hola, ${name}` : "Tu equilibrio"}</Title>
      <View style={s.brain}>
        <Brain areas={brainAreas} selectedId={selected} onSelect={setSelected} reduceMotion={data.profile.reduce_motion || undefined} />
      </View>
      {isAllClear(loads) ? <Body>Todo despejado. No hace falta resolver nada hoy.</Body> : null}
      {data.areas.map((a, i) => (
        <View key={a.id} style={[s.item, a.id === selected && s.itemOn]}>
          <Text style={s.itemName}>{a.name}</Text>
          <Text style={s.muted}>{loads[i].pending} de {a.capacity} puntos pendientes</Text>
        </View>
      ))}
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {justDone ? (
        <Notice kind="info">
          Completaste «{justDone.title}».
        </Notice>
      ) : null}
      {justDone ? <Button label="Deshacer" variant="ghost" busy={busy} onPress={undo} /> : null}
      {area ? (
        <View style={s.item}>
          <Text style={s.itemName}>{area.name}</Text>
          <Link href={{ pathname: "/area/[id]", params: { id: area.id } }} accessibilityLabel={`Abrir el área ${area.name}`} style={{ color: palette.primary, fontSize: 16, paddingVertical: 6 }}>
            Abrir área
          </Link>
          {areaTasks.length === 0 ? <Text style={s.muted}>No hay pendientes en esta área.</Text> : null}
          {areaTasks.map((t) => (
            <View key={t.id} style={s.taskRow}>
              <Text style={[s.itemName, { flex: 1, fontWeight: "400" }]}>{t.title} · {t.weight} pt</Text>
              <Button label={`Completar ${t.title}`} variant="ghost" disabled={busy} onPress={() => done(t)} />
            </View>
          ))}
          <Field label="Nueva tarea" value={draft} onChangeText={setDraft} maxLength={200} onSubmitEditing={add} returnKeyType="done" />
          <Button label="Agregar" busy={busy} disabled={!draft.trim()} onPress={add} />
        </View>
      ) : (
        <Body>Tocá una pileta para ver y agregar sus tareas.</Body>
      )}
      <Button label="Cerrar sesión" variant="ghost" onPress={() => void getSupabase().auth.signOut()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  brain: { width: "100%", aspectRatio: 400 / 320 },
  item: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff" },
  itemOn: { borderColor: palette.primary, borderWidth: 2 },
  itemName: { fontSize: 16, fontWeight: "700", color: palette.text },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { color: palette.textMuted, fontSize: 14 },
});
