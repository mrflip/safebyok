/**
 * The names a package's entries forget: each type that a public signature of an entry names,
 * declared in the package itself, that neither the entry nor the package's front door exports. A
 * host that must write that type, to annotate a variable or a parameter, has no name to import it
 * by. A host has the front door (`.`) whichever entry it imports from, so a companion entry such
 * as `./testing` may leave a name to it. The entries are the `@safebyok/source` files of the
 * package's `exports`. packages/safebyok runs it in its `typecheck`, so `pnpm justify` and CI
 * fail on a name forgotten.
 *
 * It walks from what each entry exports through their public signatures (parameters, returns,
 * properties, heritage, type parameters, and what a type alias is), and on through each
 * declaration of the package those name. A value that a signature names by `typeof` is followed
 * but never reported: the type that names it is what a host imports. Declarations outside the
 * package, safebyok-big's among them, are never walked into: only the package's own signatures
 * are its promise.
 *
 * Prints one line per name forgotten, and nothing when none is:
 *
 *   node scripts/forgotten-exports.ts <pkgdir>
 *   src/storage.ts forgets Watcher (src/storage/memory-vault-db.ts), named by MemoryVaultDB
 *
 * Exits 0 when no entry forgets a name, 1 when one does, and 2 on a usage error.
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

/** One name an entry forgets: the type, where it is declared, and the exported names whose signatures name it */
export interface Forgotten {
  /** The entry's file, from the package's directory */
  entry:    string
  /** The type's name, as declared */
  typename: string
  /** The file that declares it, from the package's directory */
  file:     string
  /** The declarations whose signatures name it, by name, in the order met */
  namedBy:  string[]
}

/** A package's entry: its subpath in `exports`, and its source file from the package's directory */
export interface SourceEntry {
  subpath: string
  source:  string
}

/**
 * The source files of a package's entries: the `@safebyok/source` condition of each of its
 * `exports`. A subpath with no such condition (`./package.json`) is no entry.
 *
 * @param manifest - The package's `package.json`, parsed.
 * @returns Each entry, in the order `exports` lists them.
 *
 * @example sourceEntries({ exports: { '.': { '@safebyok/source': './src/index.ts', import: './dist/index.js' } } })
 *   // => [{ subpath: '.', source: 'src/index.ts' }]
 */
export function sourceEntries(manifest: { exports?: Record<string, unknown> }): SourceEntry[] {
  const sourced = Object.entries(manifest.exports ?? {}).map(([subpath, target]) => {
    const source = (typeof target === 'object' && target !== null) ? (target as Record<string, unknown>)['@safebyok/source'] : undefined
    return { subpath, source }
  })
  return sourced.filter((sourcedEntry): sourcedEntry is SourceEntry => typeof sourcedEntry.source === 'string')
    .map(({ subpath, source }) => ({ subpath, source: path.normalize(source) }))
}

/**
 * Each name the package's entries forget, entry by entry, as its `tsconfig.json` compiles it.
 *
 * @param pkgdir - The package's directory, holding its `package.json` and `tsconfig.json`.
 * @returns The names forgotten, by entry and then by name; empty when none is.
 */
