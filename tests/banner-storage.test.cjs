const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { uploadBannerImage, BANNER_STORAGE_ERROR } = load('src/lib/banner-storage.ts')

function fixture({ missing = false, uploadError = true, createError = null, retryError = null, bucketError } = {}) {
  const calls = []
  let uploads = 0
  const db = { storage: {
    from(name) { assert.equal(name, 'serenity-banners'); return { upload: async (path, bytes, options) => {
      calls.push(['upload', path, options]); assert.equal(options.upsert, false)
      return { error: ++uploads === 1 ? uploadError && { statusCode: '400' } : retryError }
    } } },
    async getBucket() { calls.push(['get']); return { error: bucketError || (missing ? { statusCode: '404' } : null) } },
    async createBucket(name, options) { calls.push(['create', name, options]); return { error: createError } },
  } }
  return { db, calls }
}

test('successful uploads do not change any bucket configuration', async () => {
  const { db, calls } = fixture({ uploadError: false })
  await uploadBannerImage(db, 'id/photo.webp', Buffer.from('image'))
  assert.deepEqual(calls.map(c => c[0]), ['upload'])
})
test('missing bucket is created for public WebP images and upload is retried once', async () => {
  const { db, calls } = fixture({ missing: true })
  await uploadBannerImage(db, 'id/photo.webp', Buffer.from('image'))
  assert.deepEqual(calls.map(c => c[0]), ['upload', 'get', 'create', 'upload'])
  const options = calls[2][2]
  assert.equal(options.public, true)
  assert.deepEqual(Array.from(options.allowedMimeTypes), ['image/webp'])
  assert.equal(options.fileSizeLimit, 3 * 1024 * 1024)
})
test('existing bucket and permission failures are not changed or repeatedly retried', async () => {
  for (const options of [{}, { bucketError: { statusCode: '403' } }, { missing: true, createError: { statusCode: '403' } }, { missing: true, retryError: { statusCode: '500' } }]) {
    const { db, calls } = fixture(options)
    await assert.rejects(uploadBannerImage(db, 'id/photo.webp', Buffer.from('image')), { message: BANNER_STORAGE_ERROR })
    assert.ok(calls.filter(c => c[0] === 'upload').length <= 2)
    if (!options.missing) assert.ok(!calls.some(c => c[0] === 'create'))
  }
})
test('simultaneous first uploads tolerate another request creating the bucket', async () => {
  const { db } = fixture({ missing: true, createError: { statusCode: '409' } })
  await uploadBannerImage(db, 'id/photo.webp', Buffer.from('image'))
})
test('Storage versions returning Bucket not found with status 400 are supported', async () => {
  const { db, calls } = fixture({ bucketError: { statusCode: '400', message: 'Bucket not found' } })
  await uploadBannerImage(db, 'id/photo.webp', Buffer.from('image'))
  assert.equal(calls.filter(c => c[0] === 'create').length, 1)
})
