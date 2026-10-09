import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { palette } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
      />
    </AuthProvider>
  );
}
