import AdminNavigation from '@/components/admin/AdminNavigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Administração',
  robots: { index: false, follow: false },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#292621] lg:flex">
      <AdminNavigation />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  )
}
