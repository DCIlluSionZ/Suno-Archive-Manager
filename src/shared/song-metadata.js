(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BenGSunoMetadata = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCE_ALLOWLIST = [
    'major_model_version', 'model_name', 'type', 'status', 'display_name',
    'handle', 'is_public', 'is_liked', 'upvote_count', 'play_count'
  ];

  function firstDefined(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null) return value;
    }
    return null;
  }

  function nonEmpty(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  function looksLikeSong(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!nonEmpty(value.id)) return false;
    const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
    return [
      value.title,
      value.created_at,
      value.audio_url,
      value.image_url,
      value.image_large_url,
      value.model_name,
      value.duration,
      value.duration_seconds,
      metadata.tags,
      metadata.prompt,
      metadata.gpt_description,
      metadata.lyrics,
      metadata.model_name,
      metadata.duration,
    ].some(nonEmpty);
  }

  function findSongCandidates(value) {
    const found = [];
    const seenObjects = new WeakSet();

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (seenObjects.has(node)) return;
      seenObjects.add(node);

      if (looksLikeSong(node)) {
        found.push(node);
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }

      for (const [key, child] of Object.entries(node)) {
        if (key === 'metadata') continue;
        visit(child);
      }
    }

    visit(value);
    return found;
  }

  function toNumberOrNull(value) {
    if (value === '' || value === undefined || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function toBooleanOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    return null;
  }

  function collectSourceMetadata(raw, metadata) {
    const source = {};
    for (const key of SOURCE_ALLOWLIST) {
      const value = firstDefined(raw[key], metadata[key]);
      if (nonEmpty(value)) source[key] = value;
    }
    return source;
  }

  function normalizeSong(raw, seenAtIso) {
    if (!raw || typeof raw !== 'object' || !nonEmpty(raw.id)) return null;
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const id = String(raw.id);
    const seenAt = seenAtIso || new Date().toISOString();
    const directUrl = firstDefined(raw.suno_url, raw.url, raw.clip_url);

    return {
      id,
      title: firstDefined(raw.title, metadata.title, 'Untitled'),
      display_name: firstDefined(
        raw.display_name,
        raw.user_display_name,
        raw.profiles && raw.profiles.display_name,
        raw.handle,
        metadata.display_name
      ),
      created_at: firstDefined(raw.created_at, metadata.created_at),
      model_name: firstDefined(
        raw.model_name,
        raw.model,
        metadata.model_name,
        metadata.model,
        metadata.major_model_version,
        metadata.version
      ),
      duration_seconds: toNumberOrNull(firstDefined(
        raw.duration_seconds,
        raw.duration,
        metadata.duration_seconds,
        metadata.duration
      )),
      tags: firstDefined(raw.tags, metadata.tags, raw.style, metadata.style),
      prompt: firstDefined(
        raw.prompt,
        metadata.prompt,
        raw.gpt_description,
        metadata.gpt_description,
        raw.description,
        metadata.description
      ),
      lyrics: firstDefined(raw.lyrics, metadata.lyrics, raw.text, metadata.text),
      is_instrumental: toBooleanOrNull(firstDefined(
        raw.is_instrumental,
        metadata.is_instrumental,
        raw.make_instrumental,
        metadata.make_instrumental
      )),
      suno_url: nonEmpty(directUrl) ? directUrl : `https://suno.com/song/${encodeURIComponent(id)}`,
      image_url: firstDefined(
        raw.image_url,
        raw.image_large_url,
        metadata.image_url,
        metadata.image_large_url
      ),
      parent_id: firstDefined(raw.parent_clip_id, raw.parent_id, metadata.parent_clip_id, metadata.parent_id),
      source_id: firstDefined(raw.source_clip_id, raw.source_id, metadata.source_clip_id, metadata.source_id),
      continuation_id: firstDefined(raw.continuation_clip_id, raw.continuation_id, metadata.continuation_clip_id),
      remix_id: firstDefined(raw.remix_clip_id, raw.remix_id, metadata.remix_clip_id),
      cover_id: firstDefined(raw.cover_clip_id, raw.cover_id, metadata.cover_clip_id),
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      source_metadata: collectSourceMetadata(raw, metadata),
    };
  }

  function mergeSongRecord(existing, incoming) {
    if (!existing) return { ...incoming, source_metadata: { ...(incoming.source_metadata || {}) } };
    if (!incoming) return { ...existing, source_metadata: { ...(existing.source_metadata || {}) } };
    if (String(existing.id) !== String(incoming.id)) {
      throw new Error('Cannot merge different Suno song IDs');
    }

    const merged = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'first_seen_at' || key === 'source_metadata') continue;
      if (nonEmpty(value)) merged[key] = value;
    }
    merged.first_seen_at = existing.first_seen_at || incoming.first_seen_at || null;
    merged.last_seen_at = incoming.last_seen_at || existing.last_seen_at || null;
    merged.source_metadata = {
      ...(existing.source_metadata || {}),
      ...Object.fromEntries(
        Object.entries(incoming.source_metadata || {}).filter(([, value]) => nonEmpty(value))
      ),
    };
    return merged;
  }

  function buildExportDocument(songs, exportedAtIso) {
    const sorted = [...(songs || [])].sort((a, b) => {
      const aDate = a && a.created_at ? String(a.created_at) : '9999';
      const bDate = b && b.created_at ? String(b.created_at) : '9999';
      const dateCmp = aDate.localeCompare(bDate);
      if (dateCmp !== 0) return dateCmp;
      return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
    return {
      schema_version: 1,
      exported_at: exportedAtIso || new Date().toISOString(),
      source: 'ben-g-suno-metadata-bridge',
      song_count: sorted.length,
      songs: sorted,
    };
  }

  return {
    findSongCandidates,
    normalizeSong,
    mergeSongRecord,
    buildExportDocument,
  };
});
