/** Public aliases and browser return types, independent of the original extension implementation. */
export function decorateHelper(rt, helper) {
  const extensions=()=>rt.snapshot.extensions??[];
  const extension=id=>extensions().find(item=>item.name===id);
  const response=value=>new rt.window.Response(JSON.stringify(value),{status:value?.error?400:200,headers:{'content-type':'application/json'}});
  helper.isAdmin=()=>rt.snapshot.administration?.writable===true;
  helper.isInstalledExtension=id=>!!extension(id);
  helper.getExtensionType=id=>{ const item=extension(id); return !item?null:item.optional||!item.installed?'system':item.installation?.type??'local'; };
  helper.getExtensionInstallationInfo=async id=>{
    if(!extension(id)) return null;
    const item=await rt.request('extensions.info',{name:id});
    return {...item, ...(item.installation??{}), name:item.name, version:item.version??null,
      remote_url:item.installation?.url??null, commit_hash:item.installation?.commit??null, branch:item.installation?.branch??null};
  };
  for(const [name,method] of Object.entries({installExtension:'extensions.install',uninstallExtension:'extensions.uninstall',reinstallExtension:'extensions.reinstall',updateExtension:'extensions.update'})) {
    helper[name]=async (id,type='local')=>response(await rt.commit(method,name==='installExtension'?{url:id,options:{type}}:{name:id}));
  }
  helper.getProxyPresetNames=()=>rt.snapshot.connections.map(item=>item.name??item.id);
  helper.getModelList=custom_api=>rt.request('generation.models',{custom_api});
  const active=rt.shared.helperGenerations??=new Map();
  helper.stopGenerationById=id=>{
    const controller=active.get(id); if(!controller)return false;
    controller.abort(new Error('Generation stopped.')); rt.track(rt.request('generation.cancel',{generationId:id})); return true;
  };
  helper.stopAllGeneration=()=>{
    const running=active.size>0; for(const controller of active.values())controller.abort(new Error('Generation stopped.'));
    rt.track(rt.request('generation.stopAll',{})); return running;
  };
  for(const name of ['importRawCharacter','importRawChat','importRawWorldbook']) {
    const original=helper[name]; helper[name]=async (...args)=>response(await original(...args));
  }
  const importPreset=helper.importRawPreset;
  helper.importRawPreset=async (...args)=>!!await importPreset(...args);
  helper.importRawTavernRegex=(filename,content)=>{
    const raw=content??filename; JSON.parse(raw);
    rt.stage('import.regex',{raw,name:content===undefined?'Import.json':filename},()=>{}); return true;
  };
}
