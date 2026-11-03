import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Notice, Screen, Title } from "@/components/ui";
import { fetchAreas, type Area } from "@/data/areas";
import { advanceStep, fetchRun, setRunState, type Run } from "@/data/routines";
import { currentStep, runProgress } from "@/domain/routines";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const MARK = { done: "✓ Hecho", skipped: "↷ Saltado", pending: "• Pendiente", cancelled: "✕ Cancelado" } as const;

export default function Ejecucion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<Run | null | undefined>(undefined);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, a] = await Promise.all([fetchRun(String(id)), fetchAreas()]);
      setRun(r);
      setAreas(a);
    } catch (e) {
      setError(dataErrorMessage(e));
    }
  }, [id]);
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
  if (run === undefined) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  if (run === null) {
    return (
      <Center>
        <Body>Esta rutina ya no está disponible.</Body>
        <Button label="Volver a Rutinas" onPress={() => router.replace("/rutinas")} />
      </Center>
    );
  }

  const areaName = (aid: string) => areas.find((a) => a.id === aid)?.name ?? "";
  const progress = runProgress(run.steps);
  const current = currentStep(run.steps);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setActionError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const home = () => router.replace("/equilibrio");

  if (run.status === "completed") {
    return (
      <Screen>
        <Title>Terminaste «{run.template_name}»</Title>
        <Body>
          {progress.done} paso{progress.done === 1 ? "" : "s"} hecho{progress.done === 1 ? "" : "s"}
          {progress.skipped ? `, ${progress.skipped} saltado${progress.skipped === 1 ? "" : "s"}` : ""}. Eso también es atención.
        </Body>
        <Button label="Volver a mi equilibrio" onPress={home} />
        <Button label="Ir a Rutinas" variant="ghost" onPress={() => router.replace("/rutinas")} />
      </Screen>
    );
  }
  if (run.status === "cancelled") {
    return (
      <Screen>
        <Title>Cancelaste «{run.template_name}»</Title>
        <Body>Los pasos pendientes ya no suman a tu carga. Lo que habías hecho se conserva.</Body>
        <Button label="Volver a mi equilibrio" onPress={home} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{run.template_name}</Title>
      <Text style={s.muted}>
        {run.version === "short" ? "Versión corta · " : ""}
        {progress.done + progress.skipped} de {progress.total} pasos resueltos
      </Text>
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}

      {run.status === "paused" ? (
        <>
          <Notice kind="info">La rutina está en pausa. Cuando quieras, la retomás justo donde quedó.</Notice>
          <Button label="Retomar" busy={busy} onPress={() => void act(() => setRunState(run.id, "resume"))} />
        </>
      ) : current ? (
        <View style={s.current} accessibilityLiveRegion="polite">
          <Text style={s.muted}>Paso actual · {areaName(current.area_id)}</Text>
          <Text style={s.big}>{current.title}</Text>
          <Button label="Listo" busy={busy} onPress={() => void act(() => advanceStep(current.id, "complete"))} />
          <Button label="Saltar este paso" variant="ghost" disabled={busy} onPress={() => void act(() => advanceStep(current.id, "skip"))} />
          <Button label="Pausar" variant="ghost" disabled={busy} onPress={() => void act(() => setRunState(run.id, "pause"))} />
        </View>
      ) : null}

      <Button label={showAll ? "Ocultar la secuencia completa" : "Ver la secuencia completa"} variant="ghost" onPress={() => setShowAll((v) => !v)} />
      {showAll
        ? run.steps.map((st) => (
            <View key={st.id} style={s.row}>
              <Text style={s.rowTitle}>{st.position + 1}. {st.title}</Text>
              <Text style={s.muted}>{MARK[st.status]} · {areaName(st.area_id)} · {st.weight} pt</Text>
            </View>
          ))
        : null}

      {confirmCancel ? (
        <>
          <Notice kind="info">Cancelar libera los pasos pendientes de tu carga. Lo hecho se conserva.</Notice>
          <Button label="Sí, cancelar la rutina" busy={busy} onPress={() => void act(() => setRunState(run.id, "cancel"))} />
          <Button label="No, seguir" variant="ghost" onPress={() => setConfirmCancel(false)} />
        </>
      ) : (
        <Button label="Cancelar la rutina" variant="ghost" disabled={busy} onPress={() => setConfirmCancel(true)} />
      )}
      <Button label="Volver" variant="ghost" onPress={() => router.replace("/rutinas")} />
    </Screen>
  );
}

const s = StyleSheet.create({
  current: { padding: 16, borderRadius: 18, borderWidth: 2, borderColor: palette.primary, backgroundColor: "#fff", gap: 10 },
  big: { fontSize: 22, fontWeight: "800", color: palette.text, lineHeight: 30 },
  muted: { color: palette.textMuted, fontSize: 14 },
  row: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 2 },
  rowTitle: { fontSize: 16, color: palette.text },
});
