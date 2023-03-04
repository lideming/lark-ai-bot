import { Database } from "https://deno.land/x/btrdb@v0.8.3/mod.ts";
import { dirname } from "https://deno.land/std@0.178.0/path/mod.ts";

export async function getDatabase(appId: string, name: string) {
  const path = `data/${appId}/${name}.btrdb`;
  await Deno.mkdir(dirname(path), { recursive: true });
  return await Database.openFile(path);
}
