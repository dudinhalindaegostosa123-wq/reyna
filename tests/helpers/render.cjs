const { load } = require('./load.cjs')

function renderer(file, mocks, globals = {}) {
  let cursor = 0
  const hooks = []
  let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useId() { return `test-id-${cursor++}` },
    useState(value) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof value === 'function' ? value() : value
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next }]
    },
    useRef(value) { const index = cursor++; return hooks[index] ||= { current: value } },
    useMemo(fn, deps) {
      const index = cursor++
      if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { value: fn(), deps }
      return hooks[index].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const index = cursor++
      if (!hooks[index] || !same(hooks[index].deps, deps)) {
        const previous = hooks[index]
        hooks[index] = { deps }
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = fn() })
      }
    },
  }
  const element = (type, props) => ({ type, props: props || {} })
  const module = load(file, {
    ...mocks, react,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'fragment' },
  }, {}, { setInterval: () => 1, clearInterval() {}, ...globals })
  return {
    render(props) { cursor = 0; return module.default(props) },
    flush() { const current = effects; effects = []; current.forEach(effect => effect()) },
  }
}
function nodes(tree, predicate) {
  if (tree == null || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate))
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
function storage() {
  const values = new Map()
  return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
module.exports = { renderer, nodes, storage }
