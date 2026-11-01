"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchJsonResponse} from '../../lib/http-response';
type Target={id:string;accountId:string};
type Result={updated:boolean;checkedAt?:string|null;waiting?:boolean;authorizationRequired?:boolean;error?:string|null};
/** A separate, bounded read of the visible page; full catalogue/history imports keep their cursors. */
export function MetaVisibleRefresh({items,accounts,onUpdated,onReconnect}:{items:Target[];accounts:{id:string;canSync:boolean}[];onUpdated:()=>void;onReconnect:()=>void}){
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[auth,setAuth]=useState(false),running=useRef(false);
  const allowed=new Set(accounts.filter(a=>a.canSync).map(a=>a.id));
  const key=JSON.stringify(items.filter(o=>allowed.has(o.accountId)).map(o=>[o.accountId,o.id]));
  const refresh=useCallback(async()=>{
    if(running.current||document.visibilityState!=='visible')return;
    const pairs=JSON.parse(key) as string[][];if(!pairs.length)return;
    running.current=true;setBusy(true);let changed=false,needsAuth=false,latest='',errors:string[]=[];
    try{
      const grouped=new Map<string,string[]>();for(const[a,id]of pairs)grouped.set(a,[...(grouped.get(a)??[]),id]);
      // Sequential accounts share the provider's quota and avoid bursts across a large selection.
      for(const[accountId,objects]of grouped){
        try{
          const r:Result=await fetchJsonResponse('/api/meta-ads/accounts/'+accountId+'/refresh-visible',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({objects})});
          changed ||= r.updated;needsAuth ||= !!r.authorizationRequired;
          if(r.checkedAt&&r.checkedAt>latest)latest=r.checkedAt;
          if(r.error)errors.push(r.error);else if(r.waiting&&!r.checkedAt)errors.push('Esperando el turno de actualización de Meta.');
        }catch(e){errors.push(e instanceof Error?e.message:'No se pudo actualizar esta vista.');}
      }
      setAuth(needsAuth);
      setNotice(errors.length?errors[0]:latest?'Vista consultada: '+new Date(latest).toLocaleTimeString('es-PE',{timeZone:'America/Lima'}):'Esperando la próxima lectura.');
      if(changed)onUpdated();
    }finally{running.current=false;setBusy(false);}
  },[key,onUpdated]);
  useEffect(()=>{const tick=()=>{void refresh();};const first=setTimeout(tick,1000),timer=setInterval(tick,60000);window.addEventListener('focus',tick);return()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener('focus',tick);};},[refresh]);
  if(key==='[]')return null;
  return <section className="meta-visible-refresh" aria-label="Actualización breve de Meta"><button type="button" disabled={busy} onClick={()=>void refresh()} title="Consulta estados y gasto de hoy y ayer de los elementos visibles. No espera al histórico ni cambia las campañas.">{busy?'↻ Consultando Meta…':'↻ Actualizar vista'}</button><small role="status">{notice||'Estados y gasto de hoy/ayer · consulta cada 60 s'}</small>{auth&&<button type="button" onClick={onReconnect}>Reconectar Meta</button>}<small>Meta puede entregar métricas con retraso.</small></section>;
}
