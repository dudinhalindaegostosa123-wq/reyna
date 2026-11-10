import type {ImportedVariation} from './data'
export type VariationDimension={key:string;label:string;kind:'gauge'|'length'|'other';values:string[]}
export type VariationDimensions={fields:VariationDimension[];rows:{id:string;values:Record<string,string>;available:boolean}[]}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_:()-]+/g,' ').replace(/\s+/g,' ').trim()
function field(label:string):Omit<VariationDimension,'values'>{
 const text=normalize(label)
 if(/espessur|calibre|bitola/.test(text) && !/rosca/.test(text))return {key:'gauge',label:'Espessura (calibre)',kind:'gauge'}
 if(/comprimento/.test(text) && !/pedra|topo|cristal|zirc|navete|decorativ/.test(text))return {key:'length',label:'Comprimento da haste',kind:'length'}
 return {key:`other:${text}`,label:label.replace(/:+$/,'').trim(),kind:'other'}
}
export function buildVariationDimensions(variations:ImportedVariation[]):VariationDimensions|null{
 if(!variations.length)return null
 const fields=new Map<string,VariationDimension>(),rows:VariationDimensions['rows']=[]
 let expected=''
 const seen=new Set<string>(),ids=new Set<string>()
 for(const variation of variations){
  if(!variation.id || ids.has(variation.id))return null
  ids.add(variation.id)
  const attributes=variation.attributes
  if(!attributes || typeof attributes!=='object' || Array.isArray(attributes))return null
  const values:Record<string,string>={}
  for(const [label,input] of Object.entries(attributes)){
   if(typeof input!=='string' || !input.trim() || !label.trim())return null
   const descriptor=field(label),value=input.trim().replace(/\s+/g,' ')
   if(values[descriptor.key]!==undefined)return null
   values[descriptor.key]=value
   const existing=fields.get(descriptor.key) || {...descriptor,values:[]}
   if(!existing.values.includes(value))existing.values.push(value)
   fields.set(descriptor.key,existing)
  }
  const keys=Object.keys(values).sort(),schema=JSON.stringify(keys)
  if(!expected)expected=schema
  if(schema!==expected)return null
  const combination=JSON.stringify(keys.map(key=>[key,values[key]]))
  if(seen.has(combination))return null // Keep the original SKU list if dimensions cannot identify one SKU.
  seen.add(combination)
  rows.push({id:variation.id,values,available:variation.inStock && variation.priceAvailable})
 }
 if(!fields.has('gauge') && !fields.has('length'))return null
 const rank=(item:VariationDimension)=>item.kind==='gauge'?0:item.kind==='length'?1:2
 const ordered=Array.from(fields.values()).sort((a,b)=>rank(a)-rank(b))
 for(const item of ordered)item.values.sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))
 return {fields:ordered,rows}
}
export function dimensionValues(model:VariationDimensions,id:string):Record<string,string>{
 return {...(model.rows.find(row=>row.id===id)?.values || {})}
}
export function dimensionAvailable(model:VariationDimensions,values:Record<string,string>,key:string,value:string){
 const index=model.fields.findIndex(item=>item.key===key)
 return model.rows.some(row=>row.available && row.values[key]===value && model.fields.slice(0,index).every(field=>!values[field.key] || row.values[field.key]===values[field.key]))
}
export function selectDimension(model:VariationDimensions,values:Record<string,string>,key:string,value:string){
 const next={...values,[key]:value},index=model.fields.findIndex(item=>item.key===key)
 let clear=false
 for(const item of model.fields.slice(index+1)){
  if(clear || next[item.key] && !dimensionAvailable(model,next,item.key,next[item.key])){delete next[item.key];clear=true}
 }
 const complete=model.fields.every(item=>Boolean(next[item.key]))
 const row=complete?model.rows.find(row=>model.fields.every(item=>row.values[item.key]===next[item.key])):null
 return {values:next,id:row?.id || ''}
}
export function dimensionLabel(value:string){
 const measurement=/^\s*(\d+(?:[.,]\d+)?)\s*mm\s*$/i.exec(value)
 return measurement?`${measurement[1].replace('.',',')} mm`:value
}
