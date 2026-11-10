export function normalizeCheckoutDocument(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 24 ||
    !/^[a-zA-Z0-9.\/\s-]+$/.test(input)
  ) {
    throw new Error('Informe um CPF ou CNPJ válido para a entrega.')
  }

  const document = input.replace(/[.\/\s-]/g, '').toUpperCase()

  if (/^(.)\1+$/.test(document)) {
    throw new Error('Informe um CPF ou CNPJ válido para a entrega.')
  }

  if (/^\d{11}$/.test(document)) {
    for (const length of [9, 10]) {
      let sum = 0

      for (let i = 0; i < length; i++) {
        sum += Number(document[i]) * (length + 1 - i)
      }

      const digit = (sum * 10 % 11) % 10

      if (digit !== Number(document[length])) {
        throw new Error('Confira os dígitos do CPF informado.')
      }
    }

    return document
  }

  if (/^[A-Z0-9]{12}\d{2}$/.test(document)) {
    for (const length of [12, 13]) {
      let sum = 0
      let weight = 2

      for (let i = length - 1; i >= 0; i--) {
        sum += (document.charCodeAt(i) - 48) * weight
        weight = weight === 9 ? 2 : weight + 1
      }

      const remainder = sum % 11

      if (
        (remainder < 2 ? 0 : 11 - remainder) !==
        Number(document[length])
      ) {
        throw new Error('Confira os dígitos do CNPJ informado.')
      }
    }

    return document
  }

  throw new Error('Informe um CPF ou CNPJ válido para a entrega.')
}
