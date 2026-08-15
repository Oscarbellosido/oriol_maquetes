/**
 * Worker de la galeria @maquetes-f1n.
 *
 * Guarda la llista de vídeos afegits a KV, sota la clau "videos", com un array
 * JSON de { id, title, date_added }. L'ordre de l'array és l'ordre en què surten
 * a la galeria: els vídeos nous s'afegeixen al davant i l'administrador el pot
 * canviar arrossegant les targetes.
 *
 *   GET    /?action=list           → llista pública (CORS obert)
 *   GET    /?action=visit          → suma una visita i retorna el total
 *   GET    /?action=stats          → retorna el total de visites, sense sumar-ne
 *   POST   /?action=add            → body { id, title }                    · X-Admin-Secret
 *   POST   /?action=update         → body { id, title?, description? }    · X-Admin-Secret
 *   POST   /?action=reorder        → body { ids: [...] }  · X-Admin-Secret
 *   DELETE /?action=remove&id=ID   → elimina un vídeo      · X-Admin-Secret
 */

const KEY = 'videos';
const VISITS_KEY = 'visits';

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
    .map(v => ({ id: v.id, title: v.title, date_added: v.date_added || '', description: typeof v.description === 'string' ? v.description : '' }));
}

async function writeVideos(env, videos) {
  await env.VIDEOS_KV.put(KEY, JSON.stringify(videos));
}

async function readVisits(env) {
  const n = Number(await env.VIDEOS_KV.get(VISITS_KEY));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
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

    // Llegir-sumar-escriure no és atòmic a KV: amb dues visites alhora se'n pot
    // perdre alguna. Per a un comptador orientatiu de galeria ja va bé.
    if (request.method === 'GET' && action === 'visit') {
      const visits = (await readVisits(env)) + 1;
      await env.VIDEOS_KV.put(VISITS_KEY, String(visits));
      return json({ visits });
    }

    if (request.method === 'GET' && action === 'stats') {
      return json({ visits: await readVisits(env) });
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
      videos.unshift(video);            // el més nou, al davant de la galeria
      await writeVideos(env, videos);
      return json({ ok: true, video }, 201);
    }

    // Canvia el títol i/o la descripció d'un vídeo que ja hi és, segons quins
    // camps arribin al body. La resta (l'ordre dins de la llista, la data) no
    // es toca.
    if (request.method === 'POST' && action === 'update') {
      if (!secretOk(request, env)) return json({ error: 'No autoritzat' }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON invàlid' }, 400);
      }

      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      if (!validId(id)) return json({ error: "L'ID del vídeo no és vàlid" }, 400);

      const hasTitle = typeof body?.title === 'string';
      const hasDescription = typeof body?.description === 'string';
      if (!hasTitle && !hasDescription) return json({ error: 'Falta el títol o la descripció' }, 400);

      const title = hasTitle ? body.title.trim() : '';
      const description = hasDescription ? body.description.trim() : '';
      if (hasTitle && !title) return json({ error: 'Falta el títol' }, 400);
      if (hasTitle && title.length > 200) return json({ error: 'El títol és massa llarg' }, 400);
      if (hasDescription && description.length > 2000) return json({ error: 'La descripció és massa llarga' }, 400);

      const videos = await readVideos(env);
      const video = videos.find(v => v.id === id);
      if (!video) return json({ error: 'Vídeo no trobat' }, 404);

      let changed = false;
      if (hasTitle && video.title !== title) { video.title = title; changed = true; }
      if (hasDescription && video.description !== description) { video.description = description; changed = true; }
      if (changed) await writeVideos(env, videos);
      return json({ ok: true, video });
    }

    // Rep tots els ids en l'ordre nou. Els que no siguin a KV s'ignoren, i els de
    // KV que no s'esmentin queden al final: així un client desincronitzat no en
    // pot fer desaparèixer cap.
    if (request.method === 'POST' && action === 'reorder') {
      if (!secretOk(request, env)) return json({ error: 'No autoritzat' }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON invàlid' }, 400);
      }

      if (!Array.isArray(body?.ids)) return json({ error: "Falta la llista d'ids" }, 400);

      const pending = new Map((await readVideos(env)).map(v => [v.id, v]));
      const ordered = [];
      for (const id of body.ids) {
        const video = pending.get(id);
        if (!video) continue;           // desconegut, o repetit dins d'ids
        ordered.push(video);
        pending.delete(id);
      }
      ordered.push(...pending.values());

      await writeVideos(env, ordered);
      return json({ ok: true });
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
