# What each hook does

[Back to the README](../README.md)

The mod registers these hooks. Two features change what Claude is sent. The usage guard, while it is on and the five-hour usage is at its threshold, adds a note after tool results, refuses tools, and sends the continue prompt. The long-reply switch, while it is on, sends one short message before refreshing a long reply and refuses tools in that message's turn.

| Hook | What it does | What it changes |
| :- | :- | :- |
| `session.start` | Restores the auto-refresh setting you last chose, the usage guard's settings, a paused session's planned continue, and after a restart this session's unexpired cache and open panel; starts a one-second timer that redraws the countdown, sends a refresh, the long-reply message or the guard's continue when one is due and, while auto-refresh is on, renews this session's hold on idle compaction once a minute; keeps this session's cache and panel state in the store when either changes; turns idle compaction back on if it was left off by a session that has since ended; registers the six commands; and measures the context window | Nothing: the event is passed on as it came |
| `session.measure` | Measures the context window again whenever Claude Code does | Nothing: the event is passed on as it came |
| `turn.step` | For the main conversation only, reads the finished step's token usage and counts the letters of its reply; with the usage guard on, reads the five-hour usage | Nothing: every chunk and the result are passed on untouched |
| `turn.start`, `turn.complete` | Note the main conversation's turn, so the guard can end it and the long-reply message's turn can be told apart; when a wrapped-up turn ends, pause; when the continue's turn ends, end the pause or plan a retry | Nothing |
| `tool.call` | In the long-reply message's turn, refuses every call. While the guard is wrapping up, adds the note to each tool result for Claude; past 8 tools or 99%, refuses the call and ends the turn at the third refusal | Only in that turn and while wrapping up; otherwise the call is passed on untouched |
| `prompt.submit` | A message you send ends a pause, dropping the planned continue, clears the last refresh from the status line, and lets the next idle period send its own long-reply message | Nothing: the prompt is passed on as it came |
| `classic.SessionStart` | On resume or fork, takes the time since the last response, the context size, the model and whether Claude Code counts the cache as expired, so the cache's state shows before the first turn; after compaction, or on a resume Claude Code counts as expired, forgets the old cache | Nothing: it adds no context and passes the event on |
| `classic.PostModelSwitch` | Takes the cache lifetime Claude Code reports with the switch, and marks the tracked cache as no longer usable when the model changes | Nothing |
| `session.end` | If auto-refresh is still on, turns it off (so the conversation after a `/clear` or a resume starts with it off) and turns idle compaction back on unless another session still has auto-refresh on | Nothing: the event is passed on as it came |
| `command.run` | Answers its own six commands, matched by name; `/cache-auto` also turns idle compaction off or back on | Only those commands; no other command reaches it |
| `ui.render` (`AbovePrompt`) | Adds the one-line status bar under what is already above the prompt | Adds its own line; leaves the rest as it was, and stands aside while a survey is shown |
| `ui.render` (`Pane`, id `cache`) | Draws the mod's own panel | Only its own panel |
