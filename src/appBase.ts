import { Application, Router } from "./dep.ts";
import { AppConfig, Config } from "./config.ts";
import { loggingMiddleware } from "./utils/middlewares.ts";

export interface AppType {
  createApp(appId: string, appConfig: AppConfig): { router: Router };
}

export async function runApps(
  config: Config,
  appTypes: Record<string, AppType>,
) {
  const app = new Application();

  const appRouter = new Router();

  app.use(loggingMiddleware);

  for (const [appId, appConfig] of Object.entries(config.apps)) {
    const type = appTypes[appConfig.type];
    if (!type) {
      throw new Error(`app type ${appConfig.type} does not exist`);
    }
    const { router } = type.createApp(appId, appConfig);
    appRouter.use("/" + appId, router.routes(), router.allowedMethods());
  }

  app.use(appRouter.routes());
  app.use(appRouter.allowedMethods());

  app.addEventListener("listen", (e) => {
    console.info(`Listening on ${e.hostname}:${e.port}`);
  });

  await app.listen(config.listen);
}
