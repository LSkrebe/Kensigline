/**
 * Lightweight smoke tests for Bosha feed helpers (no DB, no network).
 * Run: npx tsx src/bosha/bosha-smoke.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { extractLinksFromFeedXml, stripHtmlToText } from "./feeds.js";

test("stripHtmlToText removes tags", () => {
  assert.equal(stripHtmlToText("<p>Hello <b>world</b></p>"), "Hello world");
});

test("RSS 2.0 link extraction", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Test PR</title><link>https://example.com/a</link></item>
    <item><title>Two</title><link>https://example.com/b</link></item>
  </channel></rss>`;
  const links = extractLinksFromFeedXml(xml, "https://feeds.example.com/news.xml");
  assert.equal(links.length, 2);
  assert.equal(links[0]!.url, "https://example.com/a");
});

test("Atom link extraction", () => {
  const xml = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Call</title>
      <link href="https://cdn.example.com/transcript/123"/>
    </entry>
  </feed>`;
  const links = extractLinksFromFeedXml(xml, "https://example.com/atom.xml");
  assert.equal(links.length, 1);
  assert.ok(links[0]!.url.includes("cdn.example.com"));
});
