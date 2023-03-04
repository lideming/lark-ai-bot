# Lark OpenAI chat bot

Built with:

- [Deno] + [Oak]
- [Lark Node.js SDK] (with Node.js compatibility in Deno)
- [btrdb] for persisting chat context

## Bot commands

- `!reset` - reset context
- `!system` - manage system prompt setting (for current chat)
    - `!system` - show the current system prompt
    - `!system default` - restore the system prompt to default settings
    - `!system One line answers by default.` - override system prompt to "One line answers by default."

## Run

### Run without clone

1. Create `config.js` (See [config.example.js](config.example.js)).
2. Run `deno run -A https://raw.github.com/lideming/lark-ai-bot/master/src/app.ts`
    - or (for permission control)  
      `deno run --allow-net --allow-read --allow-write=data --allow-env https://raw.github.com/lideming/lark-ai-bot/master/src/app.ts`

### Clone and run from local source

1. Clone this repo
2. `cp config.example.js config.js` and edit `config.js`
3. Run `run.sh` (Deno 1.28+ is required)

## Configure Event and Webhooks

Event and webhooks should be enabled and configured in Lark/Feishu Developer Console.

In *Event Subscriptions*, set *Request URL* to `<API_HOST>/<APP_PATH>/events`, and enable the `im.message.receive_v1` event.

In *Features - Bot*, set *Message Card Request URL* to `<API_HOST>/<APP_PATH>/interactive-events`.

(`<APP_PATH>` is the key of `apps` config object.)

[Deno]: https://deno.land/
[Oak]: https://deno.land/x/oak
[Lark Node.js SDK]: https://github.com/larksuite/node-sdk/
[btrdb]: https://github.com/lideming/btrdb/
[Velo]: https://deno.land/x/velo
