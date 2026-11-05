const signatures=new WeakMap<object,string>();
/** Compare all returned fields, including permissions, FX and provider amounts; never only CAS tokens. */
export function reuseFinancialResponse<T extends object>(previous:T|null,next:T):T {
 if(!previous)return next;
 const signature=(value:T)=>{let s=signatures.get(value);if(s===undefined){s=JSON.stringify(value);signatures.set(value,s);}return s;};
 return signature(previous)===signature(next)?previous:next;
}
