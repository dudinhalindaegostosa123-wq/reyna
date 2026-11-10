const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const {declaredProducts}=load('src/lib/label-declared-values.ts')
const sum=products=>products.reduce((n,p)=>n+Math.round(p.value*100)*p.quantity,0)
test('discounts are allocated to declared merchandise, never freight, with exact cent conservation',()=>{
 const products=[{name:'Joia A',quantity:3,value:100},{name:'Joia B',quantity:2,value:50}]
 const result=declaredProducts(products,{subtotal:400,discount:83.33,shipping:20})
 assert.equal(sum(result),31667)
 assert.equal(result.reduce((n,p)=>n+p.quantity,0),5)
 assert.ok(result.every(p=>p.value>=0 && p.value<=100))
 assert.equal(sum(declaredProducts([{name:'Joia',quantity:3,value:10}],{subtotal:30,discount:0.01})),2999)
 assert.equal(products[0].value,100)
 assert.equal(sum(declaredProducts(products,{subtotal:400,discount:400})),0)
})
test('saved legacy net lines are not discounted twice, and divergent amounts remain blocked',()=>{
 const net=[{name:'Compra antiga',quantity:2,value:40}]
 assert.equal(declaredProducts(net,{discount:0}),net)
 for(const order of [{subtotal:79,discount:10},{subtotal:80,discount:81},{subtotal:80,discount:-1},{subtotal:80,discount:'bad'}]) assert.throws(()=>declaredProducts(net,order))
 assert.throws(()=>declaredProducts([{name:'Joia',quantity:1.5,value:10}],{discount:0}))
})
