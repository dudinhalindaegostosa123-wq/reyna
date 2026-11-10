import { legacyOrderAddresses } from '@/lib/legacy-order-display'

export default function LegacyOrderAddresses({ payload }: { payload: unknown }) {
  return <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
    {legacyOrderAddresses(payload).map(address => <section key={address.title}>
      <h3 className="font-medium">{address.title}</h3>
      {address.lines.length ? <address className="mt-2 space-y-1 text-xs not-italic leading-6 text-store-muted">
        {address.lines.map((line, index) => <p key={index}>{line}</p>)}
      </address> : <p className="mt-2 text-xs leading-6 text-store-muted">Não informado no arquivo do site antigo.</p>}
    </section>)}
  </div>
}
