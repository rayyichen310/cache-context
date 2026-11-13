# cache-context

A Claude Code mod that shows when your conversation's prompt cache expires and what rebuilding it would cost, how full the context window is, and can pause a session near the five-hour usage limit and continue it after the reset. It can also keep the cache alive while you are away: that is off by default, and each refresh uses a little of your plan usage or API credit.

![The status bar above the prompt: the cache countdown, the context fill, compact, and the Refresh and Guard toggles](docs/band.png)

[中文說明](README.zh-TW.md)

Everything shows on a one-line status bar above the prompt. Press "Details ›" on it, or run `/cache-panel`, for the panel shown in the sections below. On the desktop app the rings and the panel are drawn and animated; in the terminal the same information is drawn in text.

## See what stepping away costs — Cache countdown

Claude Code keeps your conversation in a prompt cache for five minutes or one hour after its last use. Step away longer than that, and your first message back pays to put the whole conversation into the cache again. Each message sends the conversation so far to the model, and what that costs depends on the cache. Taking the model's normal input price as 1:

| How the message handles the conversation so far | Price |
| :- | :- |
| The cache holds: read it from the cache | 0.1 (most models; 0.05 on Opus 5.5) |
| For comparison: sent as normal input | 1 |
| The cache expired: write it into the cache again | 1.25 for the five-minute cache, 2 for the one-hour cache |

The ring on the status bar drains with the time the cache has left. The panel puts the cost of rebuilding the cache next to the cost of keeping it alive with one refresh:

![The cache countdown with the cost of an expiry next to the cost of one refresh](docs/panel-cache.png)

In the screenshot the conversation is about 220k tokens on Opus 5.5 (normal input $4 per million tokens) with the one-hour cache. Rebuilding it after an expiry costs 220k × $4 × 2 ≈ $1.76. One refresh only reads the cache, 220k × $4 × 0.05 ≈ $0.044, plus a few dozen tokens for the request itself: $0.045.

After a long turn, run `/cache-status` to get the same figures in text: how long the cache has left, how many tokens it holds, and both costs. Dollar figures use API list prices; on a subscription they are an equivalent, not a charge.

## Keep the cache over lunch — Auto-refresh

When you know you will be away, auto-refresh sends one small request shortly before the cache would expire, which keeps it alive. It is off by default. **Each refresh uses a little of your plan usage or API credit.**

![The auto-refresh switch, its limit, the Refresh now button and the recent cache hits](docs/panel-auto-refresh.png)

- Turn it on with Refresh on the status bar, "Turn on" in the panel, or `/cache-auto on 12`.
- It stops at the limit you set (12 per idle period unless you change it), and before the refreshes would cost more than one rebuild. The panel estimates how long the cache can be kept.
- Until a refresh has been seen to keep the cache alive, it sends only one per idle period, and the panel shows the count as `0/1`. Your next message resets the count.
- It stays on when Claude Code updates or restarts, and a cache that has not yet expired goes on being refreshed. Only you turn it off.
- While it is on, the mod turns off Claude Code's idle compaction, which would otherwise compact a long conversation before the first refresh. It turns the setting back on afterwards.

To extend the cache once, for example before a meeting, press "Refresh now" or run `/cache-ping`. The reply says how many tokens were read from the cache and what the refresh cost, and the countdown starts over.

## Know when to compact — Context window

Once the context window fills, Claude Code compacts the conversation on its own. A second ring on the status bar shows how much of the window is in use, and the panel shows how close auto-compaction is:

![The context section: share of the window in use, tokens left before auto-compaction, and the compact button](docs/panel-context.png)

- A bar split by category, and the tokens left before auto-compaction.
- Under "Legend", each category's share, and the MCP tools, memory files and custom agents in context; ↗ opens a memory file or agent in your default app.
- "Compact session", here and on the status bar, does what `/compact` does, when you choose.

## Stop before the usage runs out, and keep the cache — Usage guard

Once the five-hour usage runs out, refreshes are refused too, so the cache expires while you wait for the reset, and your first message after it pays for the rebuild. The usage guard has Claude wrap up and pause before the usage runs out (at 97% unless you change it), which leaves a little usage for auto-refresh to keep the cache alive until after the reset. It is off by default.

![The usage guard: five-hour usage, the wrap-up threshold and the continue switch](docs/panel-guard.png)

- Turn it on with Guard on the status bar, "Turn on" in the panel, or `/cache-guard on`.
- When the five-hour usage reaches the threshold (97% unless you change it), the guard asks Claude to finish the step in hand, write down its progress and stop.
- The session then pauses. 30 seconds after the five-hour reset, the mod sends a message for you that asks Claude to carry on with the work it paused. With auto-refresh on through the pause, the cache is still there, so that message does not pay for a rebuild.
- Your own message ends the pause at any time.

## Status bar toggles

The Refresh and Guard toggles show their state with a dot: green on, grey off, amber at work. While the guard wraps up or pauses, its toggle says so (`Guard · wrapping up 97%`, `Guard · continues 18:30`, `Guard · paused`), and a press opens the panel instead of turning the guard off.

The rules behind each feature, such as how the cache lifetime is detected, when refreshes stop, and what the guard does step by step, are in [How it works](docs/how-it-works.md).

## Install

