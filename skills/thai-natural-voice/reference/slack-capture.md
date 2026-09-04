# Slack voice capture

Use for a named Slack author or Slack message URL. This is the Slack acquisition
branch of the capture pipeline; return to its screening step after sampling.

## Contents

- [Select the access path](#select-the-access-path)
- [Read through a connector](#read-through-a-connector)
- [Read through a local CLI](#read-through-a-local-cli)
- [Resolve the author and collect samples](#resolve-the-author-and-collect-samples)
- [References](#references)

## Select the access path

Slack connections are independent. A working connector does not authenticate a
plugin MCP server or supply a local CLI token. Choose by callable read capability,
not by whether something named Slack is installed.

| Path | Discovery | Evidence of usable access |
|---|---|---|
| claude.ai Slack connector | If tools are deferred and ToolSearch is available, discover `mcp__claude_ai_Slack__*` search, user-profile, channel-read, or thread-read tools. Inspect the returned schemas before calling. | A successful read through the OAuth-connected provider; no local token is needed. |
| Slack plugin MCP | Inspect the exposed tools for `plugin:slack:slack`. | Search/read tools are available and a read succeeds. Authentication-only tools or installed workflow skills do not establish message access. |
| Local Slack CLI | Inspect live help and API results as described below. | The configured credential can read the requested messages; workspace-level developer login alone is insufficient. |

Honor the user's named path. When they identify an already working connector,
discover and use it before requesting CLI credentials or starting another login.
Without a path preference, prefer an already callable, authenticated connector
that can read the requested workspace. Inspect actual tool schemas rather than
inventing names from a namespace prefix.

If tools are deferred, use the host's tool-discovery facility. If neither the
connector nor a discovery tool is exposed in this session, report **unavailable
in this session**. That does not mean the user's connection is unauthenticated.
Keep this distinct from an exposed provider requiring authentication and from a
credential lacking message-read permissions. Use another path only when it is
available and authorized for the same source; the user may authorize that switch
in a follow-up. Do not repeat a failed CLI read after they identify its limitation.

## Read through a connector

1. Discover the read/search and user-profile tools for the chosen provider. Keep
   the task read-only even if send, draft, schedule, or reaction tools also exist.
2. Resolve workspace and author from existing evidence or a bounded lookup.
   A channel's creator field can help identify an account; it is not a writing
   sample and does not prove that the author wrote the channel's messages.
3. Search for messages by the resolved author using the actual tool's supported
   filters. Read the underlying message or thread when the result is only a
   snippet. Retain only that author's text for screening.
4. Record the provider, workspace, author, and selected message links as
   provenance. Apply the shared sampling rules below. A failed provider yields
   an access report, not a voice profile.

## Read through a local CLI

1. Discover the installed CLI and inspect its live help before forming commands.
   Several unrelated tools use the name `slack`; confirm which one is present.
   For the official CLI, inspect `slack --help`, `slack api --help`, and
   `slack auth list --help`.
2. Resolve the requested workspace using existing account context. For the
   official CLI, `slack auth list` lists developer authorizations; that alone
   does not prove message access. Verify the API identity with `slack api auth.test`.
3. Use an existing authorized API credential through the CLI's own token
   resolution, normally the `SLACK_USER_TOKEN` environment variable. Do not pass
   a token as a command argument, and keep credentials out of output, profiles,
   and repository files. A developer credential and a message-reading credential
   may have different permissions. Inspect API `ok` and `error`, not just process
   exit code. The CLI's `slack auth login` or `slack auth token` authorization is
   not proof that the selected API token has search access.
4. On `not_authed`, check the configured credential path. On `missing_scope`,
   report the required scope and pause acquisition until authorized access exists.
   On `not_allowed_token_type`, the request resolved to the wrong kind of token;
   see the token-type note below. Do not create an app, change scopes, or extract
   desktop session cookies as an implicit workaround. Follow the access-path rules
   above for another provider.

The official CLI supports these read-only shapes; verify against installed help:

```bash
slack api auth.test
slack api users.list limit=200
slack api assistant.search.info
slack api assistant.search.context --json '{"query":"from:<@USER_ID>","content_types":["messages"],"channel_types":["public_channel"],"limit":20,"sort":"timestamp","sort_dir":"desc"}'
```

Use the Real-time Search API for new integrations. `assistant.search.context`
accepts a user token without an `action_token`; a bot token requires an
`action_token` from a Slack message or `app_mention` event. A CLI-only capture
therefore needs a user token with at least `search:read.public` for public
channels, plus `search:read.users` for user lookup. Add
`search:read.private`, `search:read.im`, and `search:read.mpim` only when the
user has authorized those private conversation types. Add `search:read.files`
only when file search is needed.

The CLI resolves `SLACK_BOT_TOKEN` ahead of `SLACK_USER_TOKEN`, so a workspace
with both set can select the wrong token. A successful `auth.test` or
`users.list` is not evidence that search will work. Verify
`assistant.search.info` and then `assistant.search.context`, checking the API
envelope's `ok` and `error`. The current search endpoint returns at most 20
results per page; follow `response_metadata.next_cursor` for additional bounded
pages. Do not use the legacy `search.messages`/`search:read` path for new
capture runs.

## Resolve the author and collect samples

- Match the requested name against username, display name, and real name in the
  chosen workspace; exclude deactivated users unless explicitly requested.
  Use the resulting user id for message selection. Ask only if multiple plausible
  accounts remain or the workspace is unclear.
- For a message URL, resolve its workspace, channel, timestamp, and author with
  permitted read methods. A profile captures that author, not all thread speakers.
- Start with a bounded recent author search, at most 60 messages across no more
  than three 20-result pages. Respect any user-specified channel or date range.
  Inspect only messages attributed to the resolved author. Search snippets,
  quoted messages, bot reposts, and link previews do not establish that person's
  authorship.
- Select substantive Thai chat turns across more than one exchange when possible.
  Retain the selected message ids and permalinks for provenance. Exclude copied
  text and fragments that carry no usable language. Count the screened text with
  a Thai-aware segmenter as required by the main capture pipeline.
- If the first page is too thin, fetch another bounded page within the same
  authorized scope. Stop when thresholds are met, results are exhausted, or the
  retrieval would need a broader source. Record the actual sample window; recent
  results are not necessarily representative of the author's entire voice.

Keep raw messages transient and out of the distributed skill. Save only broad
traits, counts, source ids, and links in user storage. Nothing is sent to Slack.
If access fails, report the actual retrieved sample count and the error; a generic
preset is not a successful capture. Distinguish a user's report of a working
connection from a read verified in the current session.

## References

- [Official CLI API reference](https://docs.slack.dev/tools/slack-cli/reference/commands/slack_api/) — token resolution and parameter forms
- [Real-time Search API](https://docs.slack.dev/reference/methods/assistant.search.context/) — current search method, scopes, filters, and pagination
- [Real-time Search guide](https://docs.slack.dev/apis/web-api/real-time-search-api/) — user consent, private-channel access, and usage limits
- [Search scopes](https://docs.slack.dev/reference/scopes/search.read.public/) — granular search permissions
