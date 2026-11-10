import Link from 'next/link'
import Brand from '@/components/brand/Brand'
import { STORE_INFORMATION } from '@/lib/store-information'

export default function Footer() {
  return (
    <footer className="lunarity-footer">
      <div className="ln-container lunarity-footer-top">
        <div className="lunarity-footer-about"><Link href="/" aria-label="Lunarity — página inicial"><Brand /></Link><p>Joias para acompanhar suas fases.<br />Explore os detalhes. Encontre o seu brilho.</p></div>
        <div><h3>SEU UNIVERSO</h3><ul>{[
          { label: 'Todas as joias', href: '/categoria/todos' },
          { label: 'Para a orelha', href: '/orelha' },
          { label: 'Para o nariz', href: '/nariz' },
          { label: 'Conheça o titânio', href: '/materiais/titanio' },
        ].map(item => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></div>
        <div><h3>PODEMOS AJUDAR?</h3><ul>
          <li><Link href="/ajuda">Dúvidas frequentes</Link></li>
          <li><Link href="/minha-conta">Minha conta e pedidos</Link></li>
          {STORE_INFORMATION.whatsapp && <li><a href={STORE_INFORMATION.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a></li>}
          {STORE_INFORMATION.instagram && <li><a href={STORE_INFORMATION.instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a></li>}
          {STORE_INFORMATION.email && <li><a href={`mailto:${STORE_INFORMATION.email}`}>{STORE_INFORMATION.email}</a></li>}
        </ul></div>
      </div>
      <div className="ln-container lunarity-footer-bottom"><span>© {new Date().getFullYear()} Lunarity. Todos os direitos reservados.</span><span>FEITA DE FASES. CHEIA DE POSSIBILIDADES.</span></div>
    </footer>
  )
}
