import ts from "typescript"
import { generate } from 'astring'
import {simple} from 'acorn-walk'
import {glob} from 'glob'

const apiRoutes = {}

const buildExpressionAst = (name, basePath, serverRoutes, parse) => {
  const fullPath = `${basePath}/${name}`
  const func = serverRoutes[fullPath]
  const parms = func.toString().replace(/\n/g, ' ').replace(/^[^(]*\(/, '').replace(/\).*$/, '')
  return parse(`{return (await fetch('/server${fullPath}', {method: 'POST', body:  JSON.stringify([${parms}])})).json()}`, {allowReturnOutsideFunction: true}).body[0]
}

export default function SimpleRPCPlugin() {
  return {
    name: 'vite-plugin-simple-rpc',
    transform: async function (code, id) {
      if (id.startsWith(process.cwd()+'/src/server/')) {
        const urlPath = id.replace(/^.*server/, '').replace(/\.ts$/, '')
        const importPath = process.cwd()+`/.rpc/build${urlPath}.js`
        const ast = this.parse(code)
        const module = await import(importPath)
        const exportedAsyncFunctions = Object.keys(module).filter((endpoint) => module[endpoint].constructor.name === 'AsyncFunction')
        exportedAsyncFunctions.forEach(exportedFunc => {
          apiRoutes[`${urlPath}/${exportedFunc}`] = module[exportedFunc]
        })
        ast.body = ast.body.filter(statement => {
          if (statement.type === 'ExportNamedDeclaration') {
            if (statement.declaration.type === 'VariableDeclaration') {
              return exportedAsyncFunctions.some(func => statement.declaration.declarations.some(declaration => declaration.id.name === func))
            } else if (statement.declaration.type === 'FunctionDeclaration') {
              return exportedAsyncFunctions.some(func => func === statement.declaration.id.name)
            } else {
              return false
            }
          }
          return false
        })
        const parse = this.parse
        simple(ast, {
          VariableDeclarator(node) {
            node.init.expression = false
            node.init.body = buildExpressionAst(node.id.name, urlPath, apiRoutes, parse)
          },
          FunctionDeclaration(node) {
            node.body = buildExpressionAst(node.id.name, urlPath, apiRoutes, parse)
          }
        })

        const newCode = generate(ast)
        return {
          code: newCode,
          map: { mappings: '' }
        }
      }
    },
    configureServer: function(server) {
      server.middlewares.use('/server', function (req, res) {
        if (apiRoutes[req.url]) {
          const body = [];
          req
              .on('data', chunk => {
                body.push(chunk);
              })
              .on('end', async () => {
                const payload = JSON.parse(Buffer.concat(body).toString());
                const result = JSON.stringify(await apiRoutes[req.url](...payload))
                res.end(result)
              });
        }
      })
    },
    buildStart: async function() {
      const files = await glob('src/server/**/*.{js,ts}')
      const program = ts.createProgram(files, {
        outDir: '.rpc/build',
        moduleResolution: ts.ModuleResolutionKind.Node10,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
        esModuleInterop: true,
        sourceMap: true
      })
      const emitResult = program.emit();
      const allDiagnostics = ts
          .getPreEmitDiagnostics(program)
          .concat(emitResult.diagnostics);

      allDiagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
          const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
          console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
          console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
      });
    }
  }
}

