import type { Metadata } from 'next'
import PasswordRecoveryForm from '@/components/PasswordRecoveryForm'
export const metadata: Metadata = { title: 'Recuperar senha', robots: { index: false, follow: false } }
export default function RecoveryPage({ searchParams = {} }: { searchParams?: { erro?: string } }) {
  return <PasswordRecoveryForm invalid={searchParams.erro === 'link'} />
}
