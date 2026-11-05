import {db} from '../db';
import {demand} from '../errors';
import {ownerOnly,checkFinancialContext,financialContext} from './financial-access';
import {effectiveness} from './effectiveness';
import {sheetAnalysis} from './sheet-analysis';
import {totalsProductDetail} from './totals-product-detail';
import type {Actor} from './service';
/** Resolve the exact selected inventory names before every financial source read. */
export async function selectionAnalysis(actor:Actor,q:{listId:string;tableId:string;country:string;names:string[];since:string;until:string}){
 ownerOnly(actor);await checkFinancialContext(actor,db);
 const cap=financialContext(actor);demand(!cap||cap.access.isOwner||cap.scope==='ALL'||cap.tableIds.includes(q.tableId),'Hoja fuera del documento.',403);
 const aliases=await db.metaAlias.findMany({where:{tableId:q.tableId,inventorySheetId:q.listId,name:{in:q.names}},select:{id:true,name:true}});
 demand(aliases.length===q.names.length,'Uno de los diplomados seleccionados no tiene vínculo con esta hoja. Actualiza la selección.',409);
 const target={names:aliases.map(a=>a.name),country:q.country};
 const sheet=await effectiveness(actor,q.tableId,q.since,q.until,db,[],false,target);
 const currencies=[...new Set(sheet.rows.filter(r=>r.country===q.country).map(r=>r.currency))];
 const [analysis,products]=await Promise.all([sheetAnalysis(actor,{tableId:q.tableId,since:q.since,until:q.until,target}),Promise.all(currencies.map(currency=>totalsProductDetail(actor,{tableId:q.tableId,country:q.country,currency,since:q.since,until:q.until,target})))]);
 return {sheet,analysis,products};
}
export type SelectionAnalysis=Awaited<ReturnType<typeof selectionAnalysis>>;
