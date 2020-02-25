import { readFileSync as readFile, writeFileSync as writeFile, statSync as stat, existsSync as exists } from 'fs'
import { resolve, dirname } from 'path'
import * as ts from 'typescript'

function error(msg: string): never {
  console.error(msg)
  process.exit(1)
}

type Option = {
  input: string
  output: string
}

let option: Option = {} as Option

for (let i = 0; i < process.argv.length; i++) {
  let v = process.argv[i]
  if (i === 2) option.input = v
  if (v === '-o') option.output = process.argv[i + 1]
}

if (!option.input) error('No input is provided.')

let isFile = (path: string) => exists(path) && stat(path).isFile()
let isDir = (path: string) => exists(path) && stat(path).isDirectory()

/* Resolve graph, support follows:
  - module/
  - module/index
  - module/index.ts 
*/
function localModulePath(path: string, from?: string): string {
  let absPath = from ? resolve(dirname(from), path) : resolve(path)
  let tsPath = absPath.endsWith('.ts') ? absPath : absPath + '.ts'
  let indexPath = resolve(absPath, 'index.ts')
  return isFile(tsPath) ? tsPath : isDir(absPath) && isFile(indexPath) ? indexPath : error(`Cannot find module '${path}'.`)
}

let entryFile = localModulePath(option.input)

function npmModulePath(pkg: string, from: string): string {
  let projRoot = dirname(from)
  while (!isDir(resolve(projRoot, 'node_modules'))) {
    projRoot = dirname(projRoot)
  }

  let pkgRoot = resolve(projRoot, 'node_modules', pkg)

  let jsPath = pkgRoot + '.js'
  if (isFile(jsPath)) {
    return jsPath
  }

  let packageJSONPath = resolve(pkgRoot, 'package.json')
  if (isFile(packageJSONPath)) {
    let main: string = require(packageJSONPath).module || require(packageJSONPath).main
    if (main) {
      return resolve(pkgRoot, main)
    }
  }

  let indexPath = resolve(pkgRoot, 'index.js')
  if (isFile(indexPath)) {
    return indexPath
  }

  return error(`Cannot find module '${pkg}'.`)
}

// // Type check
let diagnostics = ts.getPreEmitDiagnostics(
  ts.createProgram([entryFile], {
    strict: true,
    target: ts.ScriptTarget.Latest,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    allowSyntheticDefaultImports: true
  })
)

if (diagnostics.length) {
  diagnostics.forEach(d => console.log(d.messageText))
  error('Type check Error.')
}

// Compile graph

let pathQueue = [entryFile]
let blocks: string[] = []

function compile(path: string) {
  let content = readFile(path, 'utf-8')
  let source: ts.SourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.ES2015)

  source.forEachChild((node: any) => {
    const { ImportDeclaration, ExpressionStatement, FunctionDeclaration, VariableStatement } = ts.SyntaxKind
    switch (node.kind) {
      case ImportDeclaration:
        let moduleSpecifier = node.moduleSpecifier.getText(source)
        let dep = JSON.parse(moduleSpecifier) as string
        let depPath: string
        if (dep.startsWith('.')) {
          depPath = localModulePath(dep, path)
        } else {
          depPath = npmModulePath(dep, path)
        }
        pathQueue.push(depPath)
        break
      case FunctionDeclaration:
        const name = node.name.getText(source)
        const block = node.body.getText(source)
        let c = `function ${name}()${block};`
        blocks.push(c)
        break
      case ExpressionStatement:
        blocks.push(node.expression.getText(source) + ';')
        break
      case VariableStatement:
        blocks.push('var ' + node.declarationList.declarations[0].getText(source))
        break
    }
  })
}

let path
while ((path = pathQueue.shift())) compile(path)

let result = blocks.join('\n\n')

writeFile(option.output, result)
