import * as Linking from "expo-linking";
import { useState } from "react";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { getSupabase } from "@/data/supabase";
import { authErrorMessage, validateEmail } from "@/features/auth/messages";

export default function Recuperar() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    const bad = validateEmail(email);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: Linking.createURL("/nueva-clave"),
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Recuperar contraseña</Title>
      {sent ? (
        <Body>Si hay una cuenta con ese email, te enviamos un enlace para elegir una contraseña nueva.</Body>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Button label="Enviar enlace" onPress={submit} busy={busy} />
        </>
      )}
    </Screen>
  );
}
