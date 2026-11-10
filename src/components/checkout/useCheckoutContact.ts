'use client'
import {useEffect} from 'react'
import type {CartItem} from '@/lib/cart'
import {checkoutContact} from '@/lib/checkout-contact'
export function useCheckoutContact({id,name,email,phone,items,enabled}:{id:string;name:string;email:string;phone?:string;items:CartItem[];enabled:boolean}) {
 const cart=JSON.stringify(items.slice(0,100).map(item=>({name:item.name.slice(0,180),slug:item.slug.slice(0,250),quantity:item.quantity})))
 const estimatedCents=Math.round(items.reduce((total,item)=>total+item.price*item.quantity,0)*100)
 useEffect(()=>{
  if(!enabled || !id)return
  let token:string
  try{
   token=sessionStorage.getItem('serenity-checkout-contact-token-v1') || crypto.randomUUID()
   sessionStorage.setItem('serenity-checkout-contact-token-v1',token)
  }catch{return}
  const contact=checkoutContact({id,token,name,email,phone,items:JSON.parse(cart),estimatedCents})
  if(!contact)return
  const body=JSON.stringify(contact)
  const send=()=>{void fetch('/api/checkout/contato',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})}
  const timer=setTimeout(send,1500)
  let lastInteraction=Date.now()
  const interaction=()=>{lastInteraction=Date.now()}
  const heartbeat=setInterval(()=>{if(document.visibilityState==='visible' && Date.now()-lastInteraction<=60000)send()},60000)
  document.addEventListener('input',interaction)
  document.addEventListener('pointerdown',interaction)
  const visible=()=>{if(document.visibilityState==='hidden')send()}
  window.addEventListener('pagehide',send)
  window.addEventListener('serenity-checkout-contact-flush',send)
  document.addEventListener('visibilitychange',visible)
  return ()=>{clearTimeout(timer);clearInterval(heartbeat);window.removeEventListener('pagehide',send);window.removeEventListener('serenity-checkout-contact-flush',send);document.removeEventListener('visibilitychange',visible);document.removeEventListener('input',interaction);document.removeEventListener('pointerdown',interaction)}
 },[id,name,email,phone,cart,estimatedCents,enabled])
}
