;(function (modules) {

var executedModules = {};
(function executeModule(id) {
  if (executedModules[id]) return executedModules[id];

  var mod = modules[id];
  var localRequire = function (path) {
    return executeModule(mod[1][path]);
  };
  var module = { exports: {} };
  executedModules[id] = module.exports;
  mod[0](localRequire, module, module.exports);
  return module.exports;
})(0);

})({
0: [
function (require, module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
var module_1 = require("./module");
console.log(module_1.module());

}, {
"./module": 1,
}
],
1: [
function (require, module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
function module() {
    return 'hello world';
}
exports.module = module;

}, {
}
],
})
