export function youtubeVideoId(value) {
  let id = String(value).trim();
  if (/^https?:/.test(id)) {
    const url = new URL(id), host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0];
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1);
    else throw new Error('A YouTube URL or video ID is required.');
  }
  if (!/^[\w-]{11}$/.test(id)) throw new Error('A valid YouTube video ID or URL is required.');
  return id;
}

function playerResponse(html) {
  const marker = html.indexOf('ytInitialPlayerResponse');
  if (marker < 0) throw new Error('YouTube did not return player data (login, consent or bot challenge may be required).');
  const start = html.indexOf('{', marker); let depth = 0, string = false, escaped = false;
  for (let end = start; end < html.length; end++) {
    const character = html[end];
    if (string) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') string = false; }
    else if (character === '"') string = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return JSON.parse(html.slice(start, end + 1));
  }
  throw new Error('YouTube player data is incomplete.');
}

/** Real YouTube metadata and caption parsing through the shared native network transport. */
export function createYouTubeServices(rt, network) {
  const view = rt.window;
  const watch = async (value, settings = {}) => {
    const id = youtubeVideoId(value), response = await network.fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'Accept-Language': settings.lang || 'en' }, signal: settings.signal });
    if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
    const data = playerResponse(await response.text());
    if (data.playabilityStatus?.status && data.playabilityStatus.status !== 'OK') throw new Error(data.playabilityStatus.reason || `YouTube video status: ${data.playabilityStatus.status}`);
    return { id, data };
  };
  const tracks = data => (data.captions?.playerCaptionsTracklistRenderer?.captionTracks || []).map(track => ({
    languageCode: track.languageCode, name: track.name?.simpleText || track.name?.runs?.map(run => run.text).join('') || track.languageCode,
    automatic: track.kind === 'asr', translatable: track.isTranslatable === true, url: track.baseUrl,
  }));
  return {
    videoId: youtubeVideoId,
    metadata: async (value, settings) => {
      const { id, data } = await watch(value, settings), details = data.videoDetails || {}, micro = data.microformat?.playerMicroformatRenderer || {};
      return { id, url: `https://www.youtube.com/watch?v=${id}`, title: details.title || '', author: details.author || '', channelId: details.channelId || '',
        description: details.shortDescription || '', duration: Number(details.lengthSeconds || 0), viewCount: Number(details.viewCount || 0),
        isLive: details.isLiveContent === true, thumbnails: details.thumbnail?.thumbnails || [], publishedAt: micro.publishDate || micro.uploadDate || '', captionTracks: tracks(data) };
    },
    captionTracks: async (value, settings) => tracks((await watch(value, settings)).data),
    transcript: async (value, settings = {}) => {
      const { id, data } = await watch(value, settings), all = tracks(data);
      const track = settings.lang ? all.find(track => track.languageCode === settings.lang) : all.find(track => !track.automatic) || all[0];
      if (!track) throw new Error(`No captions available${settings.lang ? ' in ' + settings.lang : ''} for ${id}`);
      const response = await network.fetch(track.url, { signal: settings.signal });
      if (!response.ok) throw new Error(`Captions HTTP ${response.status}`);
      const body = await response.text(); if (!body.trim()) throw new Error('YouTube returned an empty caption track.');
      let segments;
      if (body.trimStart().startsWith('{')) {
        const json = JSON.parse(body);
        segments = (json.events || []).map(event => ({ start: Number(event.tStartMs || 0) / 1000, duration: Number(event.dDurationMs || 0) / 1000,
          text: (event.segs || []).map(segment => segment.utf8 || '').join('').trim() })).filter(segment => segment.text);
      } else {
        const xml = new view.DOMParser().parseFromString(body, 'application/xml');
        if (xml.querySelector('parsererror')) throw new Error('YouTube caption XML could not be parsed.');
        segments = [...xml.querySelectorAll('text,p')].map(node => ({
          start: Number(node.getAttribute('start') ?? Number(node.getAttribute('t') || 0) / 1000),
          duration: Number(node.getAttribute('dur') ?? Number(node.getAttribute('d') || 0) / 1000), text: node.textContent.trim(),
        })).filter(segment => segment.text);
      }
      if (!segments.length) throw new Error('YouTube caption track contains no transcript.');
      return { videoId: id, languageCode: track.languageCode, automatic: track.automatic, segments, text: segments.map(segment => segment.text).join('\n') };
    },
  };
}
