import { NextResponse } from 'next/server'
import { pixDiscountEnabled } from '@/lib/pix-discount-server'
import { showCollectionCampaign } from '@/lib/collection-server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const [enabled, pix] = await Promise.all([showCollectionCampaign(), pixDiscountEnabled()])
    return NextResponse.json({ enabled, pix }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
