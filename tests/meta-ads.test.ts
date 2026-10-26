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
