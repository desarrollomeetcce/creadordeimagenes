"use client";
import type { InstructionPolicy } from "../../lib/instruction-policy";
export function InstructionPolicyControls({scope,value,onChange}:{scope:"project"|"category"|"subproduct";value:InstructionPolicy;onChange:(value:InstructionPolicy)=>void}){
 const select=(key:"includeSelf"|"includeProject"|"includeProduct",label:string)=><label key={key}>{label}<select value={value[key]===false?"no":"yes"} onChange={e=>onChange({...value,[key]:e.target.value==="yes"})}><option value="yes">Sí considerar</option><option value="no">No considerar</option></select></label>;
 return <div className="fields instruction-policy-controls">{select("includeSelf","Instrucciones de este "+({project:"proyecto",category:"producto",subproduct:"subproducto"}[scope]))}{scope!=="project"&&select("includeProject","Instrucciones del proyecto")}{scope==="subproduct"&&select("includeProduct","Instrucciones del producto")}<small>Desactivar conserva el texto. Los adjuntos y la marca mantienen su uso. Las desactivaciones de niveles superiores también se respetan.</small></div>;
}
