import { Link, router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { getSupabase } from "@/data/supabase";
import { authErrorMessage, validateEmail, validatePassword } from "@/features/auth/messages";

export default function Registro() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const eErr = email ? validateEmail(email) : null;
  const pErr = password ? validatePassword(password) : null;

  async function submit() {
    const bad = validateEmail(email) ?? validatePassword(password);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: Linking.createURL("/") },
      });
      if (error) throw error;
      // Con confirmación de email activa no hay sesión todavía.
      if (data.session) router.replace("/");
      else setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Title>Revisá tu email</Title>
        <Body>Te mandamos un enlace a {email.trim()} para confirmar la cuenta. Al abrirlo seguimos desde donde dejaste.</Body>
        <Button label="Ya confirmé, entrar" onPress={() => router.replace("/entrar")} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>Crear cuenta</Title>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={eErr} />
      <Field label="Contraseña (mínimo 8 caracteres)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={pErr} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button label="Crear cuenta" onPress={submit} busy={busy} />
      <Link href="/entrar" style={{ color: "#8065C4", fontSize: 16, paddingVertical: 8 }}>Ya tengo cuenta</Link>
    </Screen>
  );
}
