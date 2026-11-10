'use client'
import { useEffect } from 'react'
import { useCartStore } from '@/lib/cart'
export default function CommerceSync() {
  useEffect(()=>{
    const controller=new AbortController()
    const update=async()=>{
      if(document.visibilityState==='hidden') return
      try{
        const response=await fetch('/api/comercio',{cache:'no-store',signal:controller.signal})
        if(response.ok){const policy=await response.json();if(typeof policy.included_stems==='boolean' && [0,15].includes(policy.anodization_fee)) useCartStore.getState().applyCommercePolicy(policy)}
      }catch{}
    }
    void update();window.addEventListener('focus',update);document.addEventListener('visibilitychange',update)
    return ()=>{controller.abort();window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}
  },[])
  return null
}
