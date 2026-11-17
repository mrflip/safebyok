// thread-22-recase.cjs -- the validator_names rename, by the TypeScript checker.
//
//   REPO_ROOT=<worktree> node recase.cjs <mode> <tsconfig> <absolute dir to edit> [--dry]
//
// Thread 22's tool, kept so a branch cut before #322 can re-run the rename over its own code
// rather than merge it: `ns`, then `rename`, then `verify`, each run over every adapter, the demo
// and e2e (each with its own tsconfig) before the core, whose src must still be pre-rename.
// CORE_ONLY=1 leaves safebyok-convex's own component validators alone, as #322's core rename
// commit did (they are renamed in a commit of their own). thread-22-validator_names.md says more.
//
// mode `rename`: every Zod validator declared under packages/safebyok/src (and convex's
//   component/validators.ts) whose name starts with a capital is renamed lowerFirst, in value
//   positions only (an expression, `typeof X`, a destructured binding, the Validator call's
//   returned key, an import or export specifier). A type position keeps the name, the type's.
// mode `ns`: every value import of a validator by name from a shapes module becomes a namespace:
//   `import * as BX from './shapes/box'` and `BX.boxRecord`; types stay imported by name. One
//   from the package's entry point stays a named import, as #322 left those (thread 27).
//
// Amended by thread 27 (winboard/20261025-restyle/thread-27-restyle_tidy.md), superseding
// thread-22-validator_names.md's "For a later branch", which is kept as it was:
//   1. Rebase onto `5254c7c6` (the moves).
//   2. Run `ns`, then `rename`, then `verify`, under CORE_ONLY=1: each adapter, the demo and e2e
//      before the core, whose src must still be pre-rename.
//   3. Lowercase the `*Vals` with `perl -pi -e 's/\b(<lists>)\b/lcfirst($1)/ge'`.
//   4. Rebase onto #322's tip. A conflict there is a name, and #322's side wins.
//   5. #322 removed the `Validators` namespace export. A file that reached validators through it
//      comes out of step 2 as `Validators.boxRecord`: make it `Safebyok`, the main entry
//      star-imported (`perl -pi -e 's/import \{ Validators \} from/import * as Safebyok from/;
//      s/\bValidators\./Safebyok./g'`), or import the one or two it reaches by name. A
//      `Validators` destructured from a star import of the entry (convex's validators test) is
//      mended by hand.
'use strict'
const path = require('path')
const fs = require('fs')
const Root = path.resolve(process.env.REPO_ROOT || process.cwd())
const ts = require(path.join(Root, 'packages/safebyok/node_modules/typescript'))

const [mode, tsconfigArg, onlyUnder, ...flags] = process.argv.slice(2)
const tsconfigPath = path.resolve(tsconfigArg)
const dry = flags.includes('--dry')
const CoreSrc = path.join(Root, 'packages/safebyok/src')
const ConvexValidators = path.join(Root, 'packages/safebyok-convex/src/component/validators.ts')
const CoreOnly = process.env.CORE_ONLY === '1'

const NsFor = {
  'shapes/primitives.ts':       'PX',
  'shapes/fields.ts':           'FX',
  'shapes/scopes.ts':           'CX',
  'shapes/box.ts':              'BX',
  'shapes/device.ts':           'DX',
  'shapes/vault.ts':            'VX',
  'shapes/vault-db.ts':         'VDX',
  'shapes/bank-opts.ts':        'OX',
  'shapes/key-deriver-spec.ts': 'KX',
  'shapes/mask.ts':             'MX',
}
const nsOfFile = (fileName) => {
  if (fileName === ConvexValidators) { return CoreOnly ? null : 'CVX' }
  const rel = path.relative(CoreSrc, fileName)
  // The package's entry points: a validator imported from one by name stays so, as #322 left it.
  if (rel === 'index.ts' || rel === 'validators.ts') { return null }
  return NsFor[rel] ?? null
}

const lowerFirst = (name) => name[0].toLowerCase() + name.slice(1)

// == Program

const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfigPath))
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()

const resolve = (sym) => {
  let seen = 0
  while (sym && (sym.flags & ts.SymbolFlags.Alias) && seen++ < 20) { sym = checker.getAliasedSymbol(sym) }
  return sym
}

