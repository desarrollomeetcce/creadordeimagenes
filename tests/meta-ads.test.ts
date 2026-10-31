import "./inventory-cac.test";
import "./inventory-report-summary.test";
import {advisorDayEffectiveness} from "../lib/meta-ads/advisor-day-effectiveness";
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,summarize,localDay,metricFor,dayCount} from '../lib/meta-ads/analytics';
import {MetaReader,readTool,selectTool,toolArguments,safeMetaURL,type MetaTool} from '../lib/meta-ads/provider';
test('Meta: costo ponderado, cero resultados y días inclusivos',()=>{const rows=[{day:'2026-10-19',spend:10,impressions:100,clicks:10,actions:{'onsite_conversion.messaging_conversation_started_7d':10}},{day:'2026-10-20',spend:20,impressions:100,clicks:10,actions:{'onsite_conversion.messaging_conversation_started_7d':1}}];const p=summarize(rows,'MESSAGES','2026-10-19','2026-10-20',true);assert.equal(p.cost,30/11);assert.notEqual(p.cost,10.5);assert.equal(summarize([{...rows[0],actions:{}}],'MESSAGES','2026-10-19','2026-10-20',true).state,'NO_RESULTS');assert.equal(summarize([],'MESSAGES','2026-10-19','2026-10-20',true).state,'INACTIVE');assert.equal(summarize([],'MESSAGES','2026-10-19','2026-10-20',false).state,'UNAVAILABLE');assert.equal(dayCount('2026-10-20','2026-10-20'),1);});
test('Meta: no confundir objetivo con resultado ni sumar leads duplicados',()=>{assert.equal(metricFor('AUTO','OUTCOME_ENGAGEMENT'),'UNKNOWN');assert.equal(metricFor('AUTO','OUTCOME_ENGAGEMENT','CONVERSATIONS'),'MESSAGES');assert.equal(metricFor('AUTO','OUTCOME_LEADS'),'LEADS');assert.equal(metricFor('MESSAGES','OUTCOME_LEADS'),'MESSAGES');const p=summarize([{day:'2026-10-20',spend:20,impressions:100,clicks:10,actions:{lead:10,'offsite_conversion.fb_pixel_lead':8,link_click:99}}],'LEADS','2026-10-20','2026-10-20',true);assert.equal(p.results,10);assert.equal(p.cost,2);});
test('Meta: periodos y antigüedad siguen zona horaria y no reinician con pausas',()=>{assert.equal(localDay('America/Lima',new Date('2026-10-21T02:00:00Z')),'2026-10-20');const a=analyze([{day:'2026-09-01',spend:10,impressions:50,clicks:0,actions:{}},{day:'2026-10-20',spend:5,impressions:20,clicks:0,actions:{}}],'MESSAGES','2026-10-20',true,'2026-09-01',2,10);assert.equal(a.ageDays,50);assert.equal(a.activeDays,2);assert.equal(a.periods['7'].since,'2026-10-14');assert.equal(a.periods['lifetime'].spend,15);assert.equal(a.historyPartial,true);});
test('Meta MCP: lista permitida de lectura y parámetros acotados por cuenta',()=>{const t:MetaTool={name:'get_insights',inputSchema:{properties:Object.fromEntries(['account_id','level','time_increment','date_preset','action_attribution_windows','action_report_time','after'].map(k=>[k,{}]))}};assert(readTool(t));assert(!readTool({...t,name:'update_campaign'}));assert(!readTool({...t,name:'get_and_delete_ads'}));assert(!readTool({...t,annotations:{destructiveHint:true}}));const a=toolArguments(t,'insights',{accountId:'123',level:'ad'});assert.equal(a.account_id,'123');assert.deepEqual(a.action_attribution_windows,['7d_click','1d_view']);assert.equal(a.action_report_time,'impression');assert.throws(()=>toolArguments({...t,inputSchema:{properties:{level:{}}}},'insights',{accountId:'123'}));assert.throws(()=>selectTool([{...t,name:'update_insights'}],'insights'));assert.throws(()=>safeMetaURL('http://127.0.0.1/'));assert.throws(()=>safeMetaURL('https://mcp.facebook.com.evil.test/'));});
test('Marketing API: paginación solo por cursor, token en cabecera y atribución explícita',async()=>{const original=globalThis.fetch;const calls:URL[]=[];globalThis.fetch=async(input,init)=>{const u=new URL(String(input));calls.push(u);assert.equal(u.hostname,'graph.facebook.com');assert.equal(u.searchParams.has('access_token'),false);assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer synthetic-token');assert.equal(u.searchParams.get('action_report_time'),'impression');return Response.json({data:[],paging:{next:'https://evil.test/?access_token=bad',cursors:{after:'cursor-next'}}});};try{const r=await new MetaReader('synthetic-token','API','v23.0').get('insights',{accountId:'123',level:'ad'});assert.equal(r.after,'cursor-next');assert.equal(calls[0].pathname,'/v23.0/act_123/insights');}finally{globalThis.fetch=original;}});
test('MCP Streamable HTTP: initialize, catalogue, structured result et fin de SSE sans attendre fermeture',async()=>{const original=globalThis.fetch;const methods:string[]=[];let cancelled=false;globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));methods.push(b.method);if(b.method==='initialize')return Response.json({jsonrpc:'2.0',id:b.id,result:{protocolVersion:'2025-03-26'}});if(b.method==='notifications/initialized')return new Response(null,{status:202});if(b.method==='tools/list')return Response.json({jsonrpc:'2.0',id:b.id,result:{tools:[{name:'get_ad_accounts',inputSchema:{properties:{fields:{type:'string'}}}}]}});assert.equal(b.method,'tools/call');assert.equal(b.params.name,'get_ad_accounts');assert(b.params.arguments.fields.includes('currency,timezone_name'));return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({jsonrpc:'2.0',id:b.id,result:{structuredContent:{data:[{id:'123',name:'Cuenta'}]}}})+'\n\n'));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});};try{const r=await new MetaReader('synthetic-token','MCP','v23.0').get('accounts');assert.equal(r.data[0].id,'123');assert.equal(cancelled,true);assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','tools/call']);}finally{globalThis.fetch=original;}});

test('Meta: miniaturas solo desde dominios permitidos y sin URL de token',async()=>{const {thumbnailURL}=await import('../lib/meta-ads/thumbnail');assert.equal(thumbnailURL('https://scontent.test.fbcdn.net/image.jpg').hostname,'scontent.test.fbcdn.net');for(const url of ['http://localhost/image','https://evil.test/image','https://fbcdn.net.evil.test/','https://scontent.test.fbcdn.net/image?access_token=private','https://user:pass@scontent.test.fbcdn.net/image'])assert.throws(()=>thumbnailURL(url));});

test('OAuth Meta: recurso/emisor y endpoints vinculados, solo permisos permitidos',async()=>{
 const {oauthDiscovery,oauthClientMetadata}=await import('../lib/meta-ads/oauth-policy');
 const resource={resource:'https://mcp.facebook.com/ads',authorization_servers:['https://mcp.facebook.com/ads'],scopes_supported:['ads_read','ads_management','business_management','ads_mcp_management','pages_manage_ads']};
 const meta={issuer:'https://mcp.facebook.com/ads',authorization_endpoint:'https://www.facebook.com/v26.0/dialog/oauth',token_endpoint:'https://graph.facebook.com/v26.0/oauth/access_token',code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']};
 const p=oauthDiscovery(resource,meta,resource.authorization_servers[0]);assert.deepEqual(p.scopes,['ads_read','business_management','ads_mcp_management']);assert(!p.scopes.includes('ads_management'));
 for(const bad of [{...meta,issuer:'https://www.facebook.com'},{...meta,code_challenge_methods_supported:['plain']},{...meta,authorization_endpoint:'https://www.facebook.com/other'},{...meta,token_endpoint:'https://evil.test/token'},{...meta,token_endpoint_auth_methods_supported:['client_secret_basic']}])assert.throws(()=>oauthDiscovery(resource,bad,resource.authorization_servers[0]));
 assert.throws(()=>oauthDiscovery({...resource,resource:'https://mcp.facebook.com/devtools'},meta,resource.authorization_servers[0]));
 const client=oauthClientMetadata('https://app.example.test');assert.equal(client.client_id,'https://app.example.test/api/meta/oauth/client');assert.deepEqual(client.redirect_uris,['https://app.example.test/api/meta/oauth/callback']);assert.equal(client.token_endpoint_auth_method,'none');assert(!JSON.stringify(client).includes('secret'));assert.throws(()=>oauthClientMetadata('http://public.example.test'));
});

test('Graph API: consulta mínima antes de enriquecer, business opcional no exige permiso adicional',async()=>{
 const original=globalThis.fetch,originalWarn=console.warn;const calls:string[]=[],logs:string[]=[];const token='EAA-synthetic-graph-token-1234567890';console.warn=(s)=>logs.push(String(s));
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.pathname,'/v26.0/me/adaccounts');assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer '+token);assert(!u.searchParams.has('access_token'));const f=u.searchParams.get('fields')!;calls.push(f);if(f.includes('business'))return Response.json({error:{code:200,error_subcode:33,message:'Business denied '+token}},{status:400});return Response.json({data:[{id:'98001',name:'Cuenta',...(f.includes('currency')?{currency:'PEN',timezone_name:'America/Lima'}:{}),...(f.includes('account_status')?{account_status:1}:{})}]});};
 try{const result=await new MetaReader(token,'API','v26.0').accounts();assert.deepEqual(calls,['id,name','id,name,currency,timezone_name','id,name,account_status','id,name,business{id,name}']);assert.equal(result.data[0].currency,'PEN');assert.equal(result.warnings?.[0].code,200);assert.equal(result.warnings?.[0].subcode,33);assert(!JSON.stringify(result).includes(token));assert(!logs.join().includes(token));}finally{globalThis.fetch=original;console.warn=originalWarn;}
});
test('Graph API: conserva código/subcódigo/contexto y elimina token crudo, codificado, URLs y cabeceras',async()=>{
 const {MetaGraphError}=await import('../lib/meta-ads/graph-error');const token='EAA/synthetic+secret-token-12345678901234567890',encoded=[...token].map(c=>'%'+c.charCodeAt(0).toString(16)).join('');const original=globalThis.fetch,originalWarn=console.warn;let calls=0;const logs:string[]=[];console.warn=(s)=>logs.push(String(s));
 globalThis.fetch=async()=>{calls++;return Response.json({error:{code:190,error_subcode:463,message:`Expired ${token} Bearer ${token} https://example.test/?access_token=${encodeURIComponent(token)} ${encoded}`}},{status:400});};
 try{await assert.rejects(()=>new MetaReader(token,'API','v26.0').accounts(),e=>{assert(e instanceof MetaGraphError);assert.equal(e.diagnostic.code,190);assert.equal(e.diagnostic.subcode,463);assert.equal(e.diagnostic.fields,'id,name');assert.equal(e.diagnostic.version,'v26.0');assert(e.message.includes('código 190 / subcódigo 463'));assert(!JSON.stringify(e).includes(token));assert(!JSON.stringify(e).includes(encoded));return true;});assert.equal(calls,1);assert(!logs.join().includes(token));assert(!logs.join().includes(encoded));}finally{globalThis.fetch=original;console.warn=originalWarn;}
});
test('Graph API: error de autenticación en un campo opcional no se trata como éxito parcial',async()=>{
 const original=globalThis.fetch,originalWarn=console.warn;console.warn=()=>{};globalThis.fetch=async(input)=>{const f=new URL(String(input)).searchParams.get('fields')!;if(f.includes('account_status'))return Response.json({error:{code:190,message:'Invalid OAuth token'}},{status:400});return Response.json({data:[{id:'1',name:'Uno',currency:'PEN',timezone_name:'America/Lima'}]});};try{await assert.rejects(()=>new MetaReader('synthetic-token','API','v26.0').accounts(),/código 190/);}finally{globalThis.fetch=original;console.warn=originalWarn;}
});

test('Meta: errores internos solo exponen códigos reconocidos, nunca mensajes del driver',async()=>{const {internalErrorCode}=await import('../lib/meta-ads/graph-error');assert.equal(internalErrorCode({code:'P2028',message:'secret query token'}),'P2028');assert.equal(internalErrorCode({code:'ECONNRESET'}),'ECONNRESET');assert.equal(internalErrorCode({code:'token-secret-arbitrary'}),null);assert.equal(internalErrorCode(new Error('secret')),null);});

test('Meta: búsqueda de cuentas por nombre, ID y negocio; actividad desconocida nunca se trata como cero',async()=>{
 const {matchesAccount,accountActivityText}=await import('../lib/meta-ads/account-filters');const a={id:'321283662083214',name:'Cámara Nacional',businessId:null,currency:'PEN',enabled:false};assert(matchesAccount(a,'camara'));assert(matchesAccount(a,'act_321283662083214'));assert(matchesAccount(a,'','unknown'));assert(!matchesAccount(a,'','none'));assert(!matchesAccount(a,'','spend'));assert(matchesAccount(a,'','all','__unknown'));assert(accountActivityText(a).includes('desconocida'));
 const ready={...a,activity:{state:'READY' as const,spend30:25,activeCampaigns:2}};assert(matchesAccount(ready,'','spend'));assert(matchesAccount(ready,'','active'));assert(!matchesAccount(ready,'','none'));assert(!matchesAccount({...ready,activity:{...ready.activity,state:'STALE'}},'','spend'));assert(matchesAccount({...ready,activity:{...ready.activity,spend30:0,activeCampaigns:0}},'','none'));
});
test('Meta: permiso opcional denegado se consulta una vez por verificación paginada',async()=>{
 const original=globalThis.fetch,warn=console.warn;const calls:string[]=[];console.warn=()=>{};globalThis.fetch=async(input)=>{const u=new URL(String(input)),fields=u.searchParams.get('fields')!;calls.push(fields);if(fields.includes('business'))return Response.json({error:{code:100,message:'Requires business_management permission to access the field'}},{status:400});return Response.json({data:[{id:'123',name:'Cuenta',currency:'PEN',timezone_name:'America/Lima'}],...(!u.searchParams.has('after')?{paging:{next:'ignored',cursors:{after:'next'}}}:{})});};try{const reader=new MetaReader('synthetic-token','API','v26.0');assert.equal((await reader.accounts()).warnings?.length,1);assert.equal((await reader.accounts('next')).warnings?.length,0);assert.equal(calls.filter(f=>f.includes('business')).length,1);}finally{globalThis.fetch=original;console.warn=warn;}
});

test('Meta: preferencias acotadas conservan controles sin aceptar secretos ni selecciones inválidas',async()=>{const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');const p=parseMetaPreferences(JSON.stringify({accountIds:['123','123','bad','456'],q:'TANIA',level:'campaign',sort:'30',direction:'desc',accountPickerQuery:'SH',accountListQuery:'Tania',analysisPeriod:'15',token:'never-persist',calendar:'custom',since:'invalid',until:'2026-10-21'}));assert.deepEqual(p.accountIds,['123','456']);assert.equal(p.q,'TANIA');assert.equal(p.level,'campaign');assert.equal(p.direction,'desc');assert.equal(p.analysisPeriod,'15');assert.equal(p.accountPickerQuery,'SH');assert.equal(p.calendar,'');assert(!JSON.stringify(p).includes('never-persist'));assert.equal(parseMetaPreferences('{broken').level,'ad');});
test('Meta: progreso por etapas no declara completo antes de terminar ni oculta un bloqueo',async()=>{const {syncProgress}=await import('../lib/meta-ads/sync-progress');const now=Date.now(),base={enabled:true,syncedAt:null,nextSyncAt:new Date(now),syncError:null,syncState:{}};assert.equal(syncProgress(base,now).status,'queued');const running=syncProgress({...base,syncState:{phase:5,pages:10,processed:500,updatedAt:new Date(now).toISOString()}},now);assert.equal(running.phase,5);assert.equal(running.status,'running');assert.equal(running.processed,500);assert.equal(syncProgress({...base,syncState:{phase:2,updatedAt:new Date(now-240000).toISOString()}},now).status,'stalled');const complete=syncProgress({...base,syncedAt:new Date(now),syncState:{lastRun:{pages:12,processed:650,finishedAt:new Date(now).toISOString()}}},now);assert.equal(complete.phase,6);assert.equal(complete.pages,12);assert.equal(syncProgress({...base,syncError:'Error'},now).status,'error');});

test('Meta: último intento informa fecha y versión sin exponer credenciales',async()=>{const {syncProgress}=await import('../lib/meta-ads/sync-progress');const at=new Date().toISOString(),base={enabled:true,syncedAt:null,nextSyncAt:null,syncError:'Error',syncState:{phase:1,pages:63,lastAttempt:{at,revision:4}}};const p=syncProgress(base);assert.equal(p.attemptAt,at);assert.equal(p.credentialRevision,4);assert.equal(p.pages,63);const invalid=syncProgress({...base,syncState:{lastAttempt:{at:'bad',revision:-1}}});assert.equal(invalid.attemptAt,null);assert.equal(invalid.credentialRevision,null);});

test('Meta Marketing OAuth: retorno separado por instalación, HTTPS y sin redirecciones abiertas',async()=>{const {marketingOAuthInfo}=await import('../lib/meta-ads/marketing-policy');for(const origin of ['https://generator.agenciamagneto.org','https://creadordeimagenes-three.vercel.app']){const info=marketingOAuthInfo(origin);assert.equal(info.callbackUrl,origin+'/api/meta/marketing/oauth/callback');assert.equal(info.scope,'ads_read');assert(!info.callbackUrl.endsWith('/api/meta/oauth/callback'));}for(const origin of [undefined,'http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?x=1','https://example.com/#x'])assert.throws(()=>marketingOAuthInfo(origin));assert.equal(marketingOAuthInfo('http://localhost:3074').origin,'http://localhost:3074');});
test('Meta Marketing OAuth: Graph añade appsecret_proof sin poner el token o secreto en la URL',async()=>{const {MetaReader}=await import('../lib/meta-ads/provider'),{createHmac}=await import('node:crypto');const original=globalThis.fetch,token='synthetic-oauth-reader-token',secret='synthetic-app-secret-123456';let called=false;globalThis.fetch=async(input,init)=>{called=true;const url=new URL(String(input));assert.equal(url.searchParams.get('appsecret_proof'),createHmac('sha256',secret).update(token).digest('hex'));assert(!url.href.includes(token));assert(!url.href.includes(secret));assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+token);return Response.json({data:[]});};try{await new MetaReader(token,'API','v26.0',secret).get('accounts');assert(called);}finally{globalThis.fetch=original;}});

test('Meta v26: metadatos individuales sin parámetro ids obsoleto, Bearer y lote acotado',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(input,init)=>{calls++;const url=new URL(String(input));assert.equal(url.pathname,'/v26.0/123');assert(!url.searchParams.has('ids'));assert(url.searchParams.get('fields')!.startsWith('account_id,'));assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic');return Response.json({id:'123',account_id:'99',name:'Anuncio'});};
 try{const r=new MetaReader('synthetic','API','v26.0');assert.equal((await r.get('ads',{accountId:'99',ids:['123']})).data.length,1);await assert.rejects(()=>r.get('ads',{ids:Array.from({length:51},(_,i)=>String(i))}));await assert.rejects(()=>r.get('insights',{ids:['123']}));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('Meta: progreso rápido identifica rango y seis fases de actividad/detalles',async()=>{const {syncProgress}=await import('../lib/meta-ads/sync-progress');const p=syncProgress({enabled:true,syncedAt:null,nextSyncAt:null,syncError:null,syncState:{plan:'activity',phase:0,recentDays:90,since:'2026-07-25',until:'2026-10-22'}});assert.equal(p.label,'Resultados de campañas');assert.equal(p.recentDays,90);assert(p.scope?.includes('solo objetos con actividad'));const complete=syncProgress({enabled:true,syncedAt:new Date(),nextSyncAt:null,syncError:null,syncState:{lastRun:{plan:'activity',recentDays:90,since:'2026-07-25',until:'2026-10-22',pages:7}}});assert.equal(complete.recentDays,90);assert.equal(complete.phase,6);});

 test('Meta: catálogo parcial nunca acredita ausencia de campañas activas',async()=>{const {matchesAccount,accountActivityText}=await import('../lib/meta-ads/account-filters');const a={id:'1',name:'Cuenta',currency:'PEN',enabled:true,activity:{state:'READY' as const,spend30:0,activeCampaigns:0,partial:true}};assert(!matchesAccount(a,'','none'));assert(matchesAccount(a,'','unknown'));assert(accountActivityText(a).includes('inventario parcial'));assert(matchesAccount({...a,activity:{...a.activity,activeCampaigns:1}},'','active'));});

test('Meta: selección semanal independiente de diario30 y acumulado máximo sin ids obsoleto',async()=>{
 const original=globalThis.fetch;const calls:URL[]=[];globalThis.fetch=async(input)=>{const u=new URL(String(input));calls.push(u);assert(!u.searchParams.has('ids'));return Response.json({data:[]});};
 try{const r=new MetaReader('synthetic','API','v26.0');await r.get('insights',{accountId:'1',level:'ad',aggregate:true,since:'2026-10-16',until:'2026-10-22'});assert.equal(calls[0].searchParams.get('time_increment'),'all_days');assert.equal(calls[0].pathname,'/v26.0/act_1/insights');await r.get('insights',{accountId:'1',objectId:'2',level:'ad',aggregate:true});assert.equal(calls[1].pathname,'/v26.0/2/insights');assert.equal(calls[1].searchParams.get('date_preset'),'maximum');assert.equal(calls[1].searchParams.get('time_increment'),'all_days');await r.get('ads',{accountId:'1',activeOnly:true});assert.deepEqual(JSON.parse(calls[2].searchParams.get('effective_status')!),['ACTIVE']);}finally{globalThis.fetch=original;}
});
test('Meta: progreso separa comparativos listos de histórico y distingue pausa de finalización',async()=>{const {syncProgress}=await import('../lib/meta-ads/sync-progress');const state={plan:'focus',phase:10,recentDays:7,recentReady:true,started:new Date().toISOString()};const base={enabled:true,syncedAt:new Date(),nextSyncAt:null,syncError:null,syncState:state};const p=syncProgress(base);assert.equal(p.totalPhases,11);assert.equal(p.recentReady,true);assert.equal(p.status,'running');assert.equal(syncProgress({...base,enabled:false,syncState:{...state,stop:'paused'}}).status,'paused');assert.equal(syncProgress({...base,enabled:false,syncState:{plan:'focus',stop:'cancelled'}}).status,'cancelled');});

test('Meta cuota: Graph HTTP400/código17 es limitación, sin reintento ni campos opcionales',async()=>{
 const {MetaGraphError,retryDelay,isGraphQuota}=await import('../lib/meta-ads/graph-error');const original=globalThis.fetch,warn=console.warn;let calls=0;console.warn=()=>{};
 globalThis.fetch=async()=>{calls++;return Response.json({error:{code:17,error_subcode:2446079,message:'User request limit reached'}},{status:400});};
 try{await assert.rejects(()=>new MetaReader('synthetic-quota-token','API','v26.0').accounts(),e=>{assert(e instanceof MetaGraphError);assert.equal(e.status,429);assert.equal(e.diagnostic.httpStatus,400);assert.equal(e.diagnostic.subcode,2446079);return true;});assert.equal(calls,1);assert(isGraphQuota(429,null));assert(!isGraphQuota(400,190));const now=Date.now();assert.equal(retryDelay('3600',now),3600000);assert.equal(retryDelay(new Date(now+60000).toUTCString(),now)>58000,true);assert.equal(retryDelay('invalid'),0);assert.equal(retryDelay('99999999'),86400000);}finally{globalThis.fetch=original;console.warn=warn;}
});
test('Meta cuota: espera conserva progreso y distingue pausa manual de reintento automático',async()=>{
 const {syncProgress}=await import('../lib/meta-ads/sync-progress');const now=Date.now(),until=new Date(now+1800000),base={enabled:true,syncedAt:null,nextSyncAt:until,syncError:'código 17',syncState:{plan:'focus',phase:4,pages:4,processed:155,updatedAt:new Date(now-600000).toISOString(),quotaUntil:until.toISOString()}};
 const p=syncProgress(base,now);assert.equal(p.status,'waiting');assert.equal(p.phase,4);assert.equal(p.processed,155);assert.equal(p.nextSyncAt,until.toISOString());assert.equal(syncProgress({...base,enabled:false,syncState:{...base.syncState,stop:'paused'}},now).status,'paused');assert.notEqual(syncProgress(base,now+1800001).status,'waiting');
});

test('Meta Insights agrupados: filtro por nivel/IDs acotado sin ids raíz ni catálogo completo',async()=>{
 const original=globalThis.fetch;const calls:URL[]=[];globalThis.fetch=async(input)=>{calls.push(new URL(String(input)));return Response.json({data:[]});};
 try{const r=new MetaReader('synthetic','API','v26.0');await r.get('insights',{accountId:'123',level:'ad',insightIds:['11','12'],aggregate:true});assert.equal(calls[0].pathname,'/v26.0/act_123/insights');assert.deepEqual(JSON.parse(calls[0].searchParams.get('filtering')!),[{field:'ad.id',operator:'IN',value:['11','12']}]);assert(!calls[0].searchParams.has('ids'));await assert.rejects(()=>r.get('ads',{accountId:'123',level:'ad',insightIds:['11']}));await assert.rejects(()=>r.get('insights',{accountId:'123',level:'ad',insightIds:[]}));await assert.rejects(()=>r.get('insights',{accountId:'123',level:'ad',insightIds:['11','11']}));await assert.rejects(()=>r.get('insights',{accountId:'123',level:'ad',insightIds:Array.from({length:51},(_,i)=>String(i))}));assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});

test('Meta: conversación agregada usa gasto dividido entre resultados, no promedio de costos',()=>{
 const rows=[{spend:10,impressions:100,clicks:10,actions:{'onsite_conversion.messaging_conversation_started_7d':10}},{spend:90,impressions:300,clicks:30,actions:{'onsite_conversion.messaging_conversation_started_7d':30}}];
 const total=summarize(rows.map(r=>({...r,day:'2026-10-22'})),'MESSAGES','2026-10-22','2026-10-22',true);assert.equal(total.results,40);assert.equal(total.cost,2.5);
});
test('Meta: inventario completo no impone filtro ACTIVE y exige identidad de cuenta',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async(input)=>{const u=new URL(String(input));assert.equal(u.pathname,'/v26.0/act_123/ads');assert(!u.searchParams.has('effective_status'));assert(u.searchParams.get('fields')!.includes('account_id'));return Response.json({data:[{id:'1231',account_id:'123',status:'PAUSED',effective_status:'PAUSED'}]});};try{assert.equal((await new MetaReader('synthetic-token','API','v26.0').get('ads',{accountId:'123',inventoryAll:true})).data[0].status,'PAUSED');}finally{globalThis.fetch=previous;}
});
test('Meta: preferencias migran medida a conversaciones sin perder cuenta ni búsqueda',async()=>{
 const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');const old=parseMetaPreferences(JSON.stringify({metric:'LINK_CLICKS',accountIds:['123'],q:'Psicología',business:'99',currency:'USD',age:'older'}));assert.equal(old.metric,'MESSAGES');assert.deepEqual(old.accountIds,['123']);assert.equal(old.q,'Psicología');assert.equal(old.business,'');assert.equal(old.currency,'');assert.equal(old.age,'');assert.equal(parseMetaPreferences(JSON.stringify({layoutRevision:2,metric:'LEADS'})).metric,'LEADS');
});
test('Meta: escrituras inciertas se informan sin reintento y MCP nunca cambia estados',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async(input,init)=>{calls++;assert.equal(new URL(String(input)).pathname,'/v26.0/123');assert.equal(init?.method,'POST');assert.equal(new URLSearchParams(String(init?.body)).get('status'),'PAUSED');throw Error('Synthetic connection lost');};try{await assert.rejects(()=>new MetaReader('synthetic-token','API','v26.0').setStatus('123','PAUSED'),/pudo haberse aplicado/);assert.equal(calls,1);await assert.rejects(()=>new MetaReader('synthetic-token','MCP','v26.0').setStatus('123','PAUSED'),/no permitido/);assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('Meta: cuentas fijadas y checks persisten con IDs válidos, sin copiar nombres ni secretos',async()=>{
 const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');const p=parseMetaPreferences(JSON.stringify({layoutRevision:2,accountIds:['123'],pinnedAccountIds:['123','123','456','bad'],selectedObjects:[{id:'1001',accountId:'123',level:'campaign',token:'secret-value',name:'not-persisted'},{id:'1001',accountId:'123',level:'campaign'},{id:'1002',accountId:'456',level:'ad'},{id:'bad',accountId:'456',level:'ad'}],campaignScope:['1001','1001'],calendar:'custom',since:'2026-10-01',until:'2026-10-22',sort:'custom'}));assert.deepEqual(p.pinnedAccountIds,['123','456']);assert.deepEqual(p.selectedObjects,[{id:'1001',accountId:'123',level:'campaign'},{id:'1002',accountId:'456',level:'ad'}]);assert.deepEqual(p.campaignScope,['1001']);assert.equal(p.calendar,'custom');assert.equal(p.sort,'custom');assert.equal(p.since,'2026-10-01');assert(!JSON.stringify(p).includes('secret-value'));assert(!JSON.stringify(p).includes('not-persisted'));const restored=parseMetaPreferences(JSON.stringify({...p,layoutRevision:2}));assert.deepEqual(restored.selectedObjects,p.selectedObjects);assert.deepEqual(restored.pinnedAccountIds,p.pinnedAccountIds);
});


test('Calendario único: rangos inclusivos Lima, cambios de mes/año y semanas lunes',async()=>{
 const {reportToday,shiftDate,monthDate,quickRange}=await import('../lib/meta-ads/date-range');
 assert.equal(reportToday(new Date('2026-01-01T03:00:00Z')),'2025-12-31');
 assert.deepEqual(quickRange('7','2026-01-03'),['2025-12-28','2026-01-03']);
 assert.deepEqual(quickRange('lastmonth','2024-03-15'),['2024-02-01','2024-02-29']);
 assert.deepEqual(quickRange('lastweek','2026-10-22'),['2026-10-12','2026-10-18']);
 assert.deepEqual(quickRange('week','2026-10-25'),['2026-10-19','2026-10-25']);
 assert.equal(monthDate('2026-01-31',-1),'2025-12-01');assert.equal(shiftDate('2024-02-28',1),'2024-02-29');
});

test('Meta detalle diario: rangos inclusivos, todo lo guardado y rechazo de fechas inválidas',async()=>{
 const {dailyRange}=await import('../lib/meta-ads/daily-range');
 assert.deepEqual(dailyRange(new URLSearchParams(),'2026-10-22'),{gte:'2026-09-23',lte:'2026-10-22'});
 assert.deepEqual(dailyRange(new URLSearchParams('since=2024-02-29&until=2024-03-01'),'2026-10-22'),{gte:'2024-02-29',lte:'2024-03-01'});
 assert.deepEqual(dailyRange(new URLSearchParams('all=1'),'2026-10-22'),{lte:'2026-10-22'});
 for(const q of ['since=2026-02-30&until=2026-03-01','since=2026-10-22&until=2026-10-21','since=2026-10-22','since=&until=','since=2026-10-23&until=2026-10-24','all=1&since=2026-10-01&until=2026-10-22','all=2'])assert.throws(()=>dailyRange(new URLSearchParams(q),'2026-10-22'));
});

test('Meta ordering: active objects first before pagination, costs within comparable groups and missing costs last',async()=>{
 const {compareMetaItems}=await import('../lib/meta-ads/order');
 const row=(id:string,status:string,cost:number|null,currency='PEN')=>({id,status,effectiveStatus:status,currency,metric:'MESSAGES',createdTime:null,ageDays:null,periods:{today:{cost,results:cost===null?0:10},'7':{cost,results:10}}});
 const rows=[row('paused-cheap','PAUSED',.1),row('active-high','ACTIVE',2),row('active-none','ACTIVE',null),row('active-low','ACTIVE',.5),row('paused-high','PAUSED',1)];
 assert.deepEqual([...rows].sort((a,b)=>compareMetaItems(a,b,'today',1)).map(o=>o.id),['active-low','active-high','active-none','paused-cheap','paused-high']);
 assert.deepEqual([...rows].sort((a,b)=>compareMetaItems(a,b,'today',-1)).map(o=>o.id),['active-high','active-low','active-none','paused-high','paused-cheap']);
 assert(compareMetaItems(row('a','ACTIVE',5,'USD'),row('b','PAUSED',.1), 'today',1)<0);
 const inherited={...row('child','PAUSED',.1),status:'ACTIVE'};assert(compareMetaItems(inherited,row('live','ACTIVE',2),'today',1)>0);
});

test('Meta links select the exact campaign, adset or ad in the correct account and level',async()=>{
 const {metaObjectURL}=await import('../lib/meta-ads/meta-link');
 for(const [level,route]of [['campaign','campaigns'],['adset','adsets'],['ad','ads']]){
  const u=new URL(metaObjectURL({id:'333',accountId:'111',level,campaignId:'222',adsetId:'444'})!);
  assert.equal(u.origin,'https://adsmanager.facebook.com');assert.equal(u.pathname,'/adsmanager/manage/'+route);assert.equal(u.searchParams.get('act'),'111');assert.equal(u.searchParams.get('selected_'+level+'_ids'),'333');
  if(level!=='campaign')assert.equal(u.searchParams.get('selected_campaign_ids'),'222');
  if(level==='ad')assert.equal(u.searchParams.get('selected_adset_ids'),'444');
 }
 assert.equal(metaObjectURL({id:'bad',accountId:'111',level:'ad'}),null);assert.equal(metaObjectURL({id:'333',accountId:'111',level:'unknown'}),null);
});

test('Daily table sorts real numeric measures both directions with missing values last and stable dates',async()=>{
 const {compareDailyRows}=await import('../lib/meta-ads/order');
 const rows=[{day:'2026-10-22',spend:10,results:2,cost:5},{day:'2026-10-21',spend:2,results:2,cost:1},{day:'2026-10-20',spend:0,results:0,cost:null},{day:'2026-10-19',spend:1,results:null,cost:null}];
 const order=(key:'day'|'spend'|'results'|'cost',direction:'asc'|'desc')=>[...rows].sort((a,b)=>compareDailyRows(a,b,{key,direction})).map(r=>r.day.slice(-2));
 assert.deepEqual(order('day','asc'),['19','20','21','22']);assert.deepEqual(order('day','desc'),['22','21','20','19']);
 assert.deepEqual(order('spend','asc'),['20','19','21','22']);assert.deepEqual(order('spend','desc'),['22','21','19','20']);
 assert.deepEqual(order('results','asc'),['20','21','22','19']);assert.deepEqual(order('results','desc'),['21','22','20','19']);
 assert.deepEqual(order('cost','asc'),['21','22','19','20']);assert.deepEqual(order('cost','desc'),['22','21','19','20']);
});

test('Meta filtros múltiples: cuatro criterios, Todos reinicia y activar/desactivar se sustituyen sin perder entrega',async()=>{
 const {deliveryFilters,parseDeliveryFilters,encodeDeliveryFilters,toggleDeliveryFilter}=await import('../lib/meta-ads/state-filter');const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');
 assert.deepEqual(deliveryFilters.map(f=>f.label),['Activados','Desactivados','Con entrega','Efectivos']);assert.deepEqual(parseDeliveryFilters('all'),[]);assert.deepEqual(parseDeliveryFilters('delivery,active,effective'),['active','delivery','effective']);assert.equal(parseDeliveryFilters('active,paused'),null);assert.equal(parseDeliveryFilters('active,unknown'),null);assert.equal(parseDeliveryFilters('all,active'),null);
 const on=toggleDeliveryFilter(['paused','delivery'],'active');assert.deepEqual(on,['delivery','active']);assert.equal(encodeDeliveryFilters(on),'active,delivery');assert.deepEqual(toggleDeliveryFilter(['active','delivery'],'delivery'),['active']);assert.equal(encodeDeliveryFilters([]),'all');
 assert.equal(parseMetaPreferences(JSON.stringify({layoutRevision:2,state:'delivery,active,effective'})).state,'active,delivery,effective');for(const state of ['active,paused','issues','campaign-active'])assert.equal(parseMetaPreferences(JSON.stringify({layoutRevision:2,state})).state,'all');
});

test('Meta gráfico dual: escalas independientes, fechas reales y huecos sin fabricar ceros',async()=>{
 const {dailyChartLayout}=await import('../lib/meta-ads/daily-chart');
 const rows=[{day:'2026-10-03',spend:30,results:10,cost:3},{day:'2026-10-01',spend:10,results:20,cost:.5},{day:'2026-10-04',spend:2,results:0,cost:null}];
 const chart=dailyChartLayout(rows,'cost','results','2026-10-01','2026-10-04');assert.deepEqual(chart.points.map(p=>p.row.day),['2026-10-01','2026-10-03','2026-10-04']);assert(chart.left.max>=3&&chart.right.max>=20);assert.notEqual(chart.left.max,chart.right.max);assert.equal(chart.points[0].barHeight,.5/chart.left.max*200);assert.equal(chart.points[2].barHeight,null);assert.equal(chart.points[2].y,212);assert.equal(chart.points[1].x-chart.points[0].x,chart.width/2);assert.equal(chart.segments.length,2);assert.deepEqual(rows.map(r=>r.day),['2026-10-03','2026-10-01','2026-10-04']);
 const gaps=dailyChartLayout(rows,'spend','cost');assert.equal(gaps.points[2].y,null);assert.equal(gaps.segments.length,2);assert(gaps.points.every(p=>Number.isFinite(p.x)));assert.deepEqual(dailyChartLayout([],'cost','results').points,[]);
});

test('Meta tendencia: mejora, estabilidad y deterioro sostenido con costo ponderado e intervalo reproducible',async()=>{
 const {dailyTrend}=await import('../lib/meta-ads/daily-trend');const {shiftDay}=await import('../lib/meta-ads/analytics');
 const make=(factor:number)=>Array.from({length:14},(_,i)=>({day:shiftDay('2026-10-09',i),spend:20*(i>=7?factor:1),results:20}));
 for(const [factor,status] of [[.5,'improving'],[1,'stable'],[1.5,'deteriorating']] as const){const rows=make(factor).map(r=>factor===1?{...r,spend:r.spend*10,results:r.results*10}:r),copy=structuredClone(rows);const t=dailyTrend(rows,'2026-10-09','2026-10-22','2026-10-23');assert.equal(t.status,status);assert.equal(t.change,factor-1);assert.equal(t.weekdaysMatched,true);assert(t.interval);assert(t.interval[0]<factor-1&&t.interval[1]>factor-1);assert.deepEqual(dailyTrend([...rows].reverse(),'2026-10-09','2026-10-22','2026-10-23'),t);assert.deepEqual(rows,copy);}
 const weighted=make(1);weighted[13]={...weighted[13],spend:100,results:1};const t=dailyTrend(weighted,'2026-10-09','2026-10-22','2026-10-23');assert.equal(t.recent.cost,220/121);assert.notEqual(t.status,'deteriorating'); // single-day spike fails persistence
 const seasonal=make(1.5).map((r,i)=>({...r,spend:r.spend*(i%7+1)}));assert.equal(dailyTrend(seasonal,'2026-10-09','2026-10-22','2026-10-23').status,'deteriorating');
});
test('Meta tendencia: no fabricar certeza con huecos, duplicados, métricas desconocidas, hoy parcial o gasto nulo',async()=>{
 const {dailyTrend}=await import('../lib/meta-ads/daily-trend');const {shiftDay}=await import('../lib/meta-ads/analytics');
 const rows=Array.from({length:14},(_,i)=>({day:shiftDay('2026-10-09',i),spend:20,results:20 as number|null}));
 const run=(r:typeof rows,until='2026-10-22')=>dailyTrend(r,'2026-10-09',until,'2026-10-23');
 assert.equal(run(rows.slice(0,-1)).status,'partial');assert.equal(run([...rows,rows[4]]).status,'partial');assert.equal(run(rows.map(r=>({...r,results:null}))).status,'partial');assert.equal(run(rows.map((r,i)=>({...r,spend:i>=7?0:20,results:i>=7?0:20}))).status,'no-spend');
 const noResults=run(rows.map((r,i)=>({...r,results:i>=7?0:20})));assert.equal(noResults.status,'no-results');assert.equal(noResults.recent.cost,null);assert.equal(noResults.interval,null);
 assert.equal(run(rows.map(r=>({...r,results:1}))).status,'observing');
 const today=run([...rows,{day:'2026-10-23',spend:10000,results:0}],'2026-10-23');assert.equal(today.status,'mixed');assert.equal(today.excludedToday,true);assert.equal(today.recent.spend,140);
 assert.equal(dailyTrend(rows.slice(0,3),'2026-10-09','2026-10-11','2026-10-23').status,'observing');assert.equal(dailyTrend([],'2026-10-23','2026-10-23','2026-10-23').status,'observing');
 const reduced=run(rows.map((r,i)=>({...r,spend:i>=7?10:20,results:i>=7?10:20})));assert.equal(reduced.status,'mixed');assert.equal(reduced.resultChange,-.5);assert.equal(reduced.spendChange,-.5);
});

test('Meta sincronización compacta: actividad reciente no sustituye importación completa y ranking antiguo vuelve a Rendimiento',async()=>{
 const {syncTiming}=await import('../lib/meta-ads/sync-timing');const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');
 const a={id:'1',name:'Uno',enabled:true,intervalMinutes:30,lastCompletedAt:'2026-10-20T15:00:00Z',lastDataAt:'2026-10-23T15:00:00Z',progress:{status:'running',label:'Procesando',lastActivityAt:'2026-10-23T16:00:00Z'}};
 const b={...a,id:'2',lastCompletedAt:'2026-10-19T15:00:00Z',progress:{...a.progress,status:'waiting',lastActivityAt:'2026-10-23T17:00:00Z'}};
 assert.deepEqual(syncTiming([a,b]),{activity:'2026-10-23T17:00:00Z',completed:'2026-10-19T15:00:00Z',pending:0,automatic:2,ongoing:2});
 const missing=syncTiming([a,{...b,lastCompletedAt:null,progress:{...b.progress,lastActivityAt:'invalid'}}]);assert.equal(missing.completed,a.lastCompletedAt);assert.equal(missing.activity,a.progress.lastActivityAt);assert.equal(missing.pending,1);
 assert.equal(syncTiming([{...a,progress:{...a.progress,status:'paused'}}]).automatic,0);assert.equal(syncTiming([{...a,lastCompletedAt:null}]).completed,null);assert.deepEqual(syncTiming([]),{activity:null,completed:null,pending:0,automatic:0,ongoing:0});assert.equal(parseMetaPreferences(JSON.stringify({tab:'ranking'})).tab,'panel');
});

test('Meta país de alias: ISO explícito, nombres y preferencias válidas sin inferir moneda',async()=>{
 const {countryCodes,isCountryCode,countryName}=await import('../lib/meta-ads/countries');const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');assert.equal(countryCodes.length,249);assert.equal(new Set(countryCodes).size,249);assert(isCountryCode('PE'));assert(isCountryCode('CO'));for(const bad of ['pe','Perú','ZZ','PEN','',null])assert.equal(isCountryCode(bad),false);assert.equal(countryName('PE'),'Perú');assert.equal(countryName(null),'Sin país');assert.equal(parseMetaPreferences(JSON.stringify({countryFilter:'CO',layoutRevision:2})).countryFilter,'CO');assert.equal(parseMetaPreferences(JSON.stringify({countryFilter:'ZZ'})).countryFilter,'');assert.equal(parseMetaPreferences(JSON.stringify({countryFilter:'__none'})).countryFilter,'__none');
});

test('Efectividad: pegar columnas de Excel, países escritos, monedas y CSV sin inventar filas',async()=>{
 const {resolveCountry,parseEffectivenessPaste}=await import('../lib/meta-ads/effectiveness-paste');
 assert.equal(resolveCountry(' peru '),'PE');assert.equal(resolveCountry('ARGENTINA'),'AR');assert.equal(resolveCountry('PE · Perú'),'PE');assert.equal(resolveCountry(''), '');assert.equal(resolveCountry('ZZ'),null);
 assert.deepEqual(parseEffectivenessPaste('Monitoreo ambiental\tPerú\tPEN\r\nDermatología\tAR\tUSD\r\n'),[{name:'Monitoreo ambiental',country:'PE',currency:'PEN'},{name:'Dermatología',country:'AR',currency:'USD'}]);
 assert.deepEqual(parseEffectivenessPaste('Uno\nDos\n\n','CO','usd'),[{name:'Uno',country:'CO',currency:'USD'},{name:'Dos',country:'CO',currency:'USD'}]);
 assert.deepEqual(parseEffectivenessPaste('"Diplomado, ambiental";PE;PEN\r\n"Otro ""nombre""";AR;USD','','PEN',true),[{name:'Diplomado, ambiental',country:'PE',currency:'PEN'},{name:'Otro "nombre"',country:'AR',currency:'USD'}]);
 assert.deepEqual(parseEffectivenessPaste('"Diplomado; uno",PE,PEN','','PEN',true),[{name:'Diplomado; uno',country:'PE',currency:'PEN'}]);
 assert.throws(()=>parseEffectivenessPaste('Uno\tZZ'),/país/);assert.throws(()=>parseEffectivenessPaste('Uno\tPE\tPEN\tExtra'),/máximo/);assert.throws(()=>parseEffectivenessPaste('Uno\tPE\t??'),/moneda/);assert.throws(()=>parseEffectivenessPaste(Array(501).fill('Uno').join('\n')),/500/);assert.throws(()=>parseEffectivenessPaste(''),/1 y 500/);assert.throws(()=>parseEffectivenessPaste('"Sin cierre','','PEN',true),/comillas/);
});

test('Efectividad FX: conversión cruzada diaria, originales preservados, sin tasa no inventa importes',async()=>{
 const {convertMoney}=await import('../lib/meta-ads/exchange-rates');const rates={EUR:1,PEN:4,USD:2};assert.equal(convertMoney(100,'PEN','USD',rates),50);assert.equal(convertMoney(100,'PEN','EUR',rates),25);assert.equal(convertMoney(100,'PEN','PEN'),100);assert.equal(convertMoney(100,'PEN','USD'),null);assert.equal(convertMoney(100,'PEN','',rates),null);assert.equal(convertMoney(0,'PEN','USD'),0);assert.equal(convertMoney(100,'PEN','USD',{EUR:1,PEN:5,USD:1}),20);assert.equal(rates.PEN,4);
 const {parseEffectivenessPaste}=await import('../lib/meta-ads/effectiveness-paste');assert.deepEqual(parseEffectivenessPaste('Producto X'),[{name:'Producto X',country:'',currency:''}]);
});
test('Efectividad FX: proveedor público exige fecha exacta y coeficientes válidos con doble HTTP explícito',async()=>{
 const {fetchFxDay}=await import('../lib/meta-ads/exchange-rates');let requested='';const fake=(async(input:any)=>{requested=String(input);return Response.json({date:'2026-10-20',eur:{eur:1,pen:4,usd:2,btc:2,zzz:4}});}) as typeof fetch;
 const result=await fetchFxDay('2026-10-20',fake);assert.equal(result.rates.PEN,4);assert.equal(result.rates.USD,2);assert.equal(result.rates.BTC,undefined);assert(requested.includes('@2026-10-20/'));assert.equal(result.sourceUrl,requested);
 await assert.rejects(()=>fetchFxDay('2026-10-21',fake),/fecha/);await assert.rejects(()=>fetchFxDay('2026-10-20',(async()=>new Response('html',{status:503})) as typeof fetch),/disponible/);await assert.rejects(()=>fetchFxDay('2026-10-20',(async()=>Response.json({date:'2026-10-20',eur:{eur:1,pen:-1,usd:0}})) as typeof fetch),/incompletas/);
});

test('Calendario estilo Meta: rangos inclusivos, lunes y límites de mes/año/bisiesto sin UTC desplazar Lima',async()=>{
 const {presetRange}=await import('../lib/meta-ads/calendar-presets');assert.deepEqual(presetRange('30','2026-10-24'),['2026-09-25','2026-10-24']);assert.deepEqual(presetRange('today-yesterday','2026-01-01'),['2025-12-31','2026-01-01']);assert.deepEqual(presetRange('week','2026-10-24'),['2026-10-19','2026-10-24']);assert.deepEqual(presetRange('last-week','2026-10-24'),['2026-10-12','2026-10-18']);assert.deepEqual(presetRange('last-month','2024-03-01'),['2024-02-01','2024-02-29']);assert.deepEqual(presetRange('last-month','2026-01-24'),['2025-12-01','2025-12-31']);assert.equal(presetRange('custom','2026-10-24'),null);
});

test('Hoja: totales y promedios del rango, días faltantes/ceros explícitos y conversiones pendientes',async()=>{
 const {summarizePeriod,matchesMetricRange}=await import('../lib/meta-ads/period-summary');const cell=(v:number|null,b:number|null,g:number|null,cf:number|null,extra={})=>({sales:v,base:b,spend:g,fixedCost:cf,campaigns:2,...extra});
 const days=['2026-10-20','2026-10-21','2026-10-22'],data={'2026-10-20':cell(3,8,60,4),'2026-10-21':cell(0,8,30,0)};
 const v=summarizePeriod(data,days,'sales');assert.equal(v.total,3);assert.equal(v.average,1.5);assert.equal(v.knownDays,2);assert.equal(v.periodDays,3);assert(v.partial);
 const g=summarizePeriod(data,days,'spend',2);assert.equal(g.total,90);assert.equal(g.average,45);assert(g.partial);assert.equal(summarizePeriod(data,days.slice(0,2),'base',2).total,16);assert.equal(summarizePeriod(data,days.slice(0,2),'fixedCost').average,2);
 const incomplete={...data,'2026-10-22':cell(null,1,null,null,{sourceSpend:[{currency:'PEN',amount:8}],sourceFixedCost:[{currency:'PEN',amount:1}]})};assert.equal(summarizePeriod(incomplete,days,'spend').total,null);assert(summarizePeriod(incomplete,days,'spend').conversionPending);assert.equal(summarizePeriod(incomplete,days,'fixedCost').average,null);assert.equal(summarizePeriod({},days,'sales').total,null);
 assert(matchesMetricRange(3,{min:3,max:3}));assert(!matchesMetricRange(null,{min:0}));assert(matchesMetricRange(null,{}));assert(!matchesMetricRange(3,{max:2}));assert(matchesMetricRange(0,{min:0,max:0}));assert(matchesMetricRange(0.1+0.2,{max:0.3}));
});
test('Hoja: orden numérico ascendente/descendente mantiene desconocidos al final y monedas separadas',async()=>{
 const {compareSheetNumbers}=await import('../lib/meta-ads/period-summary');const values=[null,9,3,0];assert.deepEqual([...values].sort((a,b)=>compareSheetNumbers(a,b,'asc')),[0,3,9,null]);assert.deepEqual([...values].sort((a,b)=>compareSheetNumbers(a,b,'desc')),[9,3,0,null]);assert(compareSheetNumbers(100,1,'asc','EUR','USD')<0);assert(compareSheetNumbers(100,1,'desc','EUR','USD')<0);
});

test('Efectividad: N.A. no es cero ni una conversión pendiente en el resumen histórico', async()=>{
 const {summarizePeriod}=await import('../lib/meta-ads/period-summary');
 const days=['2026-10-20','2026-10-21','2026-10-22'];
 const cells:any={ [days[0]]:{sales:0,base:0,spend:0,fixedCost:0},[days[1]]:{sales:null,base:null,spend:null,fixedCost:null,na:['sales','base','spend','fixedCost'],sourceSpend:[{currency:'PEN',amount:20}]},[days[2]]:{sales:8,base:4,spend:12,fixedCost:2}};
 const sum=summarizePeriod(cells,days,'spend');assert.equal(sum.total,12);assert.equal(sum.average,6);assert.equal(sum.knownDays,2);assert.equal(sum.conversionPending,false);
 assert.equal(summarizePeriod(cells,days,'sales').average,4);
});

test('Efectividad: totales diarios por parámetro, N.A., cero y conversión pendiente',async()=>{
 const {sumEffectivenessDay}=await import('../lib/meta-ads/effectiveness-total-values');
 const day='2026-10-20';
 const rows:any=[{campaigns:1,days:{[day]:{sales:2,budget:30,base:4,spend:10,fixedCost:3,campaigns:1}}},{campaigns:0,days:{[day]:{sales:0,budget:0,base:null,spend:null,fixedCost:null,na:['base','spend','fixedCost']}}}];
 let sums=sumEffectivenessDay(rows,day);assert.equal(sums.sales.value,2);assert.equal(sums.budget.value,30);assert.equal(sums.budget.known,2);assert.equal(sums.spend.value,10);assert.equal(sums.spend.na,1);assert.equal(sums.spend.partial,false);
 rows.push({campaigns:1,days:{[day]:{sales:null,budget:null,base:0,spend:null,fixedCost:null,sourceSpend:[{currency:'PEN',amount:8}],manual:['budget'],fxMissing:true}}});
 sums=sumEffectivenessDay(rows,day);assert.equal(sums.spend.value,null);assert(sums.spend.pending);assert.equal(sums.budget.value,null);assert(sums.budget.pending);assert.equal(sums.sales.value,2);assert(sums.sales.partial);assert.equal(sumEffectivenessDay([],day).sales.value,null);
});

 test('Efectividad: sincronización mantiene la cobertura parcial en sumas e histórico',async()=>{const {sumEffectivenessDay}=await import('../lib/meta-ads/effectiveness-total-values');const {summarizePeriod}=await import('../lib/meta-ads/period-summary');const day='2026-10-20',days:any={[day]:{sales:2,base:4,spend:10,fixedCost:null,budget:null,campaigns:0,manual:['spend'],partialMetrics:['spend']}};assert(sumEffectivenessDay([{days,campaigns:0}],day).spend.partial);assert(summarizePeriod(days,[day],'spend').partial);});

test('Efectividad: colores de vista sin fecha, valor exacto, prioridad y validación',async()=>{
 const {sheetPalette,sheetCellColor,colorRulesSchema}=await import('../lib/meta-ads/sheet-colors');
 assert.equal(sheetPalette.length,10);assert.equal(new Set(sheetPalette.map(c=>c.hex)).size,10);
 const rule:any={id:'r1',value:0,color:'purple',metrics:['sales','budget'],pinned:true};
 assert(colorRulesSchema.safeParse([rule]).success);
 for(const day of ['2020-01-01','2026-10-20','2027-12-31'])assert.equal(sheetCellColor([rule],'sales',day,0),'#a78bfa');
 for(const [metric,value]of [['base',0],['sales',null],['sales','NA'],['sales',1]]as const)assert.equal(sheetCellColor([rule],metric,'2026-10-21',value),undefined);
 const cents:any={...rule,id:'money',value:2.35,metrics:['budget']};assert.equal(sheetCellColor([cents],'budget','2026-10-20',2.346,'PEN'),'#a78bfa');assert.equal(sheetCellColor([cents],'budget','2026-10-20',2.346),undefined);
 const later:any={...rule,id:'r2',color:'green'};assert.equal(sheetCellColor([rule,later],'sales','2026-10-21',0),'#4ade80');assert.equal(sheetCellColor([rule,{...later,value:'NA',color:'gray'}],'sales','2026-10-21','NA'),'#94a3b8');
 for(const patch of [{color:'#fff'},{value:-1},{value:Infinity},{since:'2026-10-20'},{until:'2026-10-22'},{metrics:[]},{metrics:['sales','sales']}])assert(!colorRulesSchema.safeParse([{...rule,...patch}]).success);
 assert(!colorRulesSchema.safeParse([rule,rule]).success);assert(!colorRulesSchema.safeParse(Array.from({length:31},(_,i)=>({...rule,id:String(i)}))).success);
});

test('Asesores H: horas decimales preservan cero, fracciones y vacío',async()=>{
 const {advisorAbsenceSchema,absenceSummary}=await import('../lib/meta-ads/advisor-absence');
 for(const hours of [0,0.1,0.25,0.5,1.333333,1.5,24]){assert(advisorAbsenceSchema.safeParse({advisorId:'a',day:'2026-10-26',revision:0,mode:'MANUAL',hours}).success);assert.equal(absenceSummary({mode:'MANUAL',manualHours:hours,intervals:[],revision:1}).hours,hours);}
 assert.equal(absenceSummary(null).hours,null);assert.equal(absenceSummary({mode:'MANUAL',manualHours:null,intervals:[],revision:1}).hours,null);
 for(const hours of [-1,24.000001,Infinity,0.0000001])assert(!advisorAbsenceSchema.safeParse({advisorId:'a',day:'2026-10-26',revision:0,mode:'MANUAL',hours}).success);
});
test('Asesores H: reloj usa 60 minutos, regreso pendiente y varios intervalos',async()=>{
 const {absenceClockSummary}=await import('../lib/meta-ads/advisor-absence');
 const make=(id:string,start:string,end:string|null,nextDay=false)=>({id,start,end,nextDay});
 assert.equal(absenceClockSummary([make('a','09:00','09:30')]).hours,0.5);assert.equal(absenceClockSummary([make('a','09:00','09:15')]).hours,0.25);
 let v=absenceClockSummary([make('a','09:00',null)]);assert.equal(v.hours,null);assert.equal(v.pending,1);assert.equal(v.minutes,0);
 v=absenceClockSummary([make('a','09:00','09:30'),make('b','10:00',null)]);assert.equal(v.hours,0.5);assert.equal(v.pending,1);
 assert.equal(absenceClockSummary([make('a','09:00','09:30'),make('b','10:00','11:00')]).hours,1.5);
 assert.equal(absenceClockSummary([make('a','23:40','00:10',true)]).hours,0.5);assert.equal(absenceClockSummary([make('a','00:00','00:00',true)]).hours,24);assert.equal(absenceClockSummary([make('a','00:00','00:00')]).hours,0);
 assert.equal(absenceClockSummary([]).hours,null);
});
test('Asesores H: horarios inválidos, duplicados y superpuestos no se suman',async()=>{
 const {absenceClockSummary}=await import('../lib/meta-ads/advisor-absence');const make=(id:string,start:string,end:string|null,nextDay=false)=>({id,start,end,nextDay});
 for(const intervals of [[make('a','25:00','26:00')],[make('a','09:00','08:00')],[make('a','09:00','10:00',true)],[make('a','09:00',null,true)],[make('a','09:00','10:00'),make('b','09:30','11:00')],[make('a','09:00',null),make('b','10:00','11:00')],[make('a','09:00','10:00'),make('a','11:00','12:00')]])assert.throws(()=>absenceClockSummary(intervals));
});
test('Asesores detalle: gráfico conserva horas fraccionarias y asistencia desconocida sin inventar cero',async()=>{
 const {dailyChartLayout}=await import('../lib/meta-ads/daily-chart');const rows=[{day:'2026-10-20',results:3,cost:0.5,spend:1},{day:'2026-10-21',results:0,cost:null,spend:null},{day:'2026-10-22',results:null,cost:1.25,spend:0}];
 let plot=dailyChartLayout(rows,'results','cost');assert.equal(plot.points[0].dot,0.5);assert.equal(plot.points[1].y,null);assert.equal(plot.points[1].bar,0);assert.equal(plot.points[2].bar,null);
 plot=dailyChartLayout(rows,'spend','results');assert.equal(plot.points[1].bar,null);assert.equal(plot.points[2].bar,0);
});

test('Alias: barras de estado por fecha Lima respetan eventos, base previa y futuro desconocido',async()=>{
 const {aliasStateTimeline}=await import('../lib/meta-ads/alias-state-timeline');
 const changes=[{id:'off',active:false,createdAt:'2026-10-20T17:00:00.000Z'},{id:'on',active:true,createdAt:'2026-10-21T11:00:00.000Z'}];
 const prior={id:'prior',active:true,createdAt:'2026-10-19T15:00:00.000Z'};
 let v=aliasStateTimeline('2026-10-20','2026-10-21',prior,changes,'2026-10-22T10:00:00.000Z');assert.equal(v.days[0].day,'2026-10-20');assert.equal(v.days[0].activeHours,12);assert.equal(v.days[0].inactiveHours,12);assert.equal(v.days[1].activeHours,18);assert.equal(v.days[1].inactiveHours,6);
 v=aliasStateTimeline('2026-10-20','2026-10-21',null,changes,'2026-10-21T17:00:00.000Z');assert.equal(v.days[0].knownHours,12);assert.equal(v.days[0].activeHours,0);assert.equal(v.days[1].activeHours,6);assert.equal(v.days[1].knownHours,12);
 v=aliasStateTimeline('2026-10-22','2026-10-23',prior,[],'2026-10-21T17:00:00.000Z');assert(v.days.every(d=>d.knownHours===0));assert.equal(v.events.length,0);
});

test('Asesores: tramos diarios conservan ventas al cambiar A→B→A, sin mezclar días previos',async()=>{
 const {attributeDailySales}=await import('../lib/meta-ads/advisor-attribution');
 const change=(id:string,day:string,previousAdvisorId:string|null,advisorId:string|null)=>({id,advisorId,previousAdvisorId,effectiveAt:new Date(day+'T00:00:00-05:00'),createdAt:new Date(day+'T10:00:00-05:00'),mode:'DAY',cutoffSales:null});
 const history=[change('1','2026-08-07',null,'A'),change('2','2026-08-11','A','B'),change('3','2026-08-15','B','A')];
 assert.deepEqual(attributeDailySales('A',history,'2026-08-06',3,false),[]);
 assert.equal(attributeDailySales('A',history,'2026-08-07',3,false)[0].advisorId,'A');
 assert.equal(attributeDailySales('A',history,'2026-08-10',4,false)[0].advisorId,'A');
 assert.equal(attributeDailySales('A',history,'2026-08-11',5,false)[0].advisorId,'B');
 assert.equal(attributeDailySales('A',history,'2026-08-15',2,false)[0].advisorId,'A');
});
test('Asesores: cortes acumulados por hora, regreso a asesor previo y conservación exacta del total',async()=>{
 const {attributeDailySales}=await import('../lib/meta-ads/advisor-attribution');
 const history=[{id:'1',advisorId:'B',previousAdvisorId:'A',effectiveAt:new Date('2026-08-11T12:00:00-05:00'),createdAt:new Date('2026-08-11T12:01:00-05:00'),mode:'CLOCK',cutoffSales:5},{id:'2',advisorId:'A',previousAdvisorId:'B',effectiveAt:new Date('2026-08-11T16:00:00-05:00'),createdAt:new Date('2026-08-11T16:01:00-05:00'),mode:'CLOCK',cutoffSales:8}];
 const result=attributeDailySales('A',history,'2026-08-11',12,false);
 assert.equal(result.find(x=>x.advisorId==='A')!.sales,9);assert.equal(result.find(x=>x.advisorId==='B')!.sales,3);assert.equal(result.reduce((s,x)=>s+(x.sales??0),0),12);
 assert.equal(attributeDailySales('A',history,'2026-08-10',4,false)[0].advisorId,'A');
 assert.equal(attributeDailySales('A',history,'2026-08-12',2,false)[0].sales,2);
});
test('Asesores: día completo sustituye cortes de esa fecha, conserva baseline y permite cortes posteriores',async()=>{
 const {attributeDailySales,assignmentTimeline}=await import('../lib/meta-ads/advisor-attribution');
 const history=[{id:'1',advisorId:'B',previousAdvisorId:'A',effectiveAt:new Date('2026-08-11T13:00:00-05:00'),createdAt:new Date('2026-08-11T13:01:00-05:00'),mode:'CLOCK',cutoffSales:5},{id:'2',advisorId:'C',previousAdvisorId:'B',effectiveAt:new Date('2026-08-11T00:00:00-05:00'),createdAt:new Date('2026-08-11T14:01:00-05:00'),mode:'DAY',cutoffSales:null}];
 assert.deepEqual(assignmentTimeline(history).map(x=>x.id),['2']);
 assert.equal(attributeDailySales('C',history,'2026-08-10',4,false)[0].advisorId,'A');
 assert.equal(attributeDailySales('C',history,'2026-08-11',12,false)[0].advisorId,'C');
 history.push({id:'3',advisorId:'A',previousAdvisorId:'C',effectiveAt:new Date('2026-08-11T15:00:00-05:00'),createdAt:new Date('2026-08-11T15:01:00-05:00'),mode:'CLOCK',cutoffSales:9});
 const result=attributeDailySales('A',history,'2026-08-11',12,false);assert.equal(result.find(x=>x.advisorId==='C')!.sales,9);assert.equal(result.find(x=>x.advisorId==='A')!.sales,3);
});
test('Asesores: cortes incompatibles no generan ventas negativas ni convierten faltantes en ceros',async()=>{
 const {attributeDailySales,assignmentTimingSchema}=await import('../lib/meta-ads/advisor-attribution');
 const e={id:'1',advisorId:'B',previousAdvisorId:'A',effectiveAt:new Date('2026-08-11T12:00:00-05:00'),createdAt:new Date('2026-08-11T12:01:00-05:00'),mode:'CLOCK',cutoffSales:5};
 assert(attributeDailySales('B',[e],'2026-08-11',3,false).every(x=>x.sales===null&&x.partial));
 const pending=attributeDailySales('B',[e],'2026-08-11',null,false);assert.equal(pending.find(x=>x.advisorId==='A')!.sales,5);assert.equal(pending.find(x=>x.advisorId==='B')!.sales,null);
 assert.equal(attributeDailySales('A',[],'2026-08-11',0,false)[0].sales,0);assert.equal(attributeDailySales('A',[],'2026-08-11',null,false)[0].sales,null);assert.equal(attributeDailySales('A',[],'2026-08-11',null,true)[0].na,true);
 assert(!assignmentTimingSchema.safeParse({day:'2026-02-30',mode:'DAY'}).success);assert(!assignmentTimingSchema.safeParse({day:'2026-08-11',mode:'CLOCK',time:'25:01'}).success);
});

test('Colores fijados: deseleccionar conserva regla/pin y revela solo otras reglas activas',async()=>{
 const {sheetCellColor,colorRulesSchema}=await import('../lib/meta-ads/sheet-colors');
 const old={id:'old',value:0,color:'blue' as const,metrics:['sales' as const],pinned:true};
 const pinned={...old,id:'pin',color:'purple' as const,enabled:true};
 assert.equal(sheetCellColor([old,pinned],'sales','2026-10-20',0),'#a78bfa');
 const disabled={...pinned,enabled:false};assert.equal(disabled.pinned,true);
 assert.equal(sheetCellColor([old,disabled],'sales','2026-10-20',0),'#60a5fa');assert.equal(sheetCellColor([disabled],'sales','2030-01-01',0),undefined);
 assert.deepEqual(colorRulesSchema.parse([old,disabled]),[old,disabled]);assert(!colorRulesSchema.safeParse([{...old,enabled:'false'}]).success);
});
test('Asesor I: cuenta inasistencia confirmada, conserva cero presente y huecos sin registrar/N.A.',async()=>{
 const {advisorAttendanceValue}=await import('../lib/meta-ads/advisor-metrics');
 assert.equal(advisorAttendanceValue('ABSENT','absences'),1);assert.equal(advisorAttendanceValue('PRESENT','absences'),0);
 for(const status of [null,undefined,'NA'])assert.equal(advisorAttendanceValue(status,'absences'),null);
 assert.equal(advisorAttendanceValue('ABSENT','attendance'),0);assert.equal(advisorAttendanceValue('PRESENT','attendance'),1);
});

test('Reparto aprobado: pago tardío del primer asesor cambia 3+2 a4+2 y mantiene nuevos incrementos',async()=>{
 const {advisorSalesPlan}=await import('../lib/meta-ads/advisor-sales-plan');
 const e={id:'change',advisorId:'B',previousAdvisorId:'A',effectiveAt:new Date('2026-10-20T12:00:00-05:00'),createdAt:new Date('2026-10-20T12:00:01-05:00'),mode:'CLOCK',cutoffSales:3};
 let p=advisorSalesPlan('B',[e],'2026-10-20',5,false);assert.equal(p.status,'PENDING');assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,3);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,2);
 const approval={salesTotal:6,allocations:[{advisorId:'A',sales:4},{advisorId:'B',sales:2}],basis:{events:['change'],activeAdvisorId:'B'},revision:1,approvedAt:new Date()};
 p=advisorSalesPlan('B',[e],'2026-10-20',6,false,approval);assert.equal(p.status,'APPROVED');assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,4);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,2);
 p=advisorSalesPlan('B',[e],'2026-10-20',7,false,approval);assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,4);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,3);
 const back={...e,id:'return',advisorId:'A',previousAdvisorId:'B',effectiveAt:new Date('2026-10-20T16:00:00-05:00'),createdAt:new Date('2026-10-20T16:00:01-05:00'),cutoffSales:7};
 p=advisorSalesPlan('A',[e,back],'2026-10-20',9,false,approval);assert.equal(p.status,'PENDING');assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,6);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,3);assert.equal(p.portions.reduce((s,x)=>s+(x.sales??0),0),9);
});
test('Reparto: corrección bajo un corte anterior sigue aprobada sin negativos; día completo conserva el reparto explícito',async()=>{
 const {advisorSalesPlan,salesAllocationsSchema}=await import('../lib/meta-ads/advisor-sales-plan');
 const e={id:'change',advisorId:'B',previousAdvisorId:'A',effectiveAt:new Date('2026-10-20T12:00:00-05:00'),createdAt:new Date('2026-10-20T12:00:01-05:00'),mode:'CLOCK',cutoffSales:3};
 const approval={salesTotal:2,allocations:[{advisorId:'A',sales:1},{advisorId:'B',sales:1}],basis:{events:['change'],activeAdvisorId:'B'},revision:1,approvedAt:new Date()};
 let p=advisorSalesPlan('B',[e],'2026-10-20',3,false,approval);assert.equal(p.status,'APPROVED');assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,1);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,2);
 const day={...e,id:'day',advisorId:'C',previousAdvisorId:'B',mode:'DAY',cutoffSales:null,effectiveAt:new Date('2026-10-20T00:00:00-05:00'),createdAt:new Date('2026-10-20T17:00:00-05:00')};
 p=advisorSalesPlan('C',[e,day],'2026-10-20',2,false,approval);assert.equal(p.status,'APPROVED');assert.equal(p.reconciled,true);assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,1);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,1);assert(!p.portions.some(x=>x.advisorId==='C'));
 p=advisorSalesPlan('C',[e,day],'2026-10-20',5,false,approval);assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,1);assert.equal(p.portions.find(x=>x.advisorId==='B')!.sales,1);assert.equal(p.portions.find(x=>x.advisorId==='C')!.sales,3);
 p=advisorSalesPlan('C',[e,day],'2026-10-20',1,false,approval);assert.equal(p.status,'PENDING');assert(p.portions.every(x=>x.sales===null&&x.partial));
 assert(!salesAllocationsSchema.safeParse([{advisorId:'A',sales:1},{advisorId:'A',sales:2}]).success);assert(!salesAllocationsSchema.safeParse([{advisorId:'A',sales:-1}]).success);
});
test('Reparto: no inventa cambios al asignar inicialmente sin ventas y conserva ventas sin asesor',async()=>{
 const {advisorSalesPlan}=await import('../lib/meta-ads/advisor-sales-plan');
 const e={id:'first',advisorId:'A',previousAdvisorId:null,effectiveAt:new Date('2026-10-20T12:00:00-05:00'),createdAt:new Date('2026-10-20T12:00:01-05:00'),mode:'CLOCK',cutoffSales:0};
 assert.equal(advisorSalesPlan('A',[e],'2026-10-20',3,false).hasChange,false);
 const p=advisorSalesPlan('A',[{...e,cutoffSales:4}],'2026-10-20',6,false);assert.equal(p.hasChange,true);assert.equal(p.portions.find(x=>x.advisorId===null)!.sales,4);assert.equal(p.portions.find(x=>x.advisorId==='A')!.sales,2);
});

