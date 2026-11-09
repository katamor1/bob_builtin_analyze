import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'
import { digest, exactKeys, same } from './featureSelectionSourcePolicy.mjs'

const COMPLETION_SHA256 = '440528d404edf754f0480306526307088054dee7d1b72506370d8c22872cc99b'
const EVIDENCE_REGISTRY_SHA256 = '00cb4ee6fcc2504808e1ac9c8f7f835c4b22fc6c0e4b213d9be14ecd7064cd1e'
const LEDGER_SHA256 = 'e7603655a9f356d36938fc6d722061aa9a616fcfd8258bde05ad6c30ac9ae894'
const DECISIONS_SHA256 = 'f84cba62c8a7aa29ca5bac8eea95d1004e7274dc447df00465d985ca1dfc300f'
const COMPLETION_REFERENCE = Object.freeze({boundaryId:'WAVE-0A-CONTROL-PLANE',sha256:COMPLETION_SHA256,state:'VERIFIED',acceptedMainSha:'ec136225bf2737a2f2c8053dce69d3acb6f4be3d'})
const COMPLETION_REGISTRY = Object.freeze([
  Object.freeze({sha256:COMPLETION_SHA256,evidenceSha256:EVIDENCE_REGISTRY_SHA256,reference:COMPLETION_REFERENCE}),
  Object.freeze({sha256:'df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae',evidenceSha256:'54e570330a0a679c1a11f6216747ff235cf6d282989efd561952657819c06f85',reference:Object.freeze({boundaryId:'WAVE-0B-SELECTION-LEDGER',sha256:'df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae',state:'VERIFIED',acceptedMainSha:'b8876b2714d74bd8bbe686b66d17f2f76467f041'})}),
  Object.freeze({sha256:'16c1144e7b27cf0edc91fe63f202fa9cb2cce40eafbd1ce9e07af6664fd81081',evidenceSha256:'9db66c92345c5807667256ce223f2697559ebbcbcf956cb8669c19acffb75da6',reference:Object.freeze({boundaryId:'WF2-P4-COMPILER',sha256:'16c1144e7b27cf0edc91fe63f202fa9cb2cce40eafbd1ce9e07af6664fd81081',state:'VERIFIED',acceptedMainSha:'925c50f10e114ac5613135dab7b7439ab3dba0de'})}),
  Object.freeze({sha256:'50edb7589256b8154477db5970c0f3960dc3513d6c887ec7564b4efb58638532',evidenceSha256:'cedbfa7a14539643980131ba9d416da8d92a0738194f38f18c5b534107ae3643',reference:Object.freeze({boundaryId:'WF2-P5-PLANSTORE',sha256:'50edb7589256b8154477db5970c0f3960dc3513d6c887ec7564b4efb58638532',state:'VERIFIED',acceptedMainSha:'90c678d3d33ae61a5523f2d9cf8057538028dd4b'})}),
  Object.freeze({sha256:'0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399',evidenceSha256:'b7eeb8bd743cb085bceed6226dc92baf0557bdc6345391bcff30732a64e608a5',reference:Object.freeze({boundaryId:'WF2-P6-ENTRYPOINT',sha256:'0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399',state:'VERIFIED',acceptedMainSha:'c5f9fcff29a787cc4f02140800556257bf05c547'})}),
  Object.freeze({sha256:'fe7fc94423170da5ec8838c45cf9636953e16766a70a445064195445a566507e',evidenceSha256:'7ace5d3aa5fb55078cc287f226626a00bdf6615683aa8d2982b76ad207ab1491',reference:Object.freeze({boundaryId:'WF2-P7-MANIFEST',sha256:'fe7fc94423170da5ec8838c45cf9636953e16766a70a445064195445a566507e',state:'VERIFIED',acceptedMainSha:'36c80d9b71b5c3825a9dfcb21ed666e94c54f303'})}),
  Object.freeze({sha256:'cc316f2c59dcdd37db17c20561067249b235ad84043906d89b547e2c3f965a44',evidenceSha256:'59b0cb77b47ac6a3880560b0591c89aa1edf1630af2f0a5125e9583910539291',reference:Object.freeze({boundaryId:'WORKFLOW-B-GATE-P',sha256:'cc316f2c59dcdd37db17c20561067249b235ad84043906d89b547e2c3f965a44',state:'VERIFIED',acceptedMainSha:'36c80d9b71b5c3825a9dfcb21ed666e94c54f303'})}),
  Object.freeze({sha256:'983a10ba98a58811b86550866bca5e6b7b0f6d32966a12c84195e77d3c584d22',evidenceSha256:'189be15fbbdf93ecc4fcaa96cfc8969b8c8affe1590d2b0969a1efbd95a0c041',reference:Object.freeze({boundaryId:'GATE-R-ARCHIVE-INVENTORY',sha256:'983a10ba98a58811b86550866bca5e6b7b0f6d32966a12c84195e77d3c584d22',state:'VERIFIED',acceptedMainSha:'e11b217651b790308d823b689b000c7f7c048a8d'})}),
  Object.freeze({sha256:'e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd',evidenceSha256:'22d29779b8cfa73466206495014e89dbd4e4657453bfda96d1b6e8cb4c630583',reference:Object.freeze({boundaryId:'WF2-R1-PROVENANCE',sha256:'e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd',state:'VERIFIED',acceptedMainSha:'bd3347814284daadebefaa0ab6ab2187690ff348'})}),
  Object.freeze({sha256:'6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c',evidenceSha256:'0a5920718eb49bf26fa09e5180320006ba1c97abbb808af07f940b4abf0ea129',reference:Object.freeze({boundaryId:'WF2-R2-INVOKE',sha256:'6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c',state:'VERIFIED',acceptedMainSha:'a58d5c74be087917093921c26d57c603a3d1c0d5'})}),
  Object.freeze({sha256:'af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c',evidenceSha256:'f859e6fd4e8fbedf43c7d2e33a1f08a9bfd889997d96a1c140478e772d3ee8ea',reference:Object.freeze({boundaryId:'REG-BRIDGE-OWNER-VERSION-LIFECYCLE',sha256:'af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c',state:'VERIFIED',acceptedMainSha:'4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895'})}),
  Object.freeze({sha256:'84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e',evidenceSha256:'16adb142459f056553a7f8cd2f7cf5e9d1d11323a9a880fdc5055268f45bc24f',reference:Object.freeze({boundaryId:'REG-BRIDGE-DISCOVERY-EVIDENCE',sha256:'84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e',state:'VERIFIED',acceptedMainSha:'8410356cfe623b9c1e54528c7e52344669b6d5de'})}),
  Object.freeze({sha256:'043031f1dca349602e86de34ae039561c9c0b09255ffca5c4e9fb10e66b21c8b',evidenceSha256:'feef6e87f82dbe58e71e6021e2e2785b7905ea0ab7dcc0ddcfbe3c000fa50501',reference:Object.freeze({boundaryId:'PROC-T13-LEDGER',sha256:'043031f1dca349602e86de34ae039561c9c0b09255ffca5c4e9fb10e66b21c8b',state:'VERIFIED',acceptedMainSha:'4ca80105eceb75f9192f8a94d5203a8883c05a26'})}),
  Object.freeze({sha256:'380ced2e392014619b0b71499e0247291505867d94955e04e0d47f9ab2316209',evidenceSha256:'598c83bf747d40dfce706569424811b5ab1380a59e5428f0f2013cc53f965257',reference:Object.freeze({boundaryId:'PROC-T14-BOUNDED-DOC',sha256:'380ced2e392014619b0b71499e0247291505867d94955e04e0d47f9ab2316209',state:'VERIFIED',acceptedMainSha:'46a923a3f09e83a60a45cca887f612d7187e38c3'})}),
  Object.freeze({sha256:'c6221da7bd4604daa607de8b26ac0dfc311af52ac09ffb5b08602f75bb39353e',evidenceSha256:'f646c86e9d75efe65f379c1f7b6e8559aec3ad062fa33e2f5ca63d2381e9993c',reference:Object.freeze({boundaryId:'PROC-T15-AGGREGATE',sha256:'c6221da7bd4604daa607de8b26ac0dfc311af52ac09ffb5b08602f75bb39353e',state:'VERIFIED',acceptedMainSha:'479a39d6627daa019fcec95bbb5c1ee334671723'})}),
  Object.freeze({sha256:'8ca9f920100889e3ca4a94a0794df16d91bc9f12571a0a84dd681fc390908658',evidenceSha256:'77b4199fa78285a945d0299ee3954042f48537d8e0997b7dfa15c66582c4ea1d',reference:Object.freeze({boundaryId:'PROC-T16-INPUT-PROCESS',sha256:'8ca9f920100889e3ca4a94a0794df16d91bc9f12571a0a84dd681fc390908658',state:'VERIFIED',acceptedMainSha:'2a961f624a7254d1af21e53a780efa6ccf9ee58b'})}),
  Object.freeze({sha256:'57aedc28d0617cf3260ef642883ea3c271da82508d5c551b374b9df31e5f3c69',evidenceSha256:'2d0b85f2fab06ff8cb715aaa9fc496f076ce1f12b1d8d91458c9539641ce4beb',reference:Object.freeze({boundaryId:'PROC-T17-DEADLINE',sha256:'57aedc28d0617cf3260ef642883ea3c271da82508d5c551b374b9df31e5f3c69',state:'VERIFIED',acceptedMainSha:'13d6bc08205f2185f2156b838aef65b87a64ece8'})}),
  Object.freeze({sha256:'d68db5877d0cb6267a8dbdc08c8ff392eb497988706fd01043d67802ee2bf9b3',evidenceSha256:'0668abfdfe917babc2a778df92bafa146b02e74f1586c43affe4e2ad63525b9d',reference:Object.freeze({boundaryId:'PROC-T17-PATH',sha256:'d68db5877d0cb6267a8dbdc08c8ff392eb497988706fd01043d67802ee2bf9b3',state:'VERIFIED',acceptedMainSha:'06dee79ad90c1dc45682243660bf730a87b6e77f'})})
])
const GATE_R_COMPLETION_SCOPES = Object.freeze(['GATE-R-ARCHIVE-INVENTORY','GATE-R-ACTIVE-MANIFEST','GATE-R-VALIDATOR','GATE-R-RUNNER'])
const hashes = record => Object.fromEntries(record.externalEvidence.map(row=>[row.id,{bytes:row.bytes,sha256:row.sha256}]))
const gitSha = value => {if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))throw new TypeError('invalid Git identity')}
const hash256 = value => {if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new TypeError('invalid evidence digest')}


// Closed recovery import for source M1. Current human CI exception is explicit;
// failed/pre-start CI is never decoded as successful checkout or test execution.
function validateOwnerLifecycleCompletion(record) {
 exactKeys(record,["acceptedMainSha","acceptedTreeSha","activeRuntime","automaticCleanup","boundaryId","ci","externalEvidence","finalProgramUat","installedUat","limits","local","mergeParents","mutationAuthority","packages","preservation","pullRequestNumber","repository","review","runtimeActivation","schemaVersion","source","sourceHeadSha","state"],'owner lifecycle completion')
 if(record.schemaVersion!=='bob-builtin-analyze/reg-bridge-owner-version-lifecycle-completion/v1'||record.state!=='VERIFIED')throw new TypeError('owner lifecycle schema/state')
 gitSha(record.sourceHeadSha);gitSha(record.acceptedMainSha);gitSha(record.acceptedTreeSha)
 if(record.sourceHeadSha!=='87ad6b85b10051f15f2942b286cb9cdfee852ec2'||record.acceptedMainSha!=='4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895'||record.acceptedTreeSha!=='5447e68a8754960d6ca85541db3a94ff64f0b965'||record.pullRequestNumber!==194)throw new TypeError('owner lifecycle source M1 identity')
 same(record.mergeParents,['88de3a67aedf5c8d1b3ee2ea3226a973703ebaf0','87ad6b85b10051f15f2942b286cb9cdfee852ec2'],'owner lifecycle merge parents')
 const ci=record.ci,authorization=ci.authorization
 if(ci.mode!=='explicit_current_slice_user_ci_waiver'||ci.allRequiredGatesSucceeded!==false||authorization.userInstruction!=='今回のCIを免除して残りを続行'||authorization.inheritedFromR2!==false)throw new TypeError('owner lifecycle current CI exception')
 if(authorization.scope.sliceId!==record.boundaryId||authorization.scope.sourceHeadSha!==record.sourceHeadSha||authorization.scope.acceptedMainSha!==record.acceptedMainSha||authorization.scope.accountStartupRestrictionOnly!==true||authorization.scope.includesSeparateMetadataIntegration!==true)throw new TypeError('owner lifecycle CI exception scope')
 if(ci.candidate.head!==record.sourceHeadSha||ci.actualMain.head!==record.acceptedMainSha)throw new TypeError('owner lifecycle CI subject')
 for(const scope of [ci.candidate,ci.actualMain]){
  if(scope.allRequiredGatesSucceeded!==false||scope.workflows.length!==4||scope.manual.state!=='not_run'||scope.manual.workflowsDispatched!==0)throw new TypeError('owner lifecycle CI observation')
  for(const workflow of scope.workflows){if(workflow.conclusion!=='failure')throw new TypeError('owner lifecycle CI failure must remain failure');for(const job of workflow.jobs){const skipped=scope===ci.actualMain&&job.name==='Extension source metrics';if(job.conclusion!==(skipped?'skipped':'failure')||job.steps!==0||job.checkoutVerified!==false||(!skipped&&job.runnerId!==0))throw new TypeError('owner lifecycle pre-start jobs')}}
 }
 if(record.source.selectedSourceItems!==46||record.source.sourceAdmissionDeltas!==57||record.source.metadataIsNotSourceSubject!==true)throw new TypeError('owner lifecycle source scope')
 if(record.review.fixedHeadSha!==record.sourceHeadSha||record.review.important!==2||record.review.importantFixedByObservedTdd!==2||record.review.secondReview!==false)throw new TypeError('owner lifecycle review closure')
 const workflow=record.packages.workflowRegister
 if(workflow.capBytes!==1200000||workflow.vsix.bytes>workflow.capBytes||workflow.approvedCompactionPaths.length!==79||workflow.independentAstTokenProofCount!==79||workflow.unchangedWorkflowPayloadCount!==906)throw new TypeError('owner lifecycle package capacity/proof')
 for(const pkg of Object.values(record.packages))if(pkg.sourceHeadSha!==record.sourceHeadSha||pkg.sourceTreeSha!==record.acceptedTreeSha||pkg.vsix.bytes>pkg.capBytes)throw new TypeError('owner lifecycle package subject')
 const installed=record.installedUat
 if(installed.state!=='PASSED'||installed.sourceHeadSha!==record.sourceHeadSha||installed.sourceTreeSha!==record.acceptedTreeSha||installed.requiredCases.length!==5||installed.requiredCases.some(row=>row.status!=='pass')||installed.nativeHostExit!==0||installed.nativeDeactivatePromiseAwaited!==true)throw new TypeError('owner lifecycle installed subject')
 if(record.preservation.allHashesVerified!==true||record.externalEvidence.length!==record.preservation.files+1)throw new TypeError('owner lifecycle retained evidence')
 for(const key of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])if(record.activeRuntime.gateRResult[key]!==0)throw new TypeError('owner lifecycle inactive product paths')
 if(Object.values(record.activeRuntime.productWiring).some(value=>value!==0)||record.activeRuntime.gateRResult.runtimeSuitesExecuted!==15||record.activeRuntime.gateRResult.runtimeActivation!==false||record.runtimeActivation!==false||record.automaticCleanup!==false||record.finalProgramUat!=='not_run')throw new TypeError('owner lifecycle inactive limits')
}

