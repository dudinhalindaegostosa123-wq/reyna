import type {Metadata} from 'next'
import GuestTrackingClient from './GuestTrackingClient'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Acompanhar pedido',robots:{index:false,follow:false},referrer:'no-referrer'}
export default function TrackingPage(){return <GuestTrackingClient/>}