const isZodSymbol = (sym) => {
  if (! sym || ! (sym.flags & ts.SymbolFlags.Variable)) { return false }
  const decl = sym.valueDeclaration
  if (! decl) { return false }
  const type = checker.getTypeOfSymbolAtLocation(sym, decl)
  return Boolean(type.getProperty('_zod')) || isConvexValidatorType(type)
}
const isConvexValidatorType = (type) => Boolean(type.getProperty('isConvexValidator'))

const declaredUnderTargets = (sym) => (sym?.declarations ?? []).some((decl) => {
  const fileName = decl.getSourceFile().fileName
  return fileName.startsWith(CoreSrc + '/') || (! CoreOnly && fileName === ConvexValidators)
})

/** A validator renamed: declared in a target file, a Zod (or Convex) schema, capitalized. */
const isRenamed = (sym) => sym && declaredUnderTargets(sym) && /^[A-Z]/.test(sym.name) && isZodSymbol(sym)

/** A validator reached by namespace: exported from a target module (any case). */
const isValidator = (sym) => sym && declaredUnderTargets(sym) && isZodSymbol(sym)

// == Positions

/** 'type' for a type position, 'query' for `typeof X`, 'value' otherwise. */
const positionOf = (node) => {
  let cur = node
  let sawType = false
  while (cur.parent) {
    const parent = cur.parent
    if (parent.kind === ts.SyntaxKind.TypeQuery) { return 'query' }
    if (ts.isQualifiedName(parent)) { cur = parent; continue }
    if (ts.isTypeNode(parent)) { sawType = true; cur = parent; continue }
    if (ts.isExpressionWithTypeArguments(parent) && ts.isHeritageClause(parent.parent) && parent.parent.token === ts.SyntaxKind.ImplementsKeyword) { return 'type' }
    break
  }
  if (sawType) { return 'type' }
  if (ts.isTypeAliasDeclaration(node.parent) && node.parent.name === node) { return 'typedecl' }
  if (ts.isInterfaceDeclaration(node.parent) && node.parent.name === node) { return 'typedecl' }
  return 'value'
}

/** The identifiers of a source file, JSDoc left out. */
const identifiersOf = (sf) => {
  const ids = []
  const visit = (node) => {
    if (ts.isIdentifier(node)) { ids.push(node) }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return ids
}

// == Edits

const edits = new Map()   // fileName -> [{ start, end, text }]
const addEdit = (sf, start, end, text) => {
  if (! edits.has(sf.fileName)) { edits.set(sf.fileName, []) }
  edits.get(sf.fileName).push({ start, end, text })
}
const flush = () => {
  for (const [fileName, list] of edits) {
    list.sort((aa, bb) => bb.start - aa.start)
    let text = fs.readFileSync(fileName, 'utf8')
    let lastStart = Infinity
    for (const edit of list) {
      if (edit.end > lastStart) { throw new Error(`overlapping edits in ${fileName} at ${edit.start}`) }
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
      lastStart = edit.start
    }
    if (dry) { console.log('would write', path.relative(Root, fileName), list.length, 'edits') } else { fs.writeFileSync(fileName, text) }
  }
}

const filesToEdit = program.getSourceFiles().filter((sf) => (
  sf.fileName.startsWith(onlyUnder) && ! sf.fileName.includes('/node_modules/') && ! sf.fileName.includes('/_generated/') && ! sf.isDeclarationFile
))

// == Mode rename

const runRename = () => {
  for (const sf of filesToEdit) {
    const importSpecifierUses = new Map()   // ImportSpecifier node -> { value, query, type }
    for (const id of identifiersOf(sf)) {
      const parent = id.parent
      // A Validator call's returned key, matched to a binding that is renamed.
      if ((ts.isPropertyAssignment(parent) && parent.name === id)) {
        if (returnedKeyOfRenamedBinding(parent, id)) { addEdit(sf, id.getStart(sf), id.end, lowerFirst(id.text)) }
        continue
      }
      if (ts.isImportSpecifier(parent)) { continue }
      if (ts.isExportSpecifier(parent)) { handleExportSpecifier(sf, parent, id); continue }
      if (ts.isShorthandPropertyAssignment(parent) && parent.name === id) {
        const valueSym = checker.getShorthandAssignmentValueSymbol(parent)
        const target = resolve(valueSym)
        if (isRenamed(target)) {
          noteImportUse(importSpecifierUses, valueSym, 'value')
          if (isBindingReturn(parent)) { addEdit(sf, id.getStart(sf), id.end, lowerFirst(id.text)) } else { addEdit(sf, id.getStart(sf), id.end, `${id.text}: ${lowerFirst(target.name)}`) }
        }
        continue
      }
      let sym
      try { sym = checker.getSymbolAtLocation(id) } catch { continue }
      if (! sym) { continue }
      const target = resolve(sym)
      if (! isRenamed(target)) { continue }
      if (id.text !== target.name && ! (ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent))) {
        // An alias under another local name: leave it.
        noteImportUse(importSpecifierUses, sym, positionOf(id))
        continue
      }
      const pos = positionOf(id)
      if (pos === 'type' || pos === 'typedecl') { noteImportUse(importSpecifierUses, sym, 'type'); continue }
      noteImportUse(importSpecifierUses, sym, pos)
      if (! ts.isPropertyAccessExpression(parent) && ! ts.isQualifiedName(parent)) {
        const newName = lowerFirst(id.text)
        const there = checker.resolveName(newName, id, ts.SymbolFlags.Value, false)
        if (there && resolve(there) !== target) { console.log('SHADOW', path.relative(Root, sf.fileName), sf.getLineAndCharacterOfPosition(id.getStart(sf)).line + 1, newName) }
      }
      addEdit(sf, id.getStart(sf), id.end, lowerFirst(id.text))
    }
    rewriteImportSpecifiers(sf, importSpecifierUses)
  }
}

