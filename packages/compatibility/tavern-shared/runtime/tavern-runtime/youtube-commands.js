/** YouTube captions use native network transport; browser origin/CORS do not hide errors. */
export function youtubeCommands(_context,api) {
  return {'yt-script':async(args,value)=>{
    let id=String(value).trim();
    if(/^https?:/.test(id)){const url=new URL(id);id=url.hostname==='youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.split('/').at(-1);}
    if(!/^[\w-]{11}$/.test(id))throw new Error('A valid YouTube video ID or URL is required');
    const response=await api.net.fetch(`https://www.youtube.com/watch?v=${id}`,{headers:{'Accept-Language':args.lang || 'en'}});
    if(!response.ok)throw new Error(`YouTube HTTP ${response.status}`);
    const html=await response.text(),marker=html.indexOf('ytInitialPlayerResponse');
    if(marker<0)throw new Error('YouTube did not return its player data (login, consent or bot challenge may be required)');
    const start=html.indexOf('{',marker);let end=start,depth=0,string=false,escaped=false;
    for(;end<html.length;end++){const character=html[end];if(string){if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')string=false;}
      else if(character==='"')string=true;else if(character==='{')depth++;else if(character==='}' && --depth===0){end++;break;}}
    const data=JSON.parse(html.slice(start,end));const tracks=data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track=args.lang ? tracks.find(track=>track.languageCode===args.lang) : tracks.find(track=>track.kind!=='asr') || tracks[0];
    if(!track)throw new Error(`No captions available${args.lang ? ' in '+args.lang : ''} for ${id}`);
    const captions=await api.net.fetch(track.baseUrl);if(!captions.ok)throw new Error(`Captions HTTP ${captions.status}`);
    const body=await captions.text();
    if(!body.trim())throw new Error('YouTube returned an empty caption track');
    if(body.trimStart().startsWith('{')){const json=JSON.parse(body);return (json.events || []).map(event=>(event.segs || []).map(segment=>segment.utf8 || '').join('')).filter(Boolean).join('\n');}
    const xml=new DOMParser().parseFromString(body,'application/xml');
    if(xml.querySelector('parsererror'))throw new Error('YouTube caption XML could not be parsed');
    const text=[...xml.querySelectorAll('text,p')].map(node=>node.textContent).filter(Boolean).join('\n');
    if(!text)throw new Error('YouTube caption track contains no transcript');return text;
  }};
}
