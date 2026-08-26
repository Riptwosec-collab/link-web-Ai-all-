import {getMetadata as baseGetMetadata,checkHealth,makeSnapshot,displayHost} from './metadata.js';

const tlds=new Set(['com','net','org','co','th','io','ai','app','dev','xyz','site','online','me','info','biz','cc','tv','shop','store']);
const generic=v=>/^(?:no description|untitled|home)$/i.test(String(v||'').trim())||/website or online service|general website|online service from/i.test(String(v||''));
const iconish=u=>/favicon|apple-touch|manifest|logo|icon|sprite|pixel|badge/i.test(String(u||'').toLowerCase());

function cleanTags(url,category,tags=[]){
  let domain='';try{domain=displayHost(new URL(url).hostname.replace(/^www\./,''))}catch{}
  const parts=new Set(domain.toLowerCase().split(/[.\-_/]+/).filter(Boolean)),cat=String(category||'General').toLowerCase(),out=[];
  for(const raw of tags){
    const tag=String(raw||'').trim();if(!tag)continue;const k=tag.toLowerCase();
    if(k==='www'||k==='general'||k===cat||tlds.has(k)||parts.has(k)||k.length<2)continue;
    if(out.some(x=>x.toLowerCase()===k))continue;
    out.push(tag);if(out.length>=6)break;
  }
  return out;
}
export async function getMetadata(url,settings={}){
  const m=await baseGetMetadata(url,settings);
  const description=generic(m?.description)?'':String(m?.description||'').trim();
  const summary=generic(m?.summary)?'':String(m?.summary||description||'').trim();
  const featureImageUrl=m?.featureImageUrl||(!iconish(m?.imageUrl)?m?.imageUrl:'')||'';
  const logoUrl=m?.logoUrl||'';
  const touchIconUrl=m?.touchIconUrl||'';
  const manifestIconUrl=m?.manifestIconUrl||'';
  let brandKind=String(m?.brandKind||'').toLowerCase(),brandAssetUrl=m?.brandAssetUrl||'';
  if(!brandKind){
    if(logoUrl&&!iconish(logoUrl)){brandKind='logo';brandAssetUrl=logoUrl}
    else if(featureImageUrl){brandKind='feature';brandAssetUrl=featureImageUrl}
    else if(touchIconUrl||manifestIconUrl||m?.favicon){brandKind='icon';brandAssetUrl=touchIconUrl||manifestIconUrl||m.favicon}
  }
  return {...m,description,summary,featureImageUrl,logoUrl,touchIconUrl,manifestIconUrl,brandKind,brandAssetUrl,tags:cleanTags(url,m?.category,m?.tags||[])};
}
export {checkHealth,makeSnapshot,displayHost};
