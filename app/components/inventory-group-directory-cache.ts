"use client";
import { CoalescedReadCache } from "../../lib/coalesced-read-cache";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
const cache = new CoalescedReadCache<TrialDirectory>();
/** Scope by authenticated user AND financial document; never persist directory data. */
export function readGroupDirectory(userId:string,listId:string,load:()=>Promise<TrialDirectory>,refresh=false) {
  if(!userId)return load();
  const scope=document.querySelector("[data-effectiveness-document]")?.getAttribute("data-effectiveness-document")??"ALL";
  return cache.read(JSON.stringify([userId,scope,listId]),load,refresh);
}
export function invalidateGroupDirectories(){cache.clear();}

/** FX lookup is a read sent as POST and cannot change catalog/group membership. */
export function invalidatesGroupDirectory(path:string,method:string){
  return method !== "GET" && !/(?:^|\/)effectiveness\/fx(?:\?|$)/.test(path);
}
