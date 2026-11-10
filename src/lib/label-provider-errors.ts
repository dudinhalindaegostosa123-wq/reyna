const PREFIX = 'LABEL_REMOTE_REJECTED'
const HELP: Record<string, string> = {
  AUTH: 'O Melhor Envio recusou o token de acesso. Confira a conexão em Frete.',
  PERMISSION: 'O token do Melhor Envio não tem permissão para preparar envios no carrinho. Confira as permissões da integração.',
  RECIPIENT_DOCUMENT: 'CPF/CNPJ do destinatário: o Melhor Envio recusou a emissão com o documento ausente ou inválido. Preencha um documento válido para este serviço, salve e consulte o frete novamente. O campo opcional no painel não remove a exigência da transportadora.',
  SENDER_DOCUMENT: 'CPF/CNPJ do remetente: confira o documento da loja em Configurações de envio.',
  INVOICE: 'Documentação do envio: o Melhor Envio recusou os dados fiscais. Confira a NF-e ou a modalidade de declaração aplicável ao pedido.',
  AGENCY: 'Agência de postagem: confira a agência exigida pela transportadora em Dados adicionais.',
  SERVICE: 'O Melhor Envio recusou o serviço selecionado. Consulte novamente as opções de frete.',
  PACKAGE: 'Embalagem ou conteúdo: confira peso, medidas, quantidade e valores dos produtos antes de consultar o frete novamente.',
  RECIPIENT_ADDRESS: 'Endereço do destinatário: confira CEP, rua, número, bairro, cidade e UF, salve e consulte o frete novamente.',
  SENDER_ADDRESS: 'Endereço do remetente: confira os dados da loja e o CEP de origem em Configurações de envio.',
  RECIPIENT_CONTACT: 'Contato do destinatário: confira nome, e-mail e telefone, salve e consulte o frete novamente.',
}

function providerDetails(input: unknown, secrets: string[]): string {
  const messages: string[] = []
  function clean(value: string): string {
    let result = value.slice(0, 4000).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f]/g, ' ')
    for (const secret of secrets.filter(value => value.length >= 4).sort((a,b) => b.length-a.length)) result = result.split(secret).join('[oculto]')
    return result.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [oculto]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[oculto]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail oculto]')
      .replace(/\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b/g, '[documento oculto]')
      .replace(/\b[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}\b/g, '[documento oculto]')
      .replace(/\b[0-9]{8,}\b/g, '[número oculto]').replace(/\s+/g, ' ').trim().slice(0, 220)
  }
  function visit(value: unknown, path: string, inError: boolean, depth: number) {
    if (depth > 5 || messages.length >= 5) return
    if (typeof value === 'string') {
      if (!inError || !/campo|document|cpf|cnpj|frete|agency|service|invoice|sender|recipient|declara|inv[aá]lid|requir|obrigat|permiss|token|error|falh|n[aã]o|must|denied|forbidden|not |pedido|postagem|seguro|produto/i.test(value)) return
      const message = clean(value)
      if (message && !messages.includes(message)) messages.push(message)
    } else if (Array.isArray(value)) {
      value.slice(0, 8).forEach(child => visit(child, path, inError || !path, depth + 1))
    } else if (value && typeof value === 'object') {
      Object.entries(value).slice(0, 40).forEach(([key, child]) => visit(child, path + '.' + key, inError || /message|error|detail|description|reason|mensagem|erros|validation/i.test(key), depth + 1))
    }
  }
  visit(input, '', typeof input === 'string', 0)
  return messages.join(' · ')
}

export function labelProviderFailure(status: number, details: unknown, secrets: string[] = []): string {
  const codes = new Set<string>()
  if (status === 401) codes.add('AUTH')
  if (status === 403) codes.add('PERMISSION')
  function visit(value: unknown, path = '', depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return
    for (const [key, child] of Object.entries(value)) {
      const field = (path ? path + '.' : '') + key
      if (/(?:^|\.)(?:to|recipient)\.(?:document|company_document|cpf|cnpj)(?:\.|$)/i.test(field)) codes.add('RECIPIENT_DOCUMENT')
      else if (/(?:^|\.)(?:from|sender)\.(?:document|company_document|cpf|cnpj)(?:\.|$)/i.test(field)) codes.add('SENDER_DOCUMENT')
      else if (/invoice|non_commercial|declaration/i.test(field)) codes.add('INVOICE')
      else if (/(?:^|\.)agency(?:\.|$)/i.test(field)) codes.add('AGENCY')
      else if (/(?:^|\.)service(?:_id)?(?:\.|$)/i.test(field)) codes.add('SERVICE')
      else if (/(?:^|\.)(?:volumes|products|packages)(?:\.|$)/i.test(field)) codes.add('PACKAGE')
      else if (/(?:^|\.)(?:to|recipient)\.(?:postal_code|address|number|district|city|state_abbr|complement)(?:\.|$)/i.test(field)) codes.add('RECIPIENT_ADDRESS')
      else if (/(?:^|\.)(?:from|sender)\.(?:postal_code|address|number|district|city|state_abbr)(?:\.|$)/i.test(field)) codes.add('SENDER_ADDRESS')
      else if (/(?:^|\.)(?:to|recipient)\.(?:name|email|phone)(?:\.|$)/i.test(field)) codes.add('RECIPIENT_CONTACT')
      visit(child, field, depth + 1)
    }
  }
  visit(details)
  return PREFIX + ':' + JSON.stringify({ status, codes: Array.from(codes), detail: providerDetails(details, secrets) })
}

export function isLabelProviderRejection(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  return message === PREFIX || message.startsWith(PREFIX + ':')
}

export function labelProviderMessage(code: string): string | null {
  if (!code.startsWith(PREFIX + ':')) return null
  const content = code.slice(PREFIX.length + 1)
  if (!content.startsWith('{')) {
    const messages = content.split(',').map(value => HELP[value]).filter(Boolean)
    return messages.length ? 'O Melhor Envio não preparou a etiqueta. ' + messages.join(' ') : null
  }
  try {
    const data = JSON.parse(content) as { status: number; codes: string[]; detail: string }
    const messages = Array.isArray(data.codes) ? data.codes.map(value => HELP[value]).filter(Boolean) : []
    const status = [400,401,403,422].includes(data.status) ? data.status : 'RECUSA'
    return `O Melhor Envio não preparou a etiqueta [ME-${status}]. ` +
      (messages.length ? messages.join(' ') : 'A resposta foi recusada pelo provedor.') +
      (typeof data.detail === 'string' && data.detail ? ` Detalhe retornado: ${data.detail}` : ' O provedor não retornou um detalhe de validação reconhecível. Confira este envio na conta do Melhor Envio.')
  } catch { return null }
}