test('Ventas: cambios sucesivos en el mismo minuto y a medianoche conservan el registro acumulado',async()=>{
 const {attributeDailySales}=await import('../lib/meta-ads/advisor-attribution');
 const base={effectiveAt:new Date('2026-10-20T00:00:00-05:00'),mode:'CLOCK'};
 const changes=[{...base,id:'first',advisorId:'B',previousAdvisorId:'A',cutoffSales:3,createdAt:new Date('2026-10-20T00:00:10-05:00')},{...base,id:'second',advisorId:'A',previousAdvisorId:'B',cutoffSales:5,createdAt:new Date('2026-10-20T00:00:20-05:00')}];
 const p=attributeDailySales('A',changes,'2026-10-20',7,false);assert.equal(p.find(x=>x.advisorId==='A')!.sales,5);assert.equal(p.find(x=>x.advisorId==='B')!.sales,2);assert.equal(p.reduce((s,x)=>s+(x.sales??0),0),7);
});

import {parseCategoryText,splitCategoryNames,categoryRows,categoryKey} from '../lib/meta-ads/category-paste';
import {parseCategoryFile} from '../lib/meta-ads/category-file';
import JSZip from 'jszip';
test('Categorías: TSV de Excel, encabezados y comas dentro de cada celda',()=>{
 const rows=parseCategoryText('Categoría principal\tCategorías secundarias\r\nAmbiental, Civil\tAgua, Suelos\r\nConstrucción\tObras\r\n');assert.equal(rows.length,2);assert.deepEqual(splitCategoryNames(rows[0].primary),['Ambiental','Civil']);assert.deepEqual(splitCategoryNames(rows[0].secondary),['Agua','Suelos']);assert.deepEqual(splitCategoryNames(' Ambiental, ambiental, Civil ; civil '),['Ambiental','ambiental','Civil','civil']);assert.equal(categoryKey('  CIVIL  y  OBRAS '),'civil y obras');
 assert.deepEqual(parseCategoryText('ambiental, civil'),[{primary:'ambiental, civil',secondary:''}]);
});
test('Categorías: CSV citado y separador regional preservan las listas de una celda',()=>{
 assert.deepEqual(parseCategoryText('"Categoría principal","Categorías secundarias"\n"Ambiental, Civil","Agua, Suelos"',true),[{primary:'Ambiental, Civil',secondary:'Agua, Suelos'}]);
 assert.deepEqual(parseCategoryText('Categoría principal;Categorías secundarias\nAmbiental, Civil;Agua, Suelos',true),[{primary:'Ambiental, Civil',secondary:'Agua, Suelos'}]);assert.deepEqual(parseCategoryText('Ambiental, Civil;Agua, Suelos',true),[{primary:'Ambiental, Civil',secondary:'Agua, Suelos'}]);
 assert.throws(()=>parseCategoryText('"Sin cerrar\tAgua'),/comillas/);assert.throws(()=>categoryRows([['A','B','C']]),/solo/);assert.throws(()=>splitCategoryNames('x'.repeat(81)),/80/);assert.throws(()=>splitCategoryNames(Array.from({length:21},(_,i)=>'C'+i).join(',')),/20/);assert.throws(()=>categoryRows(Array.from({length:502},()=>['A','B'])),/500/);
});
async function categoryXlsx(sheet:string,shared='<sst><si><t>Categoría principal</t></si><si><t>Categorías secundarias</t></si><si><t>Ambiental, Civil</t></si></sst>'){
 const zip=new JSZip();zip.file('xl/workbook.xml','<workbook xmlns:r="urn:test"><sheets><sheet name="Categorías" sheetId="1" r:id="rId1"/></sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');zip.file('xl/sharedStrings.xml',shared);zip.file('xl/worksheets/sheet1.xml',sheet);return (await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64');
}
test('Categorías: XLSX real con sharedStrings e inlineStr, sin ejecutar fórmulas',async()=>{
 const encoded=await categoryXlsx('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>Agua, Suelos</t></is></c></row></sheetData></worksheet>');const result=await parseCategoryFile('categorias.xlsx',encoded);assert.equal(result.sheetName,'Categorías');assert.deepEqual(result.rows,[{primary:'Ambiental, Civil',secondary:'Agua, Suelos'}]);
 await assert.rejects(()=>parseCategoryFile('categorias.xlsx','%%%'),/Archivo inválido/);
 const formula=await categoryXlsx('<worksheet><row><c r="A1"><f>1+1</f><v>2</v></c></row></worksheet>');await assert.rejects(()=>parseCategoryFile('formula.xlsx',formula),/fórmulas/);
 const outside=await categoryXlsx('<worksheet><row><c r="C1"><v>Otra</v></c></row></worksheet>');await assert.rejects(()=>parseCategoryFile('tres.xlsx',outside),/columnas A y B/);
 const entity=await categoryXlsx('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><worksheet/>');await assert.rejects(()=>parseCategoryFile('invalido.xlsx',entity),/XML/);
});
test('Categorías: límites de archivo y codificación Unicode de Excel',async()=>{
 const text='Categoría principal\tCategorías secundarias\nAmbiental\tGestión';const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]);assert.deepEqual((await parseCategoryFile('categorias.tsv',utf16.toString('base64'))).rows,[{primary:'Ambiental',secondary:'Gestión'}]);
 await assert.rejects(()=>parseCategoryFile('categorias.exe',Buffer.from('A\tB').toString('base64')),/xlsx/);await assert.rejects(()=>parseCategoryFile('grande.csv',Buffer.alloc(2000001,65).toString('base64')),/2 MB/);
 const huge=await categoryXlsx('<worksheet>'+ ' '.repeat(8000001)+'</worksheet>');await assert.rejects(()=>parseCategoryFile('expandido.xlsx',huge),/8 MB/);
});