Requires Claude Code **v2.1.287 or later**. This plugin is a [mod](https://code.claude.com/docs/en/plugins/mods/overview); the mods API is new and may change.

```
/plugin install cache-context --marketplace rayyichen310/cache-context
```

Type it at the prompt of a terminal session (`claude`); answer `y` to add the marketplace, then choose a scope. Once installed at the user scope it also loads in the desktop app's Code tab.

If you also have [cache-refresher](https://github.com/olddonkey/cache-refresher) installed, disable it, since both draw a status bar and register the same commands:

```bash
claude plugin disable cache-refresher@olddonkey
```

The status bar appears after the first response of a session, once at least 1,024 tokens are cached.

## Commands

| Command | What it does |
| :- | :- |
| `/cache-status` | Prints the cache's status, its lifetime and the source of that lifetime, and the cost figures |
| `/cache-panel` | Opens the panel |
| `/cache-ping [force]` | Refreshes the cache now. Refused when the cache has already expired, unless `force` |
| `/cache-auto [on\|off] [max]` | Shows or changes the auto-refresh settings: on or off, and the maximum refreshes per idle period (default 12) |
| `/cache-guard [on\|off] [threshold]` | Shows or changes the usage guard: on or off, and the five-hour usage (50–99%) at which Claude wraps up. A threshold alone turns the guard on |
| `/cache-lang [auto\|code]` | Sets the display language by its code (for example `ja`, `de`, `pt-BR`), or goes back to matching the conversation |

The mod follows the language Claude replies in, in 43 languages. Apart from English and Chinese the translations are machine-made and have not been checked by native speakers: corrections are welcome as issues or pull requests.

## What it sends, changes and stores

- **Sends** only through your own conversation: a refresh when you ask for one or auto-refresh is on, a compaction when you press compact, and the guard's continue prompt. **Refreshes use your plan's usage or your API credit**, a little each. No network requests of its own, no telemetry, no dependencies.
- **Changes** one setting, Idle compaction, and only while auto-refresh is on. If the mod is disabled or removed while it holds the setting off, turn it back on in `/config`.
- **Stores** cache activity, its own switches and per-session state in the plugin's local store. No message text is stored, and it does not read your settings files, your saved transcript or any credential.

The full lists are in [docs/privacy.md](docs/privacy.md), and what each hook does is in [docs/hooks.md](docs/hooks.md).

## Troubleshooting

- **No status bar above the prompt.** It appears after the first response of a session, and only once at least 1,024 tokens are cached. Check that `claude --version` is 2.1.287 or later and that `claude plugin list` shows the plugin enabled.
- **The countdown uses the wrong lifetime.** `/cache-status` shows the lifetime in force and where it came from (environment, observed or assumed). An assumed lifetime corrects itself the first time a gap longer than five minutes ends in a hit or a miss.
- **A refresh was refused, or reported a miss.** A refused refresh sends nothing and costs nothing. A miss means the cache had already expired or no longer matched; that request was billed like any other, and your next message rebuilds the cache. `/cache-ping force` sends the request anyway, which rebuilds the cache now.
- **Auto-refresh sent one refresh and stopped.** That is the trial: the rest, up to your limit, unlocks once a refresh has been seen to extend the cache.
- **Auto-refresh never sent anything, and the conversation was compacted while you were away.** That is Claude Code's idle compaction. The mod turns it off while auto-refresh is on, unless a project, local or managed settings file holds the setting; see [Idle compaction](docs/how-it-works.md#idle-compaction).
- **The panel is in the wrong language.** `/cache-lang` followed by a language code sets one (`/cache-lang xx` lists the codes); `/cache-lang auto` goes back to matching the conversation. Closely related languages can be mistaken for one another on a short reply.
- **No ring in the terminal.** The terminal draws the same information as text; the rings and the animations are the desktop app's.

Questions and bugs: open an issue at https://github.com/rayyichen310/cache-context/issues.

## Develop

To try it for one session from a checkout:

```bash
claude --plugin-dir .
```

```bash
claude plugin validate .
```

```bash
claude plugin test
```

`hooks/register.tsx` wires the hooks; `hooks/model.ts` and `hooks/economics.ts` are pure logic; `hooks/views.ts` draws the status bar and the panel; `hooks/messages.ts` holds the languages; `hooks/context.ts` holds the context window's figures, words and drawings; `hooks/limits.ts` holds the usage guard's defaults and words.

Each language is one file under `hooks/locales/` plus an entry in the registry in `hooks/messages.ts`; `tests/locales.test.ts` holds every catalog to the English shape and to the room each panel line has. `tests/context.test.ts` covers the context window, `tests/guard.test.ts` the usage guard and `tests/restart.test.ts` what is carried over a restart.

## Credits

cache-context is a fork of [olddonkey/cache-refresher](https://github.com/olddonkey/cache-refresher) 0.2.4, which provides the cache countdown, the cost figures, auto-refresh and the languages. The fork adds:

- The usage guard and `/cache-guard`
- The context window: the ring on the status bar and the context section in the panel
- The compact button
- The Refresh and Guard toggles on the status bar
- The auto-refresh switch kept across restarts, and each session's cache countdown and open panel carried over a restart
- Waiting for the reset when a refresh is refused at the usage limit, instead of trying again every second

Bugs in the original cache features can also be reported to cache-refresher: https://github.com/olddonkey/cache-refresher/issues.

## License

MIT, as cache-refresher. See [LICENSE](LICENSE); the original copyright notice is kept.
