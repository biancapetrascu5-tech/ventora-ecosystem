# AttentionList

"Au nevoie de tine": the few things that need a person, each with its own action, at the top of every app's Today screen.

**Props.**
- `items`: `[{ id, icon, tone?, title, meta?, time?, actions?: [{ label, icon?, primary?, quiet?, onClick }] }]`, where `tone` is `'neutral' | 'attention' | 'danger'`.
- `empty`: what to show when there is nothing — usually nothing at all.

**Tone (PASUL 2 b, S1).** Every state has its icon and its text; colour only adds meaning.
- **Neutral (default):** the icon sits on a neutral tint. This covers what needs you but not right now:
  - appointments not confirmed;
  - requests;
  - in EasyBook, messages without confirmation, the phone's battery, tomorrow's capacity and an old phone app.
- **`tone: 'attention'`:** peach, only for "are nevoie de tine acum". In EasyBook that is "the business phone is disconnected and has messages waiting"; elsewhere, what has to be done today or it is lost (an overdue invoice in MoneyDesk, a leave request in TeamSpace).
- **`tone: 'danger'`:** red, only for an error or a loss: messages that did not go out, money owed.

Keep it short: three to five items. The rest belongs in a list. The preview shows the three tones, a real day in EasyBook, the empty state, Light and Dark frames, and German and Italian.