const noteImportUse = (uses, sym, pos) => {
  if (! sym || ! (sym.flags & ts.SymbolFlags.Alias)) { return }
  const spec = (sym.declarations ?? []).find((decl) => ts.isImportSpecifier(decl))
  if (! spec) { return }
  if (! uses.has(spec)) { uses.set(spec, { value: 0, query: 0, type: 0 }) }
  const counts = uses.get(spec)
  if (pos === 'value') { counts.value++ } else if (pos === 'query') { counts.query++ } else { counts.type++ }
}

/** True for `{ Foo }` returned from a Validator call whose result binds `Foo`: the key renames with the binding. */
const isBindingReturn = (shorthand) => Boolean(validatorCallOf(shorthand))

/** The Validator(...) call a returned object literal sits in, where the call's result is destructured. */
const validatorCallOf = (node) => {
  let cur = node
  while (cur) {
    if (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && cur.expression.text === 'Validator') {
      const decl = cur.parent
      if (ts.isVariableDeclaration(decl) && ts.isObjectBindingPattern(decl.name)) { return cur }
      return null
    }
    cur = cur.parent
  }
  return null
}

const returnedKeyOfRenamedBinding = (assignment, id) => {
  const call = validatorCallOf(assignment)
  if (! call) { return false }
  if (! /^[A-Z]/.test(id.text)) { return false }
  // Only a key of the object the callback returns: its own object literal is a direct child of the
  // arrow's body or of a return statement.
  const literal = assignment.parent
  const holder = literal.parent
  const returned = ts.isParenthesizedExpression(holder) || ts.isReturnStatement(holder) || ts.isArrowFunction(holder)
  if (! returned) { return false }
  const binding = call.parent.name.elements.find((el) => ! el.propertyName && el.name.text === id.text)
  return Boolean(binding)
}

const handleExportSpecifier = (sf, spec, id) => {
  // `export { Foo } from './x'` or `export { Foo }`: Foo, the value, is renamed; the type keeps its name.
  if (spec.propertyName && spec.propertyName !== id) {
    // `export { a as B }`: rename the exported side only when it is the validator's own name.
    return
  }
  let sym
  try { sym = checker.getExportSpecifierLocalTargetSymbol(spec) ?? checker.getSymbolAtLocation(id) } catch { return }
  const target = resolve(sym)
  if (! isRenamed(target)) { return }
  const isTypeToo = Boolean(target.flags & ts.SymbolFlags.Type)
  const isValidatorsFile = path.relative(CoreSrc, sf.fileName) === 'validators.ts'
  const declIsTypeOnly = spec.parent.parent.isTypeOnly || spec.isTypeOnly
  if (declIsTypeOnly) { return }
  const newText = lowerFirst(id.text) + (isTypeToo && ! isValidatorsFile ? `, type ${id.text}` : '')
  addEdit(sf, spec.getStart(sf), spec.end, newText)
}

