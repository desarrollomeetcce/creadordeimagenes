import { AppError } from "./errors";
type Job={status:string;error?:string|null;snapshot:unknown;variation?:{reviewStatus:string;deletedAt:Date|null}|null};
export function orderRecovery(status:string,jobs:Job[],message:string|null,canManage:boolean){
 if(["STOPPED","COMPLETED","ACCEPTED"].includes(status))return {canContinuePending:false,canApproveSample:false,canRetry:false,retryCount:0,recoveryHint:null,error:message,needsConnectionReview:false};
 const pending=jobs.some(j=>j.status==="PENDING"),running=jobs.some(j=>j.status==="RUNNING"),failed=jobs.some(j=>j.status==="FAILED"),uncertain=jobs.some(j=>j.status==="UNCERTAIN");
 const sample=jobs.find(j=>{const s=j.snapshot as Record<string,unknown>;return s.previewFirst===true&&s.index===0;});
 const needsApproval=!!sample&&sample.variation?.reviewStatus!=="APPROVED";
 const interrupted=status==="NEEDS_REVIEW";
 const canContinuePending=canManage&&interrupted&&pending&&!running&&!failed&&!uncertain&&!needsApproval;
 const canApproveSample=canManage&&["REVIEW","NEEDS_REVIEW"].includes(status)&&pending&&!running&&!failed&&!uncertain&&needsApproval&&!!sample?.variation&&!sample.variation.deletedAt;
 const retryCount=jobs.filter(j=>["PENDING","FAILED","UNCERTAIN"].includes(j.status)).length;
 const canRetry=canManage&&["NEEDS_REVIEW","PAUSED"].includes(status)&&!running&&(failed||uncertain);
 let hint:string|null=null;
 if(uncertain)hint="La generación está en pausa. El intento anterior puede tener un cargo. Reintentar requiere tu confirmación y conserva las imágenes terminadas.";
 else if(failed)hint="La generación está en pausa por un error. Puedes reintentar lo no completado; las imágenes terminadas se conservan.";
 else if(status==="DISPATCH_UNCERTAIN")hint="No se confirmó el envío al ejecutor. Usa Comprobar ejecutor antes de cualquier continuación.";
 else if(canContinuePending)hint="La muestra está aprobada y se conserva. Puedes continuar solo las imágenes pendientes; las terminadas no se vuelven a generar.";
 else if(canApproveSample)hint="La muestra se conserva. Apruébala para continuar únicamente con las imágenes pendientes.";
 const detail=message&&message.trim().length>10?message:jobs.find(j=>j.error&&j.error.trim().length>10)?.error;
 const error=detail??(interrupted?"La ejecución se interrumpió antes de completar el lote. La imagen ya generada se conserva. Revisa la acción disponible para continuar.":null);
 return {canContinuePending,canApproveSample,canRetry,retryCount,recoveryHint:hint,error,needsConnectionReview:!!error&&/verificar la conexión|verifica.*conexión|conexión.*verific|no admite el modelo|OpenAI rechazó|modelo o los parámetros/i.test(error)};
}
/** Do not expose exception bodies, SQL, provider responses or credentials. */
export function continuationError(error:unknown){
 if(error instanceof AppError)return error.message;
 return "No se pudo preparar la siguiente imagen (ORDEN_CONTINUACION). La muestra aprobada se conserva. Puedes volver a intentar continuar solo las pendientes.";
}
export function reportContinuationError(orderId:string,error:unknown){
 const code=error&&typeof error==="object"&&"code" in error&&typeof error.code==="string"&&/^P(?:1000|1001|1002|1008|1017|2024|2028)$/.test(error.code)?error.code:error instanceof AppError?"VALIDATION":"INTERNAL";
 console.error(JSON.stringify({event:"order_continuation_failed",orderId,code}));
}
