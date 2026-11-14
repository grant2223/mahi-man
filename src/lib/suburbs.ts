import { sb } from "./supabase";

/* Every suburb in an area. The server returns at most 1,000 rows a request and Sydney has more,
   so this reads them in pages of 1,000 until a page comes back short. */
export async function areaSuburbs<T>(areaId: number, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("suburbs").select(cols).eq("area_id", areaId).order("name").order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}
