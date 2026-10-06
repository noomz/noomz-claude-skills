# Security

Flightdeck observes your session and keeps derived fields in session state. It never keeps your prompts or your subagents' answers. Every text it keeps goes through `scrub()` in `hooks/hygiene.ts`, which masks secrets and cuts the text to a fixed cap. "What it keeps" in the README lists each field and the test that checks it. `/flightdeck audit` lists what is held at any moment. It makes no network requests, runs no processes, and reads or writes no files.

`scrub()` masks by pattern. A secret with no key name and no known token shape can survive in the two fields that keep words: an architect's advice line and an agent's description.

If you find a way it could leak data, for example a credential format that `scrub()` misses or a field that skips it, report it privately through GitHub's **Security → Report a vulnerability** on [noomz/noomz-claude-skills](https://github.com/noomz/noomz-claude-skills) rather than in a public issue. A fix to `scrub()` lands in `mods/pinboard/hooks/hygiene.ts` and `mods/flightdeck/hooks/hygiene.ts` together, with a case in `tests/hygiene.test.ts`.
