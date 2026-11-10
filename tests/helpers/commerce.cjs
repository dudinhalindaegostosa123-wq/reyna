const {load}=require('./load.cjs')
const commerce=load('src/lib/commerce.ts')
module.exports={
 './individual-sale':load('src/lib/individual-sale.ts'),
 '@/lib/read-fetch':load('src/lib/read-fetch.ts'),
 '@/lib/commerce':commerce,
 '@/lib/commerce-server':{getCommercePolicy:async()=>commerce.DEFAULT_COMMERCE_POLICY},
 '@/lib/stem-description':load('src/lib/stem-description.ts'),
}
