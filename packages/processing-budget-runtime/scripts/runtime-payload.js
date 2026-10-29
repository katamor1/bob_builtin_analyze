'use strict';
const MODULES=Object.freeze(['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget']);
const COMPILED_FILES=Object.freeze(MODULES.flatMap(name=>['js','d.ts','js.map'].map(suffix=>name+'.'+suffix)).sort());
const PACKAGE_FILES=Object.freeze(['package.json','README.md','contracts/processing-budget-definition.v1.json','schema/processing-budget-profile.v1.schema.json',...COMPILED_FILES.map(name=>'out/'+name)].sort());
module.exports={MODULES,COMPILED_FILES,PACKAGE_FILES};
