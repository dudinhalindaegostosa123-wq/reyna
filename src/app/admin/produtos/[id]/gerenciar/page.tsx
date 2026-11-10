import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'

export default async function ProductManagement({ params }: {
  params: { id: string }
}) {
  await requireAdmin()
  redirect(`/admin/produtos/${encodeURIComponent(params.id)}`)
}
