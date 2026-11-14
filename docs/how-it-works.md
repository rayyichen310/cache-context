# How cache-context works

[中文](how-it-works.zh-TW.md) · [Back to the README](../README.md)

## Prompt cache and its lifetime

Claude Code reuses the cached part of your conversation at the cache-read price, a tenth of the normal input price for most models. The cache entry lives for five minutes or one hour after it was last used. Come back after that and your next message writes the conversation to the cache again at the cache-write price: 1.25 times the normal input price for the five-minute cache, 2 times for the one-hour cache.

Which lifetime applies is read from the environment variables Claude Code itself honors (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`). With none of them set, the mod assumes one hour on a subscription inside its plan limits and five minutes elsewhere. When Claude Code itself gives the lifetime (at a model switch, and on a resume between five minutes and an hour after the last response that it still counts as cached, which means one hour), the mod uses that in place of its own assumption, except past the plan's limits. Either way it corrects the lifetime from what it observes.

Only the main conversation is tracked; subagents keep caches of their own. After compaction the mod starts tracking afresh, and after a model switch it shows the cache as unavailable, since what was cached no longer matches.

## When a refresh pays off

A refresh replays the conversation's last request with Claude's last reply after it. It reads the cached prefix at the cache-read price `r`, writes that last reply into the cache, and adds a few dozen tokens for the request itself. The reply's length is the output tokens of Claude's last reply. A refresh caches the reply for five minutes, even when the conversation itself uses the one-hour cache: a second refresh within five minutes reads the reply from the cache, but one sent later, as every auto-refresh is, writes it again. So the mod counts the reply in every refresh, at the five-minute write price (1.25 times the normal input price).

After an expiry the prefix is written again at the cache-write price `w`, which is `w − r` per token more than a hit would have cost. Call one refresh's cost `p` and that difference over the whole prefix `L`. Refreshes are worth sending while their total stays under `L`, which gives at most about `L / p` refreshes in a row. A refresh pays off whenever the chance you come back within its window is above about `p / L`. `/cache-status` shows both numbers for your model, cache size and last reply.

Dollar figures are computed at API list prices. On a subscription they are an equivalent, not a charge.

## Auto-refresh rules

- A refresh is sent shortly before the cache would expire. Auto-refresh stops at the limit you set (12 per idle period unless you change it). When the model's price is known, it also stops before the refreshes would cost more than one expiry adds.
- Until a refresh has been seen to extend the cache, it sends only one per idle period.
- A refresh refused at the usage limit is not tried again before the reset and does not count against your limit; with no reset time given, the cache is not refreshed again until the next reply. Any other failed refresh counts as one, and the next comes at least a minute later.
- With "Message if reply ≥ 2k" on, and Claude's last reply at least that long (2,000 tokens unless you change it), the first refresh of an idle period is a short message in the main conversation instead of a fork. It is sent as a message of yours would be, marked as coming from this plugin, and asks Claude to answer "ok"; tools are refused in its turn. The main conversation caches what it sends at its own lifetime, so the long reply goes into the cache with it, and the refreshes after it write only the short answer. The long reply is written once at the cache-write price, which your next message would have paid anyway, so the message saves about the reply's length at the five-minute write price on every refresh. It is sent once per idle period, only while the usage guard is not wrapping up or paused. If Claude Code refuses the message, or its turn has not started two minutes later, the refresh goes out as a fork. The cost estimates count the long reply until the message's turn has ended, then the short answer.
- The switch and its limit are kept in the mod's own store, so they survive restarts and updates of Claude Code and apply to later sessions until you turn auto-refresh off.
- Each session's cache countdown and whether its panel was open are kept too. When a session comes back after a restart, a cache that has not yet expired is tracked and refreshed again, and the panel opens again if it was open. Records of sessions not seen for 7 days are dropped.

## Idle compaction

With the one-hour cache and at least 200,000 tokens of context (`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, never below 100,000), Claude Code compacts an idle conversation at 90% of the cache's lifetime, 54 minutes after your last turn. Auto-refresh waits until five minutes before expiry, and a refresh does not postpone the compaction, so without intervention the conversation would be compacted before the first refresh.

So while any session has auto-refresh on, the mod turns Idle compaction (`idleCompaction` in `/config`) off in your user settings, and turns it back on once no session has auto-refresh on. If the setting was already off, the mod leaves it alone. A session that crashed or was killed counts as ended five minutes after it was last heard from, when the next session starts or changes auto-refresh.

If a project, local or managed settings file holds the setting, the mod cannot change it: set `"idleCompaction": false` there, or raise `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` above your context size. If the mod is disabled or removed while it holds the setting off, turn it back on in `/config`.

## Context window

The figures are the ones `/context` shows, read locally after each main-conversation turn; no request is sent for them. The section's own words exist in Traditional Chinese, Simplified Chinese and English; other languages show the English.

## Usage guard in detail

1. After each of Claude's replies, the guard reads the five-hour usage.
2. When the usage reaches the threshold (97% unless you change it, 50–99%), each tool result carries a note only Claude reads. The note asks Claude to finish the step in hand, write down its progress and the next step, and stop.
3. After 8 more tools, or at 99% usage, tools are refused. The third refused call ends the turn.
4. When the turn ends, the session is paused. Auto-refresh keeps the cache alive through the pause as usual.
5. With "Continue after the reset" on (the default), the mod sends a continue prompt 30 seconds after the five-hour reset. If that is refused, it tries again after 5 seconds, then each minute, five times at most. The continue prompt is marked as coming from this plugin.

While the guard wraps up or the session is paused, the panel shows Stop now, Not this time, Continue now and Cancel continue. "Not this time" keeps the guard quiet until the reset.

- Your own message ends a pause, even before the reset. If the usage is still over the threshold, the guard starts wrapping up again after the next reply.
- With the seven-day usage used up, there is no automatic continue.
- The guard reads the usage after each reply, so a single long reply can pass the threshold before the guard sees it.
- "Continue after the reset" is the mod's own switch. It does not change Claude Code's "Continue automatically at usage limit" (`autoContinueAtUsageLimit`): Claude Code lets a mod turn that setting off but not on.
- The guard's settings live in the panel and `/cache-guard` only. They have no `/config` row, as Claude Code does not let a mod change its own `userConfig` rows.
- The guard's words exist in Traditional Chinese and English.
