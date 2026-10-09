import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Sesión en el almacén seguro del sistema (nativo) o en el storage del navegador (web). */
const nativeStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

let client: SupabaseClient | null = null;

/** Falla con un mensaje claro si falta configurar el proyecto Supabase propio. */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  client ??= createClient(url, anonKey, {
    auth: {
      storage: Platform.OS === "web" ? AsyncStorage : nativeStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
    },
  });
  return client;
}
