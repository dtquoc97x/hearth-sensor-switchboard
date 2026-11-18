<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Sensor simulation and relay automation rules live in `src/lib/iot.ts` as pure functions — keeps rules unit-testable and swappable for real device data later.
- Device payloads are free-form (only `Uid` is required, field names are arbitrary), so read readings through `findFieldName`/`findFieldValue` in `src/lib/iot.ts` — never compare field keys exactly.
- Relay modules store independent data sources for each automatic-rule input; resolve and evaluate them through pure helpers in `src/lib/iot.ts` so missing device data cannot silently use simulation.