export function forgottenExports(pkgdir: string): Forgotten[] {
  const pkgroot = realpathSync(pkgdir)
  const manifest = JSON.parse(readFileSync(path.join(pkgroot, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }
  const entries = sourceEntries(manifest)
  const config = ts.getParsedCommandLineOfConfigFile(path.join(pkgroot, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (diag) => { throw new Error(ts.flattenDiagnosticMessageText(diag.messageText, '\n')) } })
  if (! config) { throw new Error(`forgotten-exports: no tsconfig.json in ${pkgroot}`) }
  const program = ts.createProgram({ rootNames: [...config.fileNames, ...entries.map(({ source }) => path.join(pkgroot, source))], options: config.options })
  const checker = program.getTypeChecker()
  const frontDoor = entries.find(({ subpath }) => subpath === '.')
  const remembered = frontDoor ? exportsOf(program, checker, pkgroot, frontDoor.source) : new Set<ts.Symbol>()
  return entries.flatMap(({ source }) => forgottenOfEntry(program, checker, pkgroot, source, remembered))
}

/** What an entry exports, with the members of each namespace it exports, which a host reaches as `Ns.Member` */
function exportsOf(program: ts.Program, checker: ts.TypeChecker, pkgroot: string, entry: string): Set<ts.Symbol> {
  const sourceFile = program.getSourceFile(path.join(pkgroot, entry))
  const moduleSym = sourceFile && checker.getSymbolAtLocation(sourceFile)
  if (! moduleSym) { throw new Error(`forgotten-exports: ${entry} is not a module the package's tsconfig.json compiles`) }
  const topSyms = checker.getExportsOfModule(moduleSym).map((sym) => unalias(checker, sym))
  const namespaces = topSyms.filter((sym) => (sym.flags & ts.SymbolFlags.ValueModule) !== 0)
  const memberSyms = namespaces.flatMap((sym) => checker.getExportsOfModule(sym).map((member) => unalias(checker, member)))
  return new Set([...topSyms, ...memberSyms])
}

/** What an alias stands for, or the symbol itself when it is no alias */
function unalias(checker: ts.TypeChecker, sym: ts.Symbol): ts.Symbol {
  return (sym.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(sym) : sym
}

/** True when the file is the package's own: under its directory, and not under a `node_modules` */
function isOwnFile(pkgroot: string, file: string): boolean {
  return file.startsWith(pkgroot + path.sep) && ! file.includes(`${path.sep}node_modules${path.sep}`)
}

/** The package's own declarations of a symbol */
function ownDeclarations(pkgroot: string, sym: ts.Symbol): ts.Declaration[] {
  return (sym.declarations ?? []).filter((decl) => isOwnFile(pkgroot, decl.getSourceFile().fileName))
}

/** The name a type reference, a `typeof` or a heritage clause names, or undefined for any other node */
function nameIn(tsnode: ts.Node): ts.Node | undefined {
  if (ts.isTypeReferenceNode(tsnode)) { return tsnode.typeName }
  if (ts.isTypeQueryNode(tsnode)) { return tsnode.exprName }
  if (ts.isExpressionWithTypeArguments(tsnode)) { return tsnode.expression }
  return undefined
}

/** The last identifier of a name, `B` of `A.B`, whose symbol is the one named */
function leafOf(nameNode: ts.Node): ts.Node {
  if (ts.isQualifiedName(nameNode)) { return nameNode.right }
  if (ts.isPropertyAccessExpression(nameNode)) { return nameNode.name }
  return nameNode
}

/** True when a class or interface member is hidden from a host: `#private` or `private` */
function isHidden(member: ts.NamedDeclaration): boolean {
  if (member.name && ts.isPrivateIdentifier(member.name)) { return true }
  return (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private) !== 0
}

/** The type nodes of a declaration's public signature: what a host's code meets when it uses the declaration */
function signatureTypes(decl: ts.Declaration): (ts.Node | undefined)[] {
  if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
    const heirs = (decl.heritageClauses ?? []).flatMap((clause) => clause.types)
    const members: ts.NamedDeclaration[] = [...decl.members]
    const shown = members.filter((member) => ! isHidden(member))
    return [...heirs, ...typeParamTypes(decl.typeParameters), ...shown.flatMap((member) => memberTypes(member))]
  }
  if (ts.isTypeAliasDeclaration(decl)) { return [...typeParamTypes(decl.typeParameters), decl.type] }
  if (ts.isFunctionDeclaration(decl)) { return memberTypes(decl) }
  if (ts.isVariableDeclaration(decl)) { return [decl.type ?? assertedType(decl.initializer)] }
  return []
}

/** The type nodes of a member's signature: its type parameters, parameters, and its type or return type */
function memberTypes(member: ts.NamedDeclaration): (ts.Node | undefined)[] {
  const typeParams = 'typeParameters' in member ? member.typeParameters as ts.NodeArray<ts.TypeParameterDeclaration> | undefined : undefined
  const params = 'parameters' in member ? member.parameters as ts.NodeArray<ts.ParameterDeclaration> : []
  const own = 'type' in member ? member.type as ts.TypeNode | undefined : undefined
  return [...typeParamTypes(typeParams), ...params.map((param) => param.type), own]
}

function typeParamTypes(typeParams: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): (ts.TypeNode | undefined)[] {
  return (typeParams ?? []).flatMap((param) => [param.constraint, param.default])
}

/** The type an unannotated variable's initializer is asserted to with `as` or `satisfies`, which is the type it has */
function assertedType(init: ts.Expression | undefined): ts.TypeNode | undefined {
  let bare = init
  while (bare && ts.isParenthesizedExpression(bare)) { bare = bare.expression }
  if (bare && (ts.isAsExpression(bare) || ts.isSatisfiesExpression(bare))) { return bare.type }
  return undefined
}

function forgottenOfEntry(program: ts.Program, checker: ts.TypeChecker, pkgroot: string, entry: string, remembered: Set<ts.Symbol>): Forgotten[] {
  const exported = exportsOf(program, checker, pkgroot, entry)
  const forgotten = new Map<ts.Symbol, Forgotten>()
  const seen = new Set<ts.Symbol>()
  const queue = [...exported].filter((sym) => ownDeclarations(pkgroot, sym).length > 0)

  // A name met in `from`'s signature: report it when it is a type the host cannot import, and walk on into it.
  function meet(nameNode: ts.Node, from: string): void {
    const found = checker.getSymbolAtLocation(leafOf(nameNode))
    const sym = found && unalias(checker, found)
    const decls = sym ? ownDeclarations(pkgroot, sym) : []
    if (! sym || decls.length === 0 || (sym.flags & ts.SymbolFlags.TypeParameter)) { return }
    if ((sym.flags & ts.SymbolFlags.Type) && ! exported.has(sym) && ! remembered.has(sym)) {
      const gone = forgotten.get(sym) ?? { entry, typename: sym.getName(), file: path.relative(pkgroot, decls[0]!.getSourceFile().fileName), namedBy: [] }
      if (! gone.namedBy.includes(from)) { gone.namedBy.push(from) }
      forgotten.set(sym, gone)
    }
    queue.push(sym)
  }

  function walk(tsnode: ts.Node, from: string): void {
    const nameNode = nameIn(tsnode)
    if (nameNode) { meet(nameNode, from) }
    ts.forEachChild(tsnode, (child) => { walk(child, from) })
  }

  while (queue.length > 0) {
    const sym = queue.shift()!
    if (seen.has(sym)) { continue }
    seen.add(sym)
    const decls = ownDeclarations(pkgroot, sym)
    const types = decls.flatMap((decl) => signatureTypes(decl))
    for (const typeNode of types) { if (typeNode) { walk(typeNode, sym.getName()) } }
  }
  return [...forgotten.values()].toSorted((aa, bb) => aa.typename.localeCompare(bb.typename))
}

/**
 * One name forgotten as a line for a person to read.
 *
 * @example describeForgotten({ entry: 'src/storage.ts', typename: 'Watcher', file: 'src/storage/memory-vault-db.ts', namedBy: ['MemoryVaultDB'] })
 *   // => 'src/storage.ts forgets Watcher (src/storage/memory-vault-db.ts), named by MemoryVaultDB'
 */
export function describeForgotten(gone: Forgotten): string {
  return `${gone.entry} forgets ${gone.typename} (${gone.file}), named by ${gone.namedBy.join(', ')}`
}

function main(argv: readonly string[]): number {
  const [pkgdir, ...rest] = argv
  if (! pkgdir || rest.length > 0) {
    process.stderr.write('Usage: node scripts/forgotten-exports.ts <pkgdir>\n')
    return 2
  }
  const forgotten = forgottenExports(pkgdir)
  for (const gone of forgotten) { process.stdout.write(`${describeForgotten(gone)}\n`) }
  return forgotten.length > 0 ? 1 : 0
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
