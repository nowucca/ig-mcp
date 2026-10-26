# Instagram MCP (multi-account)

Accounts: tarot app, Constellize, personal. All three must be **Business or Creator** accounts (Settings → Account type; personal → Creator is free and reversible).

## Setup
1. developers.facebook.com → Create app → add **Instagram** product → "API setup with Instagram login".
2. Add each IG account as a tester; generate a token per account with `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`.
3. Exchange for long-lived tokens (60 days):
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=SECRET&access_token=SHORT`
   Refresh: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=LONG`
4. Get each `igUserId`: `GET https://graph.instagram.com/me?fields=user_id,username&access_token=...`
5. `cp accounts.example.json accounts.json`, fill IDs.
6. `npm install && npm run build`

Your own accounts work as testers in Development mode — no App Review needed.

## Claude Code
claude mcp add instagram -e IG_ACCOUNTS_FILE=/abs/accounts.json -e IG_TOKEN_TAROT=... -e IG_TOKEN_CONSTELLIZE=... -e IG_TOKEN_PERSONAL=... -- node /abs/ig-mcp/dist/index.js

## Claude Desktop (claude_desktop_config.json)
{"mcpServers":{"instagram":{"command":"node","args":["/abs/ig-mcp/dist/index.js"],
 "env":{"IG_ACCOUNTS_FILE":"/abs/accounts.json","IG_TOKEN_TAROT":"...","IG_TOKEN_CONSTELLIZE":"...","IG_TOKEN_PERSONAL":"..."}}}}

## Tools
list_accounts, publish_reel (with collab invites), publish_story, publish_post, recent_media, publish_limit, reply_dm, create_highlight (returns unsupported).

Media must be at a public URL (S3/R2/etc.). Reels: MP4/H.264, 9:16, 3s–15min.
