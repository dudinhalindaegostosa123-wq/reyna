const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://reyna-three.vercel.app'
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''
export interface RestockJob {id:string;lease_id:string;recipient:string;name:string;variation:string;slug:string;variant:string;token:string}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function restockEmail(job:RestockJob){
 if(!/^[a-zA-Z0-9_-]{1,180}$/.test(job.slug) || !/^[a-f0-9]{64}$/.test(job.token) || !/^[a-f0-9-]{36}$/i.test(job.id) || (job.variant && !/^[a-zA-Z0-9-]{1,80}$/.test(job.variant)))throw Error('RESTOCK_EMAIL_INPUT')
 const name=job.name.replace(/[\r\n]/g,' ').slice(0,180),variant=job.variation.replace(/[\r\n]/g,' ').slice(0,180)
 const link=`${SITE_ORIGIN}/produto/${encodeURIComponent(job.slug)}${job.variant?'?variacao='+encodeURIComponent(job.variant):''}`
 const cancel=`${SITE_ORIGIN}/avisos/estoque/cancelar?token=${job.token}`
 const subject='Sua joia voltou ao estoque · Lunarity'
 const paragraphs=[`${name}${variant?' — '+variant:''} está disponível novamente!`,'Você pediu para receber este aviso. Confira o preço e a disponibilidade atualizados na página da peça. Este aviso não reserva estoque; a disponibilidade pode mudar.','Este é um aviso único de reposição, sem inscrição em publicidade.']
 return {subject,text:`${subject}\n\n${paragraphs.join('\n\n')}\n\nVer peça: ${link}\n\nCancelar aviso: ${cancel}`,html:`<!doctype html><html lang="pt-BR"><body style="background:#f7f4ef;color:#292621;font-family:Arial,sans-serif"><div style="max-width:580px;margin:24px auto;background:#fff;padding:32px"><p>LUNARITY</p><h1 style="font-size:26px">Sua joia voltou!</h1>${paragraphs.map(p=>`<p style="line-height:1.7">${escape(p)}</p>`).join('')}<p><a href="${escape(link)}" style="display:inline-block;background:#292621;color:#fff;padding:14px 22px;border-radius:24px;text-decoration:none">Ver a peça</a></p><p style="font-size:12px"><a href="${cancel}">Cancelar aviso</a></p></div></body></html>`}
}
