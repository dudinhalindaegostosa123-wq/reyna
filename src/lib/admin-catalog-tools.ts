export function youtubeId(input: string): string {
  let id = input.trim()

  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    let url: URL

    try {
      url = new URL(id)
    } catch {
      throw new Error('Cole um link válido do YouTube ou Shorts.')
    }

    if (url.protocol !== 'https:') throw new Error('Use um link HTTPS do YouTube.')

    if (url.hostname === 'youtu.be') {
      id = url.pathname.slice(1)
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch'
        ? url.searchParams.get('v') || ''
        : /^\/(shorts|embed)\//.test(url.pathname)
        ? url.pathname.split('/')[2] || ''
        : ''
    } else {
      throw new Error('Use um link do YouTube ou Shorts.')
    }
  }

  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error('Não foi possível identificar o vídeo.')

  return id
}

export function attributes(input: string): Record<string, string> {
  let pairs: unknown

  try {
    pairs = JSON.parse(input)
  } catch {
    throw new Error('Confira os atributos da variação.')
  }

  if (!Array.isArray(pairs) || pairs.length < 1 || pairs.length > 20) throw new Error('Adicione entre 1 e 20 atributos.')

  const result: Record<string, string> = Object.create(null)

  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(x => typeof x !== 'string')) throw new Error('Atributo inválido.')

    const key = pair[0].trim()
    const value = pair[1].trim()

    if (!key || !value || key.length > 120 || value.length > 180) throw new Error('Preencha o atributo e seu valor, por exemplo: Cor e Azul.')

    if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error('Cada atributo deve ter um nome diferente.')

    result[key] = value
  }

  return result
}

export function lines(input: string): string[] {
  const values = Array.from(new Set(
    input.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  ))

  if (values.length > 80 || values.some(x => x.length > 180)) throw new Error('Use até 80 itens, com até 180 caracteres cada.')

  return values
}

export function uuid(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) throw new Error('Identificador inválido. Atualize a página.')
  return input
}
