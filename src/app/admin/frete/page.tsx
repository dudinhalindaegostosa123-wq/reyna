
import { adminDatabase } from '@/lib/admin-auth'
import { shippingSettings } from '@/lib/shipping-server'
import { loadLabelSender } from '@/lib/label-draft-server'
import LabelSenderForm from '@/components/admin/LabelSenderForm'
import ShippingSettingsForm from './ShippingSettingsForm'
import ShippingTest from './ShippingTest'
import ShippingDashboard from './ShippingDashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Envios | Administração Lunarity',
}

export default async function ShippingPage() {
  const { db } = await adminDatabase()
  const settings = await shippingSettings(db)
  const sender = await loadLabelSender(db, settings.origin)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <ShippingDashboard
        settingsForm={
          <ShippingSettingsForm settings={settings} />
        }
        senderForm={sender.version > 0 ? <LabelSenderForm initial={sender} /> : (
          <p className="rounded-2xl bg-white p-5 text-sm">A emissão de etiquetas ainda precisa ser configurada. Você já pode salvar os dados reais da embalagem e o CEP de origem acima.</p>
        )}
        shippingTest={<ShippingTest />}
      />
    </div>
  )
}
