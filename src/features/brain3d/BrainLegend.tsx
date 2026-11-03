import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/theme/tokens";

export interface LegendItem {
  id: string;
  name: string;
  fill: string;
}

/**
 * Leyenda de áreas. Además de explicar los colores, es la forma accesible de elegir una pileta:
 * cada ítem es un radio enfocable con teclado y legible por lector de pantalla.
 */
export function BrainLegend({ items, selectedId, onSelect }: { items: readonly LegendItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <View role="radiogroup" accessibilityLabel="Áreas" style={s.row}>
      {items.map((it) => {
        const on = it.id === selectedId;
        return (
          <Pressable key={it.id} role="radio" accessibilityLabel={it.name} aria-checked={on} onPress={() => onSelect(it.id)} style={[s.item, on && s.itemOn]}>
            <View style={[s.dot, { backgroundColor: it.fill }]} />
            <Text style={[s.text, on && s.textOn]}>{on ? "✓ " : ""}{it.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 2, rowGap: 0 },
  item: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 8, borderRadius: 22 },
  itemOn: { backgroundColor: "#EFE9FB" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontSize: 14, color: palette.textMuted },
  textOn: { color: palette.primary, fontWeight: "700" },
});