// One historical source observation, captured after real CI and physical byte
// readback. These facts grant no runtime, filesystem or execution authority.
const DISCOVERY_SOURCE_HEAD='6f2624523df4d59a941be39666ab651b4a153370'
const DISCOVERY_ACCEPTED_MAIN='8410356cfe623b9c1e54528c7e52344669b6d5de'
const DISCOVERY_ACCEPTED_TREE='6e6c1af52131a4b3eddd9491f5658e71adfb8903'
const DISCOVERY_REQUIRED_REFERENCES=Object.freeze(['WAVE-0A-CONTROL-PLANE','WAVE-0B-SELECTION-LEDGER','WF2-P4-COMPILER','WF2-P5-PLANSTORE','WF2-P6-ENTRYPOINT','WF2-P7-MANIFEST','WORKFLOW-B-GATE-P','GATE-R-ARCHIVE-INVENTORY','WF2-R1-PROVENANCE','WF2-R2-INVOKE','REG-BRIDGE-OWNER-VERSION-LIFECYCLE','REG-BRIDGE-DISCOVERY-EVIDENCE'])
const DISCOVERY_CI_JOBS=Object.freeze({
 'extensions-quality':['workflow-register','bob-bazaar-review','bob-code-consistency-review','Windows / workflow-register','Windows / bob-bazaar-review','Windows / bob-code-consistency-review','Real-machine environment contracts','Extension source metrics','Workflow evidence subject','Workflow evidence / ubuntu-latest','Workflow evidence / windows-latest','Workflow evidence byte parity'],
 'workflow-contracts':['Strict workflow validation'],
 'code-consistency-review-scaffold':['Validate scaffold','Validate VS Code extension'],
 'three-extension-ui-contracts':['UI and documentation contracts']
})
function validateDiscoveryCompletion(record) {
 const fail=reason=>{throw new TypeError('Discovery completion: '+reason)}
 exactKeys(record,['acceptedMainSha','acceptedTreeSha','activeRuntime','automaticCleanup','boundaryId','ci','discovery','externalEvidence','finalProgramUat','installedUat','limits','local','mergeParents','mutationAuthority','packages','preservation','pullRequestNumber','repository','review','runtimeActivation','schemaVersion','source','sourceHeadSha','state'],'Discovery completion')
 if(record.schemaVersion!=='bob-builtin-analyze/reg-bridge-discovery-evidence-completion/v1'||record.state!=='VERIFIED'||record.sourceHeadSha!==DISCOVERY_SOURCE_HEAD||record.acceptedMainSha!==DISCOVERY_ACCEPTED_MAIN||record.acceptedTreeSha!==DISCOVERY_ACCEPTED_TREE||record.pullRequestNumber!==196)fail('source D1 identity')
 same(record.mergeParents,['90f926e0045405625f1f40d20a41346a94d1981a',DISCOVERY_SOURCE_HEAD],'Discovery normal merge parents')
 const source=record.source
 if(source.selectedSourceItems!==27||source.sourceAdmissionDeltas!==11||source.literalRootToolFiles!==37||source.remainderItems!==675||source.unassigned!==0||source.metadataIsNotSourceSubject!==true)fail('selected source or complete remainder')
 if(source.ownerAdmissionSha256!=='1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4'||source.discoveryAdmissionSha256!=='c3a311ce9fb9948532234a0460b8643a93c1149bb1a10f92a737e1b71d6fd816'||source.sourceCoverageSha256!=='100c0c53e6764e08685c81a5f92c0d193e798b675de1c8da8c8b7ea44d3560d9'||source.upstreamMainSha!=='90f926e0045405625f1f40d20a41346a94d1981a'||source.upstreamDeltas!==27)fail('immutable source layers')
 const external=record.externalEvidence
 if(!Array.isArray(external)||external.length!==123||new Set(external.map(x=>x.id)).size!==external.length)fail('physical evidence collection')
 const key=row=>[row.path,row.sha256,row.bytes].join('\0'),observed=new Set()
 const bare=row=>{exactKeys(row,['path','bytes','sha256'],'Discovery byte binding');if(typeof row.path!=='string'||!row.path||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>67108864)fail('evidence path or byte count');hash256(row.sha256)}
 for(const row of external){exactKeys(row,['id','path','bytes','sha256'],'Discovery external evidence');if(typeof row.id!=='string'||!row.id)fail('evidence identity');const b={path:row.path,bytes:row.bytes,sha256:row.sha256};bare(b);observed.add(key(b))}
 const bound=row=>{bare(row);if(!observed.has(key(row)))fail('binding is not an actual captured byte observation')}
 exactKeys(record.discovery,['sourceCoverage','remainderClosure','subject','catalog','discovery','compiledManifest','report','crossPlatform'],'Discovery evidence joins')
 for(const row of Object.values(record.discovery))bound(row)
 if(record.discovery.sourceCoverage.sha256!==source.sourceCoverageSha256)fail('coverage byte binding')
 const ci=record.ci
 exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','candidate','actualMain'],'Discovery actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('real CI required; no inherited waiver')
 for(const [scope,head,event,expectedSuccess]of [[ci.candidate,DISCOVERY_SOURCE_HEAD,'pull_request',16],[ci.actualMain,DISCOVERY_ACCEPTED_MAIN,'push',15]]){
  if(scope.state!=='PASSED'||scope.mode!=='actual_exact_head_success'||scope.head!==head||scope.event!==event||scope.requiredJobs!==expectedSuccess||scope.workflows.length!==4)fail('CI source or required count')
  same(scope.workflows.map(x=>x.id),Object.keys(DISCOVERY_CI_JOBS),'Discovery four CI workflows')
  let successes=0,skips=0
  for(const workflow of scope.workflows){
   if(workflow.head!==head||workflow.event!==event||workflow.conclusion!=='success'||!Number.isSafeInteger(workflow.runId)||workflow.runId<=0||!Number.isSafeInteger(workflow.attempt)||workflow.attempt<1)fail('actual workflow run')
   bound(workflow.raw);same(workflow.jobs.map(x=>x.name),DISCOVERY_CI_JOBS[workflow.id],'Discovery required job names')
   for(const job of workflow.jobs){
    if(!Number.isSafeInteger(job.jobId)||job.jobId<=0)fail('actual job identity')
    if(event==='push'&&job.name==='Extension source metrics'){
     if(job.conclusion!=='skipped'||job.runnerId||job.checkout!==null||job.log!==null||job.skipReason!=='unchanged_metrics_job_is_pull_request_only')fail('only the unchanged main metrics skip is allowed');skips++;continue
    }
    if(job.conclusion!=='success'||!Number.isSafeInteger(job.runnerId)||job.runnerId<=0)fail('required job did not execute successfully')
    exactKeys(job.checkout,['event','expectedHeadSha','actualHeadSha'],'Discovery actual checkout marker')
    if(job.checkout.event!==event||job.checkout.expectedHeadSha!==head||job.checkout.actualHeadSha!==head)fail('exact checkout head')
    bound(job.log);successes++
   }
  }
  if(successes!==expectedSuccess||skips!==(event==='push'?1:0))fail('required job or expected skip totals')
 }
 if(ci.actualMain.successfulJobs!==15||ci.actualMain.skippedJobs!==1||ci.actualMain.contractRows!==16)fail('main observed totals')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'Discovery packages')
 for(const [name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){
  const pkg=record.packages[name];bound(pkg.vsix)
  if(pkg.id!==id||pkg.version!==version||pkg.sourceHeadSha!==DISCOVERY_ACCEPTED_MAIN||pkg.sourceTreeSha!==DISCOVERY_ACCEPTED_TREE||pkg.capBytes!==cap||pkg.vsix.bytes>cap||pkg.headroomBytes!==cap-pkg.vsix.bytes)fail('actual main VSIX identity or capacity')
 }
 const compact=record.packages.workflowRegister.compaction;bound(compact.proof)
 if(compact.configuredTargets!==113||compact.independentAstProofCount!==111||compact.allPresentTargetsCovered!==true)fail('actual compaction coverage')
 same(compact.absentConfiguredTargets,['extension/out/webview/templateCustomizationStudioPanel.js','extension/out/commands/runControlView.js'],'configured but unshipped compaction paths')
 const installed=record.installedUat
 if(installed.state!=='PASSED'||installed.sourceHeadSha!==DISCOVERY_ACCEPTED_MAIN||installed.sourceTreeSha!==DISCOVERY_ACCEPTED_TREE||installed.nativeHostExit!==0||installed.nativeDeactivatePromiseAwaited!==true||installed.cleanupZero!==true||installed.operationHubOpened!==true||installed.noWorktreeRuntimeLoaded!==true||installed.instrumentedBoundaries!==7)fail('same-hash native installed proof')
 same(installed.requiredCases.map(x=>x.id),['three_actual_activations','operation_hub','awaited_native_deactivation','registry_cleanup','five_inactive_effects'],'native installed cases')
 if(installed.requiredCases.some(x=>x.status!=='pass')||installed.guiVisualOperator!=='not_run'||installed.liveBobModel!=='not_run')fail('installed proof limits')
 for(const row of [installed.hostReport,installed.nativeResult,installed.probeSource,installed.byteBindings])bound(row)
 const runtime=record.activeRuntime
 if(runtime.evidenceSourceHeadSha!==DISCOVERY_SOURCE_HEAD||runtime.evidenceSourceTreeSha!==DISCOVERY_ACCEPTED_TREE||runtime.runtimeActivation!==false||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15)fail('inactive runtime source')
 for(const name of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])if(runtime.gateRResult[name]!==0||runtime.productWiring[name]!==0)fail('product effects must remain zero')
 const review=record.review
 if(review.oneFreshSourceReview!==true||review.finalSourceHeadSha!==DISCOVERY_SOURCE_HEAD||review.critical!==0||review.important!==1||review.importantFixedByObservedTdd!==1||review.minor!==0||review.secondReview!==false||review.additionalCiFixesVerifiedByTdd!==2)fail('source review closure')
 const preservation=record.preservation;bound(preservation.manifest)
 if(preservation.files!==122||preservation.allHashesVerified!==true||preservation.primaryMainRef!==DISCOVERY_ACCEPTED_MAIN||preservation.primaryCheckoutMoved!==false||preservation.protectedContentsRead!==false||preservation.untrackedPreserved!==15)fail('retained evidence and concurrent user work')
 if(record.local.allQualityGatesPassed!==true||record.local.fullRoot.passed!==262||record.local.affectedRoot.passed!==169||record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run')fail('local gates or inactive limits')
}


