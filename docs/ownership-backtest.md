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

Cost is about $0.0001 per video for Jev.

## Clef thumbnail check

Cloudflare's [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) decision models (October 2026) use the same API as Jev but can also see images, and the Convex AI Gateway serves them as `cloudflare/clef`, `cloudflare/clef-flash` and `cloudflare/clef-omni`. Images go inside `state` as `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }` parts; the gateway rejects Clef's top-level `images` field.

Same backtest, same 411 videos:

| Version | Accuracy | Auto-decided at 90% | Wrong at 90% |
| --- | --- | --- | --- |
| Clef, same request as Jev | 84% | 34% | 1 |
| Clef, same text sent as a string part (control) | 87% | 33% | 0 |
| Clef plus the video's thumbnail | 77% | 22% | 3 |
| Clef plus the thumbnail and 3 of Mike's thumbnails | 76% | 28% | 2 |

So Clef is worse than Jev at the overall call, and putting the thumbnail into that same question makes it worse still. Asking it a focused visual question works better. Mike is on almost all of his own thumbnails, usually in a black Convex cap. "Is Mike in this thumbnail?" scored 99% on two April 2025 videos with a different presenter in Mike's thumbnail style, so it matches the general look rather than recognising him. "Is someone wearing a black cap with the white Convex logo?" is more reliable.

Shipped as a tie-breaker: when Jev leans "mine" (50 to 90%) but can't decide, Clef checks the thumbnail for the cap, and 97%+ tips it to "mine". It never overrides Jev leaning the other way. Across two Jev runs and two cap runs it made no wrong calls on the full history, and raised auto-decisions on videos since July 2026 from 67% to 73 to 76%. Clef's cap scores move a lot with small prompt changes, so keep the 97% bar. Clef-flash never got confident enough to help. Each thumbnail check costs about $0.0017 and only runs on the borderline videos.
