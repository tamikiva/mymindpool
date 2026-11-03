import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Notice, Screen, Title } from "@/components/ui";
import { fetchAreas, type Area } from "@/data/areas";
import { fetchOpenRuns, fetchTemplates, startRun, type Run, type Template } from "@/data/routines";
import { hasShortVersion, runProgress } from "@/domain/routines";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");

export default function Rutinas() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, r, a] = await Promise.all([fetchTemplates(), fetchOpenRuns(), fetchAreas()]);
      setTemplates(t);
      setRuns(r);
      setAreas(a);
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
  if (!templates) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  const areaName = (id: string | null) => areas.find((a) => a.id === id)?.name ?? "";
  const start = async (t: Template, version: "full" | "short") => {
    setBusy(true);
    setActionError(null);
    try {
      const id = await startRun(t.id, version, today());
      router.push({ pathname: "/ejecucion/[id]", params: { id } });
    } catch (e) {
      setActionError(dataErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Rutinas</Title>
      <Body>Una rutina es una secuencia corta y reutilizable. Empieza siempre por la misma acción, y la ves de a un paso.</Body>
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}

      {runs.length > 0 ? <Text style={s.h}>En curso</Text> : null}
      {runs.map((r) => {
        const p = runProgress(r.steps);
        return (
          <View key={r.id} style={s.card}>
            <Text style={s.strong}>{r.template_name}</Text>
            <Text style={s.muted}>
              {r.status === "paused" ? "En pausa · " : ""}{p.done + p.skipped} de {p.total} pasos resueltos
              {r.version === "short" ? " · versión corta" : ""}
            </Text>
            <Button label={`Continuar ${r.template_name}`} onPress={() => router.push({ pathname: "/ejecucion/[id]", params: { id: r.id } })} />
          </View>
        );
      })}

      <Text style={s.h}>Mis rutinas</Text>
      {templates.length === 0 ? <Body>Todavía no tenés rutinas. Creá una o empezá desde una sugerida.</Body> : null}
      {templates.map((t) => {
        const open = runs.find((r) => r.template_id === t.id);
        const short = hasShortVersion(t.steps.map((x) => ({ inShort: x.in_short })));
        return (
          <View key={t.id} style={s.card}>
            <Text style={s.strong}>{t.name}</Text>
            <Text style={s.muted}>
              {t.steps.length} paso{t.steps.length === 1 ? "" : "s"}{t.default_area_id ? ` · ${areaName(t.default_area_id)}` : ""}
            </Text>
            {t.start_cue ? <Text style={s.muted}>Señal: {t.start_cue}</Text> : null}
            {open ? (
              <Body>Ya está en curso: seguila desde «En curso».</Body>
            ) : (
              <>
                <Button label={`Empezar ${t.name}`} busy={busy} onPress={() => void start(t, "full")} />
                {short ? <Button label={`Empezar versión corta de ${t.name}`} variant="ghost" disabled={busy} onPress={() => void start(t, "short")} /> : null}
              </>
            )}
            <Link href={{ pathname: "/rutina/[id]", params: { id: t.id } }} accessibilityLabel={`Editar ${t.name}`} style={s.link}>Editar</Link>
          </View>
        );
      })}
      <Button label="Nueva rutina" variant="ghost" onPress={() => router.push({ pathname: "/rutina/[id]", params: { id: "nueva" } })} />
    </Screen>
  );
}

const s = StyleSheet.create({
  h: { fontSize: 18, fontWeight: "800", color: palette.text, marginTop: 8 },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 8 },
  strong: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  link: { color: palette.primary, fontSize: 16, paddingVertical: 6 },
});
