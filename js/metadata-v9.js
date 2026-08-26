import {getMetadata as baseGetMetadata,checkHealth,makeSnapshot,displayHost} from './metadata.js';

const tlds=new Set(['com','net','org','co','th','io','ai','app','dev','xyz','site','online','me','info','biz','cc','tv','shop','store']);
const generic=v=>/^(?:no description|untitled|home)$/i.test(String(v||'').trim())||/website or online service|general website|online service from/i.test(String(v||''));
const googleIcon=u=>/google\.com\/s2\/favicons/i.test(String(u||''));
const iconish=u=>/favicon|apple-touch|manifest|(?:^|[\/_-])icon(?:[\/_-]|\.|$)|sprite|pixel|badge/i.test(String(u||'').toLowerCase());
const featureBad=u=>!u||/favicon|apple-touch|manifest|(?:^|[\/_-])icon(?:[\/_-]|\.|$)|sprite|pixel|badge|logo/i.test(String(u||'').toLowerCase());

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
function realLogo(m={}){
  const declared=String(m.brandKind||'').toLowerCase();
  const list=[m.logoUrl,declared==='logo'?m.brandAssetUrl:''].filter(Boolean);
  return list.find(x=>!googleIcon(x)&&!/favicon|apple-touch|manifest/i.test(String(x).toLowerCase()))||'';
}
function featureArt(m={}){
  const declared=String(m.brandKind||'').toLowerCase();
  const list=[m.heroImageUrl,m.featureImageUrl,declared==='feature'?m.brandAssetUrl:'',m.imageUrl].filter(Boolean);
  return list.find(x=>!featureBad(x))||'';
}
export async function getMetadata(url,settings={}){
  const m=await baseGetMetadata(url,settings);
  const description=generic(m?.description)?'':String(m?.description||'').trim();
  const summary=generic(m?.summary)?'':String(m?.summary||description||'').trim();
  const logoUrl=realLogo(m);
  const heroImageUrl=m?.heroImageUrl||'';
  const featureImageUrl=featureArt(m);
  const touchIconUrl=m?.touchIconUrl||'';
  const manifestIconUrl=m?.manifestIconUrl||'';
  const fallbackIcon=touchIconUrl||manifestIconUrl||(!googleIcon(m?.favicon)?m?.favicon:'')||'';

  // Canonical priority: real logo -> website feature/hero art -> quality icon -> text fallback.
  // This intentionally gives feature art priority over favicon/touch icons when a real logo is absent.
  let brandKind='',brandAssetUrl='';
  if(logoUrl){brandKind='logo';brandAssetUrl=logoUrl}
  else if(featureImageUrl){brandKind='feature';brandAssetUrl=featureImageUrl}
  else if(fallbackIcon){brandKind='icon';brandAssetUrl=fallbackIcon}

  return {...m,
    description,summary,logoUrl,heroImageUrl,featureImageUrl,featureLogoUrl:featureImageUrl,
    touchIconUrl,manifestIconUrl,brandKind,brandAssetUrl,
    tags:cleanTags(url,m?.category,m?.tags||[])
  };
}
export {checkHealth,makeSnapshot,displayHost};
