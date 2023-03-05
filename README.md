# Lark OpenAI chat bot

Built with:

- [Deno] + [Oak]
- [Lark Node.js SDK] (with Node.js compatibility in Deno)
- [btrdb] for persisting chat context

## Conversation Branching

By default, user messages are a reply to the last message in the chat (unless the `!new` command is used).

If the user replies to a previous message in the chat history, a new conversation branch will be created starting from the replied message.

## Bot Commands

- `!new` ~~(`!reset`)~~ - starts a new conversation
  - Note: You can still resume previous conversations by replying to them.
- `!system` - manages system prompt setting (for current chat)
  - `!system` - shows the current system prompt
  - `!system default` - restores the system prompt to default settings
  - `!system One line answers by default.` - overrides system prompt to "One line answers by default."

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

## Configure on Lark/Feishu Open Platform

### Event and Webhooks

Event and webhooks should be enabled and configured in Lark/Feishu Developer Console.

In _Event Subscriptions_, set _Request URL_ to `<API_HOST>/<APP_PATH>/events`, and enable the `im.message.receive_v1` event.

In _Features - Bot_, set _Message Card Request URL_ to `<API_HOST>/<APP_PATH>/interactive-events`.

(`<APP_PATH>` is the key of `apps` config object.)

### Permissions

Required permissions:

- im:message.group_at_msg
- im:message.p2p_msg
- im:message:send_as_bot
- im:message.groups

[deno]: https://deno.land/
[oak]: https://deno.land/x/oak
[lark node.js sdk]: https://github.com/larksuite/node-sdk/
[btrdb]: https://github.com/lideming/btrdb/
[velo]: https://deno.land/x/velo
