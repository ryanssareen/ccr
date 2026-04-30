(()=>{var a={};a.id=974,a.ids=[974],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},12964:(a,b,c)=>{"use strict";c.r(b),c.d(b,{GlobalError:()=>D.a,__next_app__:()=>J,handler:()=>L,pages:()=>I,routeModule:()=>K,tree:()=>H});var d=c(49754),e=c(9117),f=c(46595),g=c(32324),h=c(39326),i=c(38928),j=c(20175),k=c(12),l=c(54290),m=c(12696),n=c(82802),o=c(77533),p=c(45229),q=c(32822),r=c(261),s=c(26453),t=c(52474),u=c(26713),v=c(51356),w=c(62685),x=c(36225),y=c(63446),z=c(2762),A=c(45742),B=c(86439),C=c(81170),D=c.n(C),E=c(62506),F=c(91203),G={};for(let a in E)0>["default","tree","pages","GlobalError","__next_app__","routeModule","handler"].indexOf(a)&&(G[a]=()=>E[a]);c.d(b,G);let H=["",{children:["__PAGE__",{},{page:[()=>Promise.resolve().then(c.bind(c,17742)),"/Users/ryan/Documents/ccr/web/app/page.tsx"]}]},{layout:[()=>Promise.resolve().then(c.bind(c,16953)),"/Users/ryan/Documents/ccr/web/app/layout.tsx"],"global-error":[()=>Promise.resolve().then(c.t.bind(c,81170,23)),"next/dist/client/components/builtin/global-error.js"],"not-found":[()=>Promise.resolve().then(c.t.bind(c,87028,23)),"next/dist/client/components/builtin/not-found.js"],forbidden:[()=>Promise.resolve().then(c.t.bind(c,90461,23)),"next/dist/client/components/builtin/forbidden.js"],unauthorized:[()=>Promise.resolve().then(c.t.bind(c,32768,23)),"next/dist/client/components/builtin/unauthorized.js"]}],I=["/Users/ryan/Documents/ccr/web/app/page.tsx"],J={require:c,loadChunk:()=>Promise.resolve()},K=new d.AppPageRouteModule({definition:{kind:e.RouteKind.APP_PAGE,page:"/page",pathname:"/",bundlePath:"",filename:"",appPaths:[]},userland:{loaderTree:H},distDir:".next",relativeProjectDir:""});async function L(a,b,d){var C;let G="/page";"/index"===G&&(G="/");let M=(0,h.getRequestMeta)(a,"postponed"),N=(0,h.getRequestMeta)(a,"minimalMode"),O=await K.prepare(a,b,{srcPage:G,multiZoneDraftMode:!1});if(!O)return b.statusCode=400,b.end("Bad Request"),null==d.waitUntil||d.waitUntil.call(d,Promise.resolve()),null;let{buildId:P,query:Q,params:R,parsedUrl:S,pageIsDynamic:T,buildManifest:U,nextFontManifest:V,reactLoadableManifest:W,serverActionsManifest:X,clientReferenceManifest:Y,subresourceIntegrityManifest:Z,prerenderManifest:$,isDraftMode:_,resolvedPathname:aa,revalidateOnlyGenerated:ab,routerServerContext:ac,nextConfig:ad,interceptionRoutePatterns:ae}=O,af=S.pathname||"/",ag=(0,r.normalizeAppPath)(G),{isOnDemandRevalidate:ah}=O,ai=K.match(af,$),aj=!!$.routes[aa],ak=!!(ai||aj||$.routes[ag]),al=a.headers["user-agent"]||"",am=(0,u.getBotType)(al),an=(0,p.isHtmlBotRequest)(a),ao=(0,h.getRequestMeta)(a,"isPrefetchRSCRequest")??"1"===a.headers[t.NEXT_ROUTER_PREFETCH_HEADER],ap=(0,h.getRequestMeta)(a,"isRSCRequest")??!!a.headers[t.RSC_HEADER],aq=(0,s.getIsPossibleServerAction)(a),ar=(0,m.checkIsAppPPREnabled)(ad.experimental.ppr)&&(null==(C=$.routes[ag]??$.dynamicRoutes[ag])?void 0:C.renderingMode)==="PARTIALLY_STATIC",as=!1,at=!1,au=ar?M:void 0,av=ar&&ap&&!ao,aw=(0,h.getRequestMeta)(a,"segmentPrefetchRSCRequest"),ax=!al||(0,p.shouldServeStreamingMetadata)(al,ad.htmlLimitedBots);an&&ar&&(ak=!1,ax=!1);let ay=!0===K.isDev||!ak||"string"==typeof M||av,az=an&&ar,aA=null;_||!ak||ay||aq||au||av||(aA=aa);let aB=aA;!aB&&K.isDev&&(aB=aa),K.isDev||_||!ak||!ap||av||(0,k.d)(a.headers);let aC={...E,tree:H,pages:I,GlobalError:D(),handler:L,routeModule:K,__next_app__:J};X&&Y&&(0,o.setReferenceManifestsSingleton)({page:G,clientReferenceManifest:Y,serverActionsManifest:X,serverModuleMap:(0,q.createServerModuleMap)({serverActionsManifest:X})});let aD=a.method||"GET",aE=(0,g.getTracer)(),aF=aE.getActiveScopeSpan();try{let f=K.getVaryHeader(aa,ae);b.setHeader("Vary",f);let k=async(c,d)=>{let e=new l.NodeNextRequest(a),f=new l.NodeNextResponse(b);return K.render(e,f,d).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=aE.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==i.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${aD} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${aD} ${a.url}`)})},m=async({span:e,postponed:f,fallbackRouteParams:g})=>{let i={query:Q,params:R,page:ag,sharedContext:{buildId:P},serverComponentsHmrCache:(0,h.getRequestMeta)(a,"serverComponentsHmrCache"),fallbackRouteParams:g,renderOpts:{App:()=>null,Document:()=>null,pageConfig:{},ComponentMod:aC,Component:(0,j.T)(aC),params:R,routeModule:K,page:G,postponed:f,shouldWaitOnAllReady:az,serveStreamingMetadata:ax,supportsDynamicResponse:"string"==typeof f||ay,buildManifest:U,nextFontManifest:V,reactLoadableManifest:W,subresourceIntegrityManifest:Z,serverActionsManifest:X,clientReferenceManifest:Y,setIsrStatus:null==ac?void 0:ac.setIsrStatus,dir:c(33873).join(process.cwd(),K.relativeProjectDir),isDraftMode:_,isRevalidate:ak&&!f&&!av,botType:am,isOnDemandRevalidate:ah,isPossibleServerAction:aq,assetPrefix:ad.assetPrefix,nextConfigOutput:ad.output,crossOrigin:ad.crossOrigin,trailingSlash:ad.trailingSlash,previewProps:$.preview,deploymentId:ad.deploymentId,enableTainting:ad.experimental.taint,htmlLimitedBots:ad.htmlLimitedBots,devtoolSegmentExplorer:ad.experimental.devtoolSegmentExplorer,reactMaxHeadersLength:ad.reactMaxHeadersLength,multiZoneDraftMode:!1,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:ad.experimental.cacheLife,basePath:ad.basePath,serverActions:ad.experimental.serverActions,...as?{nextExport:!0,supportsDynamicResponse:!1,isStaticGeneration:!0,isRevalidate:!0,isDebugDynamicAccesses:as}:{},experimental:{isRoutePPREnabled:ar,expireTime:ad.expireTime,staleTimes:ad.experimental.staleTimes,cacheComponents:!!ad.experimental.cacheComponents,clientSegmentCache:!!ad.experimental.clientSegmentCache,clientParamParsing:!!ad.experimental.clientParamParsing,dynamicOnHover:!!ad.experimental.dynamicOnHover,inlineCss:!!ad.experimental.inlineCss,authInterrupts:!!ad.experimental.authInterrupts,clientTraceMetadata:ad.experimental.clientTraceMetadata||[]},waitUntil:d.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:()=>{},onInstrumentationRequestError:(b,c,d)=>K.onRequestError(a,b,d,ac),err:(0,h.getRequestMeta)(a,"invokeError"),dev:K.isDev}},l=await k(e,i),{metadata:m}=l,{cacheControl:n,headers:o={},fetchTags:p}=m;if(p&&(o[y.NEXT_CACHE_TAGS_HEADER]=p),a.fetchMetrics=m.fetchMetrics,ak&&(null==n?void 0:n.revalidate)===0&&!K.isDev&&!ar){let a=m.staticBailoutInfo,b=Object.defineProperty(Error(`Page changed from static to dynamic at runtime ${aa}${(null==a?void 0:a.description)?`, reason: ${a.description}`:""}
see more here https://nextjs.org/docs/messages/app-static-to-dynamic-error`),"__NEXT_ERROR_CODE",{value:"E132",enumerable:!1,configurable:!0});if(null==a?void 0:a.stack){let c=a.stack;b.stack=b.message+c.substring(c.indexOf("\n"))}throw b}return{value:{kind:v.CachedRouteKind.APP_PAGE,html:l,headers:o,rscData:m.flightData,postponed:m.postponed,status:m.statusCode,segmentData:m.segmentData},cacheControl:n}},o=async({hasResolved:c,previousCacheEntry:f,isRevalidating:g,span:i})=>{let j,k=!1===K.isDev,l=c||b.writableEnded;if(ah&&ab&&!f&&!N)return(null==ac?void 0:ac.render404)?await ac.render404(a,b):(b.statusCode=404,b.end("This page could not be found")),null;if(ai&&(j=(0,w.parseFallbackField)(ai.fallback)),j===w.FallbackMode.PRERENDER&&(0,u.isBot)(al)&&(!ar||an)&&(j=w.FallbackMode.BLOCKING_STATIC_RENDER),(null==f?void 0:f.isStale)===-1&&(ah=!0),ah&&(j!==w.FallbackMode.NOT_FOUND||f)&&(j=w.FallbackMode.BLOCKING_STATIC_RENDER),!N&&j!==w.FallbackMode.BLOCKING_STATIC_RENDER&&aB&&!l&&!_&&T&&(k||!aj)){let b;if((k||ai)&&j===w.FallbackMode.NOT_FOUND)throw new B.NoFallbackError;if(ar&&!ap){let c="string"==typeof(null==ai?void 0:ai.fallback)?ai.fallback:k?ag:null;if(b=await K.handleResponse({cacheKey:c,req:a,nextConfig:ad,routeKind:e.RouteKind.APP_PAGE,isFallback:!0,prerenderManifest:$,isRoutePPREnabled:ar,responseGenerator:async()=>m({span:i,postponed:void 0,fallbackRouteParams:k||at?(0,n.u)(ag):null}),waitUntil:d.waitUntil}),null===b)return null;if(b)return delete b.cacheControl,b}}let o=ah||g||!au?void 0:au;if(as&&void 0!==o)return{cacheControl:{revalidate:1,expire:void 0},value:{kind:v.CachedRouteKind.PAGES,html:x.default.EMPTY,pageData:{},headers:void 0,status:void 0}};let p=T&&ar&&((0,h.getRequestMeta)(a,"renderFallbackShell")||at)?(0,n.u)(af):null;return m({span:i,postponed:o,fallbackRouteParams:p})},p=async c=>{var f,g,i,j,k;let l,n=await K.handleResponse({cacheKey:aA,responseGenerator:a=>o({span:c,...a}),routeKind:e.RouteKind.APP_PAGE,isOnDemandRevalidate:ah,isRoutePPREnabled:ar,req:a,nextConfig:ad,prerenderManifest:$,waitUntil:d.waitUntil});if(_&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate"),K.isDev&&b.setHeader("Cache-Control","no-store, must-revalidate"),!n){if(aA)throw Object.defineProperty(Error("invariant: cache entry required but not generated"),"__NEXT_ERROR_CODE",{value:"E62",enumerable:!1,configurable:!0});return null}if((null==(f=n.value)?void 0:f.kind)!==v.CachedRouteKind.APP_PAGE)throw Object.defineProperty(Error(`Invariant app-page handler received invalid cache entry ${null==(i=n.value)?void 0:i.kind}`),"__NEXT_ERROR_CODE",{value:"E707",enumerable:!1,configurable:!0});let p="string"==typeof n.value.postponed;ak&&!av&&(!p||ao)&&(N||b.setHeader("x-nextjs-cache",ah?"REVALIDATED":n.isMiss?"MISS":n.isStale?"STALE":"HIT"),b.setHeader(t.NEXT_IS_PRERENDER_HEADER,"1"));let{value:q}=n;if(au)l={revalidate:0,expire:void 0};else if(N&&ap&&!ao&&ar)l={revalidate:0,expire:void 0};else if(!K.isDev)if(_)l={revalidate:0,expire:void 0};else if(ak){if(n.cacheControl)if("number"==typeof n.cacheControl.revalidate){if(n.cacheControl.revalidate<1)throw Object.defineProperty(Error(`Invalid revalidate configuration provided: ${n.cacheControl.revalidate} < 1`),"__NEXT_ERROR_CODE",{value:"E22",enumerable:!1,configurable:!0});l={revalidate:n.cacheControl.revalidate,expire:(null==(j=n.cacheControl)?void 0:j.expire)??ad.expireTime}}else l={revalidate:y.CACHE_ONE_YEAR,expire:void 0}}else b.getHeader("Cache-Control")||(l={revalidate:0,expire:void 0});if(n.cacheControl=l,"string"==typeof aw&&(null==q?void 0:q.kind)===v.CachedRouteKind.APP_PAGE&&q.segmentData){b.setHeader(t.NEXT_DID_POSTPONE_HEADER,"2");let c=null==(k=q.headers)?void 0:k[y.NEXT_CACHE_TAGS_HEADER];N&&ak&&c&&"string"==typeof c&&b.setHeader(y.NEXT_CACHE_TAGS_HEADER,c);let d=q.segmentData.get(aw);return void 0!==d?(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:x.default.fromStatic(d,t.RSC_CONTENT_TYPE_HEADER),cacheControl:n.cacheControl}):(b.statusCode=204,(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:x.default.EMPTY,cacheControl:n.cacheControl}))}let r=(0,h.getRequestMeta)(a,"onCacheEntry");if(r&&await r({...n,value:{...n.value,kind:"PAGE"}},{url:(0,h.getRequestMeta)(a,"initURL")}))return null;if(p&&au)throw Object.defineProperty(Error("Invariant: postponed state should not be present on a resume request"),"__NEXT_ERROR_CODE",{value:"E396",enumerable:!1,configurable:!0});if(q.headers){let a={...q.headers};for(let[c,d]of(N&&ak||delete a[y.NEXT_CACHE_TAGS_HEADER],Object.entries(a)))if(void 0!==d)if(Array.isArray(d))for(let a of d)b.appendHeader(c,a);else"number"==typeof d&&(d=d.toString()),b.appendHeader(c,d)}let s=null==(g=q.headers)?void 0:g[y.NEXT_CACHE_TAGS_HEADER];if(N&&ak&&s&&"string"==typeof s&&b.setHeader(y.NEXT_CACHE_TAGS_HEADER,s),!q.status||ap&&ar||(b.statusCode=q.status),!N&&q.status&&F.RedirectStatusCode[q.status]&&ap&&(b.statusCode=200),p&&b.setHeader(t.NEXT_DID_POSTPONE_HEADER,"1"),ap&&!_){if(void 0===q.rscData){if(q.postponed)throw Object.defineProperty(Error("Invariant: Expected postponed to be undefined"),"__NEXT_ERROR_CODE",{value:"E372",enumerable:!1,configurable:!0});return(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:q.html,cacheControl:av?{revalidate:0,expire:void 0}:n.cacheControl})}return(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:x.default.fromStatic(q.rscData,t.RSC_CONTENT_TYPE_HEADER),cacheControl:n.cacheControl})}let u=q.html;if(!p||N||ap)return(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:u,cacheControl:n.cacheControl});if(as)return u.push(new ReadableStream({start(a){a.enqueue(z.ENCODED_TAGS.CLOSED.BODY_AND_HTML),a.close()}})),(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:u,cacheControl:{revalidate:0,expire:void 0}});let w=new TransformStream;return u.push(w.readable),m({span:c,postponed:q.postponed,fallbackRouteParams:null}).then(async a=>{var b,c;if(!a)throw Object.defineProperty(Error("Invariant: expected a result to be returned"),"__NEXT_ERROR_CODE",{value:"E463",enumerable:!1,configurable:!0});if((null==(b=a.value)?void 0:b.kind)!==v.CachedRouteKind.APP_PAGE)throw Object.defineProperty(Error(`Invariant: expected a page response, got ${null==(c=a.value)?void 0:c.kind}`),"__NEXT_ERROR_CODE",{value:"E305",enumerable:!1,configurable:!0});await a.value.html.pipeTo(w.writable)}).catch(a=>{w.writable.abort(a).catch(a=>{console.error("couldn't abort transformer",a)})}),(0,A.sendRenderResult)({req:a,res:b,generateEtags:ad.generateEtags,poweredByHeader:ad.poweredByHeader,result:u,cacheControl:{revalidate:0,expire:void 0}})};if(!aF)return await aE.withPropagatedContext(a.headers,()=>aE.trace(i.BaseServerSpan.handleRequest,{spanName:`${aD} ${a.url}`,kind:g.SpanKind.SERVER,attributes:{"http.method":aD,"http.target":a.url}},p));await p(aF)}catch(b){throw b instanceof B.NoFallbackError||await K.onRequestError(a,b,{routerKind:"App Router",routePath:G,routeType:"render",revalidateReason:(0,f.c)({isRevalidate:ak,isOnDemandRevalidate:ah})},ac),b}}},16953:(a,b,c)=>{"use strict";c.r(b),c.d(b,{default:()=>n,metadata:()=>m});var d=c(75338),e=c(46326),f=c.n(e),g=c(90270),h=c.n(g),i=c(76169),j=c.n(i),k=c(97325),l=c.n(k);c(82704);let m={title:"CCR",description:"CCR managed service website"};function n({children:a}){return(0,d.jsx)("html",{lang:"en",className:`${f().variable} ${h().variable} ${j().variable} ${l().variable}`,children:(0,d.jsx)("body",{className:"bg-cream text-ink font-sans antialiased",children:a})})}},17742:(a,b,c)=>{"use strict";c.r(b),c.d(b,{default:()=>d});let d=(0,c(97954).registerClientReference)(function(){throw Error("Attempted to call the default export of \"/Users/ryan/Documents/ccr/web/app/page.tsx\" from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"/Users/ryan/Documents/ccr/web/app/page.tsx","default")},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},26713:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/is-bot")},28354:a=>{"use strict";a.exports=require("util")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:a=>{"use strict";a.exports=require("path")},39992:(a,b,c)=>{"use strict";c.r(b),c.d(b,{default:()=>j});var d=c(21124),e=c(3991),f=c.n(e),g=c(38301);let h="npm install -g @ryanisavibecoder/ccr",i="https://github.com/ryanssareen/ccr";function j(){let[a,b]=(0,g.useState)(!1),[c,e]=(0,g.useState)(!1),j=async()=>{try{await navigator.clipboard.writeText(h),e(!0),setTimeout(()=>e(!1),1400)}catch{}};return(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)("style",{children:n}),(0,d.jsx)("nav",{className:`nav${a?" scrolled":""}`,children:(0,d.jsxs)("div",{className:"nav-inner",children:[(0,d.jsx)(f(),{href:"/",className:"wordmark",children:"ccr"}),(0,d.jsxs)("div",{className:"nav-links",children:[(0,d.jsx)("a",{className:"nav-link",href:i,target:"_blank",rel:"noreferrer",children:"GitHub"}),(0,d.jsx)(f(),{className:"nav-link",href:"/docs",children:"Docs"}),(0,d.jsx)(f(),{className:"btn btn-bare",href:"/login",children:"Sign in"}),(0,d.jsx)(f(),{className:"btn btn-primary",href:"/signup",children:"Get started"})]})]})}),(0,d.jsx)("section",{className:"hero",children:(0,d.jsxs)("div",{className:"hero-inner",children:[(0,d.jsx)("span",{className:"caption caption-clay",children:"Free forever \xb7 Open source"}),(0,d.jsxs)("h1",{className:"display",children:["Vibe code, free",(0,d.jsx)("span",{className:"period",children:"."})]}),(0,d.jsxs)("p",{className:"hero-sub",children:["A terminal coding assistant that reads your repo, proposes diffs, and runs commands with your approval. No API key required. Just sign up and ",(0,d.jsx)("code",{children:"ccr"}),"."]}),(0,d.jsxs)("div",{className:"hero-cta",children:[(0,d.jsx)(f(),{className:"btn btn-primary btn-lg",href:"/signup",children:"Get started — it's free"}),(0,d.jsx)("a",{className:"btn btn-ghost btn-lg",href:i,target:"_blank",rel:"noreferrer",children:"View on GitHub →"})]}),(0,d.jsxs)("div",{className:"install-chip",role:"button","aria-label":"Copy install command",onClick:j,children:[(0,d.jsx)("span",{children:h}),(0,d.jsx)("button",{className:"copy-btn","aria-label":"Copy",onClick:a=>{a.stopPropagation(),j()},style:c?{color:"var(--accent-sage)"}:void 0,children:c?(0,d.jsx)("svg",{width:"14",height:"14",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:(0,d.jsx)("polyline",{points:"3 8.5 6.5 12 13 4.5"})}):(0,d.jsxs)("svg",{width:"14",height:"14",viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round",children:[(0,d.jsx)("rect",{x:"5",y:"5",width:"9",height:"9",rx:"1.5"}),(0,d.jsx)("path",{d:"M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11"})]})})]})]})}),(0,d.jsx)("section",{className:"terminal-section",children:(0,d.jsxs)("div",{className:"terminal-wrap",children:[(0,d.jsxs)("svg",{className:"terminal-frame",viewBox:"0 0 1100 540",fill:"none",xmlns:"http://www.w3.org/2000/svg",preserveAspectRatio:"none",children:[(0,d.jsx)("defs",{children:(0,d.jsxs)("filter",{id:"pencil",children:[(0,d.jsx)("feTurbulence",{baseFrequency:"0.05",numOctaves:2,seed:3}),(0,d.jsx)("feDisplacementMap",{in:"SourceGraphic",scale:"1.2"})]})}),(0,d.jsx)("path",{d:"M 12 8 Q 8 8 8 12 L 8 528 Q 8 532 12 532 L 1088 532 Q 1092 532 1092 528 L 1092 12 Q 1092 8 1088 8 Z",stroke:"#141413",strokeWidth:"2.5",fill:"none",strokeDasharray:"4 2",strokeLinecap:"round",style:{filter:"url(#pencil)"}})]}),(0,d.jsxs)("div",{className:"terminal",role:"img","aria-label":"Terminal demonstration",children:[(0,d.jsxs)("div",{children:[(0,d.jsx)("span",{className:"term-prompt",children:"~/projects/atlas"})," ",(0,d.jsx)("span",{className:"term-dim",children:"on"})," ",(0,d.jsx)("span",{className:"term-dim",children:"main"})]}),(0,d.jsxs)("div",{style:{marginTop:14},children:[(0,d.jsx)("span",{className:"term-prompt",children:"›"})," ",(0,d.jsx)("span",{className:"term-user",children:'ccr "the rate limiter is dropping requests under burst load.'})]}),(0,d.jsx)("div",{style:{paddingLeft:16},children:(0,d.jsx)("span",{className:"term-user",children:"find the bug in src/limiter.ts and fix it. add a test that"})}),(0,d.jsx)("div",{style:{paddingLeft:16},children:(0,d.jsx)("span",{className:"term-user",children:"covers the burst case. don't run anything yet — show me"})}),(0,d.jsx)("div",{style:{paddingLeft:16},children:(0,d.jsx)("span",{className:"term-user",children:'the diff first."'})}),(0,d.jsxs)("div",{className:"term-status-row",children:[(0,d.jsx)("span",{className:"dot"}),(0,d.jsxs)("span",{className:"term-status-text",children:["ccr is reading"," ",(0,d.jsx)("span",{className:"term-dim",children:"src/limiter.ts \xb7 src/limiter.test.ts \xb7 4 imports"})]})]}),(0,d.jsx)("div",{style:{marginTop:14,color:"var(--text-mid)"},children:"Found it. The token bucket refills on every request instead of every tick, so concurrent calls all see the pre-refill state. Here's the fix:"}),(0,d.jsxs)("div",{className:"diff-card",children:[(0,d.jsxs)("div",{className:"diff-head",children:[(0,d.jsx)("span",{className:"file",children:"src/limiter.ts"}),(0,d.jsx)("span",{children:"−2 +5"})]}),(0,d.jsxs)("div",{className:"diff-body",children:[(0,d.jsx)(k,{ln:"42",marker:" ",code:"  consume(n = 1) {"}),(0,d.jsx)(k,{ln:"43",marker:"−",code:"    this.tokens = Math.min(this.cap, this.tokens + this.rate);",variant:"del"}),(0,d.jsx)(k,{ln:"44",marker:"−",code:"    if (this.tokens < n) return false;",variant:"del"}),(0,d.jsx)(k,{ln:"43",marker:"+",code:"    const now = performance.now();",variant:"add"}),(0,d.jsx)(k,{ln:"44",marker:"+",code:"    const elapsed = (now - this.last) / 1000;",variant:"add"}),(0,d.jsx)(k,{ln:"45",marker:"+",code:"    this.tokens = Math.min(this.cap, this.tokens + elapsed * this.rate);",variant:"add"}),(0,d.jsx)(k,{ln:"46",marker:"+",code:"    this.last = now;",variant:"add"}),(0,d.jsx)(k,{ln:"47",marker:"+",code:"    if (this.tokens < n) return false;",variant:"add"}),(0,d.jsx)(k,{ln:"48",marker:" ",code:"    this.tokens -= n;"})]})]}),(0,d.jsxs)("div",{style:{color:"var(--text-mid)"},children:["Apply changes? ",(0,d.jsx)("span",{className:"term-dim",children:"[y / n / edit]"})," ",(0,d.jsx)("span",{className:"term-user",children:"y"})]}),(0,d.jsxs)("div",{className:"term-confirm",style:{marginTop:10},children:[(0,d.jsx)("span",{className:"check",children:"✓"}),(0,d.jsxs)("span",{children:["Wrote 2 files. 1 test added — passing.",(0,d.jsx)("span",{className:"term-blink"})]})]})]})]})}),(0,d.jsx)("section",{className:"callout",children:(0,d.jsxs)("div",{className:"callout-inner",children:[(0,d.jsx)("h2",{className:"h2 callout-line1",children:"Tired of wrestling your tools?"}),(0,d.jsxs)("div",{className:"callout-line2-wrap",children:[(0,d.jsxs)("h2",{className:"h2 callout-line2",children:["Just type ",(0,d.jsx)("span",{className:"ccr-underline",children:"ccr"}),"."]}),(0,d.jsxs)("svg",{className:"ccr-squiggle",width:"120",height:"24",viewBox:"0 0 120 24",fill:"none",xmlns:"http://www.w3.org/2000/svg",preserveAspectRatio:"none",children:[(0,d.jsx)("defs",{children:(0,d.jsxs)("filter",{id:"pencil2",children:[(0,d.jsx)("feTurbulence",{baseFrequency:"0.3",numOctaves:2,seed:7}),(0,d.jsx)("feDisplacementMap",{in:"SourceGraphic",scale:"0.8"})]})}),(0,d.jsx)("path",{d:"M 2 12 Q 30 8, 60 14 T 118 10",stroke:"var(--accent-clay)",strokeWidth:"2.5",fill:"none",strokeLinecap:"round",style:{filter:"url(#pencil2)"}})]})]})]})}),(0,d.jsx)("section",{children:(0,d.jsx)("div",{className:"wrap",children:(0,d.jsxs)("div",{className:"capabilities",children:[(0,d.jsx)(l,{num:"01",title:"Reads your repo",children:"Indexes files, follows imports, surfaces what matters."}),(0,d.jsx)(l,{num:"02",title:"Proposes diffs",children:"Shows you exactly what changes before anything touches disk."}),(0,d.jsx)(l,{num:"03",title:"Runs commands",children:"Asks before executing. Approve, deny, or edit on the fly."})]})})}),(0,d.jsx)("section",{className:"free",children:(0,d.jsxs)("div",{className:"wrap-narrow",children:[(0,d.jsx)("h2",{className:"h2",children:"Free isn't a trick."}),(0,d.jsx)("p",{className:"body",children:"CCR routes requests across a handful of LLM providers — Groq, Together AI, Cerebras, OpenRouter — and aggregates their free tiers so you don't have to manage API keys, top up balances, or pick a model on a Tuesday. Sign up, install, and it works."}),(0,d.jsx)("p",{className:"body",children:"We pay nothing extra to operate it; you pay nothing to use it. If a provider's free tier ever disappears, we route around it. The day that becomes impossible we'll tell you, in plain English, on this page."}),(0,d.jsxs)("div",{className:"providers","aria-label":"LLM providers",children:[(0,d.jsx)("span",{className:"provider",children:"Groq"}),(0,d.jsxs)("span",{className:"provider together",children:["Together ",(0,d.jsx)("em",{children:"AI"})]}),(0,d.jsx)("span",{className:"provider",children:"Cerebras"}),(0,d.jsx)("span",{className:"provider",children:"OpenRouter"})]})]})}),(0,d.jsx)("section",{className:"quickstart",children:(0,d.jsxs)("div",{className:"wrap",children:[(0,d.jsx)("span",{className:"caption",children:"Three commands to get started"}),(0,d.jsxs)("div",{className:"qs-grid",children:[(0,d.jsx)(m,{num:"01",code:"npm install -g @ryanisavibecoder/ccr",caption:(0,d.jsxs)(d.Fragment,{children:["Installs the ",(0,d.jsx)("code",{children:"ccr"})," binary globally. Node 20+."]})}),(0,d.jsx)(m,{num:"02",code:"ccr login",caption:"Opens your browser. No API key, no credit card."}),(0,d.jsx)(m,{num:"03",code:'ccr "explain this codebase"',caption:"Run it from the root of any project. That's the whole tutorial."})]})]})}),(0,d.jsx)("footer",{children:(0,d.jsxs)("div",{className:"foot-inner",children:[(0,d.jsxs)("div",{className:"foot-left",children:[(0,d.jsx)(f(),{href:"/",className:"wordmark",children:"ccr"}),(0,d.jsx)("span",{children:"MIT licensed \xb7 2026"})]}),(0,d.jsxs)("div",{className:"foot-right",children:[(0,d.jsx)("a",{href:i,target:"_blank",rel:"noreferrer",children:"GitHub"}),(0,d.jsx)("a",{href:"https://www.npmjs.com/package/@ryanisavibecoder/ccr",target:"_blank",rel:"noreferrer",children:"npm"}),(0,d.jsx)(f(),{href:"/terms",children:"Terms"}),(0,d.jsx)(f(),{href:"/privacy",children:"Privacy"})]})]})})]})}function k({ln:a,marker:b,code:c,variant:e}){let f=e?` diff-${e}`:"";return(0,d.jsxs)("div",{className:`diff-line${f}`,children:[(0,d.jsx)("span",{className:"ln",children:a}),(0,d.jsx)("span",{className:"marker",children:b}),(0,d.jsx)("span",{className:"code",children:c})]})}function l({num:a,title:b,children:c}){return(0,d.jsxs)("div",{className:"cap",children:[(0,d.jsx)("div",{className:"cap-num",children:a}),(0,d.jsx)("h3",{className:"h3",children:b}),(0,d.jsx)("p",{children:c})]})}function m({num:a,code:b,caption:c}){return(0,d.jsxs)("div",{className:"qs-block",children:[(0,d.jsx)("div",{className:"qs-num",children:a}),(0,d.jsx)("div",{className:"qs-code",children:b}),(0,d.jsx)("div",{className:"qs-cap",children:c})]})}let n=`
  *, *::before, *::after { box-sizing: border-box; }

  .display {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(72px, 10vw, 108px);
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    margin: 0;
    transform: rotate(-1deg);
  }
  .display .period { color: var(--accent-clay); font-style: italic; }

  .h2 {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: clamp(40px, 5.5vw, 56px);
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .h3 {
    font-family: var(--font-sans), Inter, system-ui, sans-serif;
    font-weight: 600;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .body { font-size: 17px; line-height: 1.6; color: var(--text-ink); }
  .caption {
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .caption-clay { color: var(--accent-clay); }

  .wrap { max-width: var(--max-w); margin: 0 auto; padding: 0 32px; }
  .wrap-narrow { max-width: 720px; margin: 0 auto; padding: 0 32px; }
  section { padding: var(--rhythm) 0; }
  @media (max-width: 720px) {
    section { padding: var(--rhythm-sm) 0; }
    .wrap, .wrap-narrow { padding: 0 24px; }
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-cream);
    transition: border-color 200ms ease, box-shadow 200ms ease;
    border-bottom: 1px solid transparent;
  }
  .nav.scrolled { border-bottom-color: var(--border-soft); }
  .nav-inner {
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .wordmark {
    font-family: var(--font-display), "Caveat", "Bradley Hand", cursive;
    font-weight: 600;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--text-ink);
    text-decoration: none;
    transform: rotate(-1.5deg);
    display: inline-block;
  }
  .nav-links { display: flex; align-items: center; gap: 6px; }
  .nav-link {
    font-size: 15px;
    color: var(--text-ink);
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 8px;
    transition: color 150ms ease, background 150ms ease;
  }
  .nav-link:hover { color: var(--accent-clay); }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    border-radius: 8px;
    padding: 11px 18px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    line-height: 1;
  }
  .btn-primary { background: var(--accent-clay); color: #fff; }
  .btn-primary:hover { background: var(--accent-clay-hover); }
  .btn-ghost { background: transparent; color: var(--text-ink); border-color: var(--border-soft); }
  .btn-ghost:hover { border-color: var(--text-ink); }
  .btn-bare { background: transparent; color: var(--text-ink); padding: 11px 14px; }
  .btn-bare:hover { color: var(--accent-clay); }
  .btn-lg { padding: 14px 22px; font-size: 16px; }

  .hero { padding-top: 120px; padding-bottom: 96px; text-align: center; }
  @media (max-width: 720px) { .hero { padding-top: 72px; padding-bottom: 64px; } }
  .hero-inner { max-width: 880px; margin: 0 auto; padding: 0 32px; }
  .hero .caption { margin-bottom: 28px; display: block; }
  .hero .display { margin-bottom: 28px; }
  .hero-sub {
    max-width: 580px;
    margin: 0 auto 36px;
    color: #5b5a55;
    font-size: 17px;
    line-height: 1.6;
  }
  .hero-sub code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    background: var(--border-soft);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text-ink);
  }
  .hero-cta {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 40px;
  }
  .install-chip {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    background: var(--bg-cream);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 10px 14px 10px 18px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14px;
    color: var(--text-ink);
    cursor: pointer;
    transition: border-color 150ms ease;
    user-select: all;
  }
  .install-chip:hover { border-color: var(--text-mid); }
  .install-chip .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px; height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }
  .install-chip .copy-btn:hover { color: var(--text-ink); background: var(--border-soft); }

  .terminal-section { padding-top: 0; }
  .terminal-wrap { max-width: var(--max-w); margin: 0 auto; position: relative; padding: 0 24px; }
  .terminal-frame {
    position: absolute;
    top: -8px; left: 16px; right: 16px; bottom: -8px;
    pointer-events: none;
    width: calc(100% - 32px);
    height: calc(100% + 16px);
  }
  .terminal {
    position: relative;
    background: var(--bg-cream-2);
    padding: 36px 40px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14.5px;
    line-height: 1.65;
    color: var(--text-ink);
    overflow: hidden;
  }
  @media (max-width: 720px) {
    .terminal { padding: 24px 22px; font-size: 13px; }
  }
  .term-prompt { color: var(--accent-clay); }
  .term-user { color: var(--text-ink); }
  .term-dim { color: #7d7c75; }
  .term-status-row {
    margin-top: 16px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: var(--text-mid);
    font-style: italic;
  }
  .term-status-row .dot {
    flex: 0 0 auto;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent-clay);
    animation: ccr-pulse 1.4s ease-in-out infinite;
    transform: translateY(-2px);
  }
  .term-status-text { flex: 1 1 auto; }
  @keyframes ccr-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }

  .diff-card {
    margin: 18px 0;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-cream);
    overflow: hidden;
  }
  .diff-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-soft);
    font-size: 13px;
    color: var(--text-mid);
  }
  .diff-head .file { color: var(--text-ink); font-family: var(--font-mono), ui-monospace, monospace; }
  .diff-body { padding: 8px 0; }
  .diff-line {
    display: grid;
    grid-template-columns: 44px 16px 1fr;
    align-items: baseline;
    padding: 1px 16px;
    font-size: 13.5px;
    white-space: pre;
  }
  .diff-line .ln { color: var(--text-mid); user-select: none; }
  .diff-line .marker { user-select: none; }
  .diff-add { background: rgba(217, 119, 87, 0.09); }
  .diff-add .marker, .diff-add .code { color: var(--accent-clay); }
  .diff-add .ln { color: var(--accent-clay); opacity: 0.7; }
  .diff-del { background: rgba(106, 155, 204, 0.10); }
  .diff-del .marker, .diff-del .code { color: var(--accent-sky); }
  .diff-del .ln { color: var(--accent-sky); opacity: 0.7; }

  .term-confirm {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-sage);
    font-family: var(--font-sans), Inter, sans-serif;
    font-size: 14px;
  }
  .term-confirm .check {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 1.5px solid var(--accent-sage);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--accent-sage);
    font-size: 11px;
  }
  .term-blink::after {
    content: '▍';
    color: var(--text-ink);
    margin-left: 2px;
    animation: ccr-blink 1s steps(2) infinite;
  }
  @keyframes ccr-blink { 50% { opacity: 0; } }

  .callout { padding: 128px 0; text-align: center; }
  @media (max-width: 720px) { .callout { padding: 80px 0; } }
  .callout-inner { max-width: 780px; margin: 0 auto; padding: 0 32px; }
  .callout-line1 { color: var(--text-ink); margin-bottom: 24px; }
  .callout-line2-wrap { position: relative; display: inline-block; }
  .callout-line2 { color: var(--accent-clay); }
  .ccr-underline { position: relative; display: inline-block; }
  .ccr-squiggle {
    position: absolute;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    width: 110%;
    height: auto;
    pointer-events: none;
  }

  .capabilities {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 56px;
  }
  @media (max-width: 720px) {
    .capabilities { grid-template-columns: 1fr; gap: 40px; }
  }
  .cap-num {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    font-weight: 400;
    font-size: 28px;
    color: var(--accent-clay);
    margin-bottom: 14px;
    letter-spacing: -0.01em;
  }
  .cap h3 { margin-bottom: 10px; }
  .cap p { color: #5b5a55; margin: 0; max-width: 30ch; }

  .free .h2 { text-align: center; margin-bottom: 28px; }
  .free p { color: #3f3e3a; margin: 0 0 18px; }
  .providers {
    margin-top: 56px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    color: var(--text-mid);
  }
  .providers .provider {
    font-family: var(--font-sans), Inter, sans-serif;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.005em;
    color: var(--text-mid);
  }
  .providers .provider.together { font-weight: 500; }
  .providers .provider em {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    font-weight: 400;
  }

  .quickstart .caption { margin-bottom: 36px; display: block; }
  .qs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 880px) { .qs-grid { grid-template-columns: 1fr; } }
  .qs-block { display: flex; flex-direction: column; gap: 12px; }
  .qs-num {
    font-family: var(--font-display), "Caveat", cursive;
    font-style: italic;
    color: var(--accent-clay);
    font-size: 22px;
  }
  .qs-code {
    background: var(--bg-cream-2);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 18px 20px;
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 14.5px;
    color: var(--text-ink);
    overflow-x: auto;
  }
  .qs-cap {
    font-size: 13.5px;
    color: var(--text-mid);
    line-height: 1.5;
  }
  .qs-cap code {
    font-family: var(--font-mono), ui-monospace, monospace;
  }

  footer {
    border-top: 1px solid var(--border-soft);
    padding: 64px 0;
  }
  .foot-inner {
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 0 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    color: var(--text-mid);
    font-size: 14px;
  }
  .foot-left { display: flex; align-items: baseline; gap: 16px; }
  .foot-left .wordmark { font-size: 22px; color: var(--text-mid); }
  .foot-right { display: flex; gap: 22px; }
  .foot-right a {
    color: var(--text-mid);
    text-decoration: none;
    transition: color 150ms ease;
  }
  .foot-right a:hover { color: var(--text-ink); }
  @media (max-width: 600px) {
    .foot-inner { flex-direction: column; align-items: flex-start; }
  }
`},41025:a=>{"use strict";a.exports=require("next/dist/server/app-render/dynamic-access-async-storage.external.js")},41732:(a,b,c)=>{Promise.resolve().then(c.bind(c,17742))},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},66663:(a,b,c)=>{Promise.resolve().then(c.t.bind(c,81170,23)),Promise.resolve().then(c.t.bind(c,23597,23)),Promise.resolve().then(c.t.bind(c,36893,23)),Promise.resolve().then(c.t.bind(c,89748,23)),Promise.resolve().then(c.t.bind(c,6060,23)),Promise.resolve().then(c.t.bind(c,7184,23)),Promise.resolve().then(c.t.bind(c,69576,23)),Promise.resolve().then(c.t.bind(c,73041,23)),Promise.resolve().then(c.t.bind(c,51384,23))},78536:()=>{},82704:()=>{},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},91688:()=>{},94884:(a,b,c)=>{Promise.resolve().then(c.bind(c,39992))},96927:(a,b,c)=>{Promise.resolve().then(c.t.bind(c,54160,23)),Promise.resolve().then(c.t.bind(c,31603,23)),Promise.resolve().then(c.t.bind(c,68495,23)),Promise.resolve().then(c.t.bind(c,75170,23)),Promise.resolve().then(c.t.bind(c,77526,23)),Promise.resolve().then(c.t.bind(c,78922,23)),Promise.resolve().then(c.t.bind(c,29234,23)),Promise.resolve().then(c.t.bind(c,12263,23)),Promise.resolve().then(c.bind(c,82146))}};var b=require("../webpack-runtime.js");b.C(a);var c=b.X(0,[331,521,991],()=>b(b.s=12964));module.exports=c})();