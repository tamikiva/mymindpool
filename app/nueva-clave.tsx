import { router } from "expo-router";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { getSupabase } from "@/data/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { authErrorMessage, validatePassword } from "@/features/auth/messages";

/** Destino del enlace de recuperación y del cambio de contraseña desde sesión iniciada. */
export default function NuevaClave() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const bad = validatePassword(password);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !session) {
    return (
      <Screen>
        <Title>El enlace venció</Title>
        <Body>Pedí uno nuevo y probá de nuevo.</Body>
        <Button label="Pedir otro enlace" onPress={() => router.replace("/recuperar")} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>Elegí una contraseña nueva</Title>
      <Field label="Contraseña nueva (mínimo 8 caracteres)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button label="Guardar contraseña" onPress={submit} busy={busy} />
    </Screen>
  );
}
