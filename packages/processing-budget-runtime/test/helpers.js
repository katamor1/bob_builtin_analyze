'use strict';
const fs = require('node:fs');
const path = require('node:path');
const packageRoot = path.resolve(__dirname, '..');
function loadRuntime(moduleName = 'index') {
  if (!['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index'].includes(moduleName)) throw new Error('unknown runtime module');
  const entry = path.join(packageRoot,'out',moduleName+'.js');
  if (!fs.existsSync(entry)) throw new Error('processing budget build required');
  return require(entry);
}
module.exports={packageRoot,loadRuntime};
