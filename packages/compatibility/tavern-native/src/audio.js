const copy = value => structuredClone(value);
export function createAudioApi(rt) {
  const channel = type => type === 'amb' ? 'ambient' : type ?? 'bgm';
  const read = type => {
    const selected=channel(type), state=rt.shared.audio?.[selected] ?? rt.snapshot.audio?.[selected];
    if (!state) throw new Error(`Audio channel is not initialized: ${selected}`);
    return state;
  };
  const request = (method,params) => rt.track(rt.native.request(method,params).then(value=>{
    if (value?.channel) (rt.shared.audio ??= {})[value.channel]=value;
    return value;
  }));
  const track=audio=>({url:audio.url,title:audio.title??decodeURIComponent(audio.url.split('/').pop()?.split('?')[0]??audio.url)});
  const settings = type => {
    const state=read(type);
    return { enabled:state.enabled ?? true, mode:state.mode ?? (state.shuffle?'shuffle':state.loop?'repeat_one':'repeat_all'), muted:state.muted, volume:Math.round(state.volume*100) };
  };
  const replace = (type,items,options={}) => {
    const selected=channel(type), state=read(type), playlist=items.map(track);
    (rt.shared.audio ??= {})[selected]={...state,playlist,currentIndex:options.currentIndex??Math.min(state.currentIndex,playlist.length-1),currentTrack:playlist[options.currentIndex??Math.min(state.currentIndex,playlist.length-1)]??null,...(options.autoplay?{status:'playing'}:{})};
    request('audio.setPlaylist',{channel:selected,items:playlist,...options});
  };
  return {
    getAudioList:type=>copy(read(type).playlist.map(item=>({url:item.url,title:item.title}))),
    getAudioSettings:settings,
    setAudioSettings:(type,patch)=>{
      const selected=channel(type), state=read(type), value={...settings(type),...patch};
      (rt.shared.audio ??= {})[selected]={...state,enabled:value.enabled,mode:value.mode,volume:value.volume/100,muted:value.muted};
      request('audio.configure',{channel:selected,enabled:value.enabled,mode:value.mode,volume:value.volume/100,muted:value.muted});
    },
    replaceAudioList:(type,items)=>replace(type,items),
    appendAudioList:(type,items)=>{
      const current=read(type).playlist.map(track);
      for(const item of items.map(track))if(!current.some(previous=>previous.url===item.url||previous.title===item.title))current.push(item);
      replace(type,current);
    },
    playAudio:(type,audio)=>{
      const selected=channel(type), list=read(type).playlist.map(track), value=track(audio);
      let index=list.findIndex(item=>item.url===value.url);
      if(index<0) { index=list.length; list.push(value); }
      replace(type,list,{currentIndex:index,autoplay:true});
    },
    pauseAudio:type=>{ const selected=channel(type); (rt.shared.audio??={})[selected]={...read(type),status:'paused'}; request('audio.pause',{channel:selected}); },
    getCurrentAudio:type=>{
      const state=read(type), audio=state.currentTrack;
      return { src:audio?.url??'',title:audio?.title??'',playing:state.status==='playing',progress:state.duration?state.currentTime/state.duration*100:0 };
    },
  };
}
