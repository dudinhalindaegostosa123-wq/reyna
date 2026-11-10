type Product = { name: string; quantity: number; value: number }

// Allocate saved order discounts proportionally in integer cents. Split a line
// when its cents cannot be represented by one two-decimal unit value.
export function declaredProducts(products: Product[], order: { discount?: unknown; subtotal?: unknown }): Product[] {
  const cents = (value: unknown) => {
    if (value === null || value === '' || !['number','string'].includes(typeof value)) throw new Error('Confira os valores dos itens do pedido.')
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount*100-Math.round(amount*100))>0.00001) throw new Error('Confira os valores dos itens do pedido.')
    return Math.round(amount*100)
  }
  const lines = products.map(product => {
    if (!product.name || !Number.isSafeInteger(product.quantity) || product.quantity < 1 || product.quantity > 100000) throw new Error('Confira os itens do pedido.')
    return { ...product, cents: cents(product.value)*product.quantity }
  })
  const gross = lines.reduce((sum,line) => sum+line.cents,0)
  const discount = cents(order.discount ?? 0)
  if (!Number.isSafeInteger(gross) || !gross || discount > gross) throw new Error('Confira os valores dos itens do pedido.')
  if (!discount) return products
  if (cents(order.subtotal) !== gross) throw new Error('O subtotal e os itens do pedido divergem. Confira os valores antes de emitir a etiqueta.')
  const target = gross-discount
  const allocations = lines.map((line,index) => {
    const numerator = BigInt(line.cents)*BigInt(target)
    return {index,cents:Number(numerator/BigInt(gross)),fraction:Number(numerator%BigInt(gross))}
  })
  let remainder = target-allocations.reduce((sum,line)=>sum+line.cents,0)
  for (const allocation of [...allocations].sort((a,b)=>b.fraction-a.fraction || a.index-b.index)) {
    if (remainder-- > 0) allocation.cents++
  }
  return lines.flatMap((line,index) => {
    const net = allocations[index].cents
    const unit = Math.floor(net/line.quantity)
    const extras = net%line.quantity
    return [
      ...(line.quantity-extras ? [{name:line.name,quantity:line.quantity-extras,value:unit/100}] : []),
      ...(extras ? [{name:line.name,quantity:extras,value:(unit+1)/100}] : []),
    ]
  })
}
