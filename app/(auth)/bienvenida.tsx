import { router } from "expo-router";
import { Body, Button, Screen, Title } from "@/components/ui";

export default function Bienvenida() {
  return (
    <Screen>
      <Title>My MindPool</Title>
      <Body>Tu vida, en equilibrio.</Body>
      <Body>
        Cada área de tu vida es una pileta. Las tareas pendientes suben el agua y, a medida que las
        resolvés, baja. Así mirás el conjunto y elegís dónde poner tu atención, sin apuro y sin culpa.
      </Body>
      <Button label="Crear mi cuenta" onPress={() => router.push("/registro")} />
      <Button label="Ya tengo cuenta" variant="ghost" onPress={() => router.push("/entrar")} />
    </Screen>
  );
}
