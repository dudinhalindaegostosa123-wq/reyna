import { getCommercePolicy } from '@/lib/commerce-server'
export const dynamic='force-dynamic'
export async function GET(){return Response.json(await getCommercePolicy(),{headers:{'Cache-Control':'no-store'}})}
