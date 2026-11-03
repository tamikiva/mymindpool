import { Redirect, Tabs } from "expo-router";
import { DayIcon, ListIcon, LoopIcon, PieIcon } from "@/components/icons";
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
        tabBarLabelStyle: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
        tabBarStyle: { height: 68, paddingTop: 8, backgroundColor: "#FFFDF9", borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen name="equilibrio" options={{ title: "Equilibrio", tabBarIcon: ({ color }) => <PieIcon color={color} /> }} />
      <Tabs.Screen name="dia" options={{ title: "Mi día", tabBarIcon: ({ color }) => <DayIcon color={color} /> }} />
      <Tabs.Screen name="tareas" options={{ title: "Tareas", tabBarIcon: ({ color }) => <ListIcon color={color} /> }} />
      <Tabs.Screen name="repetidas" options={{ href: null }} />
      <Tabs.Screen name="repetida/[id]" options={{ href: null }} />
      <Tabs.Screen name="rutinas" options={{ title: "Rutinas", tabBarIcon: ({ color }) => <LoopIcon color={color} /> }} />
      <Tabs.Screen name="rutina/[id]" options={{ href: null }} />
      <Tabs.Screen name="ejecucion/[id]" options={{ href: null }} />
      <Tabs.Screen name="area/[id]" options={{ href: null }} />
      <Tabs.Screen name="tarea/[id]" options={{ href: null }} />
    </Tabs>
  );
}
