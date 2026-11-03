import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Body, Button, Center, Field, Notice, Screen, Title } from "@/components/ui";
import { Chips, MultiChips } from "@/components/Chips";
import { fetchAreas, type Area } from "@/data/areas";
import { archiveRecurring, fetchRecurring, saveRecurring, type RecurringDraft } from "@/data/recurring";
import {
  WEEKDAY_LABELS, describeRule, nextOccurrences, ruleHasErrors, validateRule, type Frequency, type RecurrenceRule,
} from "@/domain/recurrence";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");
const SIZES = [{ value: 1, label: "Pequeña (1)" }, { value: 2, label: "Mediana (2)" }, { value: 3, label: "Grande (3)" }];

interface Form {
  title: string;
  note: string;
  areaId: string;
  weight: 1 | 2 | 3;
  frequency: Frequency;
  interval: string;
  weekdays: number[];
  start: string;
  end: string;
}

export default function EditarRepetida() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "nueva";
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
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
      if (isNew) {
        setForm((f) => f ?? { title: "", note: "", areaId: a[0]?.id ?? "", weight: 1, frequency: "daily", interval: "1", weekdays: [], start: today(), end: "" });
      } else {
        const t = (await fetchRecurring()).find((x) => x.id === String(id));
        if (!t) return setMissing(true);
        setForm({
          title: t.title, note: t.note ?? "", areaId: t.area_id, weight: t.weight, frequency: t.rule.frequency,
          interval: String(t.rule.interval), weekdays: t.rule.weekdays, start: t.rule.start, end: t.rule.end ?? "",
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
        <Body>Esta tarea repetida ya no existe.</Body>
        <Button label="Volver" onPress={() => router.replace("/repetidas")} />
      </Center>
    );
  }
  if (!areas || !form) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const rule: RecurrenceRule = {
    frequency: form.frequency,
    interval: Number(form.interval),
    weekdays: form.frequency === "weekly" ? form.weekdays : [],
    start: form.start.trim(),
    end: form.end.trim() || null,
  };
  const errors = validateRule({ ...rule, interval: /^\d+$/.test(form.interval.trim()) ? Number(form.interval) : NaN });
  const titleError = form.title.trim() ? null : "Poné un título.";
  const invalid = ruleHasErrors(errors) || !!titleError;
  const preview = !invalid ? nextOccurrences(rule, today() > rule.start ? today() : rule.start, 5) : [];
  const back = () => router.replace("/repetidas");

  const save = async () => {
    setShowErrors(true);
    if (invalid) return;
    setBusy(true);
    setSaveError(null);
    try {
      const draft: RecurringDraft = { title: form.title, note: form.note, areaId: form.areaId, weight: form.weight, priority: "normal", rule };
      await saveRecurring(draft, isNew ? null : String(id), today());
      back();
    } catch (e) {
      setSaveError(dataErrorMessage(e)); // lo escrito se conserva
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{isNew ? "Nueva tarea repetida" : "Editar tarea repetida"}</Title>
      <Field label="Título" value={form.title} onChangeText={(title) => set({ title })} maxLength={200} error={showErrors ? titleError : null} />
      <Body>Área</Body>
      <Chips<string> label="Área" options={areas.map((a) => ({ value: a.id, label: a.name }))} value={form.areaId} onChange={(areaId) => set({ areaId })} />
      <Body>Tamaño</Body>
      <Chips<number> label="Tamaño" options={SIZES} value={form.weight} onChange={(w) => set({ weight: w as 1 | 2 | 3 })} />
      <Body>Se repite</Body>
      <Chips<string>
        label="Frecuencia"
        options={[{ value: "daily", label: "Cada cierta cantidad de días" }, { value: "weekly", label: "Días de la semana" }]}
        value={form.frequency}
        onChange={(v) => set({ frequency: v as Frequency })}
      />
      <Field
        label={form.frequency === "daily" ? "Cada cuántos días" : "Cada cuántas semanas"}
        value={form.interval}
        keyboardType="number-pad"
        onChangeText={(interval) => set({ interval })}
        error={showErrors ? errors.interval : null}
      />
      {form.frequency === "weekly" ? (
        <>
          <MultiChips
            label="Días de la semana"
            options={WEEKDAY_LABELS.map((l, i) => ({ value: String(i + 1), label: l }))}
            values={form.weekdays.map(String)}
            onToggle={(v) => set({ weekdays: form.weekdays.includes(Number(v)) ? form.weekdays.filter((d) => d !== Number(v)) : [...form.weekdays, Number(v)] })}
          />
          {showErrors && errors.weekdays ? <Notice kind="error">{errors.weekdays}</Notice> : null}
        </>
      ) : null}
      <Field label="Empieza (AAAA-MM-DD)" value={form.start} onChangeText={(start) => set({ start })} autoCapitalize="none" error={showErrors || form.start.length >= 10 ? errors.start : null} />
      <Field label="Termina (AAAA-MM-DD, opcional)" value={form.end} onChangeText={(end) => set({ end })} autoCapitalize="none" error={showErrors || form.end.length >= 10 ? errors.end : null} />
      {!invalid ? (
        <Body>
          {describeRule(rule)}. {preview.length ? `Próximas: ${preview.join(", ")}.` : "No hay próximas repeticiones con estas fechas."}
        </Body>
      ) : null}
      <Body>Las repeticiones se generan hacia adelante, desde hoy: no se cargan días pasados. Una repetición vencida no suma a tu agua.</Body>

      {saveError ? <Notice kind="error">{saveError}</Notice> : null}
      {showErrors && invalid ? <Notice kind="error">Revisá los campos marcados.</Notice> : null}
      <Button label="Guardar" busy={busy} onPress={() => void save()} />
      {!isNew ? (
        confirmArchive ? (
          <>
            <Notice kind="info">Se deja de repetir y se descartan las repeticiones pendientes desde hoy. Lo que ya hiciste se conserva.</Notice>
            <Button label="Sí, archivar" busy={busy} onPress={() => void (async () => {
              setBusy(true);
              try { await archiveRecurring(String(id), today()); back(); } catch (e) { setSaveError(dataErrorMessage(e)); } finally { setBusy(false); }
            })()} />
            <Button label="No, conservar" variant="ghost" onPress={() => setConfirmArchive(false)} />
          </>
        ) : (
          <Button label="Archivar tarea repetida" variant="ghost" disabled={busy} onPress={() => setConfirmArchive(true)} />
        )
      ) : null}
      <Button label="Volver sin guardar" variant="ghost" onPress={back} />
    </Screen>
  );
}
