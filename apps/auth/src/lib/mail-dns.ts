export const SPF_INCLUDE = "include:spf.turbo-smtp.com";
export const DKIM_SELECTOR = "turbo-smtp";
export const DKIM_VALUE = "k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDT3MWLni6so1q9eQggRYBCLHFjohZkCnYHH8gZNDBm6zRrodRVpWpJQW7x3cWWiuBhS1X0IfBB80l5tqFa+yc+mVgnk8tkUzOHFbPQPp4fi7egTpMtsQW/ZMrxw73SItNvPr72qvJTYZNPxarMx+ULjEWybcfEdXHPY8jslGcpCwIDAQAB";
export type TxtLookup = { root: string[]; dkim: string[]; dmarc: string[]; ownership: string[] };
export type DnsRecord = { record: "OWNERSHIP" | "SPF" | "DKIM" | "DMARC"; type: "TXT"; name: string; host: string; value: string; current: string[]; status: "verified" | "missing" | "conflict"; action: "none" | "add" | "update" };
export function planMailRecords(domain: string, token: string, txt: TxtLookup): DnsRecord[] {
 const entry = (record: DnsRecord["record"], host: string, value: string, current: string[], status: DnsRecord["status"]): DnsRecord => ({ record, type: "TXT", name: host === "@" ? domain : `${host}.${domain}`, host, value, current, status, action: status === "verified" ? "none" : current.length ? "update" : "add" });
 const spf = txt.root.filter(v => /^v=spf1(?:\s|$)/i.test(v.trim()));
 const includes = spf.length === 1 && spf[0].toLowerCase().split(/\s+/).includes(SPF_INCLUDE);
 const spfValue = !spf.length ? `v=spf1 ${SPF_INCLUDE} ~all` : includes ? spf[0] : spf[0].trim().replace(/^(v=spf1)/i, `$1 ${SPF_INCLUDE}`);
 const dmarc = txt.dmarc.filter(v => /^v=dmarc1(?:;|\s|$)/i.test(v.trim()));
 const key = (v: string) => /(?:^|;)\s*p=([^;]*)/i.exec(v)?.[1].replace(/\s+/g, "");
 return [entry("OWNERSHIP", "_webdock-mail", `webdock=${token}`, txt.ownership.includes(`webdock=${token}`) ? txt.ownership : [], txt.ownership.includes(`webdock=${token}`) ? "verified" : "missing"), entry("SPF", "@", spfValue, spf, spf.length > 1 ? "conflict" : includes ? "verified" : "missing"), entry("DKIM", `${DKIM_SELECTOR}._domainkey`, DKIM_VALUE, txt.dkim, txt.dkim.some(v => key(v) === key(DKIM_VALUE)) ? "verified" : txt.dkim.length ? "conflict" : "missing"), entry("DMARC", "_dmarc", dmarc[0] || "v=DMARC1; p=none;", txt.dmarc, dmarc.length > 1 ? "conflict" : dmarc.length ? "verified" : "missing")];
}
async function txt(name: string, fetchImpl: typeof fetch): Promise<string[]> {
 const url = new URL("https://cloudflare-dns.com/dns-query"); url.searchParams.set("name", name); url.searchParams.set("type", "TXT");
 const controller = new AbortController(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  return await Promise.race([new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error("Public DNS lookup timed out.")); }, 8000); }), (async () => {
   const response = await fetchImpl(url, { headers: { Accept: "application/dns-json" }, cache: "no-store", redirect: "error", signal: controller.signal });
   reader = response.body?.getReader(); if (!response.ok || !reader || Number(response.headers.get("content-length")) > 65536) throw Error();
   let body = "", size = 0; const decoder = new TextDecoder();
   for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 65536) throw Error(); body += decoder.decode(part.value, { stream: true }); }
   const data = JSON.parse(body + decoder.decode());
   if (data.Status === 3) return [];
   if (data.Status !== 0 || data.CD === true) throw Error();
   if (data.Answer !== undefined && !Array.isArray(data.Answer)) throw Error();
   return (data.Answer || []).filter((a: { type: number; data: string }) => a.type === 16 && typeof a.data === "string").map((a: { data: string }) => a.data.replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
  })()]);
 } catch { throw Error("Public DNS lookup failed."); } finally { clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => {}); }
}
export async function lookupMailTxt(domain: string, fetchImpl: typeof fetch = fetch): Promise<TxtLookup> {
 const [root, dkim, dmarc, ownership] = await Promise.all([txt(domain, fetchImpl), txt(`${DKIM_SELECTOR}._domainkey.${domain}`, fetchImpl), txt(`_dmarc.${domain}`, fetchImpl), txt(`_webdock-mail.${domain}`, fetchImpl)]);
 return { root, dkim, dmarc, ownership };
}
