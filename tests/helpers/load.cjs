const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, mocks = {}, env = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText
  vm.runInNewContext(code, {
    exports,
    process: { env },
    console: { error() {} },
    Buffer, URL, URLSearchParams, Request, Response,
    ...globals,
    AbortController, AbortSignal,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === 'server-only') return {}
      assert.ok(name in mocks, `Unexpected dependency: ${name}`)
      return mocks[name]
    },
  })
  return exports
}

module.exports = { load }
