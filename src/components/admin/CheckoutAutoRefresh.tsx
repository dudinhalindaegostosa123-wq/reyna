'use client'
import {useEffect} from 'react'
import {useRouter} from 'next/navigation'
export default function CheckoutAutoRefresh(){
 const router=useRouter()
 useEffect(()=>{
  const refresh=()=>{
   if(document.visibilityState!=='visible' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ''))return
   router.refresh()
  }
  const timer=setInterval(refresh,30000)
  document.addEventListener('visibilitychange',refresh)
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
 },[router])
 return null
}
