import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { palette } from "@/theme/tokens";

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/bienvenida" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: { fontSize: 14 },
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="equilibrio" options={{ title: "Equilibrio" }} />
      <Tabs.Screen name="tareas" options={{ title: "Tareas" }} />
      <Tabs.Screen name="area/[id]" options={{ href: null }} />
      <Tabs.Screen name="tarea/[id]" options={{ href: null }} />
    </Tabs>
  );
}
