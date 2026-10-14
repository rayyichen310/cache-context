# cache-context

A Claude Code mod that puts two things above the prompt: how long the prompt cache has left, and how full the context window is. It is a fork of [olddonkey/cache-refresher](https://github.com/olddonkey/cache-refresher) 0.2.2, which does the first; this fork adds the second.

[中文說明](#中文說明)

## What it adds to cache-refresher

- **A second ring on the band.** Next to the cache countdown, a blue ring fills with the share of the context window in use, followed by the figures: `Context 182.6k/350k (52%)`.
- **A compact button** on the band and in the panel. It does what `/compact` does. It is hidden while Claude is replying, when compaction is refused.
- **A context section at the top of the panel**, modelled on the desktop app's own usage popover: the fill, a segmented bar coloured by category (system prompt, tools, messages, the auto-compact buffer, ...), the tokens left before auto-compaction, and a legend that opens to show each colour's category, tokens and share.

To keep the band to one line, the cache's token count, rebuild cost and auto-refresh count move from the band into the panel, which already shows them.

Everything else is cache-refresher's own, unchanged: the countdown, auto-refresh, the commands (`/cache-status`, `/cache-panel`, `/cache-ping`, `/cache-auto`, `/cache-lang`) and their behaviour. See its README for those.

## Where the numbers come from

- **Context in use** is the input side of the last response as the API counted it (the same figure as the status line's context usage). It costs nothing to read.
- **The window** is the compaction window when one is set (as `/context` measures against), otherwise the model's.
- **Left before auto-compaction** is the engine's auto-compact threshold minus the tokens in use; the threshold already leaves out the auto-compact buffer.
- **The categories** in the bar and the legend are estimated locally, as `/context`'s summary is. No request is sent for them.

## What it reads, stores and sends

As cache-refresher, plus:

- **Reads** the session's context usage and its local per-category estimate, after each main-conversation turn.
- **Sends** a compaction only when the compact button is pressed.
- **Stores** nothing more. The context figures live in session state only.

## Install

```
/plugin install cache-context --marketplace rayyichen310/cache-context
```

Type it at the prompt of a terminal session (`claude`); answer `y` to add the marketplace, then choose a scope. Once installed at the user scope it also loads in the desktop app's Code tab.

If you also have cache-refresher installed, disable it (`claude plugin disable cache-refresher@olddonkey`): both draw a band and register the same commands.

Requires Claude Code v2.1.287 or later (the mods API).

## Limits

- The bar's colours are fixed by category order on the desktop, and follow the theme's `/context` colours in the terminal.
- Text added by this fork exists in Traditional Chinese, Simplified Chinese and English; other languages show the English.
- Auto-refresh learns afresh whether refreshes extend the cache: the plugin's store is its own, so until a refresh has been seen to work it sends one per idle period, as cache-refresher does when first installed.

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test
```

`hooks/context.ts` holds the context window's figures, words and drawings; `hooks/views.ts` draws the band and the panel; `tests/context.test.ts` covers what this fork adds.

## License

MIT, as cache-refresher. See [LICENSE](LICENSE); the original copyright notice is kept.

## 中文說明

一個 Claude Code mod，在輸入框上方同時顯示兩件事：提示快取還剩多久，以及上下文視窗用了多少。它從 [olddonkey/cache-refresher](https://github.com/olddonkey/cache-refresher) 0.2.2 改來，原版負責前者，這個分支加上後者。

**比原版多了什麼**

- **第二個圈**：快取倒數旁邊多一個藍圈，填滿比例就是上下文的佔比，後面接數字，例如「上下文 182.6k/350k (52%)」。
- **壓縮按鈕**：在那一行和詳情面板裡都有，效果和 `/compact` 一樣。Claude 回應中不能壓縮，這時按鈕會先藏起來。
- **詳情面板最上方的「背景資訊視窗」**：仿照桌面 app 原本的用量彈窗，有依類別上色的分段條和「距自動壓縮剩多少」。點「顏色說明」會展開每個顏色代表的類別、token 數和佔比。

為了讓那一行放得下，快取的 token 數、過期重建成本和自動續期次數都移到詳情面板裡（面板原本就有這些資訊）。其他功能（倒數、自動續期、各指令）都和原版一樣。

**安裝**：在終端機的 `claude` 裡輸入上面那行 `/plugin install …`。如果也裝了原版 cache-refresher，請把原版停用，否則會畫出兩行，指令也會重複。
