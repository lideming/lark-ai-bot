import { Database } from "https://github.com/lideming/btrdb/raw/5262482a2e8263a340a63b7873b4253a5faabd03/mod.ts";
export * from "https://github.com/lideming/btrdb/raw/5262482a2e8263a340a63b7873b4253a5faabd03/mod.ts";
import { dirname } from "https://deno.land/std@0.178.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.178.0/fs/mod.ts";

export async function getDatabase(appId: string, name: string) {
  const oldPath = `data/${appId}/${name}.btrdb`;
  const v2Path = `data/${appId}/${name}.v2.btrdb`;
  let olddb: Database | null = null;
  if (await exists(oldPath)) {
    olddb = await Database.openFile(oldPath);
  }
  await Deno.mkdir(dirname(v2Path), { recursive: true });
  const db = await Database.openFile(v2Path, { pageSize: 4096 });
  if (olddb) {
    await db.import(await olddb.dump());
    olddb.close();
    await Deno.rename(oldPath, oldPath + ".bak");
  }
  return db;
}
