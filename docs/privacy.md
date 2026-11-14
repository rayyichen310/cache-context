# What cache-context reads, changes, stores and sends

[Back to the README](../README.md)

## Sends

A refresh is a request to the same model over your conversation's existing prefix, made through Claude Code (`$.model.fork`). It goes where your messages already go and nowhere else. It is sent only when you press "Refresh now", run `/cache-ping`, or have turned auto-refresh on. **Refreshes use your plan's usage or your API credit**, a little each: the cached prefix at the read price plus a few dozen tokens.

A compaction is sent only when you press the compact button.

With the usage guard on, the continue prompt after a pause is sent as a message of yours would be, and is marked as coming from this plugin.

With "Message if reply ≥ 2k" on, the first auto-refresh after a long reply is a short message sent the same way, also marked as coming from this plugin, which asks Claude to answer "ok". It and the answer stay in your conversation.

The mod makes no network requests of its own, has no telemetry and no dependencies. The only command it runs opens a memory file or custom agent in your default app when you press its ↗.

## Reads

- The token usage of each main-conversation response.
- The session's context usage by category.
- The text of each main-conversation reply as it passes, only to count its Chinese and Latin letters.
- The environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `LANG`, `LC_ALL`, and `USERPROFILE` or `HOME`.
- Your plan's rate-limit usage, to tell which lifetime applies and to hold refreshes back while the usage limit is reached; with the usage guard on, the five-hour usage after each reply.
- Of your files, only whether a custom agent's file exists, to offer opening it.

It does not read your settings files, your saved transcript or any credential.

## Changes

One setting, Idle compaction (`idleCompaction` in `/config`). It is turned off while any session has auto-refresh on, and back on when the last one turns it off or ends. A session that crashed or was killed counts as ended five minutes after it was last heard from, when the next session starts or changes auto-refresh.

It is changed the way `/config` changes it, in your user settings, and only when it was on; if it was off when auto-refresh came on, it stays off. If the mod is disabled or removed while it holds the setting off, turn it back on in `/config`.

## Stores

In the plugin's own local store:

- Up to 100 records of cache activity: time, token counts, model, hit or miss.
- Whether a refresh has been seen to extend the cache.
- The auto-refresh switch and its limit, and the long-reply switch and its threshold.
- The language Claude last replied in, and a language you set yourself.
- Whether it turned idle compaction off, and which sessions have auto-refresh on with when each was last heard from.
- The usage guard's switches and threshold, until when "Not this time" keeps it quiet, and for each paused session its reset and planned continue times.
- For each session, its cache countdown (times, token count, model, lifetime) and whether its panel was open.

No message text is stored.
