"use client";
import {useEffect,useId,useRef,useState,type ComponentPropsWithRef} from "react";
type Props=Omit<ComponentPropsWithRef<"input">,"type">&{secretLabel?:string};
export function PasswordInput({ref,id,secretLabel,...props}:Props){
 const generatedId=useId(),inputRef=useRef<HTMLInputElement|null>(null),[visible,setVisible]=useState(false);
 const inputId=id??generatedId,label=secretLabel??(/password/i.test(props.name??"")?"contraseña":"contenido"),action=(visible?"Ocultar ":"Mostrar ")+label;
 useEffect(()=>{setVisible(false);},[props.name,props.autoComplete]);
 useEffect(()=>{if(props.value==='')setVisible(false);},[props.value]);
 useEffect(()=>{const form=inputRef.current?.form;if(!form)return;const hide=()=>setVisible(false);form.addEventListener('reset',hide);form.addEventListener('submit',hide);return()=>{form.removeEventListener('reset',hide);form.removeEventListener('submit',hide);};},[]);
 return <span className="password-input">
  <input {...props} id={inputId} data-secret-input type={visible?"text":"password"} ref={node=>{inputRef.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}} />
  <button type="button" className="password-toggle" aria-label={action} title={action} aria-controls={inputId} aria-pressed={visible} disabled={props.disabled} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.preventDefault();setVisible(value=>!value);}}>
   <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible&&<path d="m3 3 18 18"/>}</svg>
  </button>
 </span>;
}
