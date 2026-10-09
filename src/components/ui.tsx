import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { palette } from "@/theme/tokens";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={s.screen}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" style={s.title}>{children}</Text>
);
export const Body = ({ children }: { children: ReactNode }) => <Text style={s.body}>{children}</Text>;

export function Button({
  label, onPress, variant = "primary", busy, disabled,
}: { label: string; onPress: () => void; variant?: "primary" | "ghost"; busy?: boolean; disabled?: boolean }) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={[s.btn, variant === "ghost" && s.btnGhost, off && { opacity: 0.6 }]}
    >
      {busy ? <ActivityIndicator color={variant === "ghost" ? palette.primary : "#fff"} /> : (
        <Text style={[s.btnText, variant === "ghost" && { color: palette.primary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#9A8CAB"
        {...rest}
        style={[s.input, error ? { borderColor: "#B3261E" } : null]}
      />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <View accessibilityRole={kind === "error" ? "alert" : undefined} style={[s.notice, kind === "error" ? s.noticeErr : s.noticeInfo]}>
      <Text style={{ color: palette.text, fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return <View style={s.center}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { padding: 20, gap: 14, width: "100%", maxWidth: 520, alignSelf: "center", flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: palette.text },
  body: { fontSize: 16, lineHeight: 23, color: palette.textMuted },
  btn: { minHeight: 48, borderRadius: 24, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: palette.primary },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "700", color: palette.text },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: "#D9CFEA", borderRadius: 14, paddingHorizontal: 14, fontSize: 16, color: palette.text, backgroundColor: "#fff" },
  error: { color: "#B3261E", fontSize: 14 },
  notice: { padding: 12, borderRadius: 12 },
  noticeErr: { backgroundColor: "#FBE9E7" },
  noticeInfo: { backgroundColor: "#EFE9FB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background, padding: 20 },
});
