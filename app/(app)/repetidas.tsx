import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Notice, Screen, Title } from "@/components/ui";
import { fetchAreas, type Area } from "@/data/areas";
import { fetchRecurring, type RecurringTask } from "@/data/recurring";
import { describeRule, nextOccurrences } from "@/domain/recurrence";
import { dataErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";

const today = () => new Date().toLocaleDateString("sv-SE");

export default function Repetidas() {
  const [items, setItems] = useState<RecurringTask[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, a] = await Promise.all([fetchRecurring(), fetchAreas()]);
      setItems(r);
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
  if (!items) return <Center><ActivityIndicator color={palette.primary} /></Center>;

  return (
    <Screen>
      <Title>Tareas repetidas</Title>
      <Body>Cada repetición es una tarea propia: completar la de hoy no completa las de otros días.</Body>
      {items.length === 0 ? <Body>Todavía no tenés tareas repetidas. Creá una, por ejemplo «Regar las plantas».</Body> : null}
      {items.map((r) => {
        const next = nextOccurrences(r.rule, today(), 1)[0];
        return (
          <View key={r.id} style={s.card}>
            <Text style={s.strong}>{r.title}</Text>
            <Text style={s.muted}>{areas.find((a) => a.id === r.area_id)?.name} · {r.weight} pt · {describeRule(r.rule)}</Text>
            <Text style={s.muted}>{next ? `Próxima: ${next}` : "No tiene próximas repeticiones"}</Text>
            <Link href={{ pathname: "/repetida/[id]", params: { id: r.id } }} accessibilityLabel={`Editar ${r.title}`} style={s.link}>Editar</Link>
          </View>
        );
      })}
      <Button label="Nueva tarea repetida" onPress={() => router.push({ pathname: "/repetida/[id]", params: { id: "nueva" } })} />
      <Button label="Volver a Tareas" variant="ghost" onPress={() => router.replace("/tareas")} />
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff", gap: 6 },
  strong: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
  link: { color: palette.primary, fontSize: 16, paddingVertical: 6 },
});
