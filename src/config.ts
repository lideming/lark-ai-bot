export interface Config {
  listen: "127.0.0.1:8080";

  apps: Record<string, AppConfig>;
}

export interface AppConfig {
  type: string;
  lark: {
    appId: string;
    appSecret: string;
    verificationToken: string;
  };
}