test('Inventario: cuatro columnas, etiquetas con comas, CSV y validación por fila',async()=>{
 const {parseInventoryText,inventoryRows}=await import('../lib/meta-ads/inventory-paste');
 const rows=parseInventoryText('Categoría principal\tCategorías secundarias\tInventario\tHojas\nAmbiental, Civil\tAgua, Suelos\tMonitoreo ambiental\tDiplomados, Colombia');assert.equal(rows.length,1);assert.equal(rows[0].name,'Monitoreo ambiental');assert.deepEqual(splitCategoryNames(rows[0].primary),['Ambiental','Civil']);assert.deepEqual(splitCategoryNames(rows[0].sheets),['Diplomados','Colombia']);
 assert.deepEqual(parseInventoryText('Monitoreo ambiental;Ambiental, Civil;Agua, Suelos;Diplomados, Colombia',true),rows);
 assert.equal(inventoryRows([['','A','B','']])[0].name,'');assert.equal(inventoryRows([['Producto','','','']])[0].sheets,'');assert.equal(inventoryRows([['Producto','A','B','Diplomados','Contenido del temario']])[0].syllabi?.[0].content,'Contenido del temario');
});
test('Inventario: XLSX mantiene cuatro columnas, valida nombre para temarios y rechaza fórmulas',async()=>{
 const {parseInventoryFile}=await import('../lib/meta-ads/category-file');
 const content=await categoryXlsx('<worksheet><row><c r="A1" t="inlineStr"><is><t>Ambiental, Civil</t></is></c><c r="B1" t="inlineStr"><is><t>Agua</t></is></c><c r="C1" t="inlineStr"><is><t>Monitoreo</t></is></c><c r="D1" t="inlineStr"><is><t>Diplomados, Colombia</t></is></c></row></worksheet>');assert.equal((await parseInventoryFile('inventario.xlsx',content)).rows[0].sheets,'Diplomados, Colombia');
 const extra=await categoryXlsx('<worksheet><row><c r="E1"><v>Extra</v></c></row></worksheet>');await assert.rejects(()=>parseInventoryFile('extra.xlsx',extra),/nombre del inventario/);
 const formula=await categoryXlsx('<worksheet><row><c r="C1"><f>1+1</f><v>2</v></c></row></worksheet>');await assert.rejects(()=>parseInventoryFile('formula.xlsx',formula),/fórmulas/);
});

