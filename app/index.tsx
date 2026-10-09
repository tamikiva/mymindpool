import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Brain, type BrainArea } from "@/features/brain/Brain";
import { MAX_AREAS, MIN_AREAS } from "@/features/brain/geometry";
import { computeBrain, isAllClear, type LoadTask } from "@/domain/load";
import { areaColors, palette } from "@/theme/tokens";

const DEFAULT_NAMES = ["Casa", "Trabajo", "Salud", "Vida social", "Descanso", "Familia", "Estudio", "Proyectos"];
const TODAY = "2026-10-09";

/** Ensayo técnico del hito 0: el nivel sale del dominio (load.ts), no de números sueltos. */
export default function BrainTrial() {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [weights, setWeights] = useState<number[]>([3, 1, 6, 8, 0, 2, 4, 5]);
  const [selected, setSelected] = useState<number>(0);
  const [reduce, setReduce] = useState<boolean | undefined>(undefined);

  const areas: BrainArea[] = useMemo(() => {
    const defs = Array.from({ length: count }, (_, i) => ({ id: `a${i}`, capacity: 8 }));
    // Un puñado de tareas de peso 1 por área: el dominio calcula el nivel.
    const tasks: LoadTask[] = defs.flatMap((d, i) =>
      Array.from({ length: weights[i] }, () => ({
        areaId: d.id,
        status: "pending" as const,
        weight: 1 as const,
        scheduledDate: null,
      })),
    );
    const loads = computeBrain(defs, tasks, TODAY);
    return loads.map((l, i) => ({
      id: l.areaId,
      name: names[i],
      fill: areaColors[i].fill,
      deep: areaColors[i].deep,
      level: l.level,
    }));
  }, [count, names, weights]);

  const loads = useMemo(
    () => areas.map((a, i) => ({ a, pending: Math.round(a.level * 8), raw: weights[i] })),
    [areas, weights],
  );
  const sel = Math.min(selected, count - 1);
  const setW = (i: number, d: number) =>
    setWeights((w) => w.map((v, j) => (j === i ? Math.max(0, Math.min(12, v + d)) : v)));

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.h1}>My MindPool · ensayo del cerebro</Text>
      <Text style={s.muted}>Hito 0. Datos de prueba locales, sin cuenta ni tareas reales.</Text>
      <View style={s.brain}>
        <Brain areas={areas} selectedId={areas[sel]?.id} onSelect={(id) => setSelected(Number(id.slice(1)))} reduceMotion={reduce} />
      </View>
      {isAllClear(areas.map((a) => ({ areaId: a.id, pending: a.level, capacity: 8, level: a.level, excess: 0, band: "low" }))) && (
        <Text style={s.muted}>Todo despejado. Un buen momento para descansar.</Text>
      )}

      <Text style={s.h2}>Áreas ({count})</Text>
      <View style={s.row}>
        {Array.from({ length: MAX_AREAS - MIN_AREAS + 1 }, (_, k) => k + MIN_AREAS).map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} áreas`} onPress={() => setCount(n)} style={[s.chip, n === count && s.chipOn]}>
            <Text style={n === count ? s.chipTextOn : s.chipText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!reduce }} onPress={() => setReduce((r) => (r ? undefined : true))} style={s.chip}>
        <Text style={s.chipText}>{reduce ? "Movimiento reducido: sí" : "Movimiento reducido: según el sistema"}</Text>
      </Pressable>

      <Text style={s.h2}>Vista de lista (equivalente accesible)</Text>
      {loads.map(({ a, raw }, i) => (
        <View key={a.id} style={[s.item, i === sel && s.itemOn]}>
          <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => setSelected(i)}>
            <Text style={s.itemName}>{a.name}</Text>
            <Text style={s.muted}>
              {raw} de 8 puntos · {a.level < 0.25 ? "carga baja" : a.level > 0.7 ? "carga alta" : "carga manejable"}
              {raw > 8 ? ` · ${raw - 8} por encima de tu referencia` : ""}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar un punto de ${a.name}`} onPress={() => setW(i, -1)} style={s.step}><Text style={s.stepText}>−</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Agregar un punto a ${a.name}`} onPress={() => setW(i, 1)} style={s.step}><Text style={s.stepText}>+</Text></Pressable>
        </View>
      ))}

      <Text style={s.h2}>Renombrar «{names[sel]}» (hasta 40 caracteres)</Text>
      <TextInput
        accessibilityLabel="Nombre del área seleccionada"
        value={names[sel]}
        maxLength={40}
        onChangeText={(t) => setNames((n) => n.map((v, j) => (j === sel ? t : v)))}
        style={s.input}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, maxWidth: 640, width: "100%", alignSelf: "center" },
  h1: { fontSize: 24, fontWeight: "800", color: palette.text },
  h2: { fontSize: 17, fontWeight: "700", color: palette.text, marginTop: 10 },
  muted: { color: palette.textMuted, fontSize: 14 },
  brain: { width: "100%", aspectRatio: 400 / 320 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: "#D9CFEA", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { color: palette.text, fontWeight: "600" },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  item: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E7E0F2", backgroundColor: "#fff" },
  itemOn: { borderColor: palette.primary, borderWidth: 2 },
  itemName: { fontSize: 16, fontWeight: "700", color: palette.text },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EFE9FB", alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 22, color: palette.primary, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#D9CFEA", borderRadius: 12, padding: 12, fontSize: 16, color: palette.text, backgroundColor: "#fff", minHeight: 44 },
});
