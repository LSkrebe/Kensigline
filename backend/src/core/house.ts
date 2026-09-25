import { setTimeout as sleep } from "node:timers/promises";

type HousePtrListing = {
  filing_id: string;
  pdf_url: string;
  name: string | null;
  office: string | null;
  filing_year: number;
};

function absHouseUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://disclosures-clerk.house.gov${p}`;
}

function pickFirst(m: RegExpMatchArray | null, idx: number) {
  const v = m?.[idx];
  return v != null ? String(v) : null;
}

function parseHouseMemberSearchHtml(html: string, filingYear: number): HousePtrListing[] {
  // The response HTML is a small table with rows containing:
  // - memberName cell
  // - office cell
  // - filing year
  // - link to a PDF (PTR)
  // We keep parsing deliberately simple and resilient.
  const rows = html.split(/<\/tr>/gi);
  const out: HousePtrListing[] = [];
  for (const r of rows) {
    const href = pickFirst(r.match(/href="([^"]+\.pdf)"/i), 1);
    if (!href) continue;
    const pdfPath = href.startsWith("http") ? href : href.startsWith("/") ? href : `/${href}`;
    const pdf_url = pdfPath.startsWith("http") ? pdfPath : absHouseUrl(pdfPath);
    const filing_id = pickFirst(pdf_url.match(/\/(\d+)\.pdf$/i), 1);
    if (!filing_id) continue;

    const name = pickFirst(r.match(/class="memberName"[\s\S]*?>\s*([^<\n]+?)\s*</i), 1);
    const office = pickFirst(r.match(/data-label="Office"[\s\S]*?>\s*([^<\n]+?)\s*</i), 1);
    out.push({ filing_id, pdf_url, name, office, filing_year: filingYear });
  }
  return out;
}

async function fetchHouseAntiForgeryAndCookies(): Promise<{ token: string; cookie: string }> {
  const r = await fetch("https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch", {
    headers: {
      "user-agent": "kensigline/0.1 (+politicians-ptr)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  const html = await r.text();
  const token = pickFirst(html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i), 1);
  if (!token) throw new Error("house_ptr_missing_request_verification_token");

  // Node fetch flattens set-cookie; we need to preserve only the cookie key/value pairs.
  const setCookie = r.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(",")
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) throw new Error("house_ptr_missing_cookie");
  return { token, cookie };
}

async function postHouseMemberSearch(opts: { filingYear: number; lastName?: string }): Promise<string> {
  const { filingYear, lastName } = opts;
  const { token, cookie } = await fetchHouseAntiForgeryAndCookies();

  const body = new URLSearchParams({
    LastName: String(lastName ?? ""),
    FilingYear: String(filingYear),
    Office: "",
    State: "",
    District: "",
    __RequestVerificationToken: token,
  }).toString();

  const r = await fetch(absHouseUrl("/FinancialDisclosure/ViewMemberSearchResult"), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      "user-agent": "kensigline/0.1 (+politicians-ptr)",
      accept: "text/html, */*",
    },
    body,
  });
  if (!r.ok) throw new Error(`house_ptr_search_failed_${r.status}`);
  return await r.text();
}

export async function listHousePtrPdfs(opts: {
  filingYear: number;
  max?: number;
  lastName?: string;
}): Promise<HousePtrListing[]> {
  const html = await postHouseMemberSearch({
    filingYear: opts.filingYear,
    lastName: opts.lastName ?? "",
  });
  const rows = parseHouseMemberSearchHtml(html, opts.filingYear);
  const max = Math.max(1, Math.min(2000, Number(opts.max ?? 400)));
  return rows.slice(0, max);
}

export async function listHousePtrPdfsWithRetry(opts: {
  filingYear: number;
  max?: number;
  lastName?: string;
}): Promise<HousePtrListing[]> {
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      return await listHousePtrPdfs(opts);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
  return [];
}