test('Inventario: columnas opcionales y pegado desde la columna enfocada, sin inventar categorías/hojas',async()=>{
 const {parseInventoryGrid,parseInventoryText,inventoryRows}=await import('../lib/meta-ads/inventory-paste');
 assert.deepEqual(parseInventoryGrid('Monitoreo ambiental\nTratamiento de aguas',false,0),{rows:[{primary:'',secondary:'',name:'Monitoreo ambiental',sheets:''},{primary:'',secondary:'',name:'Tratamiento de aguas',sheets:''}],columns:['name']});
 assert.deepEqual(parseInventoryText('Categoría principal\nAmbiental, Civil'),[{primary:'Ambiental, Civil',secondary:'',name:'',sheets:''}]);
 assert.deepEqual(parseInventoryText('Categorías secundarias\nAgua, Suelos'),[{primary:'',secondary:'Agua, Suelos',name:'',sheets:''}]);
 assert.deepEqual(parseInventoryText('Inventario\nMonitoreo'),[{primary:'',secondary:'',name:'Monitoreo',sheets:''}]);
 assert.deepEqual(parseInventoryText('Agua\nSuelos',false,2).map(r=>r.secondary),['Agua','Suelos']);
 assert.deepEqual(inventoryRows([['Solo inventario','','','']]),[{primary:'',secondary:'',name:'Solo inventario',sheets:''}]);
 assert.throws(()=>parseInventoryGrid('A\tB',false,3),/nombre del inventario/);assert.throws(()=>inventoryRows([['','','','']]),/Incluye/);
});
test('Inventario: archivo de una columna con encabezado de categoría o inventario conserva su tipo',async()=>{
 const {parseInventoryFile}=await import('../lib/meta-ads/category-file');
 for(const [title,key]of [['Categoría principal','primary'],['Categorías secundarias','secondary'],['Inventario','name']] as const){const encoded=await categoryXlsx(`<worksheet><row><c r="A1" t="inlineStr"><is><t>${title}</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>Solo nombre</t></is></c></row></worksheet>`);const r=(await parseInventoryFile('una.xlsx',encoded)).rows[0];assert.equal(r[key],'Solo nombre');assert.equal(r.sheets,'');}
});

test('Nombres similares: pide elección por tipo, reutiliza el elegido o conserva variantes independientes',async()=>{
 const {inventoryNameConflicts,resolveInventoryName}=await import('../lib/meta-ads/inventory-duplicates');
 const existing=[{kind:'PRIMARY' as const,name:'Ambiental'},{kind:'INVENTORY' as const,name:'Monitoreo Ambiental'}];
 const next=[{kind:'PRIMARY' as const,name:'AMBIENTAL'},{kind:'SECONDARY' as const,name:'AMBIENTAL'},{kind:'INVENTORY' as const,name:'MONITOREO AMBIENTAL'}];
 const conflicts=inventoryNameConflicts(next,existing);assert.equal(conflicts.length,2);assert.deepEqual(conflicts[0].similar,['Ambiental']);
 assert.throws(()=>resolveInventoryName('PRIMARY','AMBIENTAL',['Ambiental']),/Ambiental/);
 assert.equal(resolveInventoryName('PRIMARY','AMBIENTAL',['Ambiental'],[{kind:'PRIMARY',name:'AMBIENTAL',useName:'Ambiental'}]),'Ambiental');
 assert.equal(resolveInventoryName('PRIMARY','AMBIENTAL',['Ambiental'],[{kind:'PRIMARY',name:'AMBIENTAL',useName:'AMBIENTAL'}]),'AMBIENTAL');
 assert.throws(()=>resolveInventoryName('PRIMARY','AMBIENTAL',['Ambiental'],[{kind:'PRIMARY',name:'AMBIENTAL',useName:'Ajena'}]),/similar/);
 assert.equal(inventoryNameConflicts([{kind:'PRIMARY',name:'Ambiental'}],existing).length,0);
 assert.equal(inventoryNameConflicts([{kind:'PRIMARY',name:'Civil'},{kind:'PRIMARY',name:'CIVIL'}],[]).length,1);
});

