import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/theme/tokens";

/** Selector de una opción entre varias. El estado no depende solo del color: el seleccionado lleva «✓». */
export function Chips<T extends string | number | null>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View role="radiogroup" accessibilityLabel={label} style={s.row}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            role="radio"
            accessibilityLabel={o.label}
            aria-checked={on}
            onPress={() => onChange(o.value)}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[s.text, on && s.textOn]}>{on ? "✓ " : ""}{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // Las opciones se ajustan en varias líneas: nada queda oculto a un desplazamiento (zoom, texto grande).
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4 },
  chip: { minHeight: 44, maxWidth: "100%", paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: "#D9CFEA", justifyContent: "center", backgroundColor: "#fff" },
  chipOn: { borderColor: palette.primary, backgroundColor: "#EFE9FB" },
  text: { fontSize: 15, color: palette.text },
  textOn: { fontWeight: "700", color: palette.primary },
});

/** Selector de varias opciones: casillas (role checkbox). El estado se dice con «✓», no solo con color. */
export function MultiChips({
  label, options, values, onToggle,
}: { label: string; options: { value: string; label: string }[]; values: readonly string[]; onToggle: (v: string) => void }) {
  return (
    <View role="group" accessibilityLabel={label} style={s.row}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <Pressable key={o.value} role="checkbox" accessibilityLabel={o.label} aria-checked={on} onPress={() => onToggle(o.value)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.text, on && s.textOn]}>{on ? "✓ " : ""}{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
