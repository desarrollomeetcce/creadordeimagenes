"use client";
import {useEffect,useRef,useState} from "react";
import type {OrderProgress} from "./order-progress";
const active=(o:OrderProgress)=>o.running>0||["QUEUED","STARTING","ACTIVE","PAUSING"].includes(o.status);
export function useSubproductStatuses(project:string,product:string){
 const [orders,setOrders]=useState<Record<string,OrderProgress>>({});
 const latest=useRef(orders);latest.current=orders;
 useEffect(()=>{const controller=new AbortController();let fetching=false;
  const load=async()=>{if(fetching||controller.signal.aborted||document.visibilityState!=="visible")return;fetching=true;try{const r=await fetch('/api/orders?'+new URLSearchParams({project,product,includeClosed:"true"}),{signal:controller.signal,cache:'no-store'});if(!r.ok)return;const rows:OrderProgress[]=await r.json();const next:Record<string,OrderProgress>={};for(const row of rows){const id=row.scope?.subproduct;if(id&&(!next[id]||row.createdAt>next[id].createdAt))next[id]=row;}if(!controller.signal.aborted){latest.current=next;setOrders(next);}}catch{}finally{fetching=false;}};
  void load();const timer=setInterval(()=>{if(Object.values(latest.current).some(active))void load();},5000);const channel=new BroadcastChannel('studio-updates');channel.onmessage=()=>void load();const focus=()=>void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{controller.abort();clearInterval(timer);channel.close();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[project,product]);return orders;
}
export function SubproductStatus({order}:{order?:OrderProgress}){
 if(!order)return <span className="badge subproduct-status">Sin orden</span>;
 const error=order.status!=="STOPPED"&&(order.failed>0||order.uncertain>0||["NEEDS_REVIEW","DISPATCH_UNCERTAIN"].includes(order.status));
 const label=error?"Error · revisar":({QUEUED:"Pendiente · en cola",STARTING:"Pendiente · iniciando",ACTIVE:"En producción",PAUSING:"Pausando",PAUSED:"En pausa",STOPPED:"Detenido",REVIEW:"Pendiente de aprobación",COMPLETED:"Completado",ACCEPTED:"Completado"}[order.status]??order.status);
 return <span role="status" aria-live="polite" className={'badge subproduct-status '+(error?'status-error':['COMPLETED','ACCEPTED'].includes(order.status)?'status-completed':'status-pending')}>{label} · {order.completed}/{order.target}</span>;
}
