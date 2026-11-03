import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { palette } from "@/theme/tokens";

/** Selector de una opción entre varias. El estado no depende solo del color: el seleccionado lleva «✓». */
export function Chips<T extends string | number | null>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} role="radiogroup" accessibilityLabel={label} contentContainerStyle={s.row}>
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: "#D9CFEA", justifyContent: "center", backgroundColor: "#fff" },
  chipOn: { borderColor: palette.primary, backgroundColor: "#EFE9FB" },
  text: { fontSize: 15, color: palette.text },
  textOn: { fontWeight: "700", color: palette.primary },
});
