const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const {matchesCampaignParticipant}=load('src/lib/promotion-ui.ts')
test('participant search matches names, parent/variant SKUs and variation names without accent or case sensitivity',()=>{
 const item={productName:'Labret Lua Crescente Titânio',productSku:'TN1057',variantName:'Turquesa',variantSku:'TN1057-AZ'}
 for(const query of ['','  ','tn1057','lua titanio','turquesa','TN1057-az','CRESCENTE'])assert.equal(matchesCampaignParticipant(item,query),true,query)
 for(const query of ['tn1058','lua rosa'])assert.equal(matchesCampaignParticipant(item,query),false,query)
 assert.equal(matchesCampaignParticipant({productName:'Argola',variantName:''},'argola'),true)
})
