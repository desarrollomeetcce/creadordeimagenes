"use client";
import {useContext,useEffect,useMemo,useState} from "react";
import {CurrentUserId} from "./role-guide";
type Choices={previewFirst:boolean;charge:boolean};
function readChoices(key:string):Choices{
 try{
  const raw=typeof window==="undefined"?null:sessionStorage.getItem(key);
  const saved=raw&&raw.length<200?JSON.parse(raw):null;
  return {previewFirst:typeof saved?.previewFirst==="boolean"?saved.previewFirst:true,charge:typeof saved?.charge==="boolean"?saved.charge:true};
 }catch{return {previewFirst:true,charge:true};}
}
export function useGenerationChoices(scope:string,id:string){
 const userId=useContext(CurrentUserId),key=`studio-generation-choices:v1:${userId}:${scope}:${id}`;
 const stored=useMemo(()=>readChoices(key),[key]);
 const [entry,setEntry]=useState(()=>({key,value:stored}));
 const choices=entry.key===key?entry.value:stored;
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(choices));}catch{/* Preferences are optional. */}},[key,choices]);
 const change=(field:keyof Choices,value:boolean)=>setEntry(current=>({key,value:{...(current.key===key?current.value:stored),[field]:value}}));
 return {...choices,setPreviewFirst:(value:boolean)=>change("previewFirst",value),setCharge:(value:boolean)=>change("charge",value)};
}
