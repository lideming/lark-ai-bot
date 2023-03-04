import { Config } from "./config.ts";
import { runApps } from "./appBase.ts";

import * as ai from "./apps/ai/ai.ts";

const appTypes = { ai };

const config = new Function(await Deno.readTextFile("config.js"))() as Config;

await runApps(config, appTypes);