test('Inventario: orden inventario/principal/secundaria/hojas en pegado y filas, con encabezados anteriores compatibles',async()=>{
 const {parseInventoryText,parseInventoryGrid,inventoryImportFields}=await import('../lib/meta-ads/inventory-paste');
 assert.deepEqual(inventoryImportFields,['name','primary','secondary','sheets']);
 const expected=[{name:'Monitoreo',primary:'Ambiental',secondary:'Agua',sheets:'Diplomados'}];
 assert.deepEqual(parseInventoryText('Monitoreo\tAmbiental\tAgua\tDiplomados'),expected);
 assert.deepEqual(parseInventoryText('Inventario\tCategoría principal\tCategorías secundarias\tHojas\nMonitoreo\tAmbiental\tAgua\tDiplomados'),expected);
 assert.deepEqual(parseInventoryText('Categoría principal\tCategorías secundarias\tInventario\tHojas\nAmbiental\tAgua\tMonitoreo\tDiplomados'),expected);
 assert.deepEqual(parseInventoryGrid('Solo nombre\nOtro',false,0).rows.map(r=>r.name),['Solo nombre','Otro']);
 assert.deepEqual(parseInventoryGrid('Civil\nAmbiental',false,1).rows.map(r=>r.primary),['Civil','Ambiental']);
 assert.deepEqual(parseInventoryGrid('Agua\nSuelos',false,2).rows.map(r=>r.secondary),['Agua','Suelos']);
});

test('Meta: vistas principales/secundarias conservan más de100 cuentas sin confundir fijadas ni permisos',async()=>{
 const {parseMetaPreferences}=await import('../lib/meta-ads/preferences');
 const ids=Array.from({length:306},(_,i)=>String(700000+i));
 const p=parseMetaPreferences(JSON.stringify({layoutRevision:2,primaryAccountIds:[...ids,ids[0],'act_123','invalid',null],accountGroup:'primary',pinnedAccountIds:['123'],accountIds:['456'],token:'not-a-real-secret'}));
 assert.deepEqual(p.primaryAccountIds,ids);assert.equal(p.accountGroup,'primary');assert.deepEqual(p.pinnedAccountIds,['123']);assert.deepEqual(p.accountIds,['456']);assert(!JSON.stringify(p).includes('not-a-real-secret'));
 const restored=parseMetaPreferences(JSON.stringify({...p,layoutRevision:2}));assert.deepEqual(restored.primaryAccountIds,ids);assert.equal(restored.accountGroup,'primary');
 assert.equal(parseMetaPreferences(JSON.stringify({primaryAccountIds:ids,accountGroup:'admin'})).accountGroup,'secondary');assert.deepEqual(parseMetaPreferences(JSON.stringify({pinnedAccountIds:['123']})).primaryAccountIds,[]);
 assert.equal(parseMetaPreferences(JSON.stringify({primaryAccountIds:Array.from({length:1100},(_,i)=>String(i+1))})).primaryAccountIds.length,1000);
 assert.deepEqual(parseMetaPreferences(' '.repeat(200001)).primaryAccountIds,[]);
});

test('Efectividad: franjas temporales usan solo categorías asignadas y no duplican filas ni alteran el catálogo',async()=>{
 const {financialRowCategories,groupFinancialRows,financialRowKey}=await import('../lib/meta-ads/financial-categories');
 const a={id:'a',name:'A',categoryAssignments:[{category:{id:'p',name:'Ambiental',kind:'PRIMARY' as const}},{category:{id:'s',name:'Civil',kind:'SECONDARY' as const}}]},b={id:'b',name:'B',categoryAssignments:[{category:{id:'p2',name:'Ambiental',kind:'PRIMARY' as const}}]};
 const rows=[{aliasId:'a',country:'PE',sales:4},{aliasId:'a',country:'CO',sales:2},{aliasId:'b',country:'PE',sales:3}],original=JSON.stringify([a,b]),temporary={[financialRowKey(rows[0])]:['s','p','foreign-category']};
 const category=financialRowCategories(rows[0],a,temporary);assert.deepEqual(category.names,['Ambiental','Civil']);assert(category.temporary);assert.equal(financialRowCategories(rows[1],a,temporary).temporary,false);
 const bands=groupFinancialRows(rows,[a,b],temporary);assert.equal(bands.flatMap(b=>b.rows).length,3);assert.equal(bands.flatMap(b=>b.rows).reduce((n,r)=>n+r.sales,0),9);assert.equal(new Set(bands.flatMap(b=>b.rows.map(financialRowKey))).size,3);assert.equal(JSON.stringify([a,b]),original);assert.deepEqual(financialRowCategories(rows[0],a,{[financialRowKey(rows[0])]:['foreign-category']}).names,['Ambiental']);
});
test('Efectividad: preferencias temporales acotadas no aceptan claves ni categorías inválidas',async()=>{
 const {parseTemporaryCategories}=await import('../lib/meta-ads/financial-categories');assert.deepEqual(parseTemporaryCategories('invalid'),{});const key=JSON.stringify(['alias-1','PE']);const parsed=parseTemporaryCategories(JSON.stringify({[key]:['cat-1','cat-1','bad/id',null],__proto__:{polluted:true},invalid:['cat']}));assert.deepEqual(parsed,{[key]:['cat-1']});assert.equal(({} as any).polluted,undefined);
});

test('Totales: bloques horizontales conservan fuente/país/moneda separados y plantillas vacías sin duplicar pares',async()=>{
 const {totalSourceBlocks}=await import('../lib/meta-ads/total-source-blocks');const sources=[{tableId:'a',groups:[{country:'PE',currency:'PEN'},{country:'CO',currency:'COP'},{country:'PE',currency:'PEN'}]},{tableId:'b',groups:[{country:'PE',currency:'USD'}]}];
 const blocks=totalSourceBlocks(sources);assert.equal(blocks.length,3);assert.equal(new Set(blocks.map(b=>b.key)).size,3);assert(blocks.every(b=>/^[a-zA-Z0-9:_-]{1,240}$/.test(b.key+":totalSpend")));assert.deepEqual(blocks.map(b=>[b.table.tableId,b.country,b.currency]),[['a','CO','COP'],['a','PE','PEN'],['b','PE','USD']]);assert.equal(totalSourceBlocks([{tableId:'empty',groups:[]}])[0].country,'');assert.equal(totalSourceBlocks(sources,'PE','PEN').length,2);assert.equal(sources[0].groups.length,3);
});

test('Efectividad: desactivados al final y categorizados sin mezclar estados ni duplicar filas', async()=>{
 const {groupFinancialRows,financialRowKey}=await import('../lib/meta-ads/financial-categories');
 const entries=[{id:'a',name:'A',categoryAssignments:[{category:{id:'p',name:'Ambiental',kind:'PRIMARY' as const}},{category:{id:'s',name:'Civil',kind:'SECONDARY' as const}}]},{id:'b',name:'B',categoryAssignments:[{category:{id:'z',name:'Salud',kind:'PRIMARY' as const}}]}];
 const rows=[{aliasId:'a',country:'CO',active:false,sales:2},{aliasId:'b',country:'PE',active:true,sales:3},{aliasId:'a',country:'PE',active:true,sales:4},{aliasId:'none',country:'PE',active:true,sales:1},{aliasId:'none',country:'CO',active:false,sales:5}];
 const bands=groupFinancialRows(rows,entries,{[financialRowKey(rows[0])]:['s']});
 assert.deepEqual(bands.map(b=>[b.active,b.names]),[[true,['Ambiental']],[true,['Salud']],[true,[]],[false,['Ambiental']],[false,[]]]);
 const ordered=bands.flatMap(b=>b.rows);assert.deepEqual(ordered.map(r=>r.active),[true,true,true,false,false]);assert.equal(new Set(ordered.map(financialRowKey)).size,5);assert.equal(ordered.reduce((n,r)=>n+r.sales,0),15);
 const reactivated=groupFinancialRows(rows.map(r=>({...r,active:true})),entries,{});assert(reactivated.every(b=>b.active));assert.equal(reactivated.flatMap(b=>b.rows).length,5);
});

test('Efectividad: inactivos ignoran temporal y franjas homónimas distinguen principal/temporal sin tocar preferencias',async()=>{
 const {financialRowCategories,groupFinancialRows,financialRowKey}=await import('../lib/meta-ads/financial-categories');
 const a={id:'a',name:'A',categoryAssignments:[{category:{id:'p',name:'Ambiental',kind:'PRIMARY' as const}},{category:{id:'s',name:'Civil',kind:'SECONDARY' as const}}]},b={id:'b',name:'B',categoryAssignments:[{category:{id:'p2',name:'Civil',kind:'PRIMARY' as const}}]};
 const row={aliasId:'a',country:'PE',active:false},prefs={[financialRowKey(row)]:['s']},before=JSON.stringify(prefs);
 const inactive=financialRowCategories(row,a,prefs);assert.deepEqual(inactive.names,['Ambiental']);assert.equal(inactive.temporary,false);assert.deepEqual(inactive.ids,['p']);assert.equal(JSON.stringify(prefs),before);
 const active={...row,active:true};assert.deepEqual(financialRowCategories(active,a,prefs).names,['Civil']);assert.equal(financialRowCategories(active,a,prefs).temporary,true);
 const bands=groupFinancialRows([active,{aliasId:'b',country:'PE',active:true},row],[a,b],prefs);assert.deepEqual(bands.map(b=>[b.active,b.temporary,b.names]),[[true,false,['Civil']],[true,true,['Civil']],[false,false,['Ambiental']]]);assert.equal(bands.flatMap(b=>b.rows).length,3);
});

test('Vincular columnas: períodos, métricas y rechazo de ciclos/límites de cadena',async()=>{
 const {checkColumnLinkPath,linkCoversDay,linkMetrics}=await import('../lib/meta-ads/column-link-policy');assert.deepEqual(linkMetrics({columns:['sales','invalid','spend','sales']}),['sales','spend']);assert(linkCoversDay({since:null,until:null},'2030-01-01'));assert(linkCoversDay({since:'2026-10-20',until:'2026-10-27'},'2026-10-20'));assert(!linkCoversDay({since:'2026-10-20',until:'2026-10-27'},'2026-10-28'));assert.throws(()=>checkColumnLinkPath('a','a',[]));assert.throws(()=>checkColumnLinkPath('a','b',[{tableId:'b',sourceTableId:'a'}]));checkColumnLinkPath('a','b',[{tableId:'b',sourceTableId:'c'}]);assert.throws(()=>checkColumnLinkPath('root','n0',Array.from({length:9},(_,i)=>({tableId:'n'+i,sourceTableId:'n'+(i+1)}))));
});
test('Vincular columnas: vacío explícito no es conversión pendiente; una tasa pendiente impide subtotal parcial',async()=>{
 const {sumEffectivenessDay}=await import('../lib/meta-ads/effectiveness-total-values');const {summarizePeriod}=await import('../lib/meta-ads/period-summary');const day='2026-10-20';const blank={sales:null,base:null,spend:null,fixedCost:null,budget:null,manual:['spend','budget'] as const,fxPending:[],sourceSpend:[{currency:'PEN',amount:99}]};const known={...blank,spend:7,budget:10};let sum=sumEffectivenessDay([{campaigns:0,days:{[day]:blank}},{campaigns:0,days:{[day]:known}}],day);assert.equal(sum.spend.value,7);assert(!sum.spend.pending);assert.equal(sum.budget.value,10);assert(!summarizePeriod({[day]:blank},[day],'spend').conversionPending);const pending={...blank,fxPending:['budget'] as const};sum=sumEffectivenessDay([{campaigns:0,days:{[day]:pending}},{campaigns:0,days:{[day]:known}}],day);assert.equal(sum.budget.value,null);assert(sum.budget.pending);assert(summarizePeriod({[day]:pending},[day],'budget').conversionPending);
});

test('Períodos activos: fechas automáticas reales, cierres y medianoche Lima sin rellenar el pasado',async()=>{
 const {activePeriods}=await import('../lib/meta-ads/active-periods');const e=(id:string,active:boolean,createdAt:string)=>({id,active,createdAt});const history=[e('a',false,'2026-10-01T10:00:00.000Z'),e('b',true,'2026-10-12T05:00:00.000Z'),e('c',true,'2026-10-13T10:00:00.000Z'),e('d',false,'2026-10-16T05:00:00.000Z'),e('e',true,'2026-10-17T10:00:00.000Z'),e('f',false,'2026-10-24T18:00:00.000Z'),e('g',true,'2026-10-27T05:00:00.000Z'),e('h',false,'2027-01-01T00:00:00.000Z')];const before=JSON.stringify(history);const p=activePeriods(history,'2026-10-27T12:00:00.000Z');assert.equal(p.length,3);assert.deepEqual(p.map(p=>[p.since,p.through,p.until]),[['2026-10-27','2026-10-27',null],['2026-10-17','2026-10-24','2026-10-24T18:00:00.000Z'],['2026-10-12','2026-10-15','2026-10-16T05:00:00.000Z']]);assert.equal(p[2].from,'2026-10-12T05:00:00.000Z');assert.equal(JSON.stringify(history),before);assert.deepEqual(activePeriods([],new Date().toISOString()),[]);assert.deepEqual(activePeriods([history[0]],'2026-10-27T12:00:00.000Z'),[]);const instant=activePeriods([e('a',true,'2026-10-20T05:00:00.000Z'),e('b',false,'2026-10-20T05:00:00.000Z')],'2026-10-27T12:00:00.000Z');assert.equal(instant[0].since,instant[0].through);
});
test('Ir al período activo: páginas contiguas de31 días cubren todo el intervalo y permiten volver',async()=>{
 const {activePeriodWindow}=await import('../lib/meta-ads/active-periods');const first=activePeriodWindow('2026-08-01','2026-10-27');assert.deepEqual(first,{since:'2026-08-01',until:'2026-08-31',previous:null,next:'2026-09-01'});const second=activePeriodWindow('2026-08-01','2026-10-27',first.next!);assert.deepEqual(second,{since:'2026-09-01',until:'2026-10-01',previous:'2026-08-01',next:'2026-10-02'});const last=activePeriodWindow('2026-08-01','2026-10-27',second.next!);assert.equal(last.until,'2026-10-27');assert.equal(last.next,null);assert.equal(last.previous,second.since);assert.deepEqual(activePeriodWindow('2026-10-27','2026-10-27'),{since:'2026-10-27',until:'2026-10-27',previous:null,next:null});
});

test('Asesores: períodos observados recientes, sin inventar inicio heredado y con cierre exclusivo a medianoche',async()=>{
 const {advisorAssignmentPeriods}=await import('../lib/meta-ads/advisor-periods');
 const e=(id:string,advisorId:string|null,previousAdvisorId:string|null,at:string,mode='CLOCK')=>({id,advisorId,previousAdvisorId,effectiveAt:new Date(at),createdAt:new Date(at),mode,cutoffSales:0});
 const changes=[e('a','kevin',null,'2026-10-12T05:00:00Z','DAY'),e('b','donasis','kevin','2026-10-16T15:00:00Z'),e('c','kevin','donasis','2026-10-17T05:00:00Z','DAY'),e('d',null,'kevin','2026-10-25T05:00:00Z'),e('future','kevin',null,'2027-01-01T05:00:00Z')];
 const p=advisorAssignmentPeriods(null,changes,new Date('2026-10-27T12:00:00Z'));assert.deepEqual(p.map(x=>[x.id,x.advisorId,x.since,x.through]),[['c','kevin','2026-10-17','2026-10-24'],['b','donasis','2026-10-16','2026-10-16'],['a','kevin','2026-10-12','2026-10-16']]);assert.equal(advisorAssignmentPeriods('legacy',[])[0].from,null);assert.equal(advisorAssignmentPeriods('legacy',[])[0].since,null);assert.deepEqual(advisorAssignmentPeriods(null,[]),[]);
});
test('Asesores: ventas de cada tramo por cortes reales incluso cambios simultáneos, sin dividir por horas',async()=>{
 const {advisorAssignmentPeriods,assignmentPeriodSales}=await import('../lib/meta-ads/advisor-periods');
 const day='2026-10-20';const changes=[{id:'a',advisorId:'a',previousAdvisorId:null,effectiveAt:new Date(day+'T05:00:00Z'),createdAt:new Date(day+'T05:00:00Z'),mode:'DAY',cutoffSales:0},{id:'b',advisorId:'b',previousAdvisorId:'a',effectiveAt:new Date(day+'T15:00:00Z'),createdAt:new Date(day+'T15:00:00Z'),mode:'CLOCK',cutoffSales:4},{id:'c',advisorId:'a',previousAdvisorId:'b',effectiveAt:new Date(day+'T15:00:00Z'),createdAt:new Date(day+'T15:00:01Z'),mode:'CLOCK',cutoffSales:6}];
 const p=advisorAssignmentPeriods('a',changes,new Date(day+'T20:00:00Z'));
 assert.deepEqual(p.map(x=>assignmentPeriodSales('a',changes,x,day,9,false).sales),[3,2,4]);assert.equal(assignmentPeriodSales('a',changes,p[0],day,2,false).partial,true);
});
test('Base de contexto: se agrega por inventario y país sin atribuirla a cada asesor ni inventar faltantes',async()=>{
 const {inventoryBaseContext}=await import('../lib/meta-ads/inventory-base-context');const day='2026-10-20';
 const rows=[{campaigns:2,days:{[day]:{base:12,campaigns:1}}},{campaigns:1,days:{[day]:{base:8,campaigns:1}}}] as any;
 const result=inventoryBaseContext(rows,[day,'2026-10-21']);assert.equal(result.scope,'INVENTORY_COUNTRY');assert.equal(result.days[day].value,20);assert.equal(result.days[day].partial,true);assert.equal(result.days['2026-10-21'].value,null);assert.equal(result.days['2026-10-21'].known,0);assert(!JSON.stringify(result).includes('advisorId'));
});

test('Base aproximada: cuenta el día entero por asignación, deduplica relevos y no atribuye ventas ni inventa base faltante', async () => {
  const { advisorBaseEstimate } = await import('../lib/meta-ads/advisor-base-estimate');
  const day = '2026-10-20';
  const e = (id: string, advisorId: string | null, previousAdvisorId: string | null, at: string, mode = 'CLOCK') => ({ id, advisorId, previousAdvisorId, effectiveAt: new Date(at), createdAt: new Date(at), mode, cutoffSales: null });
  const rows = [
    { advisorId: 'a', campaigns: 1, days: { [day]: { base: 12, campaigns: 1 } }, changes: [e('1', 'a', null, day + 'T20:00:00Z'), e('2', 'b', 'a', day + 'T21:00:00Z'), e('3', 'a', 'b', day + 'T22:00:00Z')] },
    { advisorId: 'a', campaigns: 1, days: { [day]: { base: 8, campaigns: 1 } }, changes: [e('4', 'a', null, day + 'T23:00:00Z')] },
    { advisorId: 'unrelated', campaigns: 1, days: { [day]: { base: 999, campaigns: 1 } }, changes: [] },
  ] as any;
  const asOf = new Date('2026-10-27T12:00:00Z');
  const a = advisorBaseEstimate(rows, ['2026-10-19', day, '2026-10-21'], 'a', asOf);
  assert.equal(a.scope, 'ASSIGNED_FULL_DAY_ESTIMATE');
  assert.equal(a.days[day].value, 20); assert.equal(a.days[day].expected, 2);
  assert.equal(a.days['2026-10-19'].value, null); assert.equal(a.days['2026-10-19'].expected, 0);
  assert.equal(a.days['2026-10-21'].value, null); assert.equal(a.days['2026-10-21'].partial, true);
  assert.equal(advisorBaseEstimate(rows, [day], 'b', asOf).days[day].value, 12);
  rows[0].changes.push(e('5', null, 'a', '2026-10-21T05:00:00Z'));
  assert.equal(advisorBaseEstimate(rows.slice(0,1), ['2026-10-21'], 'a', asOf).days['2026-10-21'].expected, 0);
});

