import { getSupabase } from "./supabase";

export interface Profile {
  id: string;
  display_name: string | null;
  onboarding_completed_at: string | null;
  reduce_motion: boolean;
}

export interface Area {
  id: string;
  name: string;
  color_key: string;
  position: number;
  capacity: number;
}

export async function fetchProfile(): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, display_name, onboarding_completed_at, reduce_motion")
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await getSupabase()
    .from("areas")
    .select("id, name, color_key, position, capacity")
    .is("archived_at", null)
    .order("position");
  if (error) throw error;
  return (data ?? []) as Area[];
}

export async function completeOnboarding(
  displayName: string,
  areas: { name: string; color_key: string }[],
): Promise<void> {
  const { error } = await getSupabase().rpc("complete_onboarding", {
    p_display_name: displayName,
    p_areas: areas,
  });
  if (error) throw error;
}
