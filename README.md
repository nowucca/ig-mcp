# ig-mcp

A multi-account Instagram MCP server for Claude. Configure as many Instagram accounts as you like; Claude selects one by name on every call (e.g. "post this reel to brand-a").

## Requirements
- Each account must be an Instagram **Business or Creator** account (Settings → Account type; switching a personal account to Creator is free and reversible).
- One Meta developer app (shared by all accounts).
- Media hosted at a public URL (S3, R2, etc.).

## Setup
1. developers.facebook.com → Create app → add the **Instagram** product → "API setup with Instagram login".
2. Add every Instagram account you'll use as a tester. Accounts you own work in Development mode without App Review.
3. For each account, generate a token with `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, then exchange it for a long-lived (60-day) token:
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=SECRET&access_token=SHORT`
   After that, the server refreshes tokens automatically (see Token refresh).
4. Get each account's ID: `GET https://graph.instagram.com/me?fields=user_id,username&access_token=...`
5. `cp accounts.example.json accounts.json` and edit it (see below).
6. `npm install && npm run build`

## Configuring accounts
`accounts.json` maps an account name of your choosing to its ID and token:

```json
{
  "<name>": { "igUserId": "<id>", "token": "env:<ENV_VAR>" }
}
```

- Add one entry per account; there's no limit.
- `token` is either `env:VAR_NAME` (recommended — read from the environment) or a literal token.
- Names are shown to Claude via `list_accounts` and in each tool's `account` parameter.
- `accounts.json` is gitignored. Never commit tokens.

To add an account later: add an entry, set its env var, restart Claude.

## Token refresh
Long-lived tokens last 60 days. The server keeps them alive automatically:

- On startup and every 12h it refreshes any token within 10 days of expiry (or with unknown expiry).
- Refreshed tokens are written to `tokens.json` (next to `accounts.json`, mode 0600, gitignored) and take precedence over the configured/env token.
- Instagram only allows refreshing tokens at least 24h old; brand-new tokens are retried on the next check.
- If a token has already expired, generate a new one, set it in env, and delete that account's entry from `tokens.json`.

| Env var | Default | Purpose |
|---|---|---|
| `IG_TOKEN_CACHE` | `<accounts dir>/tokens.json` | Where refreshed tokens are stored |
| `IG_REFRESH_DAYS_BEFORE` | `10` | Refresh when this close to expiry |
| `IG_REFRESH_CHECK_HOURS` | `12` | How often to check |

Tools: `token_status` shows expiry per account; `refresh_tokens` refreshes now (optionally `force`).

Note: refresh only runs while Claude has the server running. If you go 50+ days without opening Claude, run `npm run refresh` from cron.

## Claude Code
```sh
claude mcp add instagram \
  -e IG_ACCOUNTS_FILE=/abs/path/accounts.json \
  -e IG_TOKEN_BRAND_A=... -e IG_TOKEN_BRAND_B=... \
  -- node /abs/path/ig-mcp/dist/index.js
```

## Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "instagram": {
      "command": "node",
      "args": ["/abs/path/ig-mcp/dist/index.js"],
      "env": {
        "IG_ACCOUNTS_FILE": "/abs/path/accounts.json",
        "IG_TOKEN_BRAND_A": "...",
        "IG_TOKEN_BRAND_B": "..."
      }
    }
  }
}
```
Add one `IG_TOKEN_*` variable per account referenced in `accounts.json`.

## Tools
| Tool | Description |
|---|---|
| `list_accounts` | Configured account names |
| `publish_reel` | Reel from a video URL; optional caption, cover, up to 3 collaborator invites |
| `publish_story` | Story from an image or video URL |
| `publish_post` | Feed image post; optional caption and collaborators |
| `recent_media` | Recent posts for an account |
| `publish_limit` | Remaining publishes in the 24h window |
| `reply_dm` | Reply to a user who messaged the account within 24h |
| `token_status` | Token source and expiry per account |
| `refresh_tokens` | Refresh tokens now (all or one; `force` optional) |
| `create_highlight` | Returns "unsupported" — the API has no highlights endpoint |

## Limits
- ~50 published posts per account per 24h.
- Reels: MP4/H.264, 9:16, 3s–15min.
- Stories: no stickers, links, or polls via API.
- DMs: replies only, within 24h of the user's last message.

### Cron example (daily)
```
0 9 * * * cd /abs/path/ig-mcp && IG_ACCOUNTS_FILE=/abs/path/accounts.json IG_TOKEN_BRAND_A=... npm run -s refresh >> refresh.log 2>&1
```
