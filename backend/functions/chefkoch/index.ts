// Supabase Edge Function "chefkoch"
// Leitet Anfragen an Chefkoch weiter, weil Browser die Chefkoch-Schnittstelle
// nicht direkt aufrufen dürfen (CORS).
//
//   ?action=search&q=lasagne&offset=0   → Chefkoch-Suche
//   ?action=recipe&id=745721177147257   → Chefkoch-Rezept
//   ?action=import&url=https://…        → schema.org-Rezept einer beliebigen Seite

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} von ${new URL(url).host}`);
  return res;
}

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const t = o['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    if (o['@graph']) return findRecipe(o['@graph']);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const p = new URL(req.url).searchParams;
    switch (p.get('action')) {
      case 'search': {
        const q = encodeURIComponent(p.get('q') ?? '');
        const offset = Number(p.get('offset') ?? 0) || 0;
        const res = await get(`https://api.chefkoch.de/v2/recipes?query=${q}&limit=30&offset=${offset}`);
        return json(await res.json());
      }
      case 'recipe': {
        const id = (p.get('id') ?? '').replace(/\D/g, '');
        if (!id) return json({ error: 'id fehlt' }, 400);
        const res = await get(`https://api.chefkoch.de/v2/recipes/${id}`);
        return json(await res.json());
      }
      case 'import': {
        const url = new URL(p.get('url') ?? '');
        if (!/^https?:$/.test(url.protocol)) return json({ error: 'Ungültiger Link' }, 400);
        const html = await (await get(url.toString())).text();
        const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        for (const [, body] of scripts) {
          try {
            const recipe = findRecipe(JSON.parse(body));
            if (recipe) return json({ recipe });
          } catch {
            // ungültiges JSON-LD überspringen
          }
        }
        return json({ error: 'Auf dieser Seite wurde kein Rezept gefunden.' }, 404);
      }
      default:
        return json({ error: 'Unbekannte Aktion' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
