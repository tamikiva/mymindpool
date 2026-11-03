import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { palette } from "@/theme/tokens";

/**
 * Tipografía (web): Nunito, sans serif redondeada con licencia OFL (archivos y licencia en
 * `public/fonts`). Es una elección provisoria que sigue las referencias; falta la aprobación
 * definitiva (PRD §25). En nativo se cargará por peso con expo-font en el hito 7.
 */
if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("mp-fonts")) {
  const st = document.createElement("style");
  st.id = "mp-fonts";
  st.textContent =
    [400, 600, 700, 800]
      .map((w) => `@font-face{font-family:"Nunito";font-weight:${w};font-display:swap;src:url("/fonts/Nunito-${w}.ttf") format("truetype")}`)
      .join("") +
    `body,body *{font-family:"Nunito",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif !important}`;
  document.head.appendChild(st);
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
      />
    </AuthProvider>
  );
}
