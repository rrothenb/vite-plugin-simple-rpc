var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  default: () => SimpleRPCPlugin
});
module.exports = __toCommonJS(src_exports);
var import_typescript = __toESM(require("typescript"));
var import_astring = require("astring");
var import_acorn_walk = require("acorn-walk");
var import_glob = require("glob");
var apiRoutes = {};
var buildExpressionAst = (name, basePath, serverRoutes, parse) => {
  const fullPath = `${basePath}/${name}`;
  const func = serverRoutes[fullPath];
  const parms = func.toString().replace(/\n/g, " ").replace(/^[^(]*\(/, "").replace(/\).*$/, "");
  return parse(`{return (await fetch('/server${fullPath}', {method: 'POST', body:  JSON.stringify([${parms}])})).json()}`, { allowReturnOutsideFunction: true }).body[0];
};
function SimpleRPCPlugin() {
  return {
    name: "vite-plugin-simple-rpc",
    transform: async function(code, id) {
      if (id.startsWith(process.cwd() + "/src/server/")) {
        const urlPath = id.replace(/^.*server/, "").replace(/\.ts$/, "");
        const importPath = process.cwd() + `/.rpc/build${urlPath}.js`;
        const ast = this.parse(code);
        const module2 = await import(importPath);
        const exportedAsyncFunctions = Object.keys(module2).filter((endpoint) => module2[endpoint].constructor.name === "AsyncFunction");
        exportedAsyncFunctions.forEach((exportedFunc) => {
          apiRoutes[`${urlPath}/${exportedFunc}`] = module2[exportedFunc];
        });
        ast.body = ast.body.filter((statement) => {
          if (statement.type === "ExportNamedDeclaration") {
            if (statement.declaration.type === "VariableDeclaration") {
              return exportedAsyncFunctions.some((func) => statement.declaration.declarations.some((declaration) => declaration.id.name === func));
            } else if (statement.declaration.type === "FunctionDeclaration") {
              return exportedAsyncFunctions.some((func) => func === statement.declaration.id.name);
            } else {
              return false;
            }
          }
          return false;
        });
        const parse = this.parse;
        (0, import_acorn_walk.simple)(ast, {
          VariableDeclarator(node) {
            node.init.expression = false;
            node.init.body = buildExpressionAst(node.id.name, urlPath, apiRoutes, parse);
          },
          FunctionDeclaration(node) {
            node.body = buildExpressionAst(node.id.name, urlPath, apiRoutes, parse);
          }
        });
        const newCode = (0, import_astring.generate)(ast);
        return {
          code: newCode,
          map: { mappings: "" }
        };
      }
    },
    configureServer: function(server) {
      server.middlewares.use("/server", function(req, res) {
        if (apiRoutes[req.url]) {
          const body = [];
          req.on("data", (chunk) => {
            body.push(chunk);
          }).on("end", async () => {
            const payload = JSON.parse(Buffer.concat(body).toString());
            const result = JSON.stringify(await apiRoutes[req.url](...payload));
            res.end(result);
          });
        }
      });
    },
    buildStart: async function() {
      const files = await (0, import_glob.glob)("src/server/**/*.{js,ts}");
      const program = import_typescript.default.createProgram(files, {
        outDir: ".rpc/build",
        moduleResolution: import_typescript.default.ModuleResolutionKind.Node10,
        target: import_typescript.default.ScriptTarget.ESNext,
        module: import_typescript.default.ModuleKind.CommonJS,
        allowJs: true,
        esModuleInterop: true,
        sourceMap: true
      });
      const emitResult = program.emit();
      const allDiagnostics = import_typescript.default.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
      allDiagnostics.forEach((diagnostic) => {
        if (diagnostic.file) {
          const { line, character } = import_typescript.default.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
          const message = import_typescript.default.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
          console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
        } else {
          console.log(import_typescript.default.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
      });
    }
  };
}
