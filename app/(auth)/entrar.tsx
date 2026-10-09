import { Link, router } from "expo-router";
import { useState } from "react";
import { Button, Field, Notice, Screen, Title } from "@/components/ui";
import { getSupabase } from "@/data/supabase";
import { authErrorMessage, validateEmail } from "@/features/auth/messages";

export default function Entrar() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const bad = validateEmail(email) ?? (password ? null : "Escribí tu contraseña.");
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Entrar</Title>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button label="Entrar" onPress={submit} busy={busy} />
      <Link href="/recuperar" style={{ color: "#8065C4", fontSize: 16, paddingVertical: 8 }}>Olvidé mi contraseña</Link>
      <Link href="/registro" style={{ color: "#8065C4", fontSize: 16, paddingVertical: 8 }}>Crear una cuenta</Link>
    </Screen>
  );
}
