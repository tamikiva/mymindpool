import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, Center, Notice, Screen, Title } from "@/components/ui";
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
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profile, areas] = await Promise.all([fetchProfile(), fetchAreas()]);
      setData({ profile, areas });
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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

  // Tareas llegan en el hito 2: hoy no hay carga que calcular, el nivel es 0 real.
  const loads = computeBrain(data.areas, [], today());
  const brainAreas: BrainArea[] = data.areas.map((a, i) => {
    const c = areaColors.find((x) => x.key === a.color_key) ?? areaColors[i % areaColors.length];
    return { id: a.id, name: a.name, fill: c.fill, deep: c.deep, level: loads[i].level };
  });
  const name = data.profile.display_name;

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
      <Body>Las tareas llegan en la próxima etapa; por ahora podés ver y ordenar tus áreas.</Body>
      <Button label="Cerrar sesión" variant="ghost" onPress={() => void getSupabase().auth.signOut()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  brain: { width: "100%", aspectRatio: 400 / 320 },
  item: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff" },
  itemOn: { borderColor: palette.primary, borderWidth: 2 },
  itemName: { fontSize: 16, fontWeight: "700", color: palette.text },
  muted: { color: palette.textMuted, fontSize: 14 },
});
