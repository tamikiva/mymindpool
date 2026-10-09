import { Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { completeOnboarding } from "@/data/areas";
import { useAuth } from "@/features/auth/AuthProvider";
import { authErrorMessage } from "@/features/auth/messages";
import { clearDraft, defaultDraft, loadDraft, saveDraft, validateAreas, type Draft } from "@/features/onboarding/draft";
import { areaColors, palette } from "@/theme/tokens";

export default function Onboarding() {
  const { session, loading } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    loadDraft().then(setDraft);
  }, []);
  useEffect(() => {
    if (draft) void saveDraft(draft);
  }, [draft]);

  if (!loading && !session) return <Redirect href="/bienvenida" />;
  if (!draft) return null;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setArea = (i: number, patch: Partial<Draft["areas"][number]>) =>
    set({ areas: draft.areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= draft.areas.length) return;
    const next = [...draft.areas];
    [next[i], next[j]] = [next[j], next[i]];
    set({ areas: next });
  };
  const nextColor = () => {
    const used = new Set(draft.areas.map((a) => a.color_key));
    return (areaColors.find((c) => !used.has(c.key)) ?? areaColors[0]).key;
  };
  const problem = validateAreas(draft.areas);

  async function submit() {
    if (!draft || submitting.current) return; // evita doble envío
    if (problem) return setError(problem);
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(draft.displayName, draft.areas.map((a) => ({ ...a, name: a.name.trim() })));
      await clearDraft();
      router.replace("/");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Armemos tus piletas</Title>
      <Body>Cada pileta es un área de tu vida. Podés cambiar nombres, colores y orden cuando quieras.</Body>
      <Field label="¿Cómo te decimos? (opcional)" value={draft.displayName} maxLength={60} onChangeText={(t) => set({ displayName: t })} />
      {draft.areas.map((a, i) => {
        const color = areaColors.find((c) => c.key === a.color_key) ?? areaColors[0];
        return (
          <View key={i} style={[s.card, { borderLeftColor: color.fill }]}>
            <Field label={`Área ${i + 1}`} value={a.name} maxLength={40} onChangeText={(t) => setArea(i, { name: t })} />
            <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel={`Color de ${a.name || `área ${i + 1}`}`}>
              {areaColors.map((c) => (
                <Pressable
                  key={c.key}
                  accessibilityRole="radio"
                  accessibilityLabel={c.key}
                  accessibilityState={{ checked: c.key === a.color_key }}
                  onPress={() => setArea(i, { color_key: c.key })}
                  style={[s.swatch, { backgroundColor: c.fill }, c.key === a.color_key && s.swatchOn]}
                >
                  {c.key === a.color_key ? <Text style={{ color: c.deep, fontWeight: "800" }}>✓</Text> : null}
                </Pressable>
              ))}
            </View>
            <View style={s.row}>
              <Button label="Subir" variant="ghost" onPress={() => move(i, -1)} disabled={i === 0} />
              <Button label="Bajar" variant="ghost" onPress={() => move(i, 1)} disabled={i === draft.areas.length - 1} />
              <Button label="Quitar" variant="ghost" onPress={() => set({ areas: draft.areas.filter((_, j) => j !== i) })} disabled={draft.areas.length <= 2} />
            </View>
          </View>
        );
      })}
      {draft.areas.length < 8 ? (
        <Button label="Agregar un área" variant="ghost" onPress={() => set({ areas: [...draft.areas, { name: "", color_key: nextColor() }] })} />
      ) : null}
      <Button label="Volver a las sugeridas" variant="ghost" onPress={() => set({ areas: defaultDraft().areas })} />
      {error ? <Notice kind="error">{error}</Notice> : problem ? <Notice kind="info">{problem}</Notice> : null}
      <Button label="Listo, ver mi equilibrio" onPress={submit} busy={busy} disabled={!!problem} />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#fff", borderLeftWidth: 8, borderWidth: 1, borderColor: "#E7E0F2" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: palette.text },
});