test('Períodos guardados: relativos a Lima, cruces de año/mes bisiesto y consultas mayores a31 días', async () => {
  const { detailPeriodPreset } = await import('../lib/meta-ads/detail-period-presets');
  assert.deepEqual(detailPeriodPreset('days:60', '2026-10-27'), { label: 'Últimos 60 días', since: '2026-08-29', until: '2026-10-27' });
  assert.equal(detailPeriodPreset('days:15', '2026-01-05')?.since, '2025-12-22');
  assert.deepEqual(detailPeriodPreset('last-month', '2024-03-15'), { label: 'Mes anterior', since: '2024-02-01', until: '2024-02-29' });
  assert.equal(detailPeriodPreset('last-month', '2026-01-10')?.since, '2025-12-01');
  assert.equal(detailPeriodPreset('today', '2026-10-27')?.since, '2026-10-27');
  assert.equal(detailPeriodPreset('month', '2026-10-27')?.since, '2026-10-01');
  for (const key of ['days:0','days:3661','days:1.5','random']) assert.equal(detailPeriodPreset(key,'2026-10-27'),null);
});

test('Detalle de Totales: manual y automático conservan sus fuentes, cero, N.A., faltantes y conversión pendiente', async () => {
  const { manualTotalColumns, automaticTotalColumns, totalDetailValue, totalDetailSummary } = await import('../lib/meta-ads/totals-detail');
  const good = (value: number | null) => ({ value, known: value === null ? 0 : 1, expected: 1, na: 0, partial: value === null, pending: false });
  const day = { revision: 0, manual: { baseManual: 3, totalSpend: 0, fixedCost: 'NA' }, sums: { sales: good(6), budget: good(10), base: good(12), spend: good(15), fixedCost: good(2) } } as any;
  assert.deepEqual(manualTotalColumns.map(c => totalDetailValue(day,c).value), [6,10,null,3,0,null]);
  assert.deepEqual(automaticTotalColumns.map(c => totalDetailValue(day,c).value), [6,12,null,15,2]);
  assert.equal(totalDetailValue(day,manualTotalColumns[5]).na,1);
  const summary = totalDetailSummary([good(6),good(0),good(null)]); assert.equal(summary.value,6); assert.equal(summary.known,2); assert(summary.partial);
  assert.equal(totalDetailSummary([good(6),{...good(null),pending:true}]).value,null);
  assert.equal(totalDetailSummary([good(null)]).value,null);
});

test('Enlaces de períodos: fechas e identidades explícitas, consultas extensas y rechazo de referencias inválidas', async () => {
  const { periodTableUrl, parsePeriodTableLink } = await import('../lib/meta-ads/period-table-link');
  const p = { tableId: 'hoja-1', aliasId: 'item-1', country: 'PE', since: '2026-09-01', until: '2026-10-27' };
  const url = new URL(periodTableUrl(p), 'http://localhost');
  assert.equal(url.searchParams.get('view'),'products'); assert.deepEqual(parsePeriodTableLink(url.searchParams),p);
  url.searchParams.set('periodSince','2026-02-30'); assert.equal(parsePeriodTableLink(url.searchParams),null);
  url.searchParams.set('periodSince','2026-09-01'); url.searchParams.set('periodCountry','invalid'); assert.equal(parsePeriodTableLink(url.searchParams),null);
});

test('Consultas extensas: tramos contiguos, datos de primera/última fecha, identidades y cancelación del contexto anterior', async () => {
  const { readAdvisorRange, readTotalsRange, readRangePages } = await import('../app/components/workbook-range-request');
  const original = globalThis.fetch, calls: URL[] = [];
  globalThis.fetch = (async (path: string) => {
    const url = new URL(path,'http://localhost'); calls.push(url);
    const first = url.searchParams.get('since')!, last = url.searchParams.get('until')!;
    const days = { [first]: { sales: first === '2026-09-01' ? null : 3 }, [last]: { sales: 4 } };
    const body = url.pathname.endsWith('/sheet') ? { rows: [{ id: 'a', name: 'A', days }], breakdown: [] } : { tableId: 't', name: 'T', missingFxDays: [], groups: [{country:'PE',currency:'PEN',days}, {country:'CO',currency:'COP',days}] };
    return new Response(JSON.stringify(body),{status:200});
  }) as typeof fetch;
  try {
    const params = { tableId: 't', since: '2026-09-01', until: '2026-10-27' };
    const a = await readAdvisorRange(params);
    assert.equal(calls.length,2); assert.equal(calls[0].searchParams.get('until'),'2026-10-01'); assert.equal(calls[1].searchParams.get('since'),'2026-10-02');
    assert.equal(a.rows.length,1); assert.equal(a.rows[0].days['2026-09-01'].sales,null); assert.equal(a.rows[0].days['2026-10-27'].sales,4);
    const total = await readTotalsRange(params); assert.equal(total.groups.length,2); assert(total.groups.every(g => g.days['2026-09-01'] && g.days['2026-10-27']));
    const before = calls.length; await assert.rejects(readRangePages('unused',params,()=>false)); assert.equal(calls.length,before);
  } finally { globalThis.fetch = original; }
});

test('BM manual: reemplazos absolutos por asesor conservan el resto y separan cero, vacío y N.A.',async()=>{
 const {manualBaseAllocationsSchema,manualBaseValue,replaceManualBaseAdvisor}=await import('../lib/meta-ads/manual-base-policy');
 const entries=[{advisorId:'kevin',quantity:300},{advisorId:'donasis',quantity:200}];
 assert.equal(manualBaseValue('VALUE',entries),500);
 const changed=replaceManualBaseAdvisor(entries,'kevin',500);assert.equal(manualBaseValue('VALUE',changed),700);assert.equal(changed.find(r=>r.advisorId==='donasis')?.quantity,200);assert.equal(entries[0].quantity,300);
 assert.deepEqual(replaceManualBaseAdvisor(changed,'kevin',null),[{advisorId:'donasis',quantity:200}]);
 assert.equal(manualBaseValue('VALUE',[{advisorId:'kevin',quantity:0}]),0);assert.equal(manualBaseValue('EMPTY',[]),null);assert.equal(manualBaseValue('NA',[]),'NA');
 for(const invalid of [[...entries,entries[0]],[{advisorId:'kevin',quantity:-1}],[{advisorId:'kevin',quantity:1.5}],[{advisorId:'kevin',quantity:100000001}]])assert(!manualBaseAllocationsSchema.safeParse(invalid).success);
 assert(!manualBaseAllocationsSchema.safeParse([{advisorId:null,quantity:1},{advisorId:null,quantity:2}]).success);
});
test('Desempeño: ratios distinguen cantidades e inversión, denominadores cero y datos faltantes',async()=>{
 const {performanceRatio}=await import('../lib/meta-ads/performance-metrics');
 assert.equal(performanceRatio(5,500,100),1);assert.equal(performanceRatio(100,5),20);assert.equal(performanceRatio(0,500,100),0);assert.equal(performanceRatio(0,5),0);
 for(const [n,d]of [[5,0],[null,500],[5,null],[NaN,5],[5,Infinity]])assert.equal(performanceRatio(n,d),null);
});

test('Períodos por calendario: conserva accesos relativos y fechas personalizadas, sin duplicar ni aceptar rangos inválidos',async()=>{
 const {savedCalendarPeriod,detailPeriodPreset}=await import('../lib/meta-ads/detail-period-presets');
 assert.equal(savedCalendarPeriod('2026-10-21','2026-10-27','7','2026-10-27'),'days:7');
 assert.equal(detailPeriodPreset('days:7','2026-10-28')?.since,'2026-10-22');
 assert.equal(savedCalendarPeriod('2026-10-01','2026-10-27','month','2026-10-27'),'month');
 assert.equal(savedCalendarPeriod('2026-09-01','2026-09-30','last-month','2026-10-27'),'last-month');
 const fixed=savedCalendarPeriod('2026-09-01','2026-10-27','custom','2026-10-27');assert.equal(fixed,'range:2026-09-01:2026-10-27');assert.equal(detailPeriodPreset(fixed!,'2026-10-28')?.until,'2026-10-27');
 assert.equal(savedCalendarPeriod('2026-10-19','2026-10-25','last-week','2026-10-27'),'calendar:last-week');
 for(const key of ['range:2026-02-30:2026-10-27','range:2026-10-28:2026-10-27','range:2026-10-20:2026-10-28','range:2000-01-01:2026-10-27','calendar:unknown'])assert.equal(detailPeriodPreset(key,'2026-10-27'),null);
 assert.equal(savedCalendarPeriod('2026-10-20','2026-10-27','7','2026-10-27'),null);
});

test('Distribución del asesor: valida preferencias y conserva todos los módulos sin duplicados',async()=>{
 const {normalizeAdvisorLayout,defaultAdvisorLayout,advisorModuleIds}=await import('../lib/meta-ads/advisor-detail-layout');
 for(const raw of [null,{},[],['desconocido'],[123]])assert.deepEqual(normalizeAdvisorLayout(raw),defaultAdvisorLayout);
 const rows=normalizeAdvisorLayout(['chart|chart|invalid','products|days|sold-days','assignments']);
 assert.deepEqual([...rows.flat()].sort(),[...advisorModuleIds].sort());assert(rows.every(r=>r.length<=2));assert.equal(rows[0][0],'chart');
});
test('Distribución del asesor: mover verticalmente y emparejar horizontalmente no pierde bloques',async()=>{
 const {moveAdvisorModule,defaultAdvisorLayout,advisorModuleIds}=await import('../lib/meta-ads/advisor-detail-layout');
 const original=JSON.stringify(defaultAdvisorLayout);
 assert.deepEqual(moveAdvisorModule(defaultAdvisorLayout,'chart','assignments','after'),[['inventory-analysis'],['sold-days','days'],['assignments'],['chart'],['products']]);
 assert.deepEqual(moveAdvisorModule(defaultAdvisorLayout,'days','sold-days','left')[1],['days','sold-days']);
 assert(moveAdvisorModule(defaultAdvisorLayout,'products','chart','right').some(r=>r.join('|')==='chart|products'));
 for(const source of advisorModuleIds)for(const target of advisorModuleIds)for(const placement of ['before','after','left','right']as const){const rows=moveAdvisorModule(defaultAdvisorLayout,source,target,placement);assert.deepEqual([...rows.flat()].sort(),[...advisorModuleIds].sort());assert(rows.every(r=>r.length>0&&r.length<=2));if(source!==target){const flat=rows.flat();assert(placement==='before'||placement==='left'?flat.indexOf(source)<flat.indexOf(target):flat.indexOf(source)>flat.indexOf(target));if(placement==='left'||placement==='right')assert(rows.some(r=>r.includes(source)&&r.includes(target)));}}
 assert.equal(JSON.stringify(defaultAdvisorLayout),original);
});

test('BC es un conteo manual independiente de B de Meta y de BM en ambas vistas de Totales',async()=>{
 const {manualTotalColumns,automaticTotalColumns,totalDetailValue}=await import('../lib/meta-ads/totals-detail');
 const empty={value:40,known:1,expected:1,na:0,pending:false,partial:false};
 const day:any={sums:{base:empty},manual:{baseManual:999},revision:0};
 for(const columns of [manualTotalColumns,automaticTotalColumns]){const ba=columns.find(c=>c.key==='advisorBase')!;assert.equal(ba.label,'BC');assert.equal(ba.name,'Base por contactar');assert.equal(ba.sum,false);assert.equal(totalDetailValue(day,ba).value,null);day.manual.advisorBase=0;assert.equal(totalDetailValue(day,ba).value,0);day.manual.advisorBase=300;assert.equal(totalDetailValue(day,ba).value,300);day.manual.advisorBase='NA';assert.equal(totalDetailValue(day,ba).na,1);delete day.manual.advisorBase;}
 assert.equal(day.sums.base.value,40);assert.equal(day.manual.baseManual,999);
});

test('Totales por producto: une páginas, conserva cero y faltantes, incluye desactivados y separa país/moneda', async()=>{
 const {summarizeTotalProducts}=await import('../lib/meta-ads/totals-product-summary');
 const days=['2026-09-30','2026-10-01'];
 const row=(id:string,sales:number|null,day:string,na=false,extra={})=>({aliasId:id,country:'CO',currency:'COP',active:id!=='zero',campaigns:0,days:{[day]:{sales,base:null,spend:null,fixedCost:null,na:na?['sales']:[]}},...extra});
 const aliases=['zero','sold','unknown','na','partial','foreign','currency'].map(id=>({id,name:id}));
 const pages=days.map((day,i)=>({table:{aliases},rows:[row('zero',0,day),row('sold',i?2:0,day),row('unknown',null,day),row('na',null,day,true),row('partial',i?null:0,day),row('foreign',100,day,false,{country:'PE'}),row('currency',200,day,false,{currency:'PEN'})]})) as any;
 const products=summarizeTotalProducts(pages,days,'CO','COP');assert.equal(products.length,5);
 const get=(id:string)=>products.find(p=>p.aliasId===id)!;
 assert.equal(get('zero').sums.sales.value,0);assert.equal(get('zero').active,false);assert.equal(get('zero').sums.sales.partial,false);
 assert.equal(get('sold').sums.sales.value,2);assert.equal(get('unknown').sums.sales.value,null);assert.equal(get('unknown').sums.sales.na,0);
 assert.equal(get('na').sums.sales.value,null);assert.equal(get('na').sums.sales.na,2);
 assert.equal(get('partial').sums.sales.value,0);assert.equal(get('partial').sums.sales.partial,true);
 assert.equal(summarizeTotalProducts(pages,[days[0]],'CO','COP').find(p=>p.aliasId==='sold')!.sums.sales.value,0);
 assert.equal(summarizeTotalProducts(pages,days,'PE','COP')[0].sums.sales.value,200);
});

test('Ventas de inventario: ranking y fechas por asesor, países separados, páginas sin duplicados y cero/N.A./vacío',async()=>{
 const {inventoryAdvisorSales}=await import('../lib/meta-ads/inventory-advisor-sales');
 const a={day:'2026-10-20',country:'PE',advisorId:'ana',name:'Ana',sales:1,na:false,partial:false};
 const b={...a,advisorId:'donasys',name:'Donasys',sales:3};
 const report=inventoryAdvisorSales([a,b,a,{...a,day:'2026-10-21',sales:2},{...a,country:'CO',sales:4},{...a,advisorId:'zero',name:'Cero',sales:0},{...a,advisorId:'na',name:'NA',sales:null,na:true},{...a,advisorId:null,name:'Sin asesor',sales:null}]);
 assert.equal(report.people.find(p=>p.advisorId==='ana')!.sales,7);assert.equal(report.people.find(p=>p.advisorId==='ana')!.knownDays,2);assert.equal(report.people.find(p=>p.advisorId==='donasys')!.sales,3);
 assert.equal(report.daily.filter(r=>r.advisorId==='ana'&&r.country==='PE'&&r.day==='2026-10-20').length,1);
 assert.equal(report.daily[0].day,'2026-10-21');assert.equal(report.people.find(p=>p.advisorId==='zero')!.sales,0);assert.equal(report.people.find(p=>p.advisorId==='na')!.sales,null);assert.equal(report.people.find(p=>p.advisorId===null)!.sales,null);
 assert.equal(report.people.find(p=>p.advisorId===null)!.partial,true);assert.deepEqual(inventoryAdvisorSales([]),{daily:[],people:[]});
});

test('Columnas de Totales: posiciones arbitrarias conservan identidad, recuperan parámetros nuevos y no mutan preferencias',async()=>{
 const {orderedTotalColumns,moveTotalColumn}=await import('../lib/meta-ads/totals-column-layout');
 const cols=[{key:'sales'},{key:'budget'},{key:'advisorBase'},{key:'baseManual'},{key:'totalSpend'},{key:'fixedCost'}],keys=cols.map(c=>c.key);
 assert.deepEqual(orderedTotalColumns(cols,['baseManual','unknown','baseManual']).map(c=>c.key),['baseManual','sales','budget','advisorBase','totalSpend','fixedCost']);
 assert.deepEqual(moveTotalColumn(keys,'sales','totalSpend',true),['budget','advisorBase','baseManual','totalSpend','sales','fixedCost']);
 for(const source of keys)for(const target of keys)for(const after of [false,true]){const next=moveTotalColumn(keys,source,target,after);assert.equal(next.length,6);assert.deepEqual([...next].sort(),[...keys].sort());}
 assert.deepEqual(keys,cols.map(c=>c.key));assert.deepEqual(moveTotalColumn(keys,'missing','sales'),keys);
});

test('Totales de producto: períodos por páginas conservan vendedores, fechas, cero y faltantes sin duplicar ni asignar BM/BC',async()=>{
 const {mergeTotalProductReports}=await import('../lib/meta-ads/totals-product-summary');
 const value=(n:number|null)=>({value:n,known:n===null?0:1,expected:1,na:0,partial:n===null,pending:false});
 const cell=(v:number|null,advisors:any[])=>({sums:{sales:value(v),budget:value(null),base:value(null),spend:value(null),fixedCost:value(null)},advisors});
 const person=(id:string,n:number)=>({advisorId:id,name:id,sales:n,na:false,partial:false});
 const one={aliasId:'a',name:'Curso',active:true,days:{'2026-10-20':cell(4,[person('Ana',1),person('Donasys',3)])}},two={...one,days:{'2026-10-21':cell(2,[person('Ana',2)]),'2026-10-22':cell(0,[])}};
 const p=mergeTotalProductReports([{products:[one]},{products:[one,two]}] as any,['2026-10-20','2026-10-21','2026-10-22','2026-10-23'])[0];
 assert.equal(p.sums.sales.value,6);assert.equal(p.sums.sales.partial,true);assert.equal(p.advisors!.find(a=>a.advisorId==='Ana')!.sales,3);assert.equal(p.advisors!.find(a=>a.advisorId==='Donasys')!.sales,3);assert.equal(p.days!['2026-10-22'].sums.sales.value,0);assert.equal(p.days!['2026-10-23'],undefined);assert(!('manualBase' in p));
 const {totalDetailPeriods,detailPeriodPreset}=await import('../lib/meta-ads/detail-period-presets');assert.deepEqual(totalDetailPeriods.map(k=>detailPeriodPreset(k,'2026-10-27')!.label),['Hoy','Ayer','Últimos 15 días','Últimos 30 días','Este mes']);
});

test('Guía de carga: origen automático, manual del día y BM/GM al día siguiente son independientes del valor y de la vista',async()=>{
 const {totalDataFill,sheetMetricDataFill,fillNextDay}=await import('../lib/meta-ads/sheet-data-fill');
 assert.equal(totalDataFill({key:'sales',sum:true}),'automatic');assert.equal(totalDataFill({key:'budget',sum:true}),'automatic');
 for(const key of ['baseManual','totalSpend']){assert(fillNextDay(key));assert.equal(totalDataFill({key,sum:false}),'next-day');}
 assert.equal(totalDataFill({key:'advisorBase',sum:false}),'automatic');assert.equal(totalDataFill({key:'fixedCost',sum:false}),'manual');assert.equal(totalDataFill({key:'fixedCost',sum:true}),'automatic');assert(!fillNextDay('advisorBase'));
 assert.equal(sheetMetricDataFill('sales'),'manual');assert.equal(sheetMetricDataFill('budget'),'manual');assert.equal(sheetMetricDataFill('base'),'automatic');assert.equal(sheetMetricDataFill('spend'),'automatic');
 assert.equal(sheetMetricDataFill('base',{manual:true}),'manual');assert.equal(sheetMetricDataFill('spend',{manual:true}),'manual');assert.equal(sheetMetricDataFill('sales',{linked:true,manual:true}),'automatic');assert.equal(sheetMetricDataFill('budget',{synced:true,manual:true}),'automatic');assert.equal(sheetMetricDataFill('fixedCost',{received:true}),'automatic');assert.equal(sheetMetricDataFill('sales',{automaticNa:true}),'automatic');
});

import {inventoryDetailOrder,normalizeInventoryOrder,moveInventoryModule} from '../lib/meta-ads/inventory-detail-order';
test('detalle de inventario: orden compartido conserva sus cinco módulos y mueve sin duplicar ni mutar',()=>{
 assert.deepEqual(normalizeInventoryOrder(null),['chart','days','inventory-sales-dates','inventory-advisor-sales','activity']);
 assert.deepEqual(normalizeInventoryOrder(['activity','invalid','activity','days']),['activity','days','chart','inventory-sales-dates','inventory-advisor-sales']);
 const original=[...inventoryDetailOrder];
 for(const source of original)for(const target of original)for(const after of [false,true]){const moved=moveInventoryModule(original,source,target,after);assert.equal(moved.length,5);assert.deepEqual([...moved].sort(),[...original].sort());if(source!==target)assert.equal(moved.indexOf(source),moved.indexOf(target)+(after?1:-1));assert.deepEqual(original,[...inventoryDetailOrder]);}
 assert.deepEqual(moveInventoryModule(original,'unknown','days'),original);assert.deepEqual(moveInventoryModule(original,'activity','chart'),['activity','chart','days','inventory-sales-dates','inventory-advisor-sales']);
});

