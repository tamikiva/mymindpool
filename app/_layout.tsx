import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { palette } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          contentStyle: { backgroundColor: palette.background },
        }}
      />
    </>
  );
}
