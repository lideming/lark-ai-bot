return {
  listen: "127.0.0.1:8080",

  apps: {
    myAiBot: {
      // This defines a AI chat bot, and App Path is "myAiBot"
      type: "ai",

      token: "", // OpenAI api key
      // systemPrompt: "One line answers by default.",

      lark: {
        appId: "",
        appSecret: "",
        verificationToken: "", // in "Event Subscriptions"
      },
    },
    // Multiple instances are supported
    // anotherBot: { }
  },
};
