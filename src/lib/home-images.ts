import type { SiteBanner } from './banner-ui'
import { STONE_COLORS } from './stone-colors'
export const MINI_BANNER_TARGETS=[
  {name:'Hastes e conectores',href:'/categoria/hastes-e-conectores'},
  {name:'Correntes e pingentes',href:'/categoria/correntes-e-pingentes'},
  {name:'Argolas',href:'/categoria/argolas'},
  {name:'Labret',href:'/categoria/labret'},
]
export const COLOR_BANNER_TARGETS=STONE_COLORS.map(color=>({name:color.name,href:`/cores/${color.id}`}))
export function bannerPlacement(banner:Pick<SiteBanner,'slot'|'cta'>):'hero'|'category'|'mini'|'stone' {
  return banner.slot==='category' && banner.cta==='home-mini-v1'?'mini':banner.slot==='category' && banner.cta==='home-stone-v1'?'stone':banner.slot
}
export function homeImageMap(banners:SiteBanner[]|null,placement:'mini'|'stone') {
  const result:Record<string,string>={}
  for(const banner of banners || []) if(bannerPlacement(banner)===placement && !result[banner.href]) result[banner.href]=banner.image_desktop
  return result
}
