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
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 6, rowGap: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 22 },
  itemOn: { backgroundColor: "#EFE9FB" },
  dot: { width: 14, height: 14, borderRadius: 7 },
  text: { fontSize: 15, color: palette.textMuted },
  textOn: { color: palette.primary, fontWeight: "700" },
});
