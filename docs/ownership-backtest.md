# Jev ownership backtest

New Convex channel videos are sorted into "mine" or "not mine" by [Jev](https://docs.typesafe.ai/introduction), TypeSafe's decision model, through the Convex AI Gateway (`convex/ownership.ts`, `convex/lib/ownershipJudge.ts`). Jev only decides when it is at least 90% sure. Anything else stays "undecided" and lands in the moderation email.

Backtested in October 2026 against Mike's 411 existing decisions (196 mine, 215 not mine, 2022 to 2026). Each video was judged using only the 25 latest "mine" and 25 latest "not mine" videos published before it as examples. That matches what Jev sees for a brand new video in production, where the examples are Mike's own 25 latest decisions of each kind (Jev's calls are left out). Asking Jev about an older undecided video from the admin uses the same latest examples, which can include videos published after it.

| Version | Accuracy | Auto-decided at 90% | Wrong at 90% |
| --- | --- | --- | --- |
| Video text only, no examples | 69% | 61% | 37 |
| Text plus example titles | 85% | 67% | 8 |
| Text plus examples with YouTube upload settings (shipped) | 92% | 45% | 0 |

The shipped version made no wrong calls at 90% in two separate runs. On videos since July 2026 it auto-decides about two thirds. Dropping the threshold to 85% auto-decides 86% of recent videos but made one or two wrong calls across the full history.

What made the difference:

- Jev on its own leans towards "not mine" and confidently mislabels Mike's founder chats and deep dives.
- YouTube upload settings (category, default language, default audio language, whether it was a live stream) work like a fingerprint for whoever uploaded the video. Live streams are never Mike's, and since July 2026 almost all of Mike's uploads use Science & Technology. The fingerprint drifts over time (other people used Science & Technology before 2025), so it goes to Jev as evidence alongside recent examples rather than as a hard rule.

Cost is about $0.0001 per video.
