'use server'

import { MINI_BANNER_TARGETS,COLOR_BANNER_TARGETS } from '@/lib/home-images'

import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'

const uuid = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    value
  )

export async function saveBanner(
  form: FormData
): Promise<{
  error: string
  id?: string
}> {
  const { db, user } = await adminDatabase()

  let validationError = ''

  try {
    const read = (
      key: string,
      label: string,
      max: number
    ): string => {
      const value = form.get(key)

      if (typeof value !== 'string') {
        validationError = `O campo "${label}" não foi recebido. Atualize a página e tente novamente.`
        throw new Error('BANNER_VALIDATION')
      }

      const clean = value.trim()

      if (clean.length > max) {
        validationError = `O campo "${label}" deve ter no máximo ${max} caracteres.`
        throw new Error('BANNER_VALIDATION')
      }

      return clean
    }

    const id = read('id', 'Identificação', 36)
    const versionText = read('version', 'Versão', 20)
    const title = read('title', 'Título', 180)
    const subtitle = read('subtitle', 'Subtítulo', 500)
    const href = read('href', 'Link interno', 1000)
    const alt = read('alt', 'Descrição da imagem', 300)
    const cta = read('cta', 'Texto do botão', 80)
    const placement = read('slot', 'Tipo do banner', 20)
    const slot = placement==='hero'?'hero':'category'
    const tone = read('text_tone', 'Cor do texto', 10)
    const positionText = read('position', 'Posição', 5)

    const version = Number(versionText)
    const position = Number(positionText)

    if (!uuid(id)) {
      return {
        error:
          'A identificação do banner está inválida. Reabra o banner pela lista.',
      }
    }

    if (
      !/^\d+$/.test(versionText) ||
      !Number.isSafeInteger(version) ||
      version < 0
    ) {
      return {
        error:
          'A versão do banner está inválida. Reabra o banner pela lista.',
      }
    }

    if (!title) {
      return {
        error: 'Preencha o título do banner.',
      }
    }

    if (!alt) {
      return {
        error:
          'Preencha a descrição da imagem. Exemplo: Hastes e labrets para piercings.',
      }
    }

    if (
      !href.startsWith('/') ||
      href.startsWith('//') ||
      /[\\\u0000-\u001F\u007F]/.test(href) ||
      /\s/.test(href)
    ) {
      return {
        error:
          'No link interno, use apenas um caminho sem espaços, começando com /. Exemplo: /categoria/hastes-e-topos',
      }
    }

    if (!['hero', 'category','mini','stone'].includes(placement)) {
      return {
        error:
          'Selecione um local válido para o banner.',
      }
    }

    if (placement==='mini' && !MINI_BANNER_TARGETS.some(item=>item.href===href) || placement==='stone' && !COLOR_BANNER_TARGETS.some(item=>item.href===href)) return {error:'Selecione o destino correspondente ao mini banner ou à cor.'}

    if (!['light', 'dark'].includes(tone)) {
      return {
        error:
          'Selecione uma cor válida para o texto: claro ou escuro.',
      }
    }

    if (
      !/^\d+$/.test(positionText) ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 9999
    ) {
      return {
        error:
          'Preencha a posição com um número inteiro entre 0 e 9999. Exemplo: 3.',
      }
    }

    const old = await db
      .from('serenity_site_banners')
      .select('id,version,image_desktop,image_mobile')
      .eq('id', id)
      .maybeSingle()

    if (old.error) {
      return {
        error: 'Não foi possível carregar o banner.',
      }
    }

    if (
      old.data
        ? Number(old.data.version) !== version
        : version !== 0
    ) {
      return {
        error:
          'O banner mudou em outra operação. Reabra pela lista antes de editar novamente.',
      }
    }

    if ((placement==='mini' || placement==='stone') && form.get('enabled')==='on') {
      const duplicate=await db.from('serenity_site_banners').select('id').eq('slot','category').eq('cta',placement==='mini'?'home-mini-v1':'home-stone-v1').eq('href',href).eq('enabled',true).neq('id',id).limit(1)
      if(duplicate.error) return {error:'Não foi possível conferir as imagens existentes. Tente novamente.'}
      if(duplicate.data?.length) return {error:'Já existe uma imagem ativa para esse destino. Abra o item existente na lista para trocar a imagem.'}
    }

    const upload = async (
      name: string
    ): Promise<string> => {
      const file = form.get(name)

      if (
        !file ||
        typeof file === 'string' ||
        file.size === 0
      ) {
        return ''
      }

      if (file.size > 3 * 1024 * 1024) {
        throw new Error('Cada imagem deve ter até 3 MB.')
      }

      const input = Buffer.from(await file.arrayBuffer())

      const info = await sharp(input, {
        limitInputPixels: 40000000,
      }).metadata()

      if (
        !['jpeg', 'png', 'webp'].includes(info.format || '') ||
        (info.pages || 1) > 1
      ) {
        throw new Error(
          'Use imagem estática JPG, PNG ou WebP.'
        )
      }

      const bytes = await sharp(input, {
        limitInputPixels: 40000000,
      })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer()

      const path = `${id}/${randomUUID()}.webp`

      const result = await db.storage
        .from('serenity-banners')
        .upload(path, bytes, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '31536000',
        })

      if (result.error) {
        throw new Error(
          'Falha ao enviar a imagem. Confira a configuração do bucket serenity-banners.'
        )
      }

      return path
    }

    const desktopUpload = await upload('desktop')

    const desktop =
      desktopUpload ||
      String(old.data?.image_desktop || '')

    const removeMobile =
      form.get('remove_mobile') === 'on'

    const mobileUpload = removeMobile
      ? ''
      : await upload('mobile')

    const mobile = removeMobile
      ? ''
      : mobileUpload ||
        String(old.data?.image_mobile || '')

    if (!desktop) {
      return {
        error: 'Envie a imagem para computador.',
      }
    }

    const payload = {
      title,
      subtitle,
      href,
      alt,
      cta: placement==='mini'?'home-mini-v1':placement==='stone'?'home-stone-v1':cta,
      slot,
      text_tone: tone,
      position,
      enabled: form.get('enabled') === 'on',
      image_desktop: desktop,
      image_mobile: mobile,
      updated_at: new Date().toISOString(),
      version: version + 1,
    }

    const result = old.data
      ? await db
          .from('serenity_site_banners')
          .update(payload)
          .eq('id', id)
          .eq('version', version)
          .select('id')
          .maybeSingle()
      : await db
          .from('serenity_site_banners')
          .insert({
            ...payload,
            id,
            created_by: user.id,
          })
          .select('id')
          .single()

    if (result.error || !result.data) {
      return {
        error:
          'Não foi possível confirmar o salvamento. Atualize a lista antes de tentar novamente.',
      }
    }

    revalidateTag('site-banners')
    revalidatePath('/')
    revalidatePath('/admin/banners')

    return {
      error: '',
      id: String(result.data.id),
    }
  } catch (error) {
    if (validationError) {
      return {
        error: validationError,
      }
    }

    const message =
      error instanceof Error ? error.message : ''

    const allowedMessages = [
      'Cada imagem deve ter até 3 MB.',
      'Use imagem estática JPG, PNG ou WebP.',
      'Falha ao enviar a imagem. Confira a configuração do bucket serenity-banners.',
    ]

    return {
      error: allowedMessages.includes(message)
        ? message
        : 'Não foi possível concluir. Confira a lista antes de repetir.',
    }
  }
}
