/** Short-lived, bounded memory only. Failed or invalidated reads never populate the cache. */
export class CoalescedReadCache<T> {
  private entries = new Map<string,{expires:number;promise:Promise<T>}>();
  constructor(private ttl=15000, private capacity=10, private now=Date.now) {}
  read(key:string, load:()=>Promise<T>, refresh=false):Promise<T> {
    const prior=this.entries.get(key);
    if(!refresh && prior && prior.expires>this.now()) return prior.promise;
    const entry={expires:Infinity,promise:Promise.resolve().then(load)};
    this.entries.delete(key);
    this.entries.set(key,entry);
    while(this.entries.size>this.capacity) this.entries.delete(this.entries.keys().next().value!);
    void entry.promise.then(()=>{if(this.entries.get(key)===entry)entry.expires=this.now()+this.ttl;},()=>{if(this.entries.get(key)===entry)this.entries.delete(key);});
    return entry.promise;
  }
  clear(){this.entries.clear();}
}
