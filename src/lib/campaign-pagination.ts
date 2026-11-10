/** Page size limits request size, never campaign membership. Errors discard partial results. */
export async function readCampaignPages<T>(readPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<{data:T[];error:unknown}>{
 const data:T[]=[]
 for(let offset=0;;offset+=500){
  const page=await readPage(offset,offset+499)
  if(page.error)return {data:[],error:page.error}
  data.push(...(page.data || []))
  if(!page.data || page.data.length<500)return {data,error:null}
 }
}
