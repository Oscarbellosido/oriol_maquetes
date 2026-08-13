/**
 * Worker de la galeria @maquetes-f1n.
 *
 * Guarda la llista de vídeos afegits a KV, sota la clau "videos", com un array
 * JSON de { id, title, date_added }.
 *
 *   GET    /?action=list           → llista pública (CORS obert)
 *   POST   /?action=add            → body { id, title }   · X-Admin-Secret
 *   DELETE /?action=remove&id=ID   → elimina un vídeo      · X-Admin-Secret
 */

const KEY = 'videos';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

// L'ID de YouTube són sempre 11 caràcters de l'alfabet base64url.
function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function readVideos(env) {
  const raw = await env.VIDEOS_KV.get(KEY, { type: 'json' });
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(v => v && validId(v.id) && typeof v.title === 'string')
    .map(v => ({ id: v.id, title: v.title, date_added: v.date_added || '' }));
}

async function writeVideos(env, videos) {
  await env.VIDEOS_KV.put(KEY, JSON.stringify(videos));
}

// Comparació en temps constant, per no filtrar el secret amb el temps de resposta.
function secretOk(request, env) {
  const given = request.headers.get('X-Admin-Secret') || '';
  const want = env.ADMIN_SECRET || '';
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (!env.VIDEOS_KV) {
      return json({ error: 'KV no configurat' }, 500);
    }

    // ── Públic ───────────────────────────────────────────────────────────────
    if (request.method === 'GET' && action === 'list') {
      return json(await readVideos(env));
    }

    // ── Administració ────────────────────────────────────────────────────────
    if (request.method === 'POST' && action === 'add') {
      if (!secretOk(request, env)) return json({ error: 'No autoritzat' }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON invàlid' }, 400);
      }

      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      if (!validId(id)) return json({ error: "L'ID del vídeo no és vàlid" }, 400);
      if (!title) return json({ error: 'Falta el títol' }, 400);
      if (title.length > 200) return json({ error: 'El títol és massa llarg' }, 400);

      const videos = await readVideos(env);
      if (videos.some(v => v.id === id)) return json({ error: 'Aquest vídeo ja hi és' }, 409);

      const video = { id, title, date_added: todayISO() };
      videos.push(video);
      await writeVideos(env, videos);
      return json({ ok: true, video }, 201);
    }

    if (request.method === 'DELETE' && action === 'remove') {
      if (!secretOk(request, env)) return json({ error: 'No autoritzat' }, 401);

      const id = (searchParams.get('id') || '').trim();
      if (!validId(id)) return json({ error: "L'ID del vídeo no és vàlid" }, 400);

      const videos = await readVideos(env);
      const rest = videos.filter(v => v.id !== id);
      if (rest.length === videos.length) return json({ error: 'Vídeo no trobat' }, 404);

      await writeVideos(env, rest);
      return json({ ok: true, removed: id });
    }

    return json({ error: 'Ruta desconeguda' }, 404);
  },
};
