'use client'
import {useEffect} from 'react'
import {usePathname} from 'next/navigation'
import {useCartStore} from '@/lib/cart'
import {addedCartItems} from '@/lib/analytics-model'
import {configureGoogleAnalytics,rememberAdClick,trackAnalyticsPage,trackCartEvent} from '@/lib/google-analytics'
export default function CommerceAnalytics({enabled,measurementId}:{enabled:boolean;measurementId:string|null}){
 const pathname=usePathname()
 useEffect(()=>{
  configureGoogleAnalytics(measurementId,enabled)
  if(!enabled || !measurementId)return
  rememberAdClick();trackAnalyticsPage()
  if(pathname==='/carrinho')trackCartEvent('view_cart',useCartStore.getState().items)
  if(pathname==='/checkout')trackCartEvent('begin_checkout',useCartStore.getState().items)
 },[enabled,measurementId,pathname])
 useEffect(()=>{
  if(!enabled || !measurementId)return
  let previous=useCartStore.getState().items
  const unsubscribe=useCartStore.subscribe(state=>{
   if(!useCartStore.persist.hasHydrated()){previous=state.items;return}
   const added=addedCartItems(previous,state.items);previous=state.items
   if(added.length)trackCartEvent('add_to_cart',added)
  })
  const hydrated=useCartStore.persist.onFinishHydration(state=>{previous=state.items;if(pathname==='/carrinho')trackCartEvent('view_cart',state.items);if(pathname==='/checkout')trackCartEvent('begin_checkout',state.items)})
  return ()=>{unsubscribe();hydrated()}
 },[enabled,measurementId,pathname])
 return null
}
