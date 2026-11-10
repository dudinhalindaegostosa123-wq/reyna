const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app'
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''
import { labretCopy } from '@/lib/stem-description'
import { orderItemOptions } from './order-item-options'

export interface EmailJob {
  id: string
  checkout_id?: string | null
  order_id: string | null
  kind: 'received' | 'paid' | 'owner_paid' | 'shipped' | 'delivered' | 'wholesale_requested' | 'wholesale_approved' | 'legacy_shipped' | 'legacy_delivered' | 'shipping_undelivered' | 'shipping_paused' | 'shipping_suspended' | 'legacy_undelivered' | 'legacy_paused' | 'legacy_suspended'
  recipient: string
  lease_id: string
  payload: { guest_checkout?: boolean; number?: number; name?: string; email?: string; total?: number; items?: { name: string; variation?: string; quantity: number; unit_price: number; stem_length_mm?: string | number | null; sterilized?: boolean | null; sterilization_fee?: number; anodization?: string | null; voltage?: string | null }[]; tracking?: string }
}
const escape = (input: unknown) => String(input ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const money = (input: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(input) || 0)

export function orderEmail(job: EmailJob, trackingLink?: string) {
  const guestLink = (() => {
    if (!trackingLink) return undefined
    try {
      const link = new URL(trackingLink)
      return link.origin === new URL(SITE_ORIGIN).origin && link.protocol === 'https:' && !link.username && !link.password && !link.search && link.pathname === '/acompanhar' && /^#[a-f0-9]{64}$/.test(link.hash) ? trackingLink : undefined
    } catch { return undefined }
  })()
  if ((job.payload.guest_checkout || job.kind === 'received') && !guestLink) throw new Error('GUEST_EMAIL_LINK_UNAVAILABLE')
  if (job.kind === 'received') {
    const subject=`Recebemos seu pedido #${job.payload.number} · Lunarity`
    const paragraphs=[`Olá, ${job.payload.name || 'cliente Lunarity'}!`, 'Recebemos sua seleção de joias. A confirmação de pagamento será enviada separadamente; a preparação começa após a aprovação.',
      ...(job.payload.items || []).slice(0,100).map(item=>`${item.quantity} × ${labretCopy(item.name)}${item.variation ? ' — '+item.variation : ''} · ${money(item.unit_price)} por unidade`),
      `Total no recebimento: ${money(job.payload.total)}. O benefício Pix, quando escolhido, será considerado na confirmação do pagamento.`,
      'Você pode acompanhar sua compra pelo link seguro, sem precisar fazer login. Guarde este e-mail e não compartilhe o link de acompanhamento.']
    return {subject,text:`${subject}\n\n${paragraphs.join('\n\n')}\n\nAcompanhar pedido: ${guestLink}\n\n${CONTACT_EMAIL}`,
      html:`<!doctype html><html lang="pt-BR"><body style="background:#f7f4ef;color:#292621;font-family:Arial,sans-serif"><div style="max-width:580px;margin:24px auto;background:white;padding:32px"><p style="font-size:12px;letter-spacing:4px">LUNARITY</p><h1 style="font-size:26px;font-weight:400">Recebemos seu pedido #${escape(job.payload.number)}</h1>${paragraphs.map(p=>`<p style="font-size:14px;line-height:1.7">${escape(p)}</p>`).join('')}<p><a href="${guestLink}" style="display:inline-block;background:#292621;color:white;padding:14px 22px;border-radius:24px;text-decoration:none">Acompanhar meu pedido</a></p><p>Precisa de ajuda? Responda este e-mail.</p></div></body></html>`}
  }
  if (job.kind === 'wholesale_requested' || job.kind === 'wholesale_approved') {
    const requested = job.kind === 'wholesale_requested'
    const subject = requested ? 'Nova solicitação de atacado · Lunarity' : 'Seu cadastro de atacado foi aprovado! · Lunarity'
    const heading = requested ? 'Tem gente querendo fazer parte do atacado!' : 'Bem-vinda ao atacado Lunarity!'
    const paragraphs = requested
      ? [`${job.payload.name || 'Uma pessoa'} solicitou acesso ao atacado.`, ...(job.payload.email ? [`E-mail: ${job.payload.email}`] : []), 'Acesse o painel para conferir o cadastro e decidir sobre a aprovação.']
      : [`Olá, ${job.payload.name || 'cliente Lunarity'}!`, 'Seu cadastro de atacado foi aprovado. Entre na sua conta para consultar as condições vigentes e fazer suas compras.', 'Os benefícios seguem as regras e a disponibilidade do atacado no momento da compra.']
    const link = requested ? `${SITE_ORIGIN}/admin/atacado` : `${SITE_ORIGIN}/minha-conta`
    const label = requested ? 'Analisar solicitação' : 'Acessar minha conta'
    return {
      subject,
      text: `${subject}\n\n${paragraphs.join('\n\n')}\n\n${label}: ${link}\n\nLunarity · ${CONTACT_EMAIL}`,
      html: `<!doctype html><html lang="pt-BR"><body style="background:#f7f4ef;color:#292621;font-family:Arial,sans-serif"><div style="max-width:580px;margin:24px auto;background:#fff;padding:32px"><p style="font-size:12px;letter-spacing:4px">LUNARITY</p><h1 style="font-size:26px;font-weight:400">${escape(heading)}</h1>${paragraphs.map(p => `<p style="font-size:14px;line-height:1.7">${escape(p)}</p>`).join('')}<p><a href="${link}" style="display:inline-block;background:#292621;color:#fff;padding:14px 22px;border-radius:24px;text-decoration:none">${label}</a></p><p style="font-size:12px">Precisa de ajuda? Responda este e-mail.</p></div></body></html>`,
    }
  }
  if (job.kind === 'shipping_undelivered' || job.kind === 'shipping_paused' || job.kind === 'shipping_suspended' || job.kind === 'legacy_undelivered' || job.kind === 'legacy_paused' || job.kind === 'legacy_suspended') {
    const legacy = job.kind.startsWith('legacy_')
    const status = job.kind.replace(/^(legacy|shipping)_/, '')
    const heading = status === 'undelivered' ? 'Não foi possível concluir a entrega' : status === 'paused' ? 'Seu envio está pausado' : 'Seu envio foi suspenso'
    const subject = `${heading} · ${legacy ? 'Pedido antigo' : 'Pedido'} #${job.payload.number} · Lunarity`
    const link = guestLink || `${SITE_ORIGIN}/minha-conta#${legacy ? 'historico-antigo' : 'pedidos'}`
    const paragraphs = [`Olá, ${job.payload.name || 'cliente Lunarity'}!`, 'A transportadora registrou uma atualização no seu envio. Consulte o rastreio e fale com a equipe Lunarity para conferirmos os próximos passos.', ...(job.payload.tracking ? [`Código de rastreio: ${job.payload.tracking}`] : [])]
    return { subject, text: `${subject}\n\n${paragraphs.join('\n\n')}\n\nAcompanhar: ${link}\n\n${CONTACT_EMAIL}`, html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#292621;background:#f7f4ef"><div style="max-width:580px;margin:24px auto;background:white;padding:32px"><p>LUNARITY</p><h1 style="font-size:26px">${escape(heading)}</h1><p>${legacy ? 'Pedido antigo' : 'Pedido'} #${escape(job.payload.number)}</p>${paragraphs.map(p=>`<p style="line-height:1.7">${escape(p)}</p>`).join('')}<p><a href="${link}">Acompanhar meu pedido</a></p><p>Precisa de ajuda? Responda este e-mail.</p></div></body></html>` }
  }
  const legacy = job.kind === 'legacy_shipped' || job.kind === 'legacy_delivered'
  const kind = job.kind === 'legacy_shipped' ? 'shipped' : job.kind === 'legacy_delivered' ? 'delivered' : job.kind
  const headings = { paid: 'Parabéns pela compra!', owner_paid: 'UHUL, MAIS UMA COMPRA!', shipped: 'Seu pedido foi despachado', delivered: 'Entrega registrada' }
  const descriptions = {
    owner_paid: 'Mais um pedido teve o pagamento confirmado na Lunarity! Confira as peças e as opções solicitadas para preparar a compra.',
    paid: 'Recebemos a confirmação do pagamento. Sua seleção agora segue para preparação. Acompanhe as próximas atualizações pelo link deste e-mail.',
    shipped: 'A postagem do seu pedido foi registrada. Acompanhe o andamento e as informações de rastreio pelo link deste e-mail.',
    delivered: 'A transportadora registrou a entrega do seu pedido. Se você não recebeu o pacote, fale com a equipe Lunarity para conferirmos.',
  }
  const subject = `${headings[kind]} · ${legacy ? 'Pedido antigo' : 'Pedido'} #${job.payload.number} · Lunarity`
  const isReceipt = job.kind === 'paid' || job.kind === 'owner_paid'
  const owner = job.kind === 'owner_paid'
  const items = isReceipt ? (job.payload.items || []).slice(0,100).map(item => {
    const options = orderItemOptions(item)
    if (item.anodization) options.push(`Anodização: ${item.anodization}${item.voltage ? ` · ${item.voltage} V` : ''}`)
    return `${item.quantity} × ${labretCopy(item.name)}${options.length ? ` — ${options.join(' · ')}` : ''} · ${money(item.unit_price)} por unidade`
  }) : []
  const paragraphs = [owner ? `Cliente: ${job.payload.name || 'Nome não informado'}` : job.payload.name ? `Olá, ${job.payload.name}.` : 'Olá!', descriptions[kind], ...items,
    ...(isReceipt ? [`Total pago: ${money(job.payload.total)}`] : []),
    ...(job.payload.tracking ? [`Código de rastreio: ${job.payload.tracking}`] : []),
  ]
  const account = owner ? `${SITE_ORIGIN}/admin/pedidos/${encodeURIComponent(job.order_id || '')}` : guestLink ? guestLink : legacy ? `${SITE_ORIGIN}/minha-conta#historico-antigo` : `${SITE_ORIGIN}/minha-conta#pedidos`
  const text = `${subject}\n\n${paragraphs.join('\n\n')}\n\nAcompanhar pedido: ${account}\n\nLunarity\n${CONTACT_EMAIL}`
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f4ef;color:#292621;font-family:Arial,sans-serif"><div style="max-width:580px;margin:24px auto;background:#fff;padding:32px"><p style="font-size:12px;letter-spacing:4px">LUNARITY</p><h1 style="font-size:26px;font-weight:400">${escape(headings[kind])}</h1><p>${legacy ? 'Pedido antigo' : 'Pedido'} #${escape(job.payload.number)}</p>${paragraphs.map(p => `<p style="font-size:14px;line-height:1.7">${escape(p)}</p>`).join('')}<p style="margin:28px 0"><a href="${account}" style="background:#292621;color:#fff;padding:14px 22px;text-decoration:none;border-radius:24px;display:inline-block">${owner ? 'Ver pedido no painel' : 'Acompanhar meu pedido'}</a></p><p style="font-size:12px;color:#756b5d">Precisa de ajuda? Responda este e-mail.<br>Lunarity · Sua beleza em cada detalhe.</p></div></body></html>`
  return { subject, text, html }
}