import {inventorySalesGroups} from '../lib/meta-ads/inventory-advisor-sales';
test('comparativo vertical agrupa por fecha y asesor sin sumar páginas duplicadas ni convertir cero/NA/vacío en ventas',()=>{
 const row={day:'2026-10-20',country:'PE',advisorId:'ana',name:'Ana',sales:2,na:false,partial:false};
 const rows=[row,{...row},{...row,country:'CO',sales:1,partial:true},{...row,advisorId:'don',name:'Donasis',sales:3},{...row,day:'2026-10-21',sales:0},{...row,day:'2026-10-21',advisorId:'don',name:'Donasis',sales:4},{...row,day:'2026-10-22',sales:null},{...row,day:'2026-10-23',na:true,sales:5}];
 const result=inventorySalesGroups(rows);assert.equal(result.length,2);assert.deepEqual(result[0].bars.map(b=>[b.id,b.sales,b.partial]),[['ana',3,true],['don',3,false]]);assert.deepEqual(result[1].bars.map(b=>[b.id,b.sales]),[['don',4]]);assert.equal(result[0].day,'2026-10-20');assert.equal(rows.length,8);const third=inventorySalesGroups([...rows,{...row,advisorId:'third',name:'Kevin',sales:1}]);assert.equal(third[0].bars.length,3);assert.equal(third[0].bars.find(b=>b.id==='third')?.sales,1);
});

import {sheetSalesProducts,sheetSalesStatus} from '../lib/meta-ads/sheet-sales-summary';
import type {TotalProduct} from '../lib/meta-ads/totals-product-summary';
test('toda la hoja: suma ventas entre países sin duplicar monedas, conserva cero/desactivados/sin dato y sus asesores diarios',()=>{
 const date='2026-10-20',value=(n:number|null)=>({value:n,known:n===null?0:1,expected:1,na:0,pending:false,partial:n===null}),product=(id:string,n:number|null,advisor='ana'):TotalProduct=>({aliasId:id,name:id,active:false,sums:Object.fromEntries(['sales','base','spend','budget','fixedCost'].map(k=>[k,value(n)])) as TotalProduct['sums'],days:{[date]:{sums:Object.fromEntries(['sales','base','spend','budget','fixedCost'].map(k=>[k,value(n)])) as TotalProduct['sums'],advisors:n===null?[]:[{advisorId:advisor,name:advisor,sales:n,na:false,partial:false}]}}});
 const a=product('curso',2),zero=product('cero',0),unknown=product('sin dato',null),b=product('curso',3,'don');
 const result=sheetSalesProducts([{country:'PE',currency:'PEN',products:[a,zero,unknown]},{country:'PE',currency:'USD',products:[a,zero,unknown]},{country:'CO',currency:'COP',products:[b]}],[date]);
 assert.equal(result.length,3);assert.equal(result[0].sales.value,5);assert.equal(result[0].days[date].sales.value,5);assert.deepEqual(result[0].advisors.map(p=>[p.name,p.sales]),[['don',3],['ana',2]]);assert.deepEqual(result[0].countries,['CO','PE']);assert.equal(result[0].active,false);assert.equal(sheetSalesStatus(result.find(p=>p.aliasId==='cero')!,2),'zero');assert.equal(sheetSalesStatus(result.find(p=>p.aliasId==='sin dato')!,2),'unknown');assert.equal(sheetSalesStatus(result[0],6),'low');assert.equal(sheetSalesStatus(result[0],2),'selling');
 assert.throws(()=>sheetSalesProducts([{country:'PE',currency:'PEN',products:[a]},{country:'PE',currency:'USD',products:[product('curso',4)]}],[date]),/cambiaron/);assert.equal(a.days![date].sums.sales.value,2);
});

import {totalViewColumns,totalProductMetrics} from '../lib/meta-ads/total-detail-views';
import {normalizeDetailOrder,moveDetailModule} from '../lib/meta-ads/inventory-detail-order';
test('Totales: cada vista muestra únicamente sus parámetros, sin mezclar Meta ni inventar repartos por producto',()=>{
 assert.deepEqual(totalViewColumns('manual').map(c=>c.key),['sales','budget','advisorBase','baseManual','totalSpend','fixedCost']);assert.deepEqual(totalViewColumns('automatic').map(c=>c.key),['sales','base','advisorBase','spend','fixedCost']);assert.deepEqual(totalViewColumns('today').map(c=>c.key),['sales','budget','advisorBase','fixedCost']);assert.deepEqual(totalViewColumns('yesterday').map(c=>c.key),['sales','baseManual','totalSpend','fixedCost']);assert.deepEqual(totalProductMetrics('manual'),['sales','budget']);assert.deepEqual(totalProductMetrics('automatic'),['sales','base','spend','fixedCost']);assert.deepEqual(totalProductMetrics('today'),['sales','budget']);assert.deepEqual(totalProductMetrics('yesterday'),['sales']);
 const ids=['summary','performance','advisors','products','chart','days'];assert.deepEqual(normalizeDetailOrder(['days','days','invalid'],ids),['days','summary','performance','advisors','products','chart']);assert.deepEqual(moveDetailModule(ids,'days','summary',false,ids),['days','summary','performance','advisors','products','chart']);assert.deepEqual(ids,['summary','performance','advisors','products','chart','days']);
});

import { advisorTeamRows } from "../lib/meta-ads/advisor-team-summary";
test("Comparativo de asesores: BC/BM independientes, porcentajes ponderados y cero distinto de vacío",()=>{
 const day=(sales:number|null,bm:number|null,bc:number|null,status:string|null="PRESENT")=>({sales,manualBase:bm,advisorBase:bc,na:false,partial:false,status,absence:{hours:1,pending:0}});
 const people:Parameters<typeof advisorTeamRows>[0]=[{id:"ana",name:"Ana",days:{"2026-10-20":day(2,100,40),"2026-10-21":day(1,50,20)}},{id:"zero",name:"Cero",days:{"2026-10-20":day(0,0,0,null)}},{id:"missing",name:"Sin dato",days:{"2026-10-20":day(null,null,10,null)}}];
 const bc=advisorTeamRows(people,"BC"),bm=advisorTeamRows(people,"BM");assert.equal(bc[0].sales,3);assert.equal(bc[0].base,60);assert.equal(bc[0].percent,5);assert.equal(bm[0].base,150);assert.equal(bm[0].percent,2);assert.equal(bc[0].average,1.5);assert.equal(bc[0].present,2);assert.equal(bc[0].hours,2);assert.equal(bc[1].sales,0);assert.equal(bc[1].base,0);assert.equal(bc[1].percent,null);assert.equal(bc[1].present,null);assert.equal(bc[2].sales,null);assert.equal(bc[2].percent,null);assert.equal(bc[2].partial,true);
});

import {advisorPerformanceTrend} from '../lib/meta-ads/advisor-motivation';
test('Motivación del asesor: variación equivalente, precisión y registros incompletos',()=>{
 assert.deepEqual(advisorPerformanceTrend(5,3),{kind:'improved',delta:2});assert.deepEqual(advisorPerformanceTrend(2,5),{kind:'declined',delta:-3});assert.deepEqual(advisorPerformanceTrend(0,0),{kind:'steady',delta:0});assert.equal(advisorPerformanceTrend(1.0001,1).kind,'steady');assert.equal(advisorPerformanceTrend(null,4).kind,'pending');assert.equal(advisorPerformanceTrend(5,null).kind,'pending');assert.equal(advisorPerformanceTrend(5,3,true).kind,'pending');assert.equal(advisorPerformanceTrend(5,3,false,true).kind,'pending');
});

import {periodComparison} from '../lib/meta-ads/period-comparison';
test('Resumen del período: ventas y bases de las mismas fechas, sin mezclar hoy con ayer',()=>{
 assert.equal(periodComparison([{numerator:5,denominator:358}]).value,5/358*100);
 assert.equal(periodComparison([{numerator:5,denominator:358},{numerator:3,denominator:150}]).value,8/508*100);
 assert.deepEqual(periodComparison([{numerator:5,denominator:358},{numerator:3,denominator:null}]),{value:null,mismatched:true,matchedDays:1});
 assert.equal(periodComparison([{numerator:null,denominator:100},{numerator:5,denominator:358}]).value,null);
 assert.equal(periodComparison([{numerator:null,denominator:null},{numerator:0,denominator:10}]).value,0);
 assert.equal(periodComparison([{numerator:5,denominator:0}]).value,null);
});

import {summaryPeriod} from '../lib/meta-ads/summary-period';
test('Corte del resumen: ayer excluye hoy sin quitar filas del histórico, hoy incluye avance provisional',()=>{
 const days=['2026-10-26','2026-10-27','2026-10-28','2026-10-29'];
 assert.deepEqual(summaryPeriod(days,'yesterday','2026-10-28'),{days:['2026-10-26','2026-10-27'],cutoff:'2026-10-27',end:'2026-10-27',excluded:2});assert.equal(days.length,4);
 assert.deepEqual(summaryPeriod(days,'today','2026-10-28').days,['2026-10-26','2026-10-27','2026-10-28']);assert.deepEqual(summaryPeriod(days,'manual','2026-10-28').days,days);
 assert.equal(summaryPeriod(['2026-10-28'],'yesterday','2026-10-28').end,null);assert.equal(summaryPeriod(['2026-10-20'],'yesterday','2026-10-28').end,'2026-10-20');
 assert.equal(summaryPeriod(['2024-02-29','2024-03-01'],'yesterday','2024-03-01').end,'2024-02-29');
});

test('Catálogo preparado: nombres equivalentes, límites y temarios únicos', async () => {
 const {catalogPackageSchema,syllabiSchema,catalogNameKey}=await import('../lib/meta-ads/inventory-syllabi-policy');
 const outline={id:'a',title:'Todo el mundo 1',scope:'Todo el mundo',content:'Contenido del curso'};
 const item={name:'Curso sintético',primary:'Educación',secondary:[],syllabi:[outline]};
 const p={format:'inventario-catalog-v1',targetName:'Inventario prueba',categories:['Educación'],items:[item]};
 assert(catalogPackageSchema.safeParse(p).success);
 assert.equal(catalogNameKey('  EDUCACIÓN  Superior '),'educacion superior');
 assert(!catalogPackageSchema.safeParse({...p,items:[item,{...item,name:' CURSO SINTÉTICO '}]}).success);
 assert(!syllabiSchema.safeParse([outline,outline]).success);
 assert(!syllabiSchema.safeParse([{...outline,content:' '}]).success);
 assert(!syllabiSchema.safeParse([{...outline,content:'a'.repeat(30001)}]).success);
 assert(!catalogPackageSchema.safeParse({...p,items:[{...item,hojas:['no permitido']}]}).success);
});

test('Temarios preparados: conservar alineación al quitar filas vacías y exigir un inventario real',async()=>{
 const {inventoryDraftRows}=await import('../lib/meta-ads/inventory-paste');
 const blank={name:'',primary:'',secondary:'',sheets:''},s={id:'draft-world',title:'Todo el mundo',scope:'Todo el mundo',content:'Unidad uno\nUnidad dos'};
 const rows=inventoryDraftRows([blank,{...blank,name:'Producto de prueba',syllabi:[s]},{...blank,primary:'Área de prueba'}]);
 assert.equal(rows.length,2);assert.deepEqual(rows[0].syllabi,[s]);assert.equal(rows[1].name,'');assert.equal(rows[1].syllabi,undefined);
 assert.throws(()=>inventoryDraftRows([{...blank,syllabi:[s]}]),/nombre del inventario/i);
 assert.throws(()=>inventoryDraftRows([{...blank,name:'Curso',syllabi:[s,s]}]),/revisa/i);
 assert.throws(()=>inventoryDraftRows([{...blank,name:'Curso',syllabi:[{...s,content:' '}]}]),/revisa/i);
});


test('Excel con temarios: encabezados, nombres de botones, texto multilínea,1500 filas y áreas secundarias amplias', async()=>{
 const {inventoryGrid,inventoryRows}=await import('../lib/meta-ads/inventory-paste');
 const p=inventoryGrid([['Inventario','Categoría principal','Categorías secundarias','Hojas','Temario 1','Temario 2'],['Curso','Calidad',Array.from({length:30},(_,i)=>'Área '+i).join(', '),'','Nombre: Perú 1\nÁmbito: Perú\n\nUnidad uno\nUnidad dos','Contenido sin metadatos']]);
 assert.equal(p.rows[0].syllabi?.length,2);assert.equal(p.rows[0].syllabi?.[0].title,'Perú 1');assert.equal(p.rows[0].syllabi?.[0].scope,'Perú');assert.equal(p.rows[0].syllabi?.[0].content,'Unidad uno\nUnidad dos');assert.equal(p.rows[0].syllabi?.[1].title,'Temario 2');assert.equal(p.rows[0].syllabi?.[1].scope,'Todo el mundo');assert.equal(p.hasSyllabi,true);
 assert.equal(inventoryRows(Array.from({length:1500},(_,i)=>['Curso '+i,'Área','Especialidad',''])).length,1500);
 assert.throws(()=>inventoryRows(Array.from({length:1501},(_,i)=>['Curso '+i])),/1.500/);
 const {parseInventoryFile}=await import('../lib/meta-ads/category-file');
 const merged=await categoryXlsx('<worksheet><mergeCells><mergeCell ref="A1:E1"/></mergeCells><row><c r="A1" t="inlineStr"><is><t>Área</t></is></c></row></worksheet>');await assert.rejects(()=>parseInventoryFile('revision.xlsx',merged),/franjas|combinadas/);
 const many=await categoryXlsx('<worksheet><row><c r="BC1"><v>Contenido</v></c></row></worksheet>');await assert.rejects(()=>parseInventoryFile('muchos.xlsx',many),/50/);
});


test('Inventario: una categoría se mueve al nivel solicitado y los duplicados ajenos permanecen intactos', async () => {
 const {categoryAssignmentTags}=await import('../lib/meta-ads/inventory-category-policy');
 const defs=[{id:'p',name:'Sistemas',kind:'PRIMARY'},{id:'s',name:'SISTEMAS',kind:'SECONDARY'},{id:'oldp',name:'Otra',kind:'PRIMARY'},{id:'olds',name:'Otra',kind:'SECONDARY'}];
 assert.deepEqual(categoryAssignmentTags(defs,['p','oldp','olds'],['s']),['oldp','olds','s']);
 assert.deepEqual(categoryAssignmentTags(defs,['s'],['p']),['p']);
 assert.deepEqual(categoryAssignmentTags(defs,['p','s','oldp','olds'],[]),['p','s','oldp','olds']);
 assert.throws(()=>categoryAssignmentTags(defs,[],['foreign']),/no disponible/i);
});
test('Inventario: un archivo con la misma categoría en ambas columnas conserva solo principal sin depender del orden', async () => {
 const {categoryAssignmentTags}=await import('../lib/meta-ads/inventory-category-policy');
 const defs=[{id:'p',name:'Sistemas',kind:'PRIMARY'},{id:'s',name:'sistemas',kind:'SECONDARY'}];
 for (const incoming of [['p','s'],['s','p'],['s','p','s','p']]) assert.deepEqual(categoryAssignmentTags(defs,['s'],incoming),['p']);
});


test('Búsqueda: Recursos humanos aparece primero y las opciones se reducen al escribir sin confundir categorías con nombres', async () => {
 const {searchOptions}=await import('../lib/search');
 const options=[{label:'Coaching y liderazgo',category:'Recursos humanos'},{label:'Gestión de Recursos Humanos',category:'Empresa'},{label:'Recursos humanos',category:'Empresa'},{label:'Recursos turísticos',category:'Turismo'},{label:'Comunicación organizacional',category:'Recursos humanos'}];
 let previous=options.length;
 for(const query of ['r','re','rec','recursos','recursos h','recursos hu','recursos humanos']){const found=searchOptions(options,query,o=>o.label);assert(found.length<=previous);previous=found.length;assert(found.some(o=>o.label==='Recursos humanos'));assert.equal(found[0].label,'Recursos humanos');}
 assert.deepEqual(searchOptions(options,'recursos humanos',o=>o.label).map(o=>o.label),['Recursos humanos','Gestión de Recursos Humanos']);
});
test('Búsqueda: fragmentos, palabras invertidas, tildes, signos y espacios se normalizan sin exigir Enter', async () => {
 const {matchesSearchWords,searchOptions}=await import('../lib/search');
 for(const q of ['gestion calidad','CALIDAD GESTIÓN','  calidad \u00a0gestion  ','gest cal','gestion-calidad']) assert(matchesSearchWords('Gestión de la calidad',q));
 assert(matchesSearchWords('ISO-17025','iso 17025'));assert(matchesSearchWords('NUTRICIÓN','nutri'));assert(matchesSearchWords('ﬁnanzas','finanzas'));
 assert(!matchesSearchWords('Derecho laboral','recursos'));assert(!matchesSearchWords('Recursos humanos','recursos minería'));
 const values=['Gestión de calidad','Recursos humanos'];assert.deepEqual(searchOptions(values,'',o=>o),values);assert.deepEqual(searchOptions(values,'noexiste',o=>o),[]);assert.deepEqual(values,['Gestión de calidad','Recursos humanos']);
});
test('Búsqueda: nombres exactos y prefijos tienen prioridad sobre códigos o metadatos sin perder el código explícito', async () => {
 const {searchOptions}=await import('../lib/search');
 const options=[{label:'ANA',value:'humanos'},{label:'Gestión de recursos humanos',value:'id2'},{label:'Recursos humanos',value:'id3'},{label:'Perú',value:'PE'}];
 assert.equal(searchOptions(options,'recursos',o=>o.label,o=>o.value)[0].label,'Recursos humanos');assert.equal(searchOptions(options,'PE',o=>o.label,o=>o.value)[0].label,'Perú');
 assert.equal(searchOptions(options,'humanos',o=>o.label,o=>o.value).at(-1)?.label,'ANA');
});
test('Búsqueda de cuentas: conserva los filtros de actividad y negocio con palabras y prefijos de ID', async () => {
 const {matchesAccount}=await import('../lib/meta-ads/account-filters');const a={id:'123456',name:'Cámara Nacional',businessId:'negocio',businessName:'Educación Perú',currency:'PEN',enabled:true,activity:{state:'READY' as const,spend30:10,activeCampaigns:1}};
 assert(matchesAccount(a,'peru cam','active','negocio'));assert(matchesAccount(a,'act_123456'));assert(matchesAccount(a,'camara act_123'));assert(!matchesAccount(a,'camara','none'));assert(!matchesAccount(a,'camara','active','otro'));
});


test("efectividad diaria del asesor compara fechas iguales y espera cierre para BM",()=>{
 const b={day:"2026-10-28",today:"2026-10-29",sales:5,base:358,basis:"BM" as const};
 assert.equal(advisorDayEffectiveness(b).value,5/358);
 assert.equal(advisorDayEffectiveness({...b,day:b.today}).value,null);
 assert.equal(advisorDayEffectiveness({...b,day:b.today,basis:"BC",base:150}).value,5/150);
 assert.equal(advisorDayEffectiveness({...b,day:"2026-10-30",basis:"BC"}).value,null);
 assert.equal(advisorDayEffectiveness({...b,sales:0}).value,0);
 assert.equal(advisorDayEffectiveness({...b,base:0}).value,null);
 assert.equal(advisorDayEffectiveness({...b,base:null}).value,null);
 assert.equal(advisorDayEffectiveness({...b,sales:null}).value,null);
 assert.equal(advisorDayEffectiveness({...b,partial:true}).value,null);
});


import {groupFinancialRowsByAdvisor} from "../lib/meta-ads/financial-categories";
test("Vista por asesor repite categorías dentro de cada persona sin duplicar filas ni cambiar asignaciones",()=>{
 const entries=[{id:"a",name:"Curso A",categoryAssignments:[{category:{id:"edu",name:"Educación",kind:"PRIMARY" as const}}]},{id:"b",name:"Curso B",categoryAssignments:[{category:{id:"edu",name:"Educación",kind:"PRIMARY" as const}}]},{id:"c",name:"Curso C",categoryAssignments:[{category:{id:"edu",name:"Educación",kind:"PRIMARY" as const}}]}];
 const rows=[{aliasId:"a",country:"PE",advisorId:"jesus",active:true},{aliasId:"b",country:"PE",advisorId:"donays",active:true},{aliasId:"c",country:"PE",advisorId:"jesus",active:true},{aliasId:"d",country:"PE",advisorId:null,active:false}];const before=JSON.stringify(rows);
 const groups=groupFinancialRowsByAdvisor(rows,entries,{},[{id:"jesus",name:"Jesús"},{id:"donays",name:"Donays"}]);
 assert.deepEqual(groups.map(g=>g.name),["Donays","Jesús","Sin asesor"]);assert.deepEqual(groups[0].bands[0].names,["Educación"]);assert.equal(groups[0].bands[0].rows.length,1);assert.deepEqual(groups[1].bands[0].names,["Educación"]);assert.equal(groups[1].bands[0].rows.length,2);assert.equal(groups.flatMap(g=>g.rows).length,4);assert.equal(JSON.stringify(rows),before);
 const filtered=groupFinancialRowsByAdvisor(rows.slice(0,2),entries,{},[{id:"jesus",name:"Jesús"},{id:"donays",name:"Donays"}]);assert.equal(filtered.flatMap(g=>g.rows).length,2);
});

