import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { fetchProfile } from "@/data/areas";
import { isSupabaseConfigured } from "@/data/supabase";
import { Body, Button, Center, Notice, Title } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { authErrorMessage } from "@/features/auth/messages";
import { palette } from "@/theme/tokens";
import { router } from "expo-router";

/** Puerta de entrada: decide a dónde ir según sesión y onboarding. */
export default function Gate() {
  const { session, loading, recovering } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session || recovering) return;
    let alive = true;
    setError(null);
    fetchProfile()
      .then((p) => alive && setTarget(p.onboarding_completed_at ? "/equilibrio" : "/onboarding"))
      .catch((e) => alive && setError(authErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [session, recovering, attempt]);

  if (!isSupabaseConfigured) {
    return (
      <Center>
        <Title>Falta conectar la base de datos</Title>
        <Body>
          Configurá EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY con tu proyecto Supabase
          de My MindPool (ver .env.example).
        </Body>
        <Button label="Ver el ensayo del cerebro" variant="ghost" onPress={() => router.push("/ensayo")} />
      </Center>
    );
  }
  if (loading) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  if (recovering) return <Redirect href="/nueva-clave" />;
  if (!session) return <Redirect href="/bienvenida" />;
  if (error) {
    return (
      <Center>
        <Notice kind="error">{error}</Notice>
        <Button label="Reintentar" onPress={() => setAttempt((n) => n + 1)} />
      </Center>
    );
  }
  if (!target) return <Center><ActivityIndicator color={palette.primary} /></Center>;
  return <Redirect href={target as "/equilibrio"} />;
}
