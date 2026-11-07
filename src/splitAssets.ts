// Cloudflare Pages caps files at 25 MiB, so scripts/pages-postbuild.mjs splits the bigger asset files into parts and
// lists them in osrs-assets/split-assets.json. This wraps fetch so a request for a split file fetches its parts and
// answers with the joined bytes; every other request passes straight through.
const ASSET = /\/osrs-assets\/([0-9a-f]{64}\.(?:bin|soundpack))$/;

export function installSplitAssetFetch(): void {
  const fetchFile = window.fetch.bind(window);
  let splits: Promise<Record<string, number>> | null = null;
  const loadSplits = () =>
    (splits ??= fetchFile(new URL("osrs-assets/split-assets.json", window.location.href).href)
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({})));

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const name = ASSET.exec(url.pathname)?.[1];
    const parts = name ? (await loadSplits())[name] : undefined;
    if (!parts) return fetchFile(input, init);
    const responses = await Promise.all(Array.from({ length: parts }, (_, i) => fetchFile(`${url.href}.part${i}`, init)));
    const failed = responses.find((response) => !response.ok);
    if (failed) return failed;
    const buffers = await Promise.all(responses.map((response) => response.arrayBuffer()));
    return new Response(new Blob(buffers), { status: 200, headers: { "Content-Type": "application/octet-stream" } });
  };
}
