interface Props { source?:string; shippingPending?:boolean; address?:{street?:string;number?:string;complement?:string;district?:string;city?:string;state?:string;cep?:string}|null }
export default function OrderOrigin({source,shippingPending,address}:Props){
  return <section className="mb-5 rounded-2xl border border-[#DED4C5] bg-[#F8F4ED] p-4"><p className="text-xs font-medium">Origem: {source==='site' ? 'Site' : 'Registro manual'}</p>{shippingPending && <p className="mt-2 text-xs leading-relaxed text-[#756B5D]">Frete e pagamento aguardam configuração e confirmação. O total exibido corresponde somente às peças. Consulte abaixo a reserva de estoque e seu prazo.</p>}{address && <div className="mt-3 text-sm"><p>{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ''}</p><p>{address.district} · {address.city}/{address.state}</p><p>CEP {address.cep}</p></div>}</section>
}

// Serenity: estoque e reservas v1
