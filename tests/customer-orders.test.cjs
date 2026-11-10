const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { loadCustomerOrders } = load('src/lib/customer-orders-server.ts')
const userId = '8d5dcd39-52ba-4a64-8592-30338f48987e'
const order = { id: 'owned-order', number: 20, status: 'paid', total: 100 }
function database({ orderError = null, workflowError = null, orders = [order] } = {}) {
  const calls = []
  return { calls, from(table) {
    calls.push(['from', table])
    const query = {
      select(fields) { calls.push(['select', table, fields]); return query },
      eq(field, value) { calls.push(['eq', table, field, value]); return query },
      order() { return query },
      range(a, b) { calls.push(['range', a, b]); return Promise.resolve({ data: orderError ? null : orders, error: orderError, count: orders.length }) },
      in(field, ids) { calls.push(['in', table, field, Array.from(ids)]); return Promise.resolve({ data: [{ id: 'owned-order', workflow_stage: 'paid' }, { id: 'foreign-order', workflow_stage: 'completed' }], error: workflowError }) },
    }
    return query
  } }
}

test('customer orders use canonical account ownership; workflow is queried only by owned IDs', async () => {
  const db = database()
  const result = await loadCustomerOrders(db, userId, 2, 10)
  assert.deepEqual(db.calls.find(c => c[0] === 'eq'), ['eq', 'serenity_orders', 'account_user_id', userId])
  assert.deepEqual(db.calls.find(c => c[0] === 'in'), ['in', 'serenity_admin_order_workflow', 'id', ['owned-order']])
  assert.deepEqual(db.calls.find(c => c[0] === 'range'), ['range', 10, 19])
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].id, 'owned-order')
  assert.equal(result.data[0].workflow_stage, 'paid')
  assert.equal(result.count, 1)
  assert.equal(db.calls.some(c => c[0] === 'eq' && c[1] === 'serenity_admin_order_workflow'), false)
})

test('a workflow failure does not hide paid orders or fabricate a shipping stage', async () => {
  const result = await loadCustomerOrders(database({ workflowError: { code: '42703' } }), userId, 1, 10)
  assert.equal(result.error, null)
  assert.equal(result.data[0].status, 'paid')
  assert.equal(result.data[0].workflow_stage, '')
})

test('failed ownership query, empty orders and invalid account IDs never read workflow', async () => {
  for (const options of [{ orderError: { code: '42501' } }, { orders: [] }]) {
    const db = database(options)
    const result = await loadCustomerOrders(db, userId, 1, 10)
    assert.equal(result.data.length, 0)
    assert.equal(db.calls.some(c => c[1] === 'serenity_admin_order_workflow'), false)
  }
  const db = database()
  await assert.rejects(loadCustomerOrders(db, '', 1, 10), /CUSTOMER_ACCOUNT_ID/)
  assert.equal(db.calls.length, 0)
})
