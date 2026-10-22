# Language resolution details and category exclusions

Rungs 3 through 5 arrive as an environment variable. Read it with exactly:

```bash
printenv CLAUDE_GLOSS_LANG || echo unset
```

Values are BCP-47 tags — `th`, `ja`, `zh-Hant`, `pt-BR`. Region and script are not
decoration: `zh-Hans` and `zh-Hant` are different scripts, and `pt-BR` and `pt-PT`
diverge in exactly the legal vocabulary this skill glosses.

Two values need explicit handling:

- **A comma-separated list is a fallback chain, not a request for two glosses.** Gloss into the first tag. Use a later tag only when you cannot render the first one confidently. Never stack two languages in one gloss — that breaks rules 6 and 7 below.
- **`simple-en` means the anchor is a plain-English definition** rather than a translation, and the micro-definition form is dropped as redundant: `subrogation (insurer pays you first, then pursues the other party)`.

**When resolution fails, do not guess.** Each failure has one correct response:

| Situation | Do this |
|---|---|
| `printenv` unavailable or not permitted | Treat as unset — fall to rung 6 |
| Unset | Ask once, then continue |
| Unrecognised or malformed tag (`thai`, `Thai`, `th-TH-x-junk`) | Ask which language was meant; never infer from a near-miss |
| Value is `en` or any English tag | Do not activate. There is nothing to anchor to — suggest `simple-en`, or explain-clear if the goal is simpler English |

When nothing is configured, ask once — then offer to persist to rung 3 and let the
user do it. Do not write to a settings file on your own initiative.

### Excluding categories

Glossing is not restricted to business domains. Software and infrastructure are
lockable domains too, so `singleflight` and `cache stampede` are legitimate Band 2
terms in a Redis repo. That is the default and it is deliberate — a developer
reading a second language is not only reading insurance contracts.

When a category is unwanted, name it in `CLAUDE_GLOSS_SKIP`, resolved through the
same six rungs as the language:

```bash
printenv CLAUDE_GLOSS_SKIP || echo none
```

Comma-separated free-text labels, matched against the locked domain — `software`,
`infra`, `frontend`, `finance`, `legal`, `medical`. When the locked domain matches
a skip entry, glossing is off for that domain entirely, Band 2 and Band 3 alike. A
term still glosses if it belongs to a second locked domain that is not skipped: in
an insurance repo skipping `software`, `subrogation` is glossed and `singleflight`
is not.

## Software domains are lockable

Any subject-matter domain is lockable, software included — `ioredis` and `express`
lock infrastructure the same way `stripe` and `hl7` lock payments and healthcare.
Breadth is the default; `CLAUDE_GLOSS_SKIP` is how a reader narrows it.
