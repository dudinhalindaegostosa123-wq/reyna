export interface FacetProduct {id:string;material:string;category_slugs:string[];jewelry_filters:string[]}
interface Option {value:string;label:string}
export interface FacetSelection {area:string;subarea:string;jewelry:string;material:string}
export function availableCatalogFilters(rows:FacetProduct[],selection:FacetSelection,options:{areas:Option[];subareas:Option[];jewelry:Option[]},matchesArea:(slugs:string[],area:string,subarea:string)=>boolean){
 const jewelryMatches=(row:FacetProduct,value=selection.jewelry)=>value==='all' || row.jewelry_filters.includes(value) || (value==='topo-rosca-16' && row.jewelry_filters.includes('micro-surface-16'))
 const materialMatches=(row:FacetProduct)=>selection.material==='all' || row.material===selection.material
 const areaMatches=(row:FacetProduct,area=selection.area,subarea=selection.subarea)=>matchesArea(row.category_slugs,area,subarea)
 return {
  areas:options.areas.filter(option=>option.value==='all' || rows.some(row=>materialMatches(row) && jewelryMatches(row) && areaMatches(row,option.value,'all'))),
  subareas:options.subareas.filter(option=>option.value==='all' || rows.some(row=>materialMatches(row) && jewelryMatches(row) && areaMatches(row,selection.area,option.value))),
  jewelry:options.jewelry.filter(option=>option.value==='all' || rows.some(row=>materialMatches(row) && areaMatches(row) && jewelryMatches(row,option.value))),
  materials:Array.from(new Set(rows.filter(row=>areaMatches(row) && jewelryMatches(row)).map(row=>row.material).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR')),
 }
}