// The accepted T13 source observation is immutable; metadata never becomes its subject.
const T13_SOURCE_HEAD='f71cd8e345b2dbbe02c1e40d5b4008b4da84ef38'
const T13_ACCEPTED_MAIN='4ca80105eceb75f9192f8a94d5203a8883c05a26'
const T13_ACCEPTED_TREE='6fb9efb6ae16814ca5d0354507a2e6984198e6c5'
const T13_CI_JOBS=Object.freeze({...DISCOVERY_CI_JOBS,'processing-budget-runtime':['Processing budget / ubuntu-latest','Processing budget / windows-latest']})
function validateT13Completion(record) {
 const fail=reason=>{throw new TypeError('T13 completion: '+reason)}
 exactKeys(record,['acceptedMainSha','acceptedTreeSha','activeRuntime','automaticCleanup','boundaryId','ci','externalEvidence','finalProgramUat','installedUat','limits','local','mergeParents','mutationAuthority','packages','preservation','processingBudget','pullRequestNumber','repository','review','runtimeActivation','schemaVersion','source','sourceHeadSha','state'],'T13 completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t13-ledger-completion/v1'||record.boundaryId!=='PROC-T13-LEDGER'||record.state!=='VERIFIED'||record.sourceHeadSha!==T13_SOURCE_HEAD||record.acceptedMainSha!==T13_ACCEPTED_MAIN||record.acceptedTreeSha!==T13_ACCEPTED_TREE||record.pullRequestNumber!==198)fail('accepted source S1 identity')
 same(record.mergeParents,['aa25f00f98c41c5aebdb30c68cdc967a1d205ab5',T13_SOURCE_HEAD],'T13 normal merge parents')
 const source=record.source
 exactKeys(source,['selectedSourceItems','remainderItems','unassigned','literalSourceAndControlPaths','upstreamMainSha','metadataIsNotSourceSubject','sourceCoverageSha256','sourceAdmission','ownerAdmissionSha256','categories','targetMaxUtf8Bytes','packedPayloadFiles','installedTypeConsumers','productionDependencies','changedProductPaths','packagingInputsUnchanged'],'T13 source scope')
 if(source.selectedSourceItems!==23||source.remainderItems!==675||source.unassigned!==0||source.literalSourceAndControlPaths!==32||source.categories!==13||source.targetMaxUtf8Bytes!==256||source.packedPayloadFiles!==19||source.installedTypeConsumers!==3||source.productionDependencies!==0)fail('closed source, definition, profile and package facts')
 if(source.upstreamMainSha!=='aa25f00f98c41c5aebdb30c68cdc967a1d205ab5'||source.metadataIsNotSourceSubject!==true||source.changedProductPaths!==0||source.packagingInputsUnchanged!==true||source.ownerAdmissionSha256!=='1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4')fail('unchanged product and historical baseline')
 const external=record.externalEvidence
 if(!Array.isArray(external)||external.length!==192||new Set(external.map(x=>x.id)).size!==external.length||new Set(external.map(x=>x.path)).size!==external.length)fail('unique physical evidence collection')
 const key=row=>[row.path,row.sha256,row.bytes].join('\0'),observed=new Set()
 const bare=row=>{exactKeys(row,['path','bytes','sha256'],'T13 byte binding');if(typeof row.path!=='string'||!row.path||row.path.length>4096||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>67108864)fail('evidence path or byte count');hash256(row.sha256)}
 for(const row of external){exactKeys(row,['id','path','bytes','sha256'],'T13 external evidence');if(typeof row.id!=='string'||!row.id)fail('evidence identity');const b={path:row.path,bytes:row.bytes,sha256:row.sha256};bare(b);observed.add(key(b))}
 const bound=row=>{bare(row);if(!observed.has(key(row)))fail('binding was not physically captured')}
 exactKeys(record.processingBudget,['sourceCoverage','remainderClosure','definition','profile','ledger','consumers','packaging','crossPlatform','currentProductParity'],'T13 nine evidence joins')
 for(const row of Object.values(record.processingBudget))bound(row)
 bound(source.sourceAdmission);if(record.processingBudget.sourceCoverage.sha256!==source.sourceCoverageSha256)fail('source coverage binding')
 const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','candidate','actualMain'],'T13 actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('actual CI required without inherited waivers')
 const jobIds=new Set()
 for(const [scope,head,event,expectedSuccess]of [[ci.candidate,T13_SOURCE_HEAD,'pull_request',18],[ci.actualMain,T13_ACCEPTED_MAIN,'push',17]]){
  exactKeys(scope,['state','mode','head','event','requiredJobs','successfulJobs','skippedJobs','contractRows','workflows','manual'],'T13 CI scope')
  if(scope.state!=='PASSED'||scope.mode!=='actual_exact_head_success'||scope.head!==head||scope.event!==event||scope.requiredJobs!==expectedSuccess||scope.successfulJobs!==expectedSuccess||scope.skippedJobs!==(event==='push'?1:0)||scope.contractRows!==18)fail('exact source CI totals')
  same(scope.workflows.map(x=>x.id),Object.keys(T13_CI_JOBS),'T13 five CI workflows');same(scope.manual,{state:'not_required',workflowsDispatched:0},'observed source triggers')
  let successes=0,skips=0
  for(const workflow of scope.workflows){
   exactKeys(workflow,['id','runId','attempt','event','head','conclusion','url','raw','jobs'],'T13 workflow')
   if(workflow.head!==head||workflow.event!==event||workflow.conclusion!=='success'||!Number.isSafeInteger(workflow.runId)||workflow.runId<=0||!Number.isSafeInteger(workflow.attempt)||workflow.attempt<1||workflow.url!==`https://github.com/katamor1/bob_builtin_analyze/actions/runs/${workflow.runId}`)fail('actual workflow provenance')
   bound(workflow.raw);same(workflow.jobs.map(x=>x.name),T13_CI_JOBS[workflow.id],'T13 eighteen contract job names')
   for(const job of workflow.jobs){
    if(!Number.isSafeInteger(job.jobId)||job.jobId<=0||jobIds.has(job.jobId)||job.attempt!==workflow.attempt)fail('unique job and attempt provenance');jobIds.add(job.jobId)
    if(event==='push'&&job.name==='Extension source metrics'){
     exactKeys(job,['name','jobId','attempt','conclusion','runnerId','checkout','log','skipReason'],'T13 main metrics skip')
     if(job.conclusion!=='skipped'||job.runnerId!==null||job.checkout!==null||job.log!==null||job.skipReason!=='unchanged_metrics_job_is_pull_request_only')fail('only unchanged main metrics skip is accepted');skips++;continue
    }
    exactKeys(job,['name','jobId','attempt','conclusion','runnerId','runnerName','labels','checkout','log'],'T13 executed job')
    const runner=job.name.startsWith('Windows / ')||job.name==='Real-machine environment contracts'||job.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest'
    if(job.conclusion!=='success'||!Number.isSafeInteger(job.runnerId)||job.runnerId<=0||typeof job.runnerName!=='string'||!job.runnerName||!Array.isArray(job.labels)||!job.labels.includes(runner))fail('successful assigned runner required')
    exactKeys(job.checkout,['event','expectedHeadSha','actualHeadSha'],'T13 actual checkout marker');if(job.checkout.event!==event||job.checkout.expectedHeadSha!==head||job.checkout.actualHeadSha!==head)fail('actual checkout SHA')
    bound(job.log);successes++
   }
  }
  if(successes!==expectedSuccess||skips!==(event==='push'?1:0))fail('executed job totals')
 }
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T13 actual source VSIX')
 for(const [name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){
  const pkg=record.packages[name];exactKeys(pkg,['id','version','sourceHeadSha','sourceTreeSha','capBytes','headroomBytes','vsix'],'T13 package');bound(pkg.vsix)
  if(pkg.id!==id||pkg.version!==version||pkg.sourceHeadSha!==T13_ACCEPTED_MAIN||pkg.sourceTreeSha!==T13_ACCEPTED_TREE||pkg.capBytes!==cap||pkg.vsix.bytes>cap||pkg.headroomBytes!==cap-pkg.vsix.bytes)fail('source main VSIX identity and capacity')
 }
 same(record.installedUat,{state:'not_required',executed:false,reason:'unchanged_extension_source_and_packaging_inputs',changedProductPaths:0,historicalCompletionSha256:'84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e'},'T13 does not claim new native UAT')
 const runtime=record.activeRuntime
 if(runtime.evidenceSourceHeadSha!==T13_SOURCE_HEAD||runtime.evidenceSourceTreeSha!==T13_ACCEPTED_TREE||runtime.acceptedMainSha!==T13_ACCEPTED_MAIN||runtime.runtimeActivation!==false||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive runtime exact source')
 for(const name of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])if(runtime.gateRResult[name]!==0||runtime.productWiring[name]!==0)fail('all five effects remain zero')
 const review=record.review;bound(review.report);bound(review.resolution)
 if(review.oneFreshSourceReview!==true||review.finalSourceHeadSha!==T13_SOURCE_HEAD||review.critical!==0||review.important!==1||review.importantFixedByObservedTdd!==1||review.unresolvedCritical!==0||review.unresolvedImportant!==0||review.minor!==0||review.secondReview!==false||review.additionalCiFixesVerifiedByTdd!==0)fail('one fresh source review closure')
 const p=record.preservation;bound(p.manifest)
 if(p.files!==191||p.allHashesVerified!==true||p.primaryMainRef!==T13_ACCEPTED_MAIN||p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryCheckoutMoved!==false||p.protectedContentsRead!==false||p.untrackedPreserved!==15||external.length!==p.files+1)fail('preserved user work and source evidence')
 bound(record.local.rootChecks);bound(record.local.extensionQuality.receipt)
 if(record.local.allQualityGatesPassed!==true||record.local.rootPassed!==135||record.local.packagePassed!==16||record.runtimeActivation!==false||record.mutationAuthority!==false||record.automaticCleanup!==false||record.finalProgramUat!=='not_run')fail('local gates and no execution authority')
}

// Captured after source PR #200, exact candidate/main CI and portable byte replay.
// Replay is pure data validation: historical runner paths are never opened here.
const T14_SOURCE_HEAD='b5019196f377ef372a1ea7550706f9af9149fc54'
const T14_ACCEPTED_MAIN='46a923a3f09e83a60a45cca887f612d7187e38c3'
const T14_ACCEPTED_TREE='fcc1746f6bbfaf1b9138610c45acf82a889c3533'
const T14_COMPLETION_SHA256='380ced2e392014619b0b71499e0247291505867d94955e04e0d47f9ab2316209'
const T14_EXTERNAL_ROWS_SHA256='50a3b731b60e6d407c97359af5c66f6b001d8d90e0bed31b2954d89f0322e4fe'
const T14_INSTALLED_OBSERVATION_SHA256='d2336b99e438ce5d264ed093d7fcce02a8f0a857241674dd421a0d890d855909'
export function validateT14Completion(record) {
 const fail=reason=>{throw new TypeError('T14 completion: '+reason)}
 exactKeys(record,['schemaVersion','boundaryId','state','repository','sourceHeadSha','acceptedMainSha','acceptedTreeSha','mergeParents','pullRequestNumber','source','boundedDocument','ci','packages','installedUat','activeRuntime','review','local','preservation','externalEvidence','runtimeActivation','automaticCleanup','mutationAuthority','finalProgramUat','limits'],'T14 completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t14-bounded-doc-completion/v1'||record.boundaryId!=='PROC-T14-BOUNDED-DOC'||record.state!=='VERIFIED'||record.repository!=='katamor1/bob_builtin_analyze'||record.sourceHeadSha!==T14_SOURCE_HEAD||record.acceptedMainSha!==T14_ACCEPTED_MAIN||record.acceptedTreeSha!==T14_ACCEPTED_TREE||record.pullRequestNumber!==200)fail('accepted source identity')
 same(record.mergeParents,['0e806d48dfdd3136f47f36218b72fba1cfb4c4fd',T14_SOURCE_HEAD],'T14 normal merge parents')
 const external=record.externalEvidence
 if(!Array.isArray(external)||external.length!==833||new Set(external.map(r=>r.id)).size!==833||new Set(external.map(r=>r.path)).size!==833)fail('unique physical evidence collection')
 const key=r=>[r.path,r.bytes,r.sha256].join('\0'),observed=new Set()
 function bare(row){exactKeys(row,['path','bytes','sha256'],'T14 byte binding');if(typeof row.path!=='string'||row.path.length>4096||!(/^(?:[A-Za-z]:[\\/]|\/)/.test(row.path))||row.path.includes('\0')||row.path.split(/[\\/]/).includes('..')||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>268435456)fail('positive physical byte binding');hash256(row.sha256)}
 for(const row of external){exactKeys(row,['id','path','bytes','sha256'],'T14 external evidence');if(typeof row.id!=='string'||!/^t14-evidence-\d{4}$/.test(row.id))fail('evidence identity');const b={path:row.path,bytes:row.bytes,sha256:row.sha256};bare(b);observed.add(key(b))}
 if(digest(external)!==T14_EXTERNAL_ROWS_SHA256)fail('captured physical evidence identity')
 const bound=row=>{bare(row);if(!observed.has(key(row)))fail('binding was not physically captured')}
 const source=record.source
 exactKeys(source,['selectedSourceItems','remainderItems','unassigned','upstreamMainSha','categories','rawByteAccounting','expandedByteAccounting','packedPayloadFiles','installedTypeConsumers','productionDependencies','literalSourceAndControlPaths','sourceCoverage','sourceAdmission','historicalBindings','additionalPrerequisites','metadataIsNotSourceSubject'],'T14 source')
 if(source.selectedSourceItems!==39||source.remainderItems!==675||source.unassigned!==0||source.upstreamMainSha!==record.mergeParents[0]||source.categories!==13||source.rawByteAccounting!=='source_once'||source.expandedByteAccounting!=='structural_only'||source.packedPayloadFiles!==40||source.installedTypeConsumers!==3||source.productionDependencies!==0||source.literalSourceAndControlPaths!==103||source.metadataIsNotSourceSubject!==true)fail('closed source accounting and payload facts')
 for(const name of ['sourceCoverage','sourceAdmission','historicalBindings'])bound(source[name])
 if(source.sourceCoverage.sha256!=='c41248daa674ff298ff324a890d45f1eae5f91dc4657f7c148b315ffb57be1b2'||source.sourceAdmission.sha256!=='b34713b990e77558528d57e2550044439b24726079ceebc93e9032c35b646cd1')fail('source admission and coverage')
 exactKeys(source.additionalPrerequisites,['count','sourceCoverage'],'T14 prerequisites');if(source.additionalPrerequisites.count!==66)fail('additional prerequisite count');same(source.additionalPrerequisites.sourceCoverage,source.sourceCoverage,'T14 prerequisite coverage')
 exactKeys(record.boundedDocument,['contracts','parity','rawAccounting','sourceFingerprints','callbackPostChecks','normalization','consumers','discovery','crossPlatform','packaging'],'T14 ten evidence joins');for(const row of Object.values(record.boundedDocument))bound(row)
 const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','candidate','actualMain'],'T14 actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('actual CI required without waiver')
 const jobIds=new Set(),runIds=new Set()
 for(const [scope,head,success,skips,event]of [[ci.candidate,T14_SOURCE_HEAD,18,0,'pull_request'],[ci.actualMain,T14_ACCEPTED_MAIN,17,1,'push']]){
  exactKeys(scope,['head','tree','counts','collection','portableReplay','artifactCapture','workflows'],'T14 CI scope');if(scope.head!==head||scope.tree!==T14_ACCEPTED_TREE)fail('CI source subject');same(scope.counts,{workflows:5,rows:18,success,skipped:skips},'T14 CI counts');for(const n of ['collection','portableReplay','artifactCapture'])bound(scope[n]);same(scope.workflows.map(w=>w.id),Object.keys(T13_CI_JOBS),'T14 five workflows')
  let actualSuccess=0,actualSkips=0
  for(const w of scope.workflows){
   exactKeys(w,['id','path','runId','attempt','event','head','url','raw','jobs'],'T14 workflow');if(w.path!=='.github/workflows/'+w.id+'.yml'||!Number.isSafeInteger(w.runId)||w.runId<=0||runIds.has(w.runId)||!Number.isSafeInteger(w.attempt)||w.attempt<1||w.head!==head||w.event!==event||w.url!==`https://github.com/katamor1/bob_builtin_analyze/actions/runs/${w.runId}`)fail('actual workflow provenance');runIds.add(w.runId);exactKeys(w.raw,['run','jobs','artifacts'],'T14 raw workflow');for(const b of Object.values(w.raw))bound(b);same(w.jobs.map(j=>j.name),T13_CI_JOBS[w.id],'T14 eighteen jobs')
   for(const j of w.jobs){
    if(!Number.isSafeInteger(j.jobId)||j.jobId<=0||jobIds.has(j.jobId)||j.workflow!==w.id||j.event!==w.event)fail('unique job provenance');jobIds.add(j.jobId)
    if(w.event!=='pull_request'&&j.name==='Extension source metrics'){
     exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','guard','log'],'T14 metrics skip');if(j.conclusion!=='skipped'||j.kind!=='expected_non_pr_skip'||j.runner!==null||j.guard!==null||j.log!==null)fail('PR-only metrics skip');actualSkips++;continue
    }
    exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','startedAt','completedAt','guard','log'],'T14 actual job');if(j.conclusion!=='success'||j.kind!=='actual_runner_success'||!Number.isFinite(Date.parse(j.startedAt))||Date.parse(j.completedAt)<Date.parse(j.startedAt))fail('successful completed job')
    const runner=j.name.startsWith('Windows / ')||j.name==='Real-machine environment contracts'||j.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest';exactKeys(j.runner,['id','name','labels','expected'],'T14 actual runner');if(!Number.isSafeInteger(j.runner.id)||j.runner.id<=0||typeof j.runner.name!=='string'||!j.runner.name||j.runner.expected!==runner||!Array.isArray(j.runner.labels)||!j.runner.labels.includes(runner))fail('assigned actual runner')
    exactKeys(j.guard,['event','expectedHeadSha','actualHeadSha','logTimestamp','line','step'],'T14 actual guard');if(j.guard.event!==w.event||j.guard.expectedHeadSha!==head||j.guard.actualHeadSha!==head||!Number.isSafeInteger(j.guard.line)||j.guard.line<1)fail('actual checked-out source');exactKeys(j.guard.step,['name','number','startedAt','completedAt'],'T14 guard step');const step=j.guard.step,time=Date.parse(j.guard.logTimestamp);if(step.name!=='Verify checked-out commit'||!Number.isSafeInteger(step.number)||step.number<1||!Number.isFinite(time)||!Number.isFinite(Date.parse(step.startedAt))||!Number.isFinite(Date.parse(step.completedAt))||time<Date.parse(step.startedAt)-5000||time>Date.parse(step.completedAt)+5000)fail('guard log within actual checkout step');bound(j.log);actualSuccess++
   }
  }
  if(actualSuccess!==success||actualSkips!==skips)fail('actual success and skip totals')
 }
 const installed=record.installedUat
 exactKeys(installed,['kind','state','candidate','actualMain','productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'],'T14 installed UAT');if(installed.kind!=='isolated_artifact_extension_host'||installed.state!=='passed')fail('isolated installed host')
 for(const n of ['productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'])if(installed[n]!=='not_run')fail('unexecuted product/visual/live/final UAT')
 for(const[scope,head,ciScope]of [[installed.candidate,T14_SOURCE_HEAD,ci.candidate],[installed.actualMain,T14_ACCEPTED_MAIN,ci.actualMain]]){
  exactKeys(scope,['sourceHeadSha','sourceTreeSha','replay','platforms'],'T14 installed scope');if(scope.sourceHeadSha!==head||scope.sourceTreeSha!==T14_ACCEPTED_TREE)fail('installed source subject');same(scope.replay,ciScope.portableReplay,'T14 captured replay');bound(scope.replay);same(scope.platforms.map(p=>p.os),['ubuntu-latest','windows-latest'],'T14 actual host platforms')
  for(const p of scope.platforms){
   exactKeys(p,['os','artifactId','originalManifest','runnerReceipt','hostReceipt','mappedManifest','joinProof','caseCount','loadedModules','parserEntries','sourceFixedParserFiles','vsix'],'T14 host platform');if(!Number.isSafeInteger(p.artifactId)||p.artifactId<=0||p.caseCount!==9||p.loadedModules!==24||p.parserEntries!==8||p.sourceFixedParserFiles!==583)fail('actual host and source-fixed parser inventory');for(const n of ['originalManifest','runnerReceipt','hostReceipt','mappedManifest','joinProof'])bound(p[n]);same(p.vsix.map(v=>v.id),['local.bob-bazaar-review','local.bob-code-consistency-review'],'T14 installed extensions')
   for(const [i,v]of p.vsix.entries()){
    exactKeys(v,['id','version','vsix','capBytes','headroomBytes','compiledPayload'],'T14 native VSIX');bound(v.vsix);if(v.version!==(i===0?'0.3.2':'0.1.0')||v.capBytes!==(i===0?12000000:11000000)||v.headroomBytes!==v.capBytes-v.vsix.bytes||v.headroomBytes<0||!Array.isArray(v.compiledPayload)||v.compiledPayload.length!==36)fail('actual installed VSIX and compiled payload');const paths=new Set();for(const b of v.compiledPayload){exactKeys(b,['path','bytes','sha256'],'T14 compiled module');if(typeof b.path!=='string'||!/^\w+\.(?:js|d\.ts|js\.map)$/.test(b.path)||paths.has(b.path)||!Number.isSafeInteger(b.bytes)||b.bytes<=0)fail('compiled module inventory');paths.add(b.path);hash256(b.sha256)}
   }
  }
 }
 // This literal pins the per-platform joins after the original capture and byte
 // replay; membership alone must not let a candidate artifact replace main.
 if(digest(installed)!==T14_INSTALLED_OBSERVATION_SHA256)fail('captured installed artifact joins')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T14 packages')
 for(const [name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){
  const p=record.packages[name];exactKeys(p,['id','version','sourceHeadSha','sourceTreeSha','vsix','capBytes','headroomBytes',...(name==='workflowRegister'?['compaction']:['compiledPayload','parserIdentity'])],'T14 package');bound(p.vsix);if(p.id!==id||p.version!==version||p.sourceHeadSha!==T14_ACCEPTED_MAIN||p.sourceTreeSha!==T14_ACCEPTED_TREE||p.capBytes!==cap||p.headroomBytes!==cap-p.vsix.bytes||p.headroomBytes<0)fail('accepted source package subject/capacity');if(name==='workflowRegister')bound(p.compaction);else{same(p.vsix,installed.actualMain.platforms[0].vsix.find(v=>v.id===id).vsix,'T14 exact installed input');same(p.compiledPayload,installed.actualMain.platforms[0].originalManifest,'T14 compiled manifest');same(p.parserIdentity,installed.actualMain.platforms[0].joinProof,'T14 parser identity');bound(p.compiledPayload);bound(p.parserIdentity)}
 }
 const runtime=record.activeRuntime;exactKeys(runtime,['sourceHeadSha','sourceTreeSha','receipt','output','gateRResult','productWiring','runtimeActivation'],'T14 active runtime');if(runtime.sourceHeadSha!==T14_ACCEPTED_MAIN||runtime.sourceTreeSha!==T14_ACCEPTED_TREE||runtime.runtimeActivation!==false||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive accepted runtime');bound(runtime.receipt);bound(runtime.output);const effects=['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'];exactKeys(runtime.productWiring,effects,'T14 five effects');for(const n of effects)if(runtime.productWiring[n]!==0||runtime.gateRResult[n]!==0)fail('five effects zero')
 const review=record.review;exactKeys(review,['oneFreshSourceReview','secondReview','reviewedHeadSha','finalSourceHeadSha','original','remaining','importantFixedByObservedTdd','report','resolution'],'T14 source review');if(review.oneFreshSourceReview!==true||review.secondReview!==false||review.reviewedHeadSha!=='96632a6d19a79468dd8947fffb23ce546395031a'||review.finalSourceHeadSha!==T14_SOURCE_HEAD||review.importantFixedByObservedTdd!==2)fail('single source review');same(review.original,{critical:0,important:2,minor:0},'T14 original findings');same(review.remaining,{critical:0,important:0,minor:0},'T14 review closure');bound(review.report);bound(review.resolution)
 const local=record.local;exactKeys(local,['allQualityGatesPassed','acceptedMainChecks','rootChecks','rootPassed','packagePassed','packageSkipped','candidateQuality','unchangedInputProof','bazaar','consistency'],'T14 local gates');if(local.allQualityGatesPassed!==true||local.rootPassed!==136||local.packagePassed!==48||local.packageSkipped!==1)fail('actual local gates');for(const n of ['acceptedMainChecks','rootChecks','candidateQuality','unchangedInputProof'])bound(local[n]);for(const[name,pass,skip]of [['bazaar',786,1],['consistency',353,0]]){exactKeys(local[name],['passed','skipped','executedHead'],'T14 original execution subject');if(local[name].passed!==pass||local[name].skipped!==skip||local[name].executedHead!=='7c85b9ba196041a53496afbfd31060979f8be199')fail('local unchanged-input execution history')}
 const p=record.preservation;exactKeys(p,['primaryVisibleBranch','primaryVisibleHead','primaryMainRef','primaryCheckoutMoved','untrackedPreserved','protectedContentsRead','allHashesVerified','synchronization','files','manifest'],'T14 preservation');if(p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryMainRef!==T14_ACCEPTED_MAIN||p.primaryCheckoutMoved!==false||p.untrackedPreserved!==15||p.protectedContentsRead!==false||p.allHashesVerified!==true||p.files!==832||external.length!==p.files+1)fail('preserved user work and source evidence');bound(p.manifest);bound(p.synchronization)
 if(record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run'||typeof record.limits!=='string'||!record.limits||record.limits.length>2048)fail('no new execution authority')
 // The immutable source observation also closes nested historical receipt data.
 if(digest(record)!==T14_COMPLETION_SHA256)fail('byte-fixed historical source observation')
}

// PR #202's immutable source capture. Historical paths are data: this validator
// never opens a runner filesystem or treats metadata HEAD as the source subject.
const T15_SOURCE_HEAD='a547a3282790ae070bc37617b104528ae5b095ad'
const T15_ACCEPTED_MAIN='479a39d6627daa019fcec95bbb5c1ee334671723'
const T15_ACCEPTED_TREE='727877fbc24901cfef8814608838ff2dd0809d48'
const T15_COMPLETION_SHA256='c6221da7bd4604daa607de8b26ac0dfc311af52ac09ffb5b08602f75bb39353e'
const T15_EXTERNAL_ROWS_SHA256='e68648cdf4afc59948e860689e8e735450591af7a0de3bad06597a4990e08829'
const T15_INSTALLED_OBSERVATION_SHA256='19ccc937fb757281d2ae7be77a41974b8312fe635b75dce9620bd81392c48596'
export function validateT15Completion(record) {
 const fail=reason=>{throw new TypeError('T15 completion: '+reason)}
 exactKeys(record,['schemaVersion','boundaryId','state','repository','sourceHeadSha','acceptedMainSha','acceptedTreeSha','mergeParents','pullRequestNumber','source','aggregateDocument','ci','packages','installedUat','activeRuntime','review','local','preservation','externalEvidence','runtimeActivation','automaticCleanup','mutationAuthority','finalProgramUat','limits'],'T15 completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t15-aggregate-completion/v1'||record.boundaryId!=='PROC-T15-AGGREGATE'||record.state!=='VERIFIED'||record.repository!=='katamor1/bob_builtin_analyze'||record.sourceHeadSha!==T15_SOURCE_HEAD||record.acceptedMainSha!==T15_ACCEPTED_MAIN||record.acceptedTreeSha!==T15_ACCEPTED_TREE||record.pullRequestNumber!==202)fail('accepted source identity')
 same(record.mergeParents,['a826dc20c0e71f472401adf644ca8cc777b74c58',T15_SOURCE_HEAD],'T15 normal merge parents')
 const external=record.externalEvidence
 if(!Array.isArray(external)||external.length!==908||new Set(external.map(r=>r.id)).size!==908||new Set(external.map(r=>r.path)).size!==908)fail('unique physical evidence collection')
 const key=r=>[r.path,r.bytes,r.sha256].join('\0'),observed=new Set()
 function bare(row){exactKeys(row,['path','bytes','sha256'],'T15 byte binding');if(typeof row.path!=='string'||row.path.length>4096||!(/^(?:[A-Za-z]:[\\/]|\/)/.test(row.path))||/[\x00-\x1f]/.test(row.path)||row.path.split(/[\\/]/).some(p=>p==='..'||p==='.')||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>268435456)fail('positive physical byte binding');hash256(row.sha256)}
 for(const row of external){exactKeys(row,['id','path','bytes','sha256'],'T15 external evidence');if(typeof row.id!=='string'||!/^t15-evidence-\d{4}$/.test(row.id))fail('evidence identity');const b={path:row.path,bytes:row.bytes,sha256:row.sha256};bare(b);observed.add(key(b))}
 if(digest(external)!==T15_EXTERNAL_ROWS_SHA256)fail('captured physical evidence identity')
 const bound=row=>{bare(row);if(!observed.has(key(row)))fail('binding was not physically captured')}
 const source=record.source
 exactKeys(source,['selectedSourceItems','selectedSourcePaths','selectedSourceBlobs','remainderItems','unassigned','upstreamMainSha','upstreamTreeSha','categories','rawByteAccounting','expandedByteAccounting','packedPayloadFiles','compiledPayloadFiles','installedTypeConsumers','productionDependencies','literalSourceAndControlPaths','sourceCoverage','sourceAdmission','historicalBindings','additionalPrerequisites','metadataIsNotSourceSubject'],'T15 source')
 if(source.selectedSourceItems!==30||source.selectedSourcePaths!==25||source.selectedSourceBlobs!==23||source.remainderItems!==675||source.unassigned!==0||source.upstreamMainSha!==record.mergeParents[0]||source.upstreamTreeSha!=='fa3a7ed1ea9aca00965ebe16d786096033d5f39e'||source.categories!==13||source.rawByteAccounting!=='source_once_per_selection'||source.expandedByteAccounting!=='structural_only'||source.packedPayloadFiles!==46||source.compiledPayloadFiles!==42||source.installedTypeConsumers!==3||source.productionDependencies!==0||source.literalSourceAndControlPaths!==72||source.metadataIsNotSourceSubject!==true)fail('closed source accounting and payload facts')
 for(const name of ['sourceCoverage','sourceAdmission','historicalBindings'])bound(source[name])
 if(source.sourceCoverage.sha256!=='cd3a294a3b15523c68167affec00700c198a6eff4d27230d19ff2b3e0197ba3f'||source.sourceAdmission.sha256!=='0b1f28b85b4544e391e79654d2d48e1508557d6b4d1bce7d3b5ce49f8964b626')fail('source coverage and admission')
 exactKeys(source.additionalPrerequisites,['count','sourceCoverage'],'T15 prerequisites');if(source.additionalPrerequisites.count!==47)fail('additional prerequisite count');same(source.additionalPrerequisites.sourceCoverage,source.sourceCoverage,'T15 prerequisite coverage')
 exactKeys(record.aggregateDocument,['contracts','selectionAdmission','rawAccounting','workbookAtomicity','xlsxInspection','cancellation','profileCompatibility','consumerParity','sourceFingerprints','packaging','crossPlatform'],'T15 eleven evidence joins');for(const row of Object.values(record.aggregateDocument))bound(row)
 const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','candidate','actualMain'],'T15 actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('actual CI required without waiver')
 const jobIds=new Set(),runIds=new Set()
 for(const [scope,head,success,skips,event]of [[ci.candidate,T15_SOURCE_HEAD,18,0,'pull_request'],[ci.actualMain,T15_ACCEPTED_MAIN,17,1,'push']]){
  exactKeys(scope,['head','tree','counts','collection','portableReplay','artifactCapture','workflows'],'T15 CI scope');if(scope.head!==head||scope.tree!==T15_ACCEPTED_TREE)fail('CI source subject');same(scope.counts,{workflows:5,rows:18,success,skipped:skips},'T15 CI counts');for(const n of ['collection','portableReplay','artifactCapture'])bound(scope[n]);same(scope.workflows.map(w=>w.id),Object.keys(T13_CI_JOBS),'T15 five workflows')
  let actualSuccess=0,actualSkips=0
  for(const w of scope.workflows){
   exactKeys(w,['id','path','runId','attempt','event','head','url','raw','jobs'],'T15 workflow');if(w.path!=='.github/workflows/'+w.id+'.yml'||!Number.isSafeInteger(w.runId)||w.runId<=0||runIds.has(w.runId)||!Number.isSafeInteger(w.attempt)||w.attempt<1||w.head!==head||w.event!==event||w.url!==`https://github.com/katamor1/bob_builtin_analyze/actions/runs/${w.runId}`)fail('actual workflow provenance');runIds.add(w.runId);exactKeys(w.raw,['run','jobs','artifacts'],'T15 raw workflow');for(const b of Object.values(w.raw))bound(b);same(w.jobs.map(j=>j.name),T13_CI_JOBS[w.id],'T15 eighteen jobs')
   for(const j of w.jobs){
    if(!Number.isSafeInteger(j.jobId)||j.jobId<=0||jobIds.has(j.jobId)||j.workflow!==w.id||j.event!==event)fail('unique job provenance');jobIds.add(j.jobId)
    if(event!=='pull_request'&&j.name==='Extension source metrics'){
     exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','guard','log'],'T15 metrics skip');if(j.conclusion!=='skipped'||j.kind!=='expected_non_pr_skip'||j.runner!==null||j.guard!==null||j.log!==null)fail('PR-only metrics skip');actualSkips++;continue
    }
    exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','startedAt','completedAt','guard','log'],'T15 actual job');if(j.conclusion!=='success'||j.kind!=='actual_runner_success'||!Number.isFinite(Date.parse(j.startedAt))||!Number.isFinite(Date.parse(j.completedAt))||Date.parse(j.completedAt)<Date.parse(j.startedAt))fail('successful completed job')
    const runner=j.name.startsWith('Windows / ')||j.name==='Real-machine environment contracts'||j.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest';exactKeys(j.runner,['id','name','labels','expected'],'T15 actual runner');if(!Number.isSafeInteger(j.runner.id)||j.runner.id<=0||typeof j.runner.name!=='string'||!j.runner.name||j.runner.expected!==runner||!Array.isArray(j.runner.labels)||!j.runner.labels.includes(runner))fail('assigned actual runner')
    const guard=j.guard;exactKeys(guard,['event','expectedHeadSha','actualHeadSha','logTimestamp','line','step'],'T15 actual guard');if(guard.event!==event||guard.expectedHeadSha!==head||guard.actualHeadSha!==head||typeof guard.line!=='string'||!guard.line.startsWith(guard.logTimestamp+' '))fail('actual checked-out source');let logged;try{logged=JSON.parse(guard.line.slice(guard.logTimestamp.length+1))}catch{fail('actual guard JSON')};same(logged,{event,expectedHeadSha:head,actualHeadSha:head},'T15 logged source checkout');exactKeys(guard.step,['name','number','startedAt','completedAt'],'T15 guard step');const step=guard.step,time=Date.parse(guard.logTimestamp);if(step.name!=='Verify checked-out commit'||!Number.isSafeInteger(step.number)||step.number<1||!Number.isFinite(time)||!Number.isFinite(Date.parse(step.startedAt))||!Number.isFinite(Date.parse(step.completedAt))||time<Date.parse(step.startedAt)-5000||time>Date.parse(step.completedAt)+5000)fail('guard log within actual checkout step');bound(j.log);actualSuccess++
   }
  }
  if(actualSuccess!==success||actualSkips!==skips)fail('actual success and skip totals')
 }
 const installed=record.installedUat
 exactKeys(installed,['kind','state','candidate','actualMain','productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'],'T15 installed UAT');if(installed.kind!=='isolated_artifact_extension_host'||installed.state!=='passed')fail('isolated installed host')
 for(const n of ['productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'])if(installed[n]!=='not_run')fail('unexecuted product/visual/live/final UAT')
 for(const[scope,head,ciScope]of [[installed.candidate,T15_SOURCE_HEAD,ci.candidate],[installed.actualMain,T15_ACCEPTED_MAIN,ci.actualMain]]){
  exactKeys(scope,['sourceHeadSha','sourceTreeSha','replay','platforms'],'T15 installed scope');if(scope.sourceHeadSha!==head||scope.sourceTreeSha!==T15_ACCEPTED_TREE)fail('installed source subject');same(scope.replay,ciScope.portableReplay,'T15 captured replay');bound(scope.replay);same(scope.platforms.map(p=>p.os),['ubuntu-latest','windows-latest'],'T15 actual host platforms')
  for(const p of scope.platforms){
   exactKeys(p,['os','artifactId','packageArtifactId','originalManifest','runnerReceipt','hostReceipt','mappedManifest','joinProof','packageReceipt','tarball','caseCount','loadedModules','parserEntries','sourceFixedParserFiles','packedPayloadFiles','compiledFiles','typedConsumers','vsix'],'T15 host platform');if(!Number.isSafeInteger(p.artifactId)||p.artifactId<=0||!Number.isSafeInteger(p.packageArtifactId)||p.packageArtifactId<=0||p.caseCount!==17||p.loadedModules!==28||p.parserEntries!==8||p.sourceFixedParserFiles!==583||p.packedPayloadFiles!==46||p.compiledFiles!==42||p.typedConsumers!==3)fail('actual host/package and source-fixed parser inventory');for(const n of ['originalManifest','runnerReceipt','hostReceipt','mappedManifest','joinProof','packageReceipt','tarball'])bound(p[n]);same(p.vsix.map(v=>v.id),['local.bob-bazaar-review','local.bob-code-consistency-review'],'T15 installed extensions')
   for(const [i,v]of p.vsix.entries()){
    exactKeys(v,['id','version','vsix','capBytes','headroomBytes','compiledPayload'],'T15 native VSIX');bound(v.vsix);if(v.version!==(i===0?'0.3.2':'0.1.0')||v.capBytes!==(i===0?12000000:11000000)||v.headroomBytes!==v.capBytes-v.vsix.bytes||v.headroomBytes<0||!Array.isArray(v.compiledPayload)||v.compiledPayload.length!==42)fail('actual installed VSIX and compiled payload');const paths=new Set();for(const b of v.compiledPayload){exactKeys(b,['path','bytes','sha256'],'T15 compiled module');if(typeof b.path!=='string'||!/^\w+\.(?:js|d\.ts|js\.map)$/.test(b.path)||paths.has(b.path)||!Number.isSafeInteger(b.bytes)||b.bytes<=0)fail('compiled module inventory');paths.add(b.path);hash256(b.sha256)}
   }
  }
 }
 // Pins roles as well as bytes: a captured candidate VSIX cannot replace main.
 if(digest(installed)!==T15_INSTALLED_OBSERVATION_SHA256)fail('captured installed artifact joins')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T15 packages')
 for(const [name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){
  const p=record.packages[name];exactKeys(p,['id','version','sourceHeadSha','sourceTreeSha','vsix','capBytes','headroomBytes',...(name==='workflowRegister'?['compaction']:['compiledPayload','parserIdentity'])],'T15 package');bound(p.vsix);if(p.id!==id||p.version!==version||p.sourceHeadSha!==T15_ACCEPTED_MAIN||p.sourceTreeSha!==T15_ACCEPTED_TREE||p.capBytes!==cap||p.headroomBytes!==cap-p.vsix.bytes||p.headroomBytes<0)fail('accepted source package subject/capacity');if(name==='workflowRegister')bound(p.compaction);else{same(p.vsix,installed.actualMain.platforms[0].vsix.find(v=>v.id===id).vsix,'T15 exact installed input');same(p.compiledPayload,installed.actualMain.platforms[0].originalManifest,'T15 compiled manifest');same(p.parserIdentity,installed.actualMain.platforms[0].joinProof,'T15 parser identity');bound(p.compiledPayload);bound(p.parserIdentity)}
 }
 const runtime=record.activeRuntime;exactKeys(runtime,['kind','sourceHeadSha','output','gateRResult','productWiring'],'T15 active runtime');if(runtime.kind!=='real_contract_tests'||runtime.sourceHeadSha!==T15_ACCEPTED_MAIN||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive accepted runtime');bound(runtime.output);const effects=['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'];exactKeys(runtime.productWiring,effects,'T15 five effects');for(const n of effects)if(runtime.productWiring[n]!==0||runtime.gateRResult[n]!==0)fail('five effects zero')
 const review=record.review;exactKeys(review,['oneFreshSourceReview','secondReview','reviewedHeadSha','finalSourceHeadSha','original','remaining','importantFixedByObservedTdd','report','resolution','ciRepair'],'T15 source review');if(review.oneFreshSourceReview!==true||review.secondReview!==false||review.reviewedHeadSha!=='4a098e81f3667eceb152d4ee5d898f716d45c65e'||review.finalSourceHeadSha!==T15_SOURCE_HEAD||review.importantFixedByObservedTdd!==1)fail('single source review');same(review.original,{critical:0,important:1,minor:0},'T15 original findings');same(review.remaining,{critical:0,important:0,minor:0},'T15 review closure');for(const n of ['report','resolution','ciRepair'])bound(review[n])
 const local=record.local;exactKeys(local,['allQualityGatesPassed','acceptedMainChecks','rootChecks','rootPassed','packagePassed','packageSkipped','packageExecutedHead','packageExecutedIndexTree','candidateQuality','unchangedInputProof','bazaar','consistency','methods','mainAttempt1Failure','sameHeadWindowsRetry'],'T15 local gates');if(local.allQualityGatesPassed!==true||local.rootPassed!==142||local.packagePassed!==88||local.packageSkipped!==1||local.packageExecutedHead!=='10b8bb8cdef365d2fea85b55ae63c0619e623a28'||local.packageExecutedIndexTree!==T15_ACCEPTED_TREE)fail('actual local gates');for(const n of ['acceptedMainChecks','rootChecks','candidateQuality','unchangedInputProof','methods','mainAttempt1Failure','sameHeadWindowsRetry'])bound(local[n]);for(const[name,pass,skip]of [['bazaar',799,1],['consistency',375,0]]){exactKeys(local[name],['passed','skipped','executedHead','executedIndexTree'],'T15 original execution subject');if(local[name].passed!==pass||local[name].skipped!==skip||local[name].executedHead!=='4a098e81f3667eceb152d4ee5d898f716d45c65e'||local[name].executedIndexTree!=='e4c09d8d4f62522ded986f2c0a50380dd0968f56')fail('local unchanged-input execution history')}
 const p=record.preservation;exactKeys(p,['primaryVisibleBranch','primaryVisibleHead','primaryMainRef','primaryCheckoutMoved','untrackedPreserved','protectedContentsRead','allHashesVerified','synchronization','files','manifest'],'T15 preservation');if(p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryMainRef!==T15_ACCEPTED_MAIN||p.primaryCheckoutMoved!==false||p.untrackedPreserved!==15||p.protectedContentsRead!==false||p.allHashesVerified!==true||p.files!==907||external.length!==p.files+1)fail('preserved user work and source evidence');bound(p.manifest);bound(p.synchronization)
 if(record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run'||typeof record.limits!=='string'||!record.limits||record.limits.length>4096)fail('no new execution authority')
 // Canonical data identity; generator separately pins the original pretty JSON
 // bytes so importing this historical observation never rewrites its encoding.
 if(digest(record)!==T15_COMPLETION_SHA256)fail('byte-fixed historical source observation')
}

// T16 is a byte-fixed accepted source observation, independent of this metadata commit.
const T16_SOURCE_HEAD='5f1e1e2e0916a3358125714f61ceba99f9e55154'
const T16_ACCEPTED_MAIN='2a961f624a7254d1af21e53a780efa6ccf9ee58b'
const T16_ACCEPTED_TREE='e81515142e6f9e48c11ee09f0f435b3027a1fa28'
const T16_COMPLETION_SHA256='8ca9f920100889e3ca4a94a0794df16d91bc9f12571a0a84dd681fc390908658'
const T16_EXTERNAL_ROWS_SHA256='e2ce7a14c060ce250286fa0713cd14ab5d56ee3729ae3828e8efc0f209753d69'
const T16_INSTALLED_SHA256='019bc596633bce3fac7e69cae211e00e43e17beb5770c099cda354c63cabd554'
export function validateT16Completion(record) {
 const fail=reason=>{throw new TypeError('T16 completion: '+reason)}
 exactKeys(record,['schemaVersion','boundaryId','state','repository','sourceHeadSha','acceptedMainSha','acceptedTreeSha','mergeParents','pullRequestNumber','source','inputProcess','ci','packages','installedUat','activeRuntime','review','local','preservation','externalEvidence','runtimeActivation','automaticCleanup','mutationAuthority','finalProgramUat','limits'],'T16 completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t16-input-process-completion/v1'||record.boundaryId!=='PROC-T16-INPUT-PROCESS'||record.state!=='VERIFIED'||record.repository!=='katamor1/bob_builtin_analyze'||record.sourceHeadSha!==T16_SOURCE_HEAD||record.acceptedMainSha!==T16_ACCEPTED_MAIN||record.acceptedTreeSha!==T16_ACCEPTED_TREE||record.pullRequestNumber!==204)fail('accepted source identity')
 same(record.mergeParents,['b3d18e2d9c3aa272f861a28c69e8e963572186c8',T16_SOURCE_HEAD],'T16 normal merge parents')
 const external=record.externalEvidence,observed=new Set(),identities=new Set(),key=r=>[r.path,r.bytes,r.sha256].join('\0')
 if(!Array.isArray(external)||external.length!==725||new Set(external.map(r=>r.id)).size!==725)fail('unique external evidence collection')
 function bare(row){exactKeys(row,['path','bytes','sha256'],'T16 byte binding');normalizedPath(row.path);if(row.path.length>4096||!Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>268435456)fail('positive physical binding');hash256(row.sha256)}
 for(const r of external){exactKeys(r,['id','path','bytes','sha256'],'T16 external row');if(!/^t16-evidence-\d{4}$/.test(r.id))fail('external identity');bare({path:r.path,bytes:r.bytes,sha256:r.sha256});const id=normalizedPath(r.path);if(identities.has(id))fail('physical path alias');identities.add(id);observed.add(key(r))}
 if(digest(external)!==T16_EXTERNAL_ROWS_SHA256)fail('captured physical evidence')
 const bound=row=>{bare(row);if(!observed.has(key(row)))fail('uncaptured physical binding')}
 const source=record.source
 exactKeys(source,['selectedSourceItems','selectedSourcePaths','selectedSourceBlobs','remainderItems','unassigned','upstreamMainSha','upstreamTreeSha','categories','rawByteAccounting','expandedByteAccounting','packedPayloadFiles','compiledPayloadFiles','installedTypeConsumers','productionDependencies','literalSourceAndControlPaths','sourceCoverage','sourceAdmission','historicalBindings','additionalPrerequisites','metadataIsNotSourceSubject'],'T16 source')
 if(source.selectedSourceItems!==29||source.selectedSourcePaths!==28||source.selectedSourceBlobs!==27||source.remainderItems!==675||source.unassigned!==0||source.upstreamMainSha!==record.mergeParents[0]||source.upstreamTreeSha!=='d717938a095bfd2872e46af40ed1ed04f35df03c'||source.categories!==13||source.rawByteAccounting!=='source_once_per_selection'||source.expandedByteAccounting!=='structural_only'||source.packedPayloadFiles!==46||source.compiledPayloadFiles!==42||source.installedTypeConsumers!==3||source.productionDependencies!==0||source.literalSourceAndControlPaths!==69||source.metadataIsNotSourceSubject!==true)fail('source facts and raw-once accounting')
 for(const n of ['sourceCoverage','sourceAdmission','historicalBindings'])bound(source[n])
 if(source.sourceCoverage.sha256!=='f604bcca0c863bf1e43bf6d2217fb7fcf1446d48380dbe40da8e3eff7294f73f'||source.sourceAdmission.sha256!=='6509faf09ff9652aa8b9bb32df4e0d252b484a71b0a3baa6d650c30819116720')fail('source coverage and literal admission')
 exactKeys(source.additionalPrerequisites,['count','sourceCoverage'],'T16 current prerequisites');if(source.additionalPrerequisites.count!==41)fail('prerequisite count');same(source.additionalPrerequisites.sourceCoverage,source.sourceCoverage,'T16 prerequisite source')
 exactKeys(record.inputProcess,['operationAccounting','stableInput','diff','excerpt','bob','artifact','processSettlement'],'T16 seven input/process joins');for(const b of Object.values(record.inputProcess))bound(b)
 const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','candidate','actualMain'],'T16 actual CI');if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('actual CI without inherited waiver')
 const runIds=new Set(),jobIds=new Set()
 for(const[scope,head,event,success,skips]of [[ci.candidate,T16_SOURCE_HEAD,'pull_request',18,0],[ci.actualMain,T16_ACCEPTED_MAIN,'push',17,1]]){
  exactKeys(scope,['head','tree','counts','collection','portableReplay','artifactCapture','workflows'],'T16 CI scope');if(scope.head!==head||scope.tree!==T16_ACCEPTED_TREE)fail('CI source role');same(scope.counts,{workflows:5,rows:18,success,skipped:skips},'T16 CI totals');for(const n of ['collection','portableReplay','artifactCapture'])bound(scope[n]);same(scope.workflows.map(w=>w.id),Object.keys(T13_CI_JOBS),'T16 five workflows')
  let actualSuccess=0,actualSkips=0
  for(const w of scope.workflows){
   exactKeys(w,['id','path','runId','attempt','event','head','url','raw','jobs'],'T16 workflow');if(w.path!=='.github/workflows/'+w.id+'.yml'||!Number.isSafeInteger(w.runId)||w.runId<=0||runIds.has(w.runId)||!Number.isSafeInteger(w.attempt)||w.attempt<1||w.event!==event||w.head!==head||w.url!==`https://github.com/katamor1/bob_builtin_analyze/actions/runs/${w.runId}`)fail('actual workflow provenance');runIds.add(w.runId);exactKeys(w.raw,['run','jobs','artifacts'],'T16 raw workflow');for(const b of Object.values(w.raw))bound(b);same(w.jobs.map(j=>j.name),T13_CI_JOBS[w.id],'T16 eighteen contract rows')
   for(const j of w.jobs){
    if(!Number.isSafeInteger(j.jobId)||j.jobId<=0||jobIds.has(j.jobId)||j.workflow!==w.id||j.event!==event)fail('unique job provenance');jobIds.add(j.jobId)
    if(event==='push'&&j.name==='Extension source metrics'){exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','guard','log'],'T16 PR-only metrics');if(j.conclusion!=='skipped'||j.kind!=='expected_non_pr_skip'||j.runner!==null||j.guard!==null||j.log!==null)fail('only PR metrics skip');actualSkips++;continue}
    exactKeys(j,['workflow','name','jobId','event','conclusion','kind','runner','startedAt','completedAt','guard','log'],'T16 actual job');if(j.conclusion!=='success'||j.kind!=='actual_runner_success'||!Number.isFinite(Date.parse(j.startedAt))||!Number.isFinite(Date.parse(j.completedAt))||Date.parse(j.completedAt)<Date.parse(j.startedAt))fail('actual completed success')
    const expected=j.name.startsWith('Windows / ')||j.name==='Real-machine environment contracts'||j.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest';exactKeys(j.runner,['id','name','labels','expected'],'T16 runner');if(!Number.isSafeInteger(j.runner.id)||j.runner.id<=0||typeof j.runner.name!=='string'||!j.runner.name||j.runner.expected!==expected||!Array.isArray(j.runner.labels)||!j.runner.labels.includes(expected))fail('assigned runner')
    const g=j.guard;exactKeys(g,['event','expectedHeadSha','actualHeadSha','logTimestamp','line','step'],'T16 checkout guard');if(g.event!==event||g.expectedHeadSha!==head||g.actualHeadSha!==head||typeof g.line!=='string'||!g.line.startsWith(g.logTimestamp+' '))fail('actual checkout source');let logged;try{logged=JSON.parse(g.line.slice(g.logTimestamp.length+1))}catch{fail('logged checkout JSON')};same(logged,{event,expectedHeadSha:head,actualHeadSha:head},'T16 exact checkout marker');exactKeys(g.step,['name','number','startedAt','completedAt'],'T16 guard step');const time=Date.parse(g.logTimestamp);if(g.step.name!=='Verify checked-out commit'||!Number.isSafeInteger(g.step.number)||g.step.number<1||!Number.isFinite(time)||time<Date.parse(g.step.startedAt)-5000||time>Date.parse(g.step.completedAt)+5000)fail('guard timestamp in actual step');bound(j.log);actualSuccess++
   }
  }
  if(actualSuccess!==success||actualSkips!==skips)fail('actual success/skip counts')
 }
 const installed=record.installedUat;exactKeys(installed,['kind','state','candidate','actualMain','productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'],'T16 installed UAT');if(installed.kind!=='isolated_artifact_extension_host'||installed.state!=='passed')fail('installed host state');for(const n of ['productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'])if(installed[n]!=='not_run')fail('unexecuted product and visual UAT')
 const artifactIds=new Set()
 for(const[scope,head,ciScope]of [[installed.candidate,T16_SOURCE_HEAD,ci.candidate],[installed.actualMain,T16_ACCEPTED_MAIN,ci.actualMain]]){
  exactKeys(scope,['sourceHeadSha','sourceTreeSha','replay','platforms'],'T16 host scope');if(scope.sourceHeadSha!==head||scope.sourceTreeSha!==T16_ACCEPTED_TREE)fail('installed source role');same(scope.replay,ciScope.portableReplay,'T16 captured replay');bound(scope.replay);same(scope.platforms.map(p=>p.os),['ubuntu-latest','windows-latest'],'T16 both OS')
  for(const p of scope.platforms){
   exactKeys(p,['os','artifactId','packageArtifactId','originalManifest','originalBaselineManifest','runnerReceipt','hostReceipt','baselineHostReceipt','mappedManifest','mappedBaselineManifest','joinProof','packageReceipt','tarball','caseCount','loadedModules','parserEntries','sourceFixedParserFiles','packedPayloadFiles','compiledFiles','typedConsumers','vsix'],'T16 host platform');for(const id of [p.artifactId,p.packageArtifactId]){if(!Number.isSafeInteger(id)||id<=0||artifactIds.has(id))fail('distinct actual artifacts');artifactIds.add(id)}
   if(p.caseCount!==25||p.loadedModules!==28||p.parserEntries!==8||p.sourceFixedParserFiles!==583||p.packedPayloadFiles!==46||p.compiledFiles!==42||p.typedConsumers!==3)fail('installed/package inventory');for(const n of ['originalManifest','originalBaselineManifest','runnerReceipt','hostReceipt','baselineHostReceipt','mappedManifest','mappedBaselineManifest','joinProof','packageReceipt','tarball'])bound(p[n]);same(p.vsix.map(v=>v.id),['local.bob-bazaar-review','local.bob-code-consistency-review'],'T16 installed extensions')
   for(const[i,v]of p.vsix.entries()){exactKeys(v,['id','version','vsix','capBytes','headroomBytes','compiledPayload'],'T16 installed VSIX');bound(v.vsix);if(v.version!==(i?'0.1.0':'0.3.2')||v.capBytes!==(i?11000000:12000000)||v.headroomBytes!==v.capBytes-v.vsix.bytes||v.headroomBytes<0||!Array.isArray(v.compiledPayload)||v.compiledPayload.length!==42)fail('native VSIX bounds');const paths=new Set();for(const row of v.compiledPayload){exactKeys(row,['path','bytes','sha256'],'T16 compiled payload');if(typeof row.path!=='string'||!/^\w+\.(?:js|d\.ts|js\.map)$/.test(row.path)||paths.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<=0)fail('compiled module row');paths.add(row.path);hash256(row.sha256)}}
  }
 }
 if(digest(installed)!==T16_INSTALLED_SHA256)fail('captured original and mapped host joins')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T16 packages')
 for(const[name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){const p=record.packages[name];exactKeys(p,['id','version','sourceHeadSha','sourceTreeSha','vsix','capBytes','headroomBytes',...(name==='workflowRegister'?['compaction']:['compiledPayload','parserIdentity'])],'T16 accepted package');bound(p.vsix);if(p.id!==id||p.version!==version||p.sourceHeadSha!==T16_ACCEPTED_MAIN||p.sourceTreeSha!==T16_ACCEPTED_TREE||p.capBytes!==cap||p.headroomBytes!==cap-p.vsix.bytes||p.headroomBytes<0)fail('accepted package subject/bounds');if(name==='workflowRegister')bound(p.compaction);else{same(p.vsix,installed.actualMain.platforms[0].vsix.find(v=>v.id===id).vsix,'T16 exact installed package input');same(p.compiledPayload,installed.actualMain.platforms[0].originalBaselineManifest,'T16 compiled manifest');same(p.parserIdentity,installed.actualMain.platforms[0].joinProof,'T16 parser join');bound(p.compiledPayload);bound(p.parserIdentity)}}
 const runtime=record.activeRuntime;exactKeys(runtime,['kind','sourceHeadSha','output','gateRResult','productWiring'],'T16 active runtime');if(runtime.kind!=='real_contract_tests'||runtime.sourceHeadSha!==T16_ACCEPTED_MAIN||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive actual contract runtime');bound(runtime.output);const effects=['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'];exactKeys(runtime.productWiring,effects,'T16 five effects');for(const n of effects)if(runtime.productWiring[n]!==0||runtime.gateRResult[n]!==0)fail('zero product effects')
 const review=record.review;exactKeys(review,['oneFreshSourceReview','secondReview','reviewedHeadSha','finalSourceHeadSha','original','remaining','importantFixedByObservedTdd','report','resolution','ciRepair'],'T16 source review');if(review.oneFreshSourceReview!==true||review.secondReview!==false||review.reviewedHeadSha!=='9c6c8e0786e7109d2a3ebfc8140782060676eb75'||review.finalSourceHeadSha!==T16_SOURCE_HEAD||review.importantFixedByObservedTdd!==1)fail('single source review and one fix pass');same(review.original,{critical:0,important:1,minor:0},'T16 original findings');same(review.remaining,{critical:0,important:0,minor:0},'T16 review closure');for(const n of ['report','resolution','ciRepair'])bound(review[n])
 const local=record.local;exactKeys(local,['allQualityGatesPassed','acceptedMainChecks','rootChecks','rootPassed','packagePassed','packageSkipped','packageExecutedHead','packageExecutedIndexTree','candidateQuality','unchangedInputProof','bazaar','consistency','workflow','methods'],'T16 local quality');if(local.allQualityGatesPassed!==true||local.rootPassed!==149||local.packagePassed!==97||local.packageSkipped!==1||local.packageExecutedHead!=='82fb6ff8ec481e45f5d74bacb9af31a9f1e27512'||local.packageExecutedIndexTree!=='9e7b5a8e23380ae6b3d0d74e14454903fe676536')fail('actual local execution history');for(const n of ['acceptedMainChecks','rootChecks','candidateQuality','unchangedInputProof','methods'])bound(local[n]);for(const[name,passed,skipped,head,tree]of [['bazaar',802,1,'9c6c8e0786e7109d2a3ebfc8140782060676eb75','1eaa9d6c1a0dee8b07698801c3e81e486b448de4'],['workflow',2270,1,'9c6c8e0786e7109d2a3ebfc8140782060676eb75','1eaa9d6c1a0dee8b07698801c3e81e486b448de4'],['consistency',426,0,T16_SOURCE_HEAD,T16_ACCEPTED_TREE]]){exactKeys(local[name],['passed','skipped','executedHead','executedIndexTree'],'T16 original local subject');same(local[name],{passed,skipped,executedHead:head,executedIndexTree:tree},'T16 preserved execution subject')}
 const p=record.preservation;exactKeys(p,['primaryVisibleBranch','primaryVisibleHead','primaryMainRef','primaryCheckoutMoved','untrackedPreserved','protectedContentsRead','allHashesVerified','synchronization','files','manifest'],'T16 preservation');if(p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryMainRef!==T16_ACCEPTED_MAIN||p.primaryCheckoutMoved!==false||p.untrackedPreserved!==15||p.protectedContentsRead!==false||p.allHashesVerified!==true||p.files!==724||external.length!==p.files+1)fail('user work and physical evidence preservation');bound(p.synchronization);bound(p.manifest)
 if(record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run'||!Array.isArray(record.limits)||record.limits.length!==11||record.limits.some(x=>typeof x!=='string'))fail('inactive product and honest limits')
 if(digest(record)!==T16_COMPLETION_SHA256)fail('byte-fixed accepted source observation')
}



const T17_DEADLINE_SOURCE_HEAD='4484cbbf34644a9df43a34f37b5c47d288ccf168'
const T17_DEADLINE_ACCEPTED_MAIN='13d6bc08205f2185f2156b838aef65b87a64ece8'
const T17_DEADLINE_ACCEPTED_TREE='c0f755ff9e8c7d243d5001b576f5dc269bc4b6be'
const T17_DEADLINE_COMPLETION_SHA256='57aedc28d0617cf3260ef642883ea3c271da82508d5c551b374b9df31e5f3c69'
const T17_DEADLINE_EXTERNAL_ROWS_SHA256='d0988d69fae305cf5daeac76c13aa8f181bd434074d4cf0c30bb559032aab5a3'
const T17_DEADLINE_INSTALLED_SHA256='a58e64a33d24a83cf711f72e9ceeb2dbaa9e2ef34619b89205e616d7b3ba8832'
export function validateT17DeadlineCompletion(record) {
 const fail=reason=>{throw new TypeError('T17 deadline completion: '+reason)}
 exactKeys(record,["schemaVersion","boundaryId","state","repository","sourceHeadSha","acceptedMainSha","acceptedTreeSha","mergeParents","pullRequestNumber","source","deadline","ci","packages","installedUat","activeRuntime","review","local","preservation","externalEvidence","runtimeActivation","automaticCleanup","mutationAuthority","finalProgramUat","limits"],'T17 deadline completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t17-deadline-completion/v1'||record.boundaryId!=='PROC-T17-DEADLINE'||record.state!=='VERIFIED'||record.repository!=='katamor1/bob_builtin_analyze'||record.sourceHeadSha!==T17_DEADLINE_SOURCE_HEAD||record.acceptedMainSha!==T17_DEADLINE_ACCEPTED_MAIN||record.acceptedTreeSha!==T17_DEADLINE_ACCEPTED_TREE||record.pullRequestNumber!==206)fail('accepted source identity, never metadata')
 same(record.mergeParents,['6ce384313c1072e34ced342260304c9c7dd07e9e',T17_DEADLINE_SOURCE_HEAD],'T17 normal source merge parents')
 const external=record.externalEvidence,observed=new Set(),paths=new Set(),ids=new Set(),key=b=>[b.path,b.bytes,b.sha256].join('\0')
 function bare(b){exactKeys(b,['path','bytes','sha256'],'T17 byte binding');normalizedPath(b.path);if(b.path.length>4096||!Number.isSafeInteger(b.bytes)||b.bytes<=0||b.bytes>268435456)fail('positive physical byte binding');hash256(b.sha256)}
 if(!Array.isArray(external)||external.length!==920)fail('source physical evidence count')
 for(const row of external){exactKeys(row,['id','path','bytes','sha256'],'T17 physical row');if(!/^t17-evidence-\d{4}$/.test(row.id)||ids.has(row.id))fail('unique evidence id');ids.add(row.id);bare({path:row.path,bytes:row.bytes,sha256:row.sha256});const p=normalizedPath(row.path);if(paths.has(p))fail('physical path alias');paths.add(p);observed.add(key(row))}
 if(digest(external)!==T17_DEADLINE_EXTERNAL_ROWS_SHA256)fail('fixed physical evidence collection')
 const bound=b=>{bare(b);if(!observed.has(key(b)))fail('uncaptured source observation')}
 const source=record.source;exactKeys(source,["selectedSourceItems","selectedSourcePaths","selectedSourceBlobs","selectedOriginRows","uniqueOrigins","remainderItems","unassigned","archiveOwnerSha","baseMainSha","baseTreeSha","categories","budgetErrorCodes","runtimeModules","packedPayloadFiles","compiledPayloadFiles","installedTypeConsumers","productionDependencies","literalSourceRows","literalControlRows","sourceCoverage","sourceAdmission","historicalBindings","additionalPrerequisites","metadataIsNotSourceSubject"],'T17 source coverage')
 same([source.selectedSourceItems,source.selectedSourcePaths,source.selectedSourceBlobs,source.selectedOriginRows,source.uniqueOrigins,source.remainderItems,source.unassigned],[54,54,53,56,54,675,0],'T17 exact source partition')
 same([source.categories,source.budgetErrorCodes,source.runtimeModules,source.compiledPayloadFiles,source.packedPayloadFiles,source.installedTypeConsumers,source.productionDependencies,source.literalSourceRows,source.literalControlRows,source.additionalPrerequisites],[13,9,15,45,49,3,0,70,46,48],'T17 unchanged quantities and actual inventories')
 if(source.metadataIsNotSourceSubject!==true||source.baseMainSha!=='6ce384313c1072e34ced342260304c9c7dd07e9e'||source.baseTreeSha!=='8b2738d648aeff346be05167cd30d952e974686a'||source.archiveOwnerSha!=='7ea786afd5715d841526000a402c831d6c2a203c')fail('archive/baseline source role')
 for(const n of ['sourceCoverage','sourceAdmission','historicalBindings'])bound(source[n]);if(digest(source)!=='f77f3078458e83f224c43239e2c02b07a079fcd1ffd707041080002800756232')fail('literal source coverage and prerequisites')
 const deadline=record.deadline;exactKeys(deadline,["mode","authenticatedFirstCause","externalErrorIdentityPreserved","parentEndpointNotRenewed","synchronousPostDisposeExpiry","processSettlementBoundMs","processSettlement","residualProcessZeroClaim","absoluteDeadlineAuthoritySerialized","transportVersusOuter","disposal","nativeSettlement","domains"],'T17 safe deadline evidence')
 if(deadline.mode!=='existing_operation_owns_shared_absolute_monotonic_deadline'||deadline.authenticatedFirstCause!==true||deadline.externalErrorIdentityPreserved!==true||deadline.parentEndpointNotRenewed!==true||deadline.synchronousPostDisposeExpiry!==true||deadline.processSettlementBoundMs!==2000||deadline.processSettlement!=='bounded_best_effort'||deadline.residualProcessZeroClaim!==false||deadline.absoluteDeadlineAuthoritySerialized!==false)fail('deadline authority, authentication and bounded limits')
 same(deadline.transportVersusOuter,{preserveUnrelatedOrFalseyFirstRejection:true,synchronousSpawnFailureCleanup:'not_required',settledTransportFailureChecksOwnerBeforeParsing:true,successfulResultAdoptionChecksOwner:true},'T17 transport and outer adoption priority')
 same(deadline.disposal,{ownedScopesOnly:true,borrowedOwnerNeverDisposed:true,synchronousCheckpointAfterDispose:true},'T17 owner disposal')
 same(deadline.nativeSettlement,{exitEventObservationPhase:'after_controller_settlement',nativeChildExitObserved:true,entireProcessTreeReapedGuarantee:false},'T17 measured native settlement, no residual guarantee')
 exactKeys(deadline.domains,["deadlineValueAndTypes","operationCancellationAuthority","synchronousCheckpoints","boundedProcessSettlement","analyzerAdoption","entryOwnershipAndDisposal","installedPackagesAndHost","independentAdmission"],'T17 deadline domains');for(const b of Object.values(deadline.domains))bound(b);if(digest(deadline)!=='6bf6d0e3557009d514c4045fed7bf0b16ee86da9a2883850516b261fbdd89dcb')fail('safe fixed domain observations')
 const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','workflowEvidenceByteParity','candidate','actualMain'],'T17 actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('fresh actual CI, no old waiver');bound(ci.workflowEvidenceByteParity)
 const runIds=new Set(),jobIds=new Set()
 for(const[scope,head,event,success,skips]of [[ci.candidate,T17_DEADLINE_SOURCE_HEAD,'pull_request',18,0],[ci.actualMain,T17_DEADLINE_ACCEPTED_MAIN,'push',17,1]]){
  exactKeys(scope,['head','tree','counts','collection','artifactCapture','portableReplay','workflows'],'T17 CI scope');if(scope.head!==head||scope.tree!==T17_DEADLINE_ACCEPTED_TREE)fail('actual checkout source role');same(scope.counts,{workflows:5,rows:18,success,skipped:skips},'T17 five workflow/eighteen event rows');for(const n of ['collection','artifactCapture','portableReplay'])bound(scope[n]);same(scope.workflows.map(w=>w.id),Object.keys(T13_CI_JOBS),'T17 required workflows');let actual=0,skip=0
  for(const w of scope.workflows){if(w.path!=='.github/workflows/'+w.id+'.yml'||w.head!==head||w.event!==event||w.conclusion!=='success'||!Number.isSafeInteger(w.runId)||w.runId<=0||runIds.has(w.runId)||!Number.isSafeInteger(w.attempt)||w.attempt<1||w.url!=='https://github.com/katamor1/bob_builtin_analyze/actions/runs/'+w.runId)fail('actual workflow identity');runIds.add(w.runId);bound(w.rawRun);bound(w.rawArtifacts);same(w.jobs.map(j=>j.name),T13_CI_JOBS[w.id],'T17 exact job inventory')
   for(const j of w.jobs){if(j.workflowId!==w.id||j.workflowPath!==w.path||j.runId!==w.runId||j.attempt!==w.attempt||j.event!==event||j.head!==head||!Number.isSafeInteger(j.jobId)||j.jobId<=0||jobIds.has(j.jobId))fail('actual job provenance');jobIds.add(j.jobId);bound(j.rawJobs)
    if(event==='push'&&j.name==='Extension source metrics'){if(j.conclusion!=='skipped'||j.expectedConclusion!=='skipped'||j.guard!==null||j.log!==null)fail('only non-PR metrics skip');skip++;continue}
    if(j.conclusion!=='success'||j.expectedConclusion!=='success'||!Number.isSafeInteger(j.runnerId)||j.runnerId<=0||typeof j.runnerName!=='string'||!j.runnerName||!Number.isFinite(Date.parse(j.started))||!Number.isFinite(Date.parse(j.completed))||Date.parse(j.completed)<Date.parse(j.started))fail('assigned runner actual success')
    const runner=j.name.startsWith('Windows / ')||j.name==='Real-machine environment contracts'||j.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest';if(!Array.isArray(j.runnerLabels)||!j.runnerLabels.includes(runner))fail('runner OS')
    const g=j.guard;if(!g||g.step?.name!=='Verify checked-out commit'||g.step.conclusion!=='success'||g.checkoutStep?.conclusion!=='success'||Date.parse(g.checkoutStep.completed_at)>Date.parse(g.step.started_at))fail('checkout and unconditional guard')
    same({event:g.observation.event,expectedHeadSha:g.observation.expectedHeadSha,actualHeadSha:g.observation.actualHeadSha},{event,expectedHeadSha:head,actualHeadSha:head},'T17 exact logged guard');const at=Date.parse(g.observation.at);if(!Number.isFinite(at)||at<Date.parse(g.step.started_at)-1000||at>=Date.parse(g.step.completed_at)+1000)fail('guard timestamp');bound(j.log);actual++
   }
  }same([actual,skip],[success,skips],'T17 actual event totals')
 }
 if(digest(ci)!=='795170609bb9f774574c610527381c0fd6f2a27442fce67a8887d44700acad28')fail('original actual CI observations')
 const installed=record.installedUat;exactKeys(installed,['kind','state','candidate','actualMain','productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'],'T17 isolated host')
 if(installed.kind!=='isolated_artifact_extension_host'||installed.state!=='passed')fail('installed host state');for(const n of ['productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'])if(installed[n]!=='not_run')fail('unexecuted product/visual/live UAT')
 const artifactIds=new Set();for(const[scope,head,c]of [[installed.candidate,T17_DEADLINE_SOURCE_HEAD,ci.candidate],[installed.actualMain,T17_DEADLINE_ACCEPTED_MAIN,ci.actualMain]]){exactKeys(scope,['sourceHeadSha','sourceTreeSha','replay','platforms'],'T17 host scope');if(scope.sourceHeadSha!==head||scope.sourceTreeSha!==T17_DEADLINE_ACCEPTED_TREE)fail('installed source role');same(scope.replay,c.portableReplay,'T17 actual raw and portable replay roles');bound(scope.replay);same(scope.platforms.map(p=>p.os),['linux','win32'],'T17 native both OS')
  for(const p of scope.platforms){if(p.head!==head||p.tree!==T17_DEADLINE_ACCEPTED_TREE||p.runId!==c.workflows.find(w=>w.id==='processing-budget-runtime').runId||p.hostExecutionRepeated!==false||p.mode!=='actual_ci_execution_plus_portable_byte_replay'||!Number.isSafeInteger(p.artifactId)||p.artifactId<=0||artifactIds.has(p.artifactId))fail('original actual native provenance');artifactIds.add(p.artifactId);same([p.cases,p.runtimeModules,p.parserModules,p.pinnedParserFiles,p.compiledFiles,p.tarballFiles,p.typeConsumers],[37,30,8,583,45,49,3],'T17 actual host/package inventory');for(const n of ['archive','originalManifest','originalExecution','originalHost','portableManifest','portableHost','pathMap','tarball'])bound(p[n]);if(p.githubDigest!=='sha256:'+p.archive.sha256)fail('GitHub artifact digest');same(p.vsix.map(x=>x.id),['local.bob-bazaar-review','local.bob-code-consistency-review','local.workflow-register'],'T17 three captured actual VSIX');for(const v of p.vsix)bound(v.vsix)}
 }
 if(digest(installed)!==T17_DEADLINE_INSTALLED_SHA256)fail('fixed native observations and byte maps')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T17 accepted packages');for(const[name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){const p=record.packages[name];if(p.id!==id||p.version!==version||p.sourceHeadSha!==T17_DEADLINE_ACCEPTED_MAIN||p.sourceTreeSha!==T17_DEADLINE_ACCEPTED_TREE||p.capBytes!==cap||p.headroomBytes!==cap-p.vsix.bytes||p.headroomBytes<0)fail('real package identity/capacity');bound(p.vsix);same(p.vsix,installed.actualMain.platforms[0].vsix.find(x=>x.id===id).vsix,'T17 actual main VSIX input');if(name==='workflowRegister'){same([p.compaction.declaredTargets,p.compaction.presentTargets,p.compaction.absentTargets],[113,111,2],'T17 unchanged compaction');bound(p.compaction.policyEvidence)}else{if(!Array.isArray(p.compiledPayload)||p.compiledPayload.length!==45||new Set(p.compiledPayload.map(x=>x.path)).size!==45)fail('45 compiled payload files');bound(p.parserIdentity)}}
 const runtime=record.activeRuntime;if(runtime.kind!=='real_contract_tests'||runtime.sourceHeadSha!==T17_DEADLINE_ACCEPTED_MAIN||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive actual runtime suites');bound(runtime.output);for(const n of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])if(runtime.productWiring[n]!==0||runtime.gateRResult[n]!==0)fail('zero product effects')
 const review=record.review;if(review.oneFreshSourceReview!==true||review.secondReview!==false||review.reviewedHeadSha!=='886a900b6dee2a9276a65cec072ea6dd24585f68'||review.finalSourceHeadSha!==T17_DEADLINE_SOURCE_HEAD||review.importantFixedByObservedTdd!==2||review.regressionCases!==7)fail('single source review/fix pass');same(review.original,{critical:0,important:2,minor:0},'T17 original findings');same(review.remaining,{critical:0,important:0,minor:0},'T17 closed findings');for(const n of ['report','resolution','ciRepair'])bound(review[n])
 if(record.local.allRequiredGatesSatisfied!==true||record.local.fullProductSuites.subject!=='bcf1965960ab560d1e6bb61d7a8c73963316a7f8'||record.local.fullProductSuites.root153Subject!=='1967dab5ff857981a9ec2417438d6678c64f511f'||record.local.fullProductSuites.notRelabeled!==true)fail('original full-suite subjects retained');same([record.local.repairAdmissions.distinctSuccessful,record.local.repairAdmissions.initialPassed,record.local.repairAdmissions.initialFailed,record.local.repairAdmissions.exactSameHeadRetryPassed,record.local.repairAdmissions.cleanWholeSuiteRunClaimed],[64,63,1,1,false],'T17 initial local failure and limited retry')
 const p=record.preservation;if(p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryMainRef!==T17_DEADLINE_ACCEPTED_MAIN||p.primaryCheckoutMoved!==false||p.untrackedPreserved!==15||p.protectedContentsRead!==false||p.allHashesVerified!==true||p.all18WorktreesRetained!==true||p.other17WorktreeHeadsUnchanged!==true||p.oldCompletionReferences!==16||p.files!==919||p.t16RawSha256!=='0de29738494e0835a09c034e64d32ccdc56a7027208372b03cbae57638fac9d5')fail('preserved source/user work and original sixteen');bound(p.synchronization);bound(p.manifest)
 if(record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run')fail('inactive metadata has no execution authority')
 // This is a data-only replay. Never open original runner or source-host paths.
 function inspect(value){if(!value||typeof value!=='object')return;if(typeof value.path==='string'&&/^(?:[A-Za-z]:[\\/]|\/)/.test(value.path)&&Number.isSafeInteger(value.bytes)&&typeof value.sha256==='string')bound({path:value.path,bytes:value.bytes,sha256:value.sha256});for(const child of Object.values(value))inspect(child)}inspect(record)
 if(digest(record)!==T17_DEADLINE_COMPLETION_SHA256)fail('byte-fixed accepted source observation')
}

// Pinned historical observations only: replay never opens a reported host path.
const T17_PATH_SOURCE_HEAD='442e5132528f7ae581396282d060fd24df8ab95e'
const T17_PATH_ACCEPTED_MAIN='06dee79ad90c1dc45682243660bf730a87b6e77f'
const T17_PATH_ACCEPTED_TREE='e1e8a11d1e0d25e4037f12080b074a1f5f8f5e29'
const T17_PATH_COMPLETION_SHA256='d68db5877d0cb6267a8dbdc08c8ff392eb497988706fd01043d67802ee2bf9b3'
export function validateT17PathCompletion(record) {
 const fail=reason=>{throw new TypeError('T17 PATH completion: '+reason)}
 exactKeys(record,["schemaVersion","boundaryId","state","repository","sourceHeadSha","acceptedMainSha","acceptedTreeSha","mergeParents","pullRequestNumber","source","pathPolicy","ci","packages","installedUat","activeRuntime","review","local","preservation","externalEvidence","runtimeActivation","automaticCleanup","mutationAuthority","finalProgramUat","limits"],'T17 PATH completion')
 if(record.schemaVersion!=='bob-builtin-analyze/proc-t17-path-completion/v1'||record.boundaryId!=='PROC-T17-PATH'||record.state!=='VERIFIED'||record.repository!=='katamor1/bob_builtin_analyze'||record.sourceHeadSha!==T17_PATH_SOURCE_HEAD||record.acceptedMainSha!==T17_PATH_ACCEPTED_MAIN||record.acceptedTreeSha!==T17_PATH_ACCEPTED_TREE||record.pullRequestNumber!==208)fail('accepted source identity, never metadata')
 same(record.mergeParents,['cf96788dbdd6836b449b7a31ecd3bae4ee4302a4',T17_PATH_SOURCE_HEAD],'T17 PATH normal merge parents')
 const observed=new Set(),paths=new Map(),ids=new Set(),key=b=>[b.path,b.bytes,b.sha256].join('\0'),external=record.externalEvidence
 const bare=b=>{exactKeys(b,['path','bytes','sha256'],'T17 PATH byte binding');normalizedPath(b.path);if(b.path.length>4096||!Number.isSafeInteger(b.bytes)||b.bytes<=0||b.bytes>268435456)fail('positive physical byte binding');hash256(b.sha256)}
 if(!Array.isArray(external)||external.length!==926)fail('physical observations count')
 for(const r of external){exactKeys(r,['id','path','bytes','sha256'],'T17 PATH physical observation');if(!/^t17-path-evidence-\d{4}$/.test(r.id)||ids.has(r.id))fail('unique evidence identity');ids.add(r.id);const b={path:r.path,bytes:r.bytes,sha256:r.sha256};bare(b);const p=normalizedPath(r.path),prior=paths.get(p);if(prior&&(prior.bytes!==r.bytes||prior.sha256!==r.sha256))fail('inconsistent physical path spelling');paths.set(p,b);observed.add(key(b))}
 if(paths.size!==922||digest(external)!=='79e95ed243ea6ba681749373bb1e25a5ae86dafbfa7a8fe109a60aca268e5b2c')fail('fixed physical observations and four consistent spellings')
 const bound=b=>{bare(b);if(!observed.has(key(b)))fail('uncaptured physical binding')}
 const source=record.source
 same([source.selectedSourceItems,source.selectedSourcePaths,source.selectedSourceBlobs,source.selectedOriginRows,source.uniqueOrigins,source.remainderItems,source.unassigned],[22,22,21,22,22,675,0],'T17 PATH source partition')
 same([source.categories,source.budgetErrorCodes,source.runtimeModules,source.compiledPayloadFiles,source.packedPayloadFiles,source.installedTypeConsumers,source.productionDependencies,source.literalSourceRows,source.literalControlRows,source.independentControls,source.additionalPrerequisites],[13,9,16,48,52,3,0,24,71,2,72],'T17 PATH actual source inventories')
 if(source.metadataIsNotSourceSubject!==true||source.baseMainSha!==record.mergeParents[0]||digest(source)!=='861eb71a5ade95a5e2d2884b669645f270e71f91e84d471fa07e6577210df6af')fail('source coverage and literal prerequisites')
 const policy=record.pathPolicy
 same(policy.copyProfiles,{bazaar:'full',consistency:'full',workflowRegister:'path-only'},'T17 PATH copy profiles');same(policy.workflowRuntimeJsNames,['pathPolicy.js'],'T17 PATH Workflow path-only module')
 same(policy.uncHostPolicy,{scope:'isolated_host_user_data',allowedHosts:['127.0.0.1'],globalUserSettingsChanged:false},'T17 PATH narrow host policy')
 if(policy.timeOfCheckUseRaceEliminated!==false||policy.allReparseTagsRecognized!==false||policy.networkAtomicityGuaranteed!==false||policy.windowsNativeUncRequired!==true||!Array.isArray(policy.requiredHostCases)||policy.requiredHostCases.length!==49||digest(policy)!=='42ad9056524c033c5572232549333b6229c6b185635063a9080600e30035d308')fail('fixed path semantics and honest filesystem limits')
  const ci=record.ci;exactKeys(ci,['mode','allRequiredGatesSucceeded','waiver','workflowEvidenceByteParity','candidate','actualMain'],'T17 actual CI')
 if(ci.mode!=='actual_exact_head_success'||ci.allRequiredGatesSucceeded!==true||ci.waiver!==null)fail('fresh actual CI, no old waiver');bound(ci.workflowEvidenceByteParity)
 const runIds=new Set(),jobIds=new Set()
 for(const[scope,head,event,success,skips]of [[ci.candidate,T17_PATH_SOURCE_HEAD,'pull_request',18,0],[ci.actualMain,T17_PATH_ACCEPTED_MAIN,'push',17,1]]){
  exactKeys(scope,['head','tree','counts','collection','artifactCapture','portableReplay','workflows'],'T17 CI scope');if(scope.head!==head||scope.tree!==T17_PATH_ACCEPTED_TREE)fail('actual checkout source role');same(scope.counts,{workflows:5,rows:18,success,skipped:skips},'T17 five workflow/eighteen event rows');for(const n of ['collection','artifactCapture','portableReplay'])bound(scope[n]);same(scope.workflows.map(w=>w.id),Object.keys(T13_CI_JOBS),'T17 required workflows');let actual=0,skip=0
  for(const w of scope.workflows){if(w.path!=='.github/workflows/'+w.id+'.yml'||w.head!==head||w.event!==event||w.conclusion!=='success'||!Number.isSafeInteger(w.runId)||w.runId<=0||runIds.has(w.runId)||!Number.isSafeInteger(w.attempt)||w.attempt<1||w.url!=='https://github.com/katamor1/bob_builtin_analyze/actions/runs/'+w.runId)fail('actual workflow identity');runIds.add(w.runId);bound(w.rawRun);bound(w.rawArtifacts);same(w.jobs.map(j=>j.name),T13_CI_JOBS[w.id],'T17 exact job inventory')
   for(const j of w.jobs){if(j.workflowId!==w.id||j.workflowPath!==w.path||j.runId!==w.runId||j.attempt!==w.attempt||j.event!==event||j.head!==head||!Number.isSafeInteger(j.jobId)||j.jobId<=0||jobIds.has(j.jobId))fail('actual job provenance');jobIds.add(j.jobId);bound(j.rawJobs)
    if(event==='push'&&j.name==='Extension source metrics'){if(j.conclusion!=='skipped'||j.expectedConclusion!=='skipped'||j.guard!==null||j.log!==null)fail('only non-PR metrics skip');skip++;continue}
    if(j.conclusion!=='success'||j.expectedConclusion!=='success'||!Number.isSafeInteger(j.runnerId)||j.runnerId<=0||typeof j.runnerName!=='string'||!j.runnerName||!Number.isFinite(Date.parse(j.started))||!Number.isFinite(Date.parse(j.completed))||Date.parse(j.completed)<Date.parse(j.started))fail('assigned runner actual success')
    const runner=j.name.startsWith('Windows / ')||j.name==='Real-machine environment contracts'||j.name.endsWith('/ windows-latest')?'windows-latest':'ubuntu-latest';if(!Array.isArray(j.runnerLabels)||!j.runnerLabels.includes(runner))fail('runner OS')
    const g=j.guard;if(!g||g.step?.name!=='Verify checked-out commit'||g.step.conclusion!=='success'||g.checkoutStep?.conclusion!=='success'||Date.parse(g.checkoutStep.completed_at)>Date.parse(g.step.started_at))fail('checkout and unconditional guard')
    same({event:g.observation.event,expectedHeadSha:g.observation.expectedHeadSha,actualHeadSha:g.observation.actualHeadSha},{event,expectedHeadSha:head,actualHeadSha:head},'T17 exact logged guard');const at=Date.parse(g.observation.at);if(!Number.isFinite(at)||at<Date.parse(g.step.started_at)-1000||at>=Date.parse(g.step.completed_at)+1000)fail('guard timestamp');bound(j.log);actual++
   }
  }same([actual,skip],[success,skips],'T17 actual event totals')
 }
 if(digest(ci)!=='e49c39ceb8a49f894d2da159d0cc4cf442cd9b352ce0757ef482a06a4bee97a3')fail('original actual CI observations')

 const installed=record.installedUat;exactKeys(installed,['kind','state','candidate','actualMain','productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'],'T17 PATH isolated host')
 if(installed.kind!=='isolated_artifact_extension_host'||installed.state!=='passed')fail('installed host state');for(const n of ['productActivation','productDeactivation','visualOperator','liveBob','finalProgramUat'])if(installed[n]!=='not_run')fail('unexecuted product/visual/live UAT')
 const artifactIds=new Set(),canonicalCompiled=installed.candidate.platforms[0].compiledModuleDigest
 for(const[scope,head,c]of [[installed.candidate,T17_PATH_SOURCE_HEAD,ci.candidate],[installed.actualMain,T17_PATH_ACCEPTED_MAIN,ci.actualMain]]){
  if(scope.sourceHeadSha!==head||scope.sourceTreeSha!==T17_PATH_ACCEPTED_TREE)fail('installed source role');same(scope.replay,c.portableReplay,'T17 PATH raw/portable role');bound(scope.replay);same(scope.platforms.map(p=>p.os),['linux','win32'],'T17 PATH actual both OS')
  for(const p of scope.platforms){
   const w=c.workflows.find(w=>w.id==='processing-budget-runtime');if(p.head!==head||p.tree!==T17_PATH_ACCEPTED_TREE||p.runId!==w.runId||p.attempt!==w.attempt||p.hostExecutionRepeated!==false||p.mode!=='actual_ci_execution_plus_portable_byte_validation'||!Number.isSafeInteger(p.artifactId)||p.artifactId<=0||artifactIds.has(p.artifactId))fail('actual native host provenance');artifactIds.add(p.artifactId)
   same([p.cases,p.runtimeModules,p.parserModules,p.pinnedParserFiles,p.compiledFiles,p.tarballFiles,p.typeConsumers],[49,33,8,583,48,52,3],'T17 PATH actual host/package inventory');for(const n of ['archive','originalManifest','originalExecution','originalHost','portableManifest','pathMap','tarball'])bound(p[n]);if(p.githubDigest!=='sha256:'+p.archive.sha256)fail('GitHub archive digest');hash256(p.compiledModuleDigest);if(p.compiledModuleDigest!==canonicalCompiled)fail('canonical runtime bytes across scopes and OS')
   same(p.vsix.map(v=>v.id),['local.bob-bazaar-review','local.bob-code-consistency-review','local.workflow-register'],'T17 PATH three actual VSIX');for(const v of p.vsix)bound(v.vsix)
   same(p.caseResults.map(x=>x.name),policy.requiredHostCases,'T17 PATH exact host case order');if(p.caseResults.slice(0,48).some(x=>x.state!=='passed'))fail('all applicable host cases must pass')
   const last=p.caseResults[48]
   if(p.os==='linux'){if(p.casePass!==48||p.uncState!=='not_applicable'||p.nativeUnc!==null||last.state!=='not_applicable'||last.detail.mode!=='posix'||last.detail.reason!=='posix_no_native_unc')fail('only POSIX native UNC inapplicability');continue}
   const u=p.nativeUnc;if(p.casePass!==49||p.uncState!=='passed'||last.state!=='passed'||last.detail.mode!=='native_unc'||!u||u.state!=='passed_and_disposed'||u.executionMode!=='native_windows_runner'||u.sourceHeadSha!==head||u.sourceTreeSha!==T17_PATH_ACCEPTED_TREE||u.createdByThisInvocation!==true||u.removed!==true||u.fixtureFilesRetained!==true||u.linkRejections!==3)fail('Windows native UNC success and owned disposal')
   if(!/^[a-f0-9]{32}$/.test(u.nonce)||u.shareName!=='bob-t17path-'+u.nonce||u.rootReportedPath!=='\\\\127.0.0.1\\'+u.shareName||last.detail.nonce!==u.nonce||last.detail.root!==u.rootReportedPath||last.detail.rejections!==3||typeof u.runnerPrincipal!=='string'||!u.runnerPrincipal||!/^S-1-/.test(u.runnerSid))fail('Windows native UNC exact fixture identity')
   if(u.prepareTranscripts.length!==4||u.cleanupTranscripts.length!==3)fail('Windows native UNC complete preparation and cleanup');for(const n of ['fixture','observations','cleanup','ownerMarker','probeFile','nestedProbeFile'])bound(u[n]);for(const b of [...u.prepareTranscripts,...u.cleanupTranscripts])bound(b)
   if(!u.hostPolicy||u.hostPolicy.scope!=='isolated_host_user_data'||!u.hostPolicy.record||!u.hostPolicy.settings)fail('UNC host policy isolated bytes');same(u.hostPolicy.allowedHosts,['127.0.0.1'],'T17 PATH UNC host policy narrow allowlist');bound(u.hostPolicy.record);bound(u.hostPolicy.settings)
  }
 }
 if(digest(installed)!=='81be7e674d726fc43edd55e2cb89e722d16877274500c59adb19dff9c71bc0b4')fail('fixed native observations and byte maps')
 exactKeys(record.packages,['workflowRegister','bazaar','consistency'],'T17 PATH accepted packages')
 for(const[name,id,version,cap]of [['workflowRegister','local.workflow-register','0.1.2',1200000],['bazaar','local.bob-bazaar-review','0.3.2',12000000],['consistency','local.bob-code-consistency-review','0.1.0',11000000]]){
  const p=record.packages[name];if(p.id!==id||p.version!==version||p.sourceHeadSha!==T17_PATH_ACCEPTED_MAIN||p.sourceTreeSha!==T17_PATH_ACCEPTED_TREE||p.capBytes!==cap||p.headroomBytes!==cap-p.vsix.bytes||p.headroomBytes<0)fail('actual package identity/capacity');bound(p.vsix);bound(p.policyEvidence);same(p.vsix,installed.actualMain.platforms[0].vsix.find(v=>v.id===id).vsix,'T17 PATH same actual saved/installed VSIX input')
  if(name==='workflowRegister'){if(p.runtimeCopyProfile!=='path-only'||p.runtimeJsFiles!==1)fail('Workflow path-only profile');same(p.runtimeJsNames,['pathPolicy.js'],'T17 PATH Workflow path-only inventory');same(p.compaction,{declaredTargets:113,presentTargets:111,absentTargets:2,pathPolicyCanonicalModuleOutsideCompaction:true},'T17 PATH unchanged compaction')}
  else{if(p.runtimeCopyProfile!=='full'||p.runtimeJsFiles!==16||p.compiledPayload.length!==48||new Set(p.compiledPayload.map(x=>x.path)).size!==48)fail('full native runtime delivery');bound(p.parserIdentity)}
 }
 const runtime=record.activeRuntime;if(runtime.kind!=='real_contract_tests'||runtime.sourceHeadSha!==T17_PATH_ACCEPTED_MAIN||runtime.gateRResult.runtimeActivation!==false||runtime.gateRResult.runtimeSuitesExecuted!==15||runtime.gateRResult.runtimeSuiteState!=='PASSED'||runtime.gateRResult.archiveTestsExecuted!==0)fail('inactive actual runtime suites');bound(runtime.output);for(const n of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])if(runtime.productWiring[n]!==0||runtime.gateRResult[n]!==0)fail('zero product effects')
 const review=record.review;if(review.oneFreshSourceReview!==true||review.secondReview!==false||review.finalSourceHeadSha!==T17_PATH_SOURCE_HEAD||review.importantFixedByObservedTdd!==6)fail('one source review and observed fix pass');same(review.original,{critical:0,important:6,minor:2},'T17 PATH original findings');same(review.remaining,{critical:0,important:0,minor:1},'T17 PATH retained Minor')
 if(record.local.allRequiredGatesSatisfied!==true||record.local.fullProductSuites.subject!=='6207d02ab3a3ab2a0330c4e23b08709892f2e283'||record.local.fullProductSuites.notRelabeled!==true||record.local.freshCandidate.nativeUnc!=='not_run')fail('historical local subjects and native UNC not-run retained')
 const p=record.preservation;if(p.primaryVisibleBranch!=='codex/bob-auto-response-probe'||p.primaryVisibleHead!=='90f926e0045405625f1f40d20a41346a94d1981a'||p.primaryMainRef!==T17_PATH_ACCEPTED_MAIN||p.primaryCheckoutMoved!==false||p.untrackedPreserved!==15||p.protectedContentsRead!==false||p.allHashesVerified!==true||p.all18ExistingWorktreesRetained!==true||p.other17WorktreeHeadsUnchanged!==true||p.approvedExistingWorktreeCount!==18||p.oldCompletionReferences!==17||p.formalPercent!==75||p.files!==925)fail('preserved work/source-only status');bound(p.manifest);bound(p.synchronization)
 if(record.runtimeActivation!==false||record.automaticCleanup!==false||record.mutationAuthority!==false||record.finalProgramUat!=='not_run'||!Array.isArray(record.limits)||record.limits.length!==10)fail('inactive metadata and honest limitations')
 // Only retained local ByteBindings occur in this projection. Runner paths in
 // case details are context strings; portable replay grants no filesystem IO.
 function inspect(v){if(!v||typeof v!=='object')return;if(typeof v.path==='string'&&/^(?:[A-Za-z]:[\\/]|\/)/.test(v.path)&&Number.isSafeInteger(v.bytes)&&typeof v.sha256==='string')bound({path:v.path,bytes:v.bytes,sha256:v.sha256});for(const child of Object.values(v))inspect(child)}inspect(record)
 if(digest(record)!==T17_PATH_COMPLETION_SHA256)fail('byte-fixed accepted source observation')
}

export function validateCompletionObservation(record,{programIndex,evidenceDigests}) {
  validateProgramIndex(programIndex)
  // This is a read-only recovery import, pinned after actual CI/log/archive/ref
  // readback. A new completion needs an additive reviewed registry entry.
  const recordDigest=digest(record)
  if(record.boundaryId==='GATE-R-ARCHIVE-INVENTORY') {
    exactKeys(record.composite,['sliceId','ownedScope','scopes'],'Gate R composite')
    if(record.composite.sliceId!=='GATE-R-ARCHIVE-INVENTORY') throw new TypeError('Gate R composite subject mismatch')
    same(record.composite.ownedScope,GATE_R_COMPLETION_SCOPES,'Gate R composite owned scopes')
    if(!Array.isArray(record.composite.scopes)||record.composite.scopes.length!==4) throw new TypeError('Gate R composite requires all four scopes')
    same(record.composite.scopes.map(row=>row.id),GATE_R_COMPLETION_SCOPES,'Gate R composite scope identities')
    for(const row of record.composite.scopes) {
      exactKeys(row,['id','state','artifact'],'Gate R composite scope')
      if(row.state!=='COMPLETE') throw new TypeError('Gate R composite scope incomplete')
      exactKeys(row.artifact,['path','bytes','sha256'],'Gate R composite artifact')
      if(!Number.isSafeInteger(row.artifact.bytes)||row.artifact.bytes<=0) throw new TypeError('Gate R composite artifact size')
      hash256(row.artifact.sha256)
    }
  }
  if(record.boundaryId==='REG-BRIDGE-OWNER-VERSION-LIFECYCLE')validateOwnerLifecycleCompletion(record)
  if(record.boundaryId==='REG-BRIDGE-DISCOVERY-EVIDENCE')validateDiscoveryCompletion(record)
  if(record.boundaryId==='PROC-T13-LEDGER')validateT13Completion(record)
  if(record.boundaryId==='PROC-T14-BOUNDED-DOC')validateT14Completion(record)
  if(record.boundaryId==='PROC-T15-AGGREGATE')validateT15Completion(record)
  if(record.boundaryId==='PROC-T16-INPUT-PROCESS')validateT16Completion(record)
  if(record.boundaryId==='PROC-T17-DEADLINE')validateT17DeadlineCompletion(record)
  if(record.boundaryId==='PROC-T17-PATH')validateT17PathCompletion(record)
  const registration=COMPLETION_REGISTRY.find(entry=>entry.sha256===recordDigest)
  if(!registration) throw new TypeError('unregistered completion observation')
  if(digest(evidenceDigests)!==registration.evidenceSha256) throw new TypeError('actual evidence digest registry mismatch')
  same(hashes(record),evidenceDigests,'completion evidence binding')
  if(record.mutationAuthority!==false||record.repository!==programIndex.repository||record.boundaryId!==registration.reference.boundaryId) throw new TypeError('completion subject mismatch')
}

function projectReferences(programIndex,decisions,completionReferences) {
  if(digest(decisions)!==DECISIONS_SHA256) throw new TypeError('static capability decision partition mismatch')
  if(!Array.isArray(completionReferences)||completionReferences.length>COMPLETION_REGISTRY.length) throw new TypeError('unregistered or duplicate completion')
  completionReferences.forEach((reference,index)=>same(reference,COMPLETION_REGISTRY[index].reference,'registered completion prefix'))
  const verifiedIds=new Set(completionReferences.map(reference=>reference.boundaryId))
  const wave0aVerified=verifiedIds.has('WAVE-0A-CONTROL-PLANE')
  // Only this pinned composite owns four tooling facets. Boundaries and mutation
  // slice IDs retain their one-reference semantics; no generic scope promotion.
  const verifiedCapabilityIds=new Set(verifiedIds)
  if(verifiedIds.has('GATE-R-ARCHIVE-INVENTORY')) {
    const descriptor=programIndex.programAtomicSlices.find(row=>row.sliceId==='GATE-R-ARCHIVE-INVENTORY')
    same(descriptor.ownedScope,GATE_R_COMPLETION_SCOPES,'closed Gate R composite catalog scopes')
    for(const id of GATE_R_COMPLETION_SCOPES) verifiedCapabilityIds.add(id)
  }
  if(verifiedIds.has('REG-BRIDGE-DISCOVERY-EVIDENCE')) {
    for(const id of DISCOVERY_REQUIRED_REFERENCES)if(!verifiedIds.has(id))throw new TypeError('safe prefix requires every accepted gate and closed Discovery remainder')
    verifiedIds.add('WORKFLOW-C-SAFE-PREFIX');verifiedCapabilityIds.add('WORKFLOW-C-SAFE-PREFIX')
  }
  if(['PROC-T13-LEDGER','PROC-T14-BOUNDED-DOC','PROC-T15-AGGREGATE'].every(id=>verifiedIds.has(id)))verifiedIds.add('PROCESSING-FOUNDATION')
  if(['PROC-T16-INPUT-PROCESS','PROC-T17-DEADLINE','PROC-T17-PATH'].every(id=>verifiedIds.has(id)))verifiedIds.add('PROCESSING-CONTROL')
  return {schemaVersion:'bob-builtin-analyze/feature-integration-status/v1',programIndexSha256:digest(programIndex),selectionLedgerSha256:LEDGER_SHA256,completionReferences:structuredClone(completionReferences),acceptedMainSha:completionReferences.at(-1)?.acceptedMainSha??null,boundaries:programIndex.planBoundaries.map(boundary=>({id:boundary.id,state:verifiedIds.has(boundary.id)?'VERIFIED':'planned'})),slices:programIndex.programAtomicSlices.map(slice=>({sliceId:slice.sliceId,ordinal:slice.ordinal,boundaryId:slice.boundaryId,state:verifiedIds.has(slice.sliceId)?'VERIFIED':'planned',observedActivationStatus:'inactive',immediatePredecessor:structuredClone(slice.immediatePredecessor)})),capabilities:decisions.map(cap=>({...cap,executionState:verifiedCapabilityIds.has(cap.id)?'VERIFIED':cap.disposition==='selected'||cap.disposition==='conditional'?'planned':'not_applicable',observedActivationStatus:'inactive'})),gateP:structuredClone(programIndex.downstreamProtocolPolicy.gateP),activeSliceIds:[],nextSliceId:wave0aVerified?programIndex.programAtomicSlices.find(slice=>!verifiedIds.has(slice.sliceId))?.sliceId??null:null,automaticCleanup:false,mutationAuthority:false,limits:'Historical observation only. Local implementation is not VERIFIED. Descriptor derivation is not human approval or execution permission.'}
}

export function projectIntegrationStatus(inputs) {
  exactKeys(inputs,['programIndex','ledger','completionObservations'],'projection inputs')
  const {programIndex,ledger,completionObservations}=inputs
  validateProgramIndex(programIndex)
  if(digest(ledger)!==LEDGER_SHA256) throw new TypeError('reviewed static ledger mismatch')
  if(!Array.isArray(completionObservations)||completionObservations.length>COMPLETION_REGISTRY.length) throw new TypeError('unregistered completion collection')
  const references=completionObservations.map(record=>{
    validateCompletionObservation(record,{programIndex,evidenceDigests:hashes(record)})
    return {...COMPLETION_REGISTRY.find(entry=>entry.sha256===digest(record)).reference}
  })
  return projectReferences(programIndex,ledger.capabilities.map(cap=>({id:cap.id,disposition:cap.disposition})),references)
}

export function deriveNextSlice(inputs) {
  exactKeys(inputs,['programIndex','statusProjection'],'slice admission inputs')
  const {programIndex,statusProjection}=inputs
  validateProgramIndex(programIndex)
  const decisions=statusProjection.capabilities.map(cap=>({id:cap.id,disposition:cap.disposition}))
  same(statusProjection,projectReferences(programIndex,decisions,statusProjection.completionReferences),'verified status projection')
  if(statusProjection.activeSliceIds.length) throw new TypeError('one active slice required')
  const next=programIndex.programAtomicSlices.find(slice=>statusProjection.slices.find(row=>row.sliceId===slice.sliceId).state!=='VERIFIED')
  if(!next) return null
  const predecessor=next.immediatePredecessor
  const state=predecessor.kind==='boundary_terminal'?statusProjection.boundaries.find(row=>row.id===predecessor.id)?.state:statusProjection.slices.find(row=>row.sliceId===predecessor.id)?.state
  return state==='VERIFIED'?structuredClone(next):null
}

function normalizedPath(value) {
  if(typeof value!=='string'||!/^([A-Za-z]:[\\/]|\/)/.test(value)||/[\x00-\x1f]/.test(value)||value.split(/[\\/]/).includes('..')) throw new TypeError('absolute observed path required')
  const parts=value.replaceAll('\\','/').split('/')
  if(parts.some(part=>part==='.')||parts.slice(1,-1).some(part=>!part)||(/^[A-Za-z]:/.test(value)&&parts.slice(1).some(part=>/[. ]$/.test(part)))) throw new TypeError('canonical observed path required')
  return parts.join('/').replace(/\/+$/,'').toUpperCase()
}
// Pure consistency validation. It never verifies a live filesystem, admits a
// completion to the registry, performs cleanup, or grants the C approval needed
// for the observed destructive steps. Terminal authenticity is a separate gate.
export function validateWorkspaceDisposition(inputs) {
  exactKeys(inputs,['sliceDescriptor','terminalObservation','preservationObservation','decision'],'workspace disposition inputs')
  const {sliceDescriptor,terminalObservation:terminal,preservationObservation:observation,decision}=inputs
  const program=buildProgramIndex()
  const descriptor=program.programAtomicSlices.find(row=>row.sliceId===sliceDescriptor?.sliceId)
  if(!descriptor) throw new TypeError('catalog mutation slice required')
  same(sliceDescriptor,descriptor,'static slice descriptor')
  exactKeys(terminal,['schemaVersion','classification','mutationAuthority','sliceId','state','sourceHeadSha','acceptedMainSha','workspace','evidenceSha256'],'terminal observation')
  if(terminal.schemaVersion!=='bob-builtin-analyze/slice-terminal-observation/v1'||terminal.classification!=='repository_non_mutating_slice_terminal_completion_observation'||terminal.mutationAuthority!==false||terminal.state!=='VERIFIED'||terminal.sliceId!==descriptor.sliceId) throw new TypeError('verified terminal subject required')
  gitSha(terminal.sourceHeadSha);gitSha(terminal.acceptedMainSha);hash256(terminal.evidenceSha256)
  exactKeys(terminal.workspace,['path','branchRef'],'terminal workspace');normalizedPath(terminal.workspace.path)
  if(!/^refs\/heads\/codex\/[^\s]+$/.test(terminal.workspace.branchRef)) throw new TypeError('isolated local branch required')
  const baseKeys=['schemaVersion','sliceId','workspace','terminalObservationSha256','activeSliceIds','disposition']
  if(decision==='retain_same_workspace') exactKeys(observation,baseKeys,'retained workspace observation')
  else if(decision==='dispose_to_main_only') exactKeys(observation,[...baseKeys,'preservation','operations','worktreeRemoved','localRefDeleted','mainOnlyTopology'],'disposed workspace observation')
  else throw new TypeError('closed workspace disposition required')
  if(observation.schemaVersion!==program.downstreamProtocolPolicy.schemaVersions.workspaceDisposition||observation.sliceId!==descriptor.sliceId||observation.disposition!==decision||observation.terminalObservationSha256!==digest(terminal)) throw new TypeError('terminal binding mismatch')
  same(observation.workspace,terminal.workspace,'continuous workspace identity');same(observation.activeSliceIds,[],'one continuous slice workspace')
  if(decision==='retain_same_workspace') return
  const preserved=observation.preservation
  exactKeys(preserved,['externalRoot','manifestSha256','verifiedManifestSha256','fileCount','allHashesVerified'],'preservation observation')
  hash256(preserved.manifestSha256)
  const workspacePath=normalizedPath(terminal.workspace.path);const preservationPath=normalizedPath(preserved.externalRoot)
  if(preservationPath===workspacePath||preservationPath.startsWith(`${workspacePath}/`)||preserved.verifiedManifestSha256!==preserved.manifestSha256||!Number.isSafeInteger(preserved.fileCount)||preserved.fileCount<1||preserved.allHashesVerified!==true) throw new TypeError('verified external preservation required')
  same(observation.operations,program.downstreamProtocolPolicy.workspaceDisposition.disposalOrder,'ordered disposal observations')
  same(observation.worktreeRemoved,{path:terminal.workspace.path,expectedHeadSha:terminal.sourceHeadSha,present:false},'exact worktree observation')
  same(observation.localRefDeleted,{ref:terminal.workspace.branchRef,expectedHeadSha:terminal.sourceHeadSha,present:false},'exact local ref lease observation')
  const topology=observation.mainOnlyTopology
  exactKeys(topology,['mainSha','localBranches','worktreeCount','remoteBranches','openPrCount','retainedExceptions'],'main-only topology')
  if(topology.mainSha!==terminal.acceptedMainSha||topology.worktreeCount!==1||topology.openPrCount!==0) throw new TypeError('main-only readback required')
  same(topology.localBranches,['main'],'local main only');same(topology.remoteBranches,['main'],'remote main only')
  exactKeys(topology.retainedExceptions,['userData','nativeAppMetadataRefs','existingStash'],'protected exceptions')
  for(const values of Object.values(topology.retainedExceptions)) if(!Array.isArray(values)||values.some(value=>typeof value!=='string')) throw new TypeError('explicit retained exception inventory required')
}

export function renderIntegrationStatus(inputs) {return canonicalJson(projectIntegrationStatus(inputs))}