const rewriteImportSpecifiers = (sf, uses) => {
  for (const [spec, counts] of uses) {
    const imported = (spec.propertyName ?? spec.name).text
    const local = spec.name.text
    if (local !== imported) { continue }
    const declTypeOnly = spec.parent.parent.isTypeOnly
    const specTypeOnly = spec.isTypeOnly || declTypeOnly
    const parts = []
    const typeKw = declTypeOnly ? '' : 'type '
    if (counts.value > 0) { parts.push(lowerFirst(imported)) } else if (counts.query > 0) { parts.push((specTypeOnly ? typeKw : '') + lowerFirst(imported)) }
    if (counts.type > 0) { parts.push(typeKw + imported) }
    if (parts.length === 0) { parts.push(spec.getText(sf)) }
    addEdit(sf, spec.getStart(sf), spec.end, parts.join(', '))
  }
}

// == Mode ns

const runNs = () => {
  for (const sf of filesToEdit) {
    const added = new Set()
    for (const stmt of sf.statements) {
      if (! ts.isImportDeclaration(stmt) || ! stmt.importClause) { continue }
      const modSym = checker.getSymbolAtLocation(stmt.moduleSpecifier)
      const modFile = modSym?.valueDeclaration?.getSourceFile?.()?.fileName ?? modSym?.declarations?.[0]?.getSourceFile().fileName
      if (! modFile) { continue }
      const ns = nsOfFile(modFile)
      if (! ns) { continue }
      const clause = stmt.importClause
      const bindings = clause.namedBindings
      if (! bindings) { continue }
      if (ts.isNamespaceImport(bindings)) {
        // An existing namespace under another name takes the module's one name.
        if (bindings.name.text !== ns) { renameNamespace(sf, bindings, ns) }
        continue
      }
      const moved = []     // { spec, imported, local, typeUses }
      for (const spec of bindings.elements) {
        if (spec.isTypeOnly && clause.isTypeOnly) { continue }
        const sym = checker.getSymbolAtLocation(spec.name)
        const target = resolve(sym)
        if (! isValidator(target)) { continue }
        const imported = (spec.propertyName ?? spec.name).text
        moved.push({ spec, sym, imported, local: spec.name.text, typeOnly: spec.isTypeOnly || clause.isTypeOnly })
      }
      if (moved.length === 0) { continue }
      const keptTypes = []
      for (const entry of moved) {
        let typeUses = 0
        const pending = []
        for (const id of identifiersOf(sf)) {
          if (id.text !== entry.local) { continue }
          if (ts.isImportSpecifier(id.parent)) { continue }
          const parent = id.parent
          if (ts.isPropertyAccessExpression(parent) && parent.name === id) { continue }
          if (ts.isQualifiedName(parent) && parent.right === id) { continue }
          if (ts.isPropertyAssignment(parent) && parent.name === id) { continue }
          if (ts.isShorthandPropertyAssignment(parent) && parent.name === id) {
            const valueSym = checker.getShorthandAssignmentValueSymbol(parent)
            if (valueSym !== entry.sym) { continue }
            pending.push([id, `${id.text}: ${ns}.${entry.imported}`])
            entry.hasValue = true
            continue
          }
          let sym
          try { sym = checker.getSymbolAtLocation(id) } catch { continue }
          if (sym !== entry.sym) { continue }
          const pos = positionOf(id)
          if (pos === 'type') { typeUses++; continue }
          if (pos === 'typedecl') { continue }
          if (pos === 'value') { entry.hasValue = true }
          if (pos === 'query') { entry.hasQuery = true }
          pending.push([id, `${ns}.${entry.imported}`])
        }
        entry.reached = pending.length > 0
        for (const [id, text] of pending) { addEdit(sf, id.getStart(sf), id.end, text) }
        if (typeUses > 0 && entry.reached) { keptTypes.push(entry.imported === entry.local ? entry.imported : `${entry.imported} as ${entry.local}`) }
      }
      // A validator's name imported for its type alone stays as it is.
      for (let ii = moved.length - 1; ii >= 0; ii--) { if (! moved[ii].reached) { moved.splice(ii, 1) } }
      if (moved.length === 0) { continue }
      // Rewrite the declaration.
      const movedSpecs = new Set(moved.map((entry) => entry.spec))
      const rest = bindings.elements.filter((spec) => ! movedSpecs.has(spec)).map((spec) => spec.getText(sf))
      const spec = stmt.moduleSpecifier.getText(sf)
      const lines = []
      const needsValueNs = moved.some((entry) => entry.hasValue)
      const restAll = [...rest]
      const typeSpecs = keptTypes.map((name) => (clause.isTypeOnly ? name : `type ${name}`))
      const named = [...restAll, ...typeSpecs]
      if (clause.name || named.length > 0) {
        const defaultPart = clause.name ? clause.name.getText(sf) + (named.length > 0 ? ', ' : '') : ''
        const everyTyped = ! clause.name && named.every((text) => text.startsWith('type '))
        if (everyTyped) { for (let ii = 0; ii < named.length; ii++) { named[ii] = named[ii].slice('type '.length) } }
        const allTypeOnly = clause.isTypeOnly || everyTyped
        lines.push(`import ${allTypeOnly ? 'type ' : ''}${defaultPart}${named.length > 0 ? `{ ${named.join(', ')} }` : ''} from ${spec}`)
      }
      const existing = namespaceImportOf(sf, spec, ns)
      if (! existing && ! added.has(ns)) {
        lines.push(`import ${needsValueNs ? '' : 'type '}* as ${ns} from ${spec}`)
        added.add(ns)
      } else if (existing && existing.importClause.isTypeOnly && needsValueNs) {
        addEdit(sf, existing.getStart(sf), existing.end, `import * as ${ns} from ${spec}`)
      }
      addEdit(sf, stmt.getStart(sf), stmt.end, lines.join('\n'))
    }
  }
}

