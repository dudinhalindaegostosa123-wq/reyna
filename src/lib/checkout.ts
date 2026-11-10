export interface CheckoutLine { slug:string; variant:string; quantity:number; color:string; sterilized?:boolean; stem?:string }
export interface CheckoutQuote { items:{ product_id:string; variant_id:string|null; slug:string; name:string; variation:string|null; quantity:number; unit_price:number; color:string; fee:number; line_total:number; cart_variant?:string; stem?:string;sterilized?:boolean;sterilization_fee?:number;stem_fee?:number;stem_locked?:boolean }[]; total:number; total_cents:number }
export interface CheckoutCustomer { name:string; email:string; phone:string }
export interface CheckoutAddress { cep:string; street:string; number:string; complement:string; district:string; city:string; state:string }

export const CHECKOUT_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function validateCheckoutLines(input:unknown):CheckoutLine[] {
  if(!Array.isArray(input)||input.length<1||input.length>50)throw new Error('Confira os itens do carrinho. O limite é de 50 linhas por pedido.')
  return input.map(row=>{
    if(!row||typeof row.slug!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(row.slug)||typeof row.variant!=='string'||!/^(|\d{1,12}|[a-f0-9-]{36})$/i.test(row.variant)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>999||(row.sterilized !== undefined && typeof row.sterilized !== 'boolean')||(row.stem !== undefined && !['','4','6','8','10'].includes(row.stem))||typeof row.color!=='string'||!/^(|\d{2,3})$/.test(row.color))throw new Error('Confira as peças, variações e quantidades no carrinho.')
    return {slug:row.slug,variant:row.variant,quantity:row.quantity,color:row.color,...(typeof row.sterilized==='boolean'?{sterilized:row.sterilized}:{}),...(row.stem?{stem:row.stem}:{})}
  })
}

export function validateCheckoutContact(customer:CheckoutCustomer,address:CheckoutAddress) {
  const text=(input:unknown,max:number,required=true)=>{
    if(typeof input!=='string'||input.length>max||(required&&!input.trim()))throw new Error('Preencha os dados de contato e endereço.')
    return input.trim()
  }

  if(!customer||!address)throw new Error('Preencha seus dados.')

  const contact={
    name:text(customer.name,180),
    email:text(customer.email,254).toLowerCase(),
    phone:text(customer.phone,25).replace(/\D/g,'')
  }

  const delivery={
    cep:text(address.cep,10).replace(/\D/g,''),
    street:text(address.street,180),
    number:text(address.number,30),
    complement:text(address.complement,180,false),
    district:text(address.district,100),
    city:text(address.city,100),
    state:text(address.state,2)
  }

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)||!/^\d{10,11}$/.test(contact.phone)||!/^\d{8}$/.test(delivery.cep)||!CHECKOUT_STATES.includes(delivery.state))throw new Error('Confira e-mail, telefone com DDD, CEP e estado.')

  return {customer:contact,address:delivery}
}