test('sheet analysis sorts sales both ways with missing data last and retains stable ties', async () => {
 const {sortSheetSalesProducts, emptySales} = await import('../lib/meta-ads/sheet-sales-summary');
 const product = (name:string, value:number|null) => ({aliasId:name,name,countries:['PE'],active:true,sales:{...emptySales,value},days:{},advisors:[]});
 const rows=[product('Sin dato',null),product('Dos',2),product('Cero',0),product('Dos B',2)];
 assert.deepEqual(sortSheetSalesProducts(rows,'sales',true,2).map(p=>p.name),['Cero','Dos','Dos B','Sin dato']);
 assert.deepEqual(sortSheetSalesProducts(rows,'sales',false,2).map(p=>p.name),['Dos','Dos B','Cero','Sin dato']);
 assert.equal(rows[0].name,'Sin dato');
});
test('Top full-sheet link focuses an item without changing legacy filtered period links', async () => {
 const {periodTableUrl,parsePeriodTableLink}=await import('../lib/meta-ads/period-table-link');
 const link={tableId:'table',aliasId:'item',country:'PE',since:'2026-10-20',until:'2026-10-30',focus:true};
 assert.deepEqual(parsePeriodTableLink(new URL(periodTableUrl(link),'https://example.test').searchParams),link);
 const {focus,...legacy}=link;
 assert.deepEqual(parsePeriodTableLink(new URL(periodTableUrl(legacy),'https://example.test').searchParams),legacy);
});

test('country usage counts closed and open activation periods and distinguishes short trials from unknown starts', async()=>{
 const {inventoryUsage}=await import('../lib/meta-ads/inventory-usage');
 const since='2026-10-29T00:00:00Z', now=Date.parse('2026-10-30T00:00:00Z');
 assert.deepEqual(inventoryUsage([],now),{usage:'NEVER',activationHours:0});
 assert.deepEqual(inventoryUsage([{since,until:'2026-10-29T01:00:00Z'}],now),{usage:'TEST',activationHours:1});
 assert.deepEqual(inventoryUsage([{since,until:null}],now),{usage:'USED',activationHours:24});
 assert.deepEqual(inventoryUsage([{since,until:'2026-10-29T12:00:00Z'}],now),{usage:'USED',activationHours:12});
 assert.deepEqual(inventoryUsage([{since:null,until:null}],now),{usage:'UNKNOWN',activationHours:null});
 assert.equal(inventoryUsage([{since,until:'2026-10-29T07:00:00Z'},{since:'2026-10-29T10:00:00Z',until:'2026-10-29T16:00:00Z'}],now).activationHours,13);
});
test('country header order keeps missing FX last, active first and recorded pending activity before unused items',async()=>{
 const {compareInventoryEvaluation:compare}=await import('../lib/meta-ads/inventory-evaluation-order');
 const point=(activation:string,usage:string,fx:number|null,status:string)=>({activation,usage,assessment:{usage:fx,status}});
 const active=point('ACTIVE','USED',1.2,'CRITICAL'),off=point('INACTIVE','USED',0.2,'WITHIN'),pending=point('INACTIVE','TEST',null,'PENDING'),unused=point('INACTIVE','NEVER',null,'PENDING');
 assert(compare(active,off,'activation',false)<0);assert(compare(active,off,'activation',true)>0);
 assert(compare(active,off,'factor',false)<0);assert(compare(pending,active,'factor',true)>0);
 assert(compare(pending,unused,'status',false)<0);assert(compare(pending,undefined,'status',true)<0);
});


test('Hojas: cuatro identidades históricas retiradas cuentan cero sin borrar el catálogo',async()=>{
 const {financialRowPresence}=await import('../lib/meta-ads/financial-row-presence');
 const aliases=['a','b','c','d'].map(id=>({id}));
 assert.deepEqual(financialRowPresence(aliases,aliases.map(a=>({aliasId:a.id,country:'EC',hidden:true})),[],'EC'),[]);
 assert.equal(aliases.length,4);
 assert.equal(financialRowPresence(aliases,aliases.map(a=>({aliasId:a.id,country:'EC',hidden:true})),[],'EC',true).length,4);
});
test('Hojas: el mismo diplomado en dos países cuenta una identidad; apagado fijado permanece presente',async()=>{
 const {financialRowPresence}=await import('../lib/meta-ads/financial-row-presence');
 const rows=financialRowPresence([{id:'a'},{id:'b'}],[{aliasId:'a',country:'PE',hidden:false},{aliasId:'a',country:'EC',hidden:false},{aliasId:'b',country:'PE',hidden:true}],[],'PE');
 assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.aliasId)).size,1);
 assert.deepEqual(financialRowPresence([{id:'a'}],[{aliasId:'a',country:'PE',hidden:false}],[],'PE'),[{aliasId:'a',country:'PE'}]);
});
test('Hojas: una campaña vinculada no resucita el país retirado; otro país conserva presencia y altas sin filas conservan respaldo',async()=>{
 const {financialRowPresence}=await import('../lib/meta-ads/financial-row-presence');
 const aliases=[{id:'a'},{id:'b'}],stored=[{aliasId:'a',country:'PE',hidden:true}];
 assert.deepEqual(financialRowPresence(aliases,stored,[{aliasId:'a',aliasCountry:'PE'}],'PE'),[{aliasId:'b',country:'PE'}]);
 assert.deepEqual(financialRowPresence(aliases,stored,[{aliasId:'a',aliasCountry:'PE'},{aliasId:'a',aliasCountry:'EC'}],'PE'),[{aliasId:'a',country:'EC'},{aliasId:'b',country:'PE'}]);
});


test('Factor de Inventario: regla proporcional sin tope de ventas conserva cero, excepciones y datos pendientes',async()=>{
 const {defaultInventoryLimits,inventoryFactorLimit,inventoryFactorAssessment}=await import('../lib/meta-ads/inventory-factor-policy');
 const limits=defaultInventoryLimits();assert.equal(inventoryFactorLimit(0,limits),25);
 for(const sales of [1,10,11,100,1000,1000000])assert.equal(inventoryFactorLimit(sales,limits),sales*50);
 assert.equal(inventoryFactorAssessment(100,5000,true,limits).status,'ALERT');
 assert.equal(inventoryFactorAssessment(100,4999,true,limits).status,'WITHIN');
 assert.equal(inventoryFactorAssessment(0,25,true,limits).status,'CRITICAL');
 assert.equal(inventoryFactorAssessment(null,5000,true,limits).status,'PENDING');
 assert.equal(inventoryFactorAssessment(100,null,true,limits).status,'PENDING');
 limits[2]=130;assert.equal(inventoryFactorLimit(2,limits),130);assert.equal(inventoryFactorLimit(100,limits),5000);assert.equal(limits.length,11);
});

test('Meta: autorización vencida se distingue de cuota/transitorios y no cuenta como actualización automática disponible',async()=>{
 const {requiresMetaReconnect,MetaGraphError}=await import('../lib/meta-ads/graph-error');
 assert(requiresMetaReconnect('Meta Graph · HTTP 401 · código 190 / subcódigo 463: Session has expired'));
 assert(requiresMetaReconnect(new MetaGraphError(400,{error:{code:190,message:'invalid session'}},'synthetic',{version:'v26.0',endpoint:'ads',fields:'id'})));
 assert(!requiresMetaReconnect(new MetaGraphError(429,{error:{code:4,message:'quota'}},'synthetic',{version:'v26.0',endpoint:'ads',fields:'id'})));
 assert(!requiresMetaReconnect('HTTP 400 · código 100: unknown field'));
 const {syncTiming}=await import('../lib/meta-ads/sync-timing');assert.equal(syncTiming([{id:'a',name:'A',enabled:true,intervalMinutes:30,progress:{status:'error',label:'Reconectar Meta',authorizationRequired:true}}]).automatic,0);
});
test('Estado financiero: críticos primero o mejores primero, datos pendientes siempre al final',async()=>{
 const {compareFinancialStatus}=await import('../lib/meta-ads/inventory-evaluation-order');const source=['PENDING','WITHIN','ALERT','CRITICAL','TESTING'].map(status=>({status}));
 assert.deepEqual([...source].sort((a,b)=>compareFinancialStatus(a.status,b.status,true)).map(x=>x.status),['CRITICAL','ALERT','TESTING','WITHIN','PENDING']);
 assert.deepEqual([...source].sort((a,b)=>compareFinancialStatus(a.status,b.status,false)).map(x=>x.status),['WITHIN','TESTING','ALERT','CRITICAL','PENDING']);assert.equal(compareFinancialStatus(undefined,'CRITICAL',true),1);assert.equal(compareFinancialStatus(undefined,'WITHIN',false),1);
});
test('Orden explícito conserva asesores y secuencia de estado entre categorías, sin duplicar filas ni alterar el agrupado predeterminado',async()=>{
 const {groupFinancialRows,groupFinancialRowsByAdvisor}=await import('../lib/meta-ads/financial-categories');const entries=[{id:'a',name:'A',categoryAssignments:[{category:{id:'ca',name:'Agricultura',kind:'PRIMARY' as const}}]},{id:'b',name:'B',categoryAssignments:[{category:{id:'cb',name:'Calidad',kind:'PRIMARY' as const}}]}];const rows=[{aliasId:'a',country:'PE',advisorId:'d',active:true,rank:4},{aliasId:'b',country:'PE',advisorId:'d',active:true,rank:3},{aliasId:'a',country:'EC',advisorId:'d',active:true,rank:1}];
 assert.deepEqual(groupFinancialRows(rows,entries,{},true).flatMap(b=>b.rows.map(r=>r.rank)),[4,3,1]);assert.equal(groupFinancialRows(rows,entries,{}).length,2);
 const grouped=groupFinancialRowsByAdvisor(rows,entries,{},[{id:'d',name:'DONASYS'}],true);assert.equal(grouped.length,1);assert.deepEqual(grouped[0].bands.flatMap(b=>b.rows.map(r=>r.rank)),[4,3,1]);assert.equal(new Set(grouped[0].bands.flatMap(b=>b.rows.map(r=>r.aliasId+r.country))).size,3);
});

test("Ventas registradas: inicio automático, fecha manual independiente y duplicados por inventario/país", async () => {
  const { parseMetaPreferences } = await import("../lib/meta-ads/preferences");
  const { registeredSalesSummary, validSalesDate } = await import("../lib/meta-ads/registered-sales");
  const base = { inventory: "inventory", name: "Veterinaria", country: "PE", partial: false };
  const entries = [
    { ...base, day: "2026-10-29", sales: null },
    { ...base, day: "2026-10-30", sales: 3 },
    { ...base, day: "2026-10-30", sales: 3 },
    { ...base, day: "2026-10-31", sales: 2 },
    { ...base, country: "EC", day: "2026-10-31", sales: 4 },
    { ...base, day: "2026-11-01", sales: 99 },
  ];
  const auto = registeredSalesSummary(entries, "2026-10-31");
  assert.equal(auto.total, 9);
  assert.equal(auto.since, "2026-10-30");
  assert.equal(auto.firstRecord, "2026-10-30");
  assert.equal(auto.groups.length, 2);
  const manual = registeredSalesSummary(entries, "2026-10-31", "2026-10-31");
  assert.equal(manual.total, 6);
  assert(manual.manual);
  assert.equal(registeredSalesSummary([], "2026-10-31", "2026-10-30").total, null);
  assert.equal(registeredSalesSummary([{ ...base, day: "2026-10-30", sales: 0 }], "2026-10-31").total, 0);
  assert(!validSalesDate("2026-02-30"));
  assert.equal(parseMetaPreferences(JSON.stringify({salesSince:"2026-10-30"})).salesSince,"2026-10-30");
});

test("Asesores: Hoy/Ayer fijan solo valores iniciales; Meta y período permiten rango elegido",async()=>{
 const {advisorAnalysisDefaults}=await import('../lib/meta-ads/advisor-analysis-view');
 assert.deepEqual(advisorAnalysisDefaults('today','2026-10-31','2026-10-01','2026-10-30'),{since:'2026-10-31',until:'2026-10-31',allInventory:true});
 assert.deepEqual(advisorAnalysisDefaults('yesterday','2026-03-01','2026-01-01','2026-02-01'),{since:'2026-02-28',until:'2026-02-28',allInventory:true});
 assert.equal(advisorAnalysisDefaults('meta','2026-10-31','2026-10-10','2026-10-30').since,'2026-10-10');
 assert.equal(advisorAnalysisDefaults('period','2026-10-31','2026-10-10','2026-10-30').allInventory,false);
});
test("Asesores: P/V y G/V respetan origen, misma fecha, monedas y ventas cero",async()=>{
 const {advisorFinancialSummary}=await import('../lib/meta-ads/advisor-financial-summary');
 const financial={currencies:[{currency:'PEN',budget:20,spend:30,sales:2,partial:false}],base:100,metaPartial:false,assignmentPartial:false,updatedAt:'2026-10-30T16:00:00Z'};
 const s=advisorFinancialSummary([{day:'2026-10-30',sales:2,financial}]);
 assert.equal(s.money[0].budgetCac,10);assert.equal(s.money[0].metaCac,15);assert.equal(s.effectiveness,2);
 assert.equal(advisorFinancialSummary([{day:'2026-10-30',sales:0,financial:{...financial,currencies:[{...financial.currencies[0],sales:0}]}}]).money[0].budgetCac,null);
 assert.equal(advisorFinancialSummary([{day:'2026-10-29',sales:2},{day:'2026-10-30',sales:null,financial}]).effectiveness,null);
 assert.equal(advisorFinancialSummary([{day:'2026-10-30',sales:2,financial:{...financial,currencies:[...financial.currencies,{...financial.currencies[0],currency:'USD'}]}}]).money.length,2);
});
test("Asesores: transferencias dentro del día no duplican ni prorratean P/B/G",async()=>{
 const {advisorFinancialMetrics}=await import('../lib/meta-ads/advisor-financial-metrics');
 const day='2026-10-30',asOf=new Date('2026-10-31T03:00:00Z');
 const cell={sales:2,budget:20,sourceBase:100,metaSpend:30,campaigns:1,na:[],partialMetrics:[],updatedAt:'2026-10-30T16:00:00Z'};
 const row:any={aliasId:'item',country:'PE',currency:'PEN',advisorId:'ana',campaigns:1,days:{[day]:cell},changes:[]};
 assert.equal(advisorFinancialMetrics([row],[day],new Set(['ana']),asOf).get('ana')?.[day].currencies[0].budget,20);
 const changes=[{id:'handover',previousAdvisorId:'ana',advisorId:'don',effectiveAt:new Date(day+'T12:00:00-05:00'),createdAt:new Date(day+'T12:00:00-05:00'),mode:'CLOCK',cutoffSales:1}];
 const divided=advisorFinancialMetrics([{...row,advisorId:'don',changes}],[day],new Set(['ana','don']),asOf);
 for(const name of ['ana','don']){assert.equal(divided.get(name)?.[day].currencies[0].budget,null);assert.equal(divided.get(name)?.[day].base,null);assert(divided.get(name)?.[day].assignmentPartial);}
 const attributed=advisorFinancialMetrics([{...row,attributedSales:{[day]:{ana:1,don:1}}}],[day],new Set(['ana']),asOf);
 assert.equal(attributed.get('ana')?.[day].currencies[0].sales,1);
});

test("Meta histórico: anterior a primera asignación pertenece al asesor inicial, ventas y presupuesto conservan sus fechas", async()=>{
 const {advisorFinancialMetrics}=await import('../lib/meta-ads/advisor-financial-metrics');
 const {advisorMetaPeriods}=await import('../lib/meta-ads/advisor-meta-periods');
 const {advisorAssignmentPeriods}=await import('../lib/meta-ads/advisor-periods');
 const changes=[{id:'first',previousAdvisorId:null,advisorId:'don',effectiveAt:new Date('2026-10-29T12:00:00-05:00'),createdAt:new Date('2026-10-29T12:00:00-05:00'),mode:'CLOCK',cutoffSales:0}];
 const old='2026-10-23',asOf=new Date('2026-10-31T20:00:00Z');
 const c={sales:5,budget:20,sourceBase:100,metaSpend:30,campaigns:1,na:[],partialMetrics:[],updatedAt:'2026-10-31T15:00:00Z'};
 const row:any={advisorId:'don',currency:'PEN',campaigns:1,days:{[old]:c},changes,attributedSales:{[old]:{don:2,ana:3}}};
 const data=advisorFinancialMetrics([row],[old],new Set(['don','ana']),asOf);
 assert.equal(data.get('don')?.[old].base,100);assert.equal(data.get('don')?.[old].currencies[0].spend,30);
 assert.equal(data.get('don')?.[old].currencies[0].budget,null);assert.equal(data.get('don')?.[old].currencies[0].sales,2);
 assert.equal(data.get('ana')?.[old].base,null);assert.equal(data.get('ana')?.[old].currencies[0].spend,null);assert.equal(data.get('ana')?.[old].currencies[0].sales,3);assert.equal(data.get('don')?.[old].assignmentPartial,false);
 assert.equal(advisorMetaPeriods('don',changes,asOf)[0].from,null);
 assert.equal(advisorAssignmentPeriods('don',changes,asOf)[0].from,'2026-10-29T17:00:00.000Z');
 assert.equal(changes[0].effectiveAt.toISOString(),'2026-10-29T17:00:00.000Z');
});
test("Meta histórico: futuro cambio conserva principal inicial y no duplica el histórico ni huecos posteriores",async()=>{
 const {advisorMetaPeriods}=await import('../lib/meta-ads/advisor-meta-periods');
 const first={id:'first',previousAdvisorId:null,advisorId:'don',effectiveAt:new Date('2026-10-29T00:00:00-05:00'),createdAt:new Date('2026-10-29T00:00:00-05:00'),mode:'DAY',cutoffSales:null};
 const next={...first,id:'next',previousAdvisorId:'don',advisorId:'ana',effectiveAt:new Date('2026-11-02T00:00:00-05:00'),createdAt:new Date('2026-11-02T00:00:00-05:00')};
 const periods=advisorMetaPeriods('ana',[first,next],new Date('2026-11-03T20:00:00Z'));
 assert.equal(periods.find(p=>p.advisorId==='don')?.from,null);
 assert.equal(periods.find(p=>p.advisorId==='don')?.until,'2026-11-02T05:00:00.000Z');
 assert.equal(periods.find(p=>p.advisorId==='ana')?.from,'2026-11-02T05:00:00.000Z');
 const prior={...next,id:'legacy',previousAdvisorId:'old',effectiveAt:new Date('2026-10-29T00:00:00-05:00'),createdAt:new Date('2026-10-29T00:00:00-05:00')};
 const legacy=advisorMetaPeriods('ana',[prior],new Date('2026-10-31T20:00:00Z'));
 assert.equal(legacy.find(p=>p.from===null)?.advisorId,'old');
});

test("Origen Meta editable: todo, incorporación y fecha personalizada conservan cambios posteriores",async()=>{
 const {advisorMetaPeriods}=await import('../lib/meta-ads/advisor-meta-periods');
 const a={id:'first',previousAdvisorId:null,advisorId:'ana',mode:'DAY',cutoffSales:null,effectiveAt:new Date('2026-10-29T00:00:00-05:00'),createdAt:new Date('2026-10-29T10:00:00-05:00')};
 const b={...a,id:'new',previousAdvisorId:'ana',advisorId:'francesca',effectiveAt:new Date('2026-10-31T00:00:00-05:00'),createdAt:new Date('2026-10-31T10:00:00-05:00')};
 const asOf=new Date('2026-10-31T20:00:00Z');
 assert.equal(advisorMetaPeriods('francesca',[a,b],asOf,{mode:'ALL'}).find(p=>p.advisorId==='ana')?.from,null);
 assert.equal(advisorMetaPeriods('francesca',[a,b],asOf,{mode:'ASSIGNMENT'}).find(p=>p.advisorId==='ana')?.from,a.effectiveAt.toISOString());
 const custom=advisorMetaPeriods('francesca',[a,b],asOf,{mode:'CUSTOM',since:'2026-10-23'});
 assert.equal(Date.parse(custom.find(p=>p.advisorId==='ana')!.from!),Date.parse('2026-10-23T00:00:00-05:00'));
 assert.equal(custom.find(p=>p.advisorId==='francesca')?.from,b.effectiveAt.toISOString());
 const sameDay={...b,effectiveAt:a.effectiveAt};
 const bootstrap=advisorMetaPeriods('francesca',[a,sameDay],asOf);
 assert.equal(bootstrap.find(p=>p.from===null)?.advisorId,'ana');
 assert.equal(bootstrap.find(p=>p.advisorId==='francesca')?.from,a.effectiveAt.toISOString());
});
