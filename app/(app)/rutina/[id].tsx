import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips } from "@/components/Chips";
import { fetchAreas, type Area } from "@/data/areas";
import { archiveTemplate, fetchTemplate, saveTemplate } from "@/data/routines";
import {
  MAX_STEPS, draftFromLocal, hasErrors, hasShortVersion, moveStep, suggestTemplates, validateDraft,
  type DraftStep, type StepWeight, type TemplateDraft,
} from "@/domain/routines";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const WEIGHTS: { value: StepWeight; label: string }[] = [
  { value: 1, label: "Pequeño (1)" },
  { value: 2, label: "Mediano (2)" },
  { value: 3, label: "Grande (3)" },
];

export default function EditarRutina() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "nueva";
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const a = await fetchAreas();
      setAreas(a);
      const first = a[0]?.id ?? "";
      if (isNew) {
        // Solo se parte de cero la primera vez: al volver a enfocar no se pisa lo que se estaba escribiendo.
        setDraft((d) => d ?? { name: "", defaultAreaId: first, startCue: "", steps: [{ title: "", areaId: first, weight: 1, durationMinutes: null, inShort: false }] });
      } else {
        const t = await fetchTemplate(String(id));
        if (!t) return setMissing(true);
        setDraft({
          name: t.name,
          defaultAreaId: t.default_area_id,
          startCue: t.start_cue ?? "",
          steps: t.steps.map((x) => ({ title: x.title, areaId: x.area_id, weight: x.weight, durationMinutes: x.duration_minutes, inShort: x.in_short })),
        });
      }
    } catch (e) {
      setError(dataErrorMessage(e));
    }
  }, [id, isNew]);
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
  if (missing) {
    return (
      <Center>
        <Body>Esta rutina ya no existe.</Body>
        <Button label="Volver a Rutinas" onPress={() => router.replace("/rutinas")} />
      </Center>
    );
  }
  if (!areas || !draft) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  const errors = validateDraft(draft);
  const areaOptions = areas.map((a) => ({ value: a.id, label: a.name }));
  const set = (patch: Partial<TemplateDraft>) => setDraft({ ...draft, ...patch });
  const setStep = (i: number, patch: Partial<DraftStep>) => set({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const suggestions = isNew && draft.steps.every((s) => !s.title.trim()) ? suggestTemplates(draft.name) : [];
  const back = () => router.replace("/rutinas");

  const save = async () => {
    setShowErrors(true);
    if (hasErrors(errors)) return;
    setBusy(true);
    setSaveError(null);
    try {
      await saveTemplate(draft, isNew ? null : String(id));
      back();
    } catch (e) {
      setSaveError(dataErrorMessage(e)); // el borrador queda como estaba
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{isNew ? "Nueva rutina" : "Editar rutina"}</Title>
      <Field label="Nombre" value={draft.name} onChangeText={(name) => set({ name })} maxLength={60} error={showErrors ? errors.name : null} />
      {suggestions.map((t) => (
        <View key={t.key} style={s.card}>
          <Body>Tenemos una plantilla para «{t.name}». Podés usarla y editarla.</Body>
          <Button label={`Usar la plantilla ${t.name}`} variant="ghost" onPress={() => setDraft(draftFromLocal(t, areas, draft.defaultAreaId ?? areas[0].id))} />
        </View>
      ))}
      <Text style={s.label}>Área predeterminada</Text>
      <Chips<string | null> label="Área predeterminada" options={areaOptions} value={draft.defaultAreaId} onChange={(v) => set({ defaultAreaId: v })} />
      <Field label="Señal para empezar (opcional)" value={draft.startCue} onChangeText={(startCue) => set({ startCue })} maxLength={200} />
      <Body>Por ejemplo: «Después de cerrar la computadora». Es un recordatorio de apoyo y no suma carga.</Body>

      <Text style={s.h}>Pasos</Text>
      {errors.steps && showErrors ? <Notice kind="error">{errors.steps}</Notice> : null}
      {draft.steps.map((st, i) => (
        <View key={i} style={s.card}>
          <Text style={s.strong}>{i === 0 ? "Paso 1 · acción inicial" : `Paso ${i + 1}`}</Text>
          {i === 0 ? <Text style={s.muted}>Siempre va primero y está también en la versión corta.</Text> : null}
          <Field label={`Título del paso ${i + 1}`} value={st.title} onChangeText={(title) => setStep(i, { title })} maxLength={120} error={showErrors ? errors.step[i] : null} />
          <Chips<string> label={`Área del paso ${i + 1}`} options={areaOptions} value={st.areaId} onChange={(areaId) => setStep(i, { areaId })} />
          <Chips<StepWeight> label={`Tamaño del paso ${i + 1}`} options={WEIGHTS} value={st.weight} onChange={(weight) => setStep(i, { weight })} />
          {i > 0 ? (
            <Chips<string>
              label={`Versión corta del paso ${i + 1}`}
              options={[{ value: "no", label: "Solo en la completa" }, { value: "si", label: "También en la corta" }]}
              value={st.inShort ? "si" : "no"}
              onChange={(v) => setStep(i, { inShort: v === "si" })}
            />
          ) : null}
          <View style={s.row}>
            <Button label={`Subir el paso ${i + 1}`} variant="ghost" disabled={i === 0} onPress={() => set({ steps: moveStep(draft.steps, i, i - 1) })} />
            <Button label={`Bajar el paso ${i + 1}`} variant="ghost" disabled={i === draft.steps.length - 1} onPress={() => set({ steps: moveStep(draft.steps, i, i + 1) })} />
            <Button label={`Quitar el paso ${i + 1}`} variant="ghost" disabled={draft.steps.length === 1} onPress={() => set({ steps: draft.steps.filter((_, j) => j !== i) })} />
          </View>
        </View>
      ))}
      <Button
        label="Agregar paso"
        variant="ghost"
        disabled={draft.steps.length >= MAX_STEPS}
        onPress={() => set({ steps: [...draft.steps, { title: "", areaId: draft.defaultAreaId ?? areas[0].id, weight: 1, durationMinutes: null, inShort: false }] })}
      />
      <Body>
        {draft.steps.length} de {MAX_STEPS} pasos. {hasShortVersion(draft.steps) ? "Tiene versión corta." : "Marcá pasos «También en la corta» para ofrecer una versión corta."}
      </Body>

      {saveError ? <Notice kind="error">{saveError}</Notice> : null}
      {showErrors && hasErrors(errors) ? <Notice kind="error">Revisá los campos marcados.</Notice> : null}
      <Button label="Guardar rutina" busy={busy} onPress={() => void save()} />
      {!isNew ? (
        confirmArchive ? (
          <>
            <Notice kind="info">Se archiva la rutina. Las ejecuciones ya hechas se conservan.</Notice>
            <Button label="Sí, archivar" busy={busy} onPress={() => void (async () => {
              setBusy(true);
              try { await archiveTemplate(String(id)); back(); } catch (e) { setSaveError(dataErrorMessage(e)); } finally { setBusy(false); }
            })()} />
            <Button label="No, conservar" variant="ghost" onPress={() => setConfirmArchive(false)} />
          </>
        ) : (
          <Button label="Archivar rutina" variant="ghost" disabled={busy} onPress={() => setConfirmArchive(true)} />
        )
      ) : null}
      <Button label="Volver sin guardar" variant="ghost" onPress={back} />
    </Screen>
  );
}

const s = StyleSheet.create({
  h: { fontSize: 18, fontWeight: "800", color: palette.text, marginTop: 8 },
  label: { fontSize: 14, fontWeight: "700", color: palette.text },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 8 },
  strong: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  row: { gap: 8 },
});
