import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/bienvenida" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