const namespaceImportOf = (sf, specText, ns) => sf.statements.find((stmt) => (
  ts.isImportDeclaration(stmt) && stmt.moduleSpecifier.getText(sf) === specText && stmt.importClause?.namedBindings
  && ts.isNamespaceImport(stmt.importClause.namedBindings) && stmt.importClause.namedBindings.name.text === ns
))

const renameNamespace = (sf, bindings, ns) => {
  const oldName = bindings.name.text
  const sym = checker.getSymbolAtLocation(bindings.name)
  addEdit(sf, bindings.name.getStart(sf), bindings.name.end, ns)
  for (const id of identifiersOf(sf)) {
    if (id.text !== oldName || id === bindings.name) { continue }
    const parent = id.parent
    if (ts.isPropertyAccessExpression(parent) && parent.name === id) { continue }
    if (ts.isQualifiedName(parent) && parent.right === id) { continue }
    let idSym
    try { idSym = checker.getSymbolAtLocation(id) } catch { continue }
    if (idSym !== sym) { continue }
    addEdit(sf, id.getStart(sf), id.end, ns)
  }
}

const runVerify = () => {
  // A validator named in a value import: made `type` where only its type is used, reported otherwise.
  // A VALUE line for an import from the package's entry point is as #322 left it; one from a shapes
  // module is a use `ns` missed.
  for (const sf of filesToEdit) {
    for (const stmt of sf.statements) {
      if (! ts.isImportDeclaration(stmt) || ! stmt.importClause || stmt.importClause.isTypeOnly) { continue }
      const bindings = stmt.importClause.namedBindings
      if (! bindings || ! ts.isNamedImports(bindings)) { continue }
      for (const spec of bindings.elements) {
        if (spec.isTypeOnly) { continue }
        const sym = checker.getSymbolAtLocation(spec.name)
        const target = resolve(sym)
        if (! isValidator(target)) { continue }
        const where = `${path.relative(Root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(spec.getStart(sf)).line + 1}`
        let valueUse = false
        for (const id of identifiersOf(sf)) {
          if (id.text !== spec.name.text || ts.isImportSpecifier(id.parent)) { continue }
          let idSym
          try { idSym = checker.getSymbolAtLocation(id) } catch { continue }
          if (idSym === sym && positionOf(id) !== 'type') { valueUse = true }
        }
        if (valueUse) { console.log('VALUE', where, spec.name.text) } else { console.log('TYPE ', where, spec.name.text); addEdit(sf, spec.getStart(sf), spec.end, `type ${spec.getText(sf)}`) }
      }
    }
  }
}

if (mode === 'rename') { runRename() } else if (mode === 'ns') { runNs() } else if (mode === 'verify') { runVerify() } else { throw new Error(`mode? ${mode}`) }
flush()
