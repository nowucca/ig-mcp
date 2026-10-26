#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

const G = "https://graph.instagram.com/v21.0";
type Acct = { igUserId: string; token: string };
const accounts: Record<string, Acct> = JSON.parse(
  readFileSync(process.env.IG_ACCOUNTS_FILE ?? "accounts.json", "utf8"));
const tok = (a: Acct) => a.token.startsWith("env:") ? process.env[a.token.slice(4)]! : a.token;
const acct = (n: string) => { const a = accounts[n]; if (!a) throw new Error(`Unknown account ${n}; have ${Object.keys(accounts)}`); return a; };

async function api(a: Acct, path: string, params: Record<string, string> = {}, method = "POST") {
  const u = new URL(`${G}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: tok(a) });
  const r = method === "GET"
    ? await fetch(`${u}?${body}`)
    : await fetch(u, { method, body });
  const j: any = await r.json();
  if (j.error) throw new Error(`IG API: ${j.error.message}`);
  return j;
}

async function waitReady(a: Acct, id: string) {
  for (let i = 0; i < 60; i++) {
    const s = await api(a, id, { fields: "status_code,status" }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Container ${id}: ${s.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Container ${id} not ready after 5 min`);
}

async function publish(a: Acct, params: Record<string, string>) {
  const c = await api(a, `${a.igUserId}/media`, params);
  await waitReady(a, c.id);
  const p = await api(a, `${a.igUserId}/media_publish`, { creation_id: c.id });
  const m = await api(a, p.id, { fields: "permalink" }, "GET").catch(() => ({}));
  return { mediaId: p.id, permalink: (m as any).permalink };
}

const ok = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });
const s = new McpServer({ name: "instagram", version: "0.1.0" });
const account = z.string().describe(`Account key: ${Object.keys(accounts).join(", ")}`);

s.tool("list_accounts", "List configured Instagram accounts", {}, async () => ok(Object.keys(accounts)));

s.tool("publish_reel", "Publish a reel from a public video URL",
  { account, videoUrl: z.string().url(), caption: z.string().optional(),
    collaborators: z.array(z.string()).max(3).optional().describe("Usernames to send collab invites"),
    shareToFeed: z.boolean().default(true), coverUrl: z.string().url().optional() },
  async ({ account: n, videoUrl, caption, collaborators, shareToFeed, coverUrl }) => ok(await publish(acct(n), {
    media_type: "REELS", video_url: videoUrl, share_to_feed: String(shareToFeed),
    ...(caption && { caption }), ...(coverUrl && { cover_url: coverUrl }),
    ...(collaborators?.length && { collaborators: JSON.stringify(collaborators) }) })));

s.tool("publish_story", "Publish a story (image or video URL)",
  { account, imageUrl: z.string().url().optional(), videoUrl: z.string().url().optional() },
  async ({ account: n, imageUrl, videoUrl }) => {
    if (!imageUrl === !videoUrl) throw new Error("Provide exactly one of imageUrl/videoUrl");
    return ok(await publish(acct(n), { media_type: "STORIES", ...(imageUrl ? { image_url: imageUrl } : { video_url: videoUrl! }) }));
  });

s.tool("publish_post", "Publish a feed image post",
  { account, imageUrl: z.string().url(), caption: z.string().optional(),
    collaborators: z.array(z.string()).max(3).optional() },
  async ({ account: n, imageUrl, caption, collaborators }) => ok(await publish(acct(n), {
    image_url: imageUrl, ...(caption && { caption }),
    ...(collaborators?.length && { collaborators: JSON.stringify(collaborators) }) })));

s.tool("recent_media", "List recent media for an account", { account, limit: z.number().default(10) },
  async ({ account: n, limit }) => { const a = acct(n);
    return ok(await api(a, `${a.igUserId}/media`, { fields: "id,media_type,caption,permalink,timestamp", limit: String(limit) }, "GET")); });

s.tool("publish_limit", "Check remaining publishes in the 24h window", { account },
  async ({ account: n }) => { const a = acct(n);
    return ok(await api(a, `${a.igUserId}/content_publishing_limit`, { fields: "quota_usage,config" }, "GET")); });

s.tool("reply_dm", "Reply to a user who messaged the account (within 24h window only)",
  { account, recipientId: z.string(), text: z.string() },
  async ({ account: n, recipientId, text }) => { const a = acct(n);
    return ok(await api(a, `${a.igUserId}/messages`, { recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text }) })); });

s.tool("create_highlight", "Not supported by Instagram API", { account },
  async () => ok({ error: "Instagram's API has no highlights endpoint. Add the story to a highlight in the app." }));

await s.connect(new StdioServerTransport());
