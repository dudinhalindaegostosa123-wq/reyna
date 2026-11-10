
'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Box,
  ClipboardList,
  MapPin,
  Package,
  Settings2,
  TestTube2,
  Truck,
  Tag,
  CheckCircle2,
} from 'lucide-react'

type Tab = 'overview' | 'settings' | 'test'
type SettingsSection = 'package' | 'sender'

type Props = {
  settingsForm: ReactNode
  senderForm: ReactNode
  shippingTest: ReactNode
}

export default function ShippingDashboard({
  settingsForm,
  senderForm,
  shippingTest,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [section, setSection] =
    useState<SettingsSection>('package')

  const openSettings = (target: SettingsSection) => {
    setSection(target)
    setTab('settings')
  }

  const tabs = [
    {
      id: 'overview' as const,
      label: 'Visão geral',
      icon: ClipboardList,
    },
    {
      id: 'settings' as const,
      label: 'Configurações',
      icon: Settings2,
    },
    {
      id: 'test' as const,
      label: 'Testar frete',
      icon: TestTube2,
    },
  ]

  return (
    <div className="space-y-7 text-[#302B27]">
      {/* Cabeçalho */}
      <header>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[#9A8977]">
          <Package size={15} />
          Painel administrativo
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Envios
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#756B5D]">
              Gerencie seus fretes e configurações em um só lugar.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#E8DFD5] bg-white px-4 py-2 text-xs font-medium text-[#756B5D]">
            <Truck size={16} />
            Melhor Envio
          </div>
        </div>
      </header>

      {/* Navegação */}
      <nav
        aria-label="Seções de envios"
        className="flex flex-wrap gap-1 rounded-2xl border border-[#EAE2D9] bg-[#F5F1EC] p-1.5"
      >
        {tabs.map(item => {
          const Icon = item.icon
          const active = tab === item.id

          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(item.id)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-medium transition-all sm:text-sm ${
                active
                  ? 'bg-white text-[#302B27] shadow-sm'
                  : 'text-[#817568] hover:bg-white/60'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Visão geral */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#E8DFD5] bg-white p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-[#F5F1EC] p-3 text-[#786855]">
                <Truck size={23} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-medium">
                  Integração Melhor Envio
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#817568]">
                  Configure os dados da loja, prepare suas embalagens
                  e consulte as opções de entrega disponíveis.
                </p>

                <button
                  type="button"
                  onClick={() => setTab('test')}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#665443] transition hover:opacity-70"
                >
                  Verificar conexão
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </section>

          <div>
            <h2 className="mb-4 text-lg font-medium">
              Gerenciamento
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuickCard
                icon={<Package size={22} />}
                title="Pedidos"
                description="Acompanhe os pedidos que precisam ser enviados."
                onClick={() => {
                  window.location.href = '/admin/pedidos'
                }}
              />

              <QuickCard
                icon={<Tag size={22} />}
                title="Etiquetas"
                description="Prepare, compre e imprima as etiquetas em um só lugar."
                onClick={() => {
                  window.location.href = '/admin/etiquetas'
                }}
              />

              <QuickCard
                icon={<MapPin size={22} />}
                title="Remetente"
                description="Atualize o endereço e os dados da sua loja."
                onClick={() => openSettings('sender')}
              />

              <QuickCard
                icon={<Box size={22} />}
                title="Embalagem"
                description="Defina medidas, peso e configurações de frete."
                onClick={() => openSettings('package')}
              />
            </div>
          </div>

          <section className="rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={20}
                className="mt-0.5 shrink-0 text-[#87765F]"
              />
              <div>
                <h3 className="text-sm font-medium">
                  Tudo em um só lugar
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[#817568]">
                  Antes de realizar um envio, confira os dados
                  do remetente e as medidas da embalagem.
                  Depois, utilize o simulador para consultar o frete.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Configurações */}
      {tab === 'settings' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-medium">
              Configurações de envio
            </h2>
            <p className="mt-2 text-sm text-[#817568]">
              Organize as informações utilizadas no cálculo
              de frete e na preparação das entregas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSection('package')}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                section === 'package'
                  ? 'border-[#665443] bg-[#665443] text-white'
                  : 'border-[#E8DFD5] bg-white text-[#756B5D]'
              }`}
            >
              Embalagem
            </button>

            <button
              type="button"
              onClick={() => setSection('sender')}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                section === 'sender'
                  ? 'border-[#665443] bg-[#665443] text-white'
                  : 'border-[#E8DFD5] bg-white text-[#756B5D]'
              }`}
            >
              Remetente
            </button>
          </div>

          <div className="rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-3 sm:p-5">
            <div className={section === 'package' ? 'block' : 'hidden'}>
              {settingsForm}
            </div>

            <div className={section === 'sender' ? 'block' : 'hidden'}>
              {senderForm}
            </div>
          </div>
        </div>
      )}

      {/* Testes */}
      {tab === 'test' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-medium">
              Simulador de frete
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#817568]">
              Teste a conexão com o Melhor Envio e consulte
              as opções de entrega para um CEP de destino.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-3 sm:p-5">
            {shippingTest}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-4 rounded-2xl border border-[#E8DFD5] bg-white p-5 text-left transition-all hover:border-[#CBBBA8] hover:shadow-sm sm:p-6"
    >
      <div className="rounded-xl bg-[#F5F1EC] p-3 text-[#786855]">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[#817568]">
          {description}
        </p>
      </div>

      <ArrowRight
        size={17}
        className="mt-1 shrink-0 text-[#A99A88] transition-transform group-hover:translate-x-1"
      />
    </button>
  )
}
