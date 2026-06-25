"use strict";var V=Object.create;var C=Object.defineProperty;var J=Object.getOwnPropertyDescriptor;var z=Object.getOwnPropertyNames;var Y=Object.getPrototypeOf,H=Object.prototype.hasOwnProperty;var G=(t,e)=>{for(var o in e)C(t,o,{get:e[o],enumerable:!0})},S=(t,e,o,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of z(e))!H.call(t,r)&&r!==o&&C(t,r,{get:()=>e[r],enumerable:!(n=J(e,r))||n.enumerable});return t};var w=(t,e,o)=>(o=t!=null?V(Y(t)):{},S(e||!t||!t.__esModule?C(o,"default",{value:t,enumerable:!0}):o,t)),K=t=>S(C({},"__esModule",{value:!0}),t);var oe={};G(oe,{activate:()=>ee,deactivate:()=>te});module.exports=K(oe);var d=w(require("vscode"));var u=require("vscode");function q(t,e){return u.commands.executeCommand("setContext",t,e)}function L(t){return q("bobExperience",t)}function y(){let t=[],e=u.workspace.workspaceFolders;if(e&&e.length>0){t=[];let o=u.workspace.getConfiguration("bob-code",e[0]);if(o.has("walkthrough")){let n=o.get("walkthrough");typeof n=="string"?t=[n]:Array.isArray(n)&&n.every(r=>typeof r=="string")&&(t=n)}}return t}var b;function k(t){return b||(b="bob-code",u.extensions.getExtension("RooVeterinaryInc.roo-cline")&&(b="roo-cline")),t?[b,t].join("."):b}function W(t){return t.extension.packageJSON.contributes.walkthroughs}function T(t,e=u.ViewColumn.Beside,o){let n={viewColumn:e,preserveFocus:!0,preview:!1};return u.window.showTextDocument(t,n).then(r=>(o&&(r.selection=new u.Selection(o.start,o.end),r.revealRange(o)),r))}var s=require("vscode");var I=w(require("path"));var g=w(require("path")),c=require("vscode");var h=w(require("vscode"));var M="bob-walkthroughs.welcome",E="vscode.openFolder";function F(t){t.subscriptions.push(h.commands.registerCommand(M,async()=>{let e=h.window.createWebviewPanel("walkthroughSelector","Bob Labs",h.ViewColumn.One,{enableScripts:!0}),o=await W(t),n=await N(),r=n.map(i=>o.find(l=>l.id===i.id)).filter(i=>i!==void 0);e.webview.onDidReceiveMessage(async i=>{if(i.type==="walkthroughSelected"){let l=i.id,p=n.find(f=>f.id===l);p&&(e.dispose(),h.window.withProgress({location:h.ProgressLocation.Notification,title:`Opening lab: ${p.id}`,cancellable:!1},async f=>{f.report({message:"Preparing lab..."}),await R(p)}))}},void 0,t.subscriptions);let a=r.map(i=>`
          <li class="walkthrough-box" data-id="${i.id}">
            <div class="walkthrough-title">${i.title||i.id}</div>
            <div class="walkthrough-description">${i.description||""}</div>
          </li>
        `).join("");e.webview.html=`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Walkthroughs</title>
          <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 480px;
          margin: 40px auto;
          padding: 0 20px;
        }
        h1 {
          color: var(--vscode-editor-foreground);
          border-bottom: 1px solid var(--vscode-editorGroup-border);
          padding-bottom: 10px;
        }
        .notice {
          background-color: var(--vscode-inputValidation-infoBackground);
          color: var(--vscode-inputValidation-infoForeground);
          border-left: 4px solid var(--vscode-inputValidation-infoBorder);
          padding: 10px;
          margin-bottom: 20px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        ul {
          list-style: none;
          padding: 0;
        }
        li.walkthrough-box {
          background-color: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          margin: 10px 0;
          padding: 15px;
          border-radius: 5px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: pointer;
        }
        li.walkthrough-box:hover {
          transform: translateY(-2px);
          box-shadow: 0 2px 8px 0 rgba(0,0,0,0.08);
        }
        .walkthrough-title {
          font-size: 1.1em;
          font-weight: bold;
        }
        .walkthrough-description {
          font-size: 0.97em;
          color: var(--vscode-descriptionForeground, #888);
        }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Available Labs</h1>
            <ul>
              ${a}
            </ul>
            <div class="notice">
              Selecting a lab will reset its contents to the initial state.
            </div>
          </div>
          <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.walkthrough-box').forEach(box => {
          box.addEventListener('click', () => {
            const id = box.getAttribute('data-id');
            vscode.postMessage({ type: 'walkthroughSelected', id });
          });
        });
          </script>
        </body>
        </html>
      `}))}var A="txc-lab";function _(){let t=c.workspace.workspaceFolders?c.workspace.workspaceFolders[0]:void 0;if(t){let e=t.uri.fsPath;for(;e!==g.default.dirname(e);){if(g.default.basename(e).includes(A))return e;e=g.default.dirname(e)}return}}function B(){let t=c.workspace.workspaceFolders;return t!==void 0&&t.length===1&&t[0].name.includes(A)}async function N(){let t=[],e=await c.workspace.findFiles("**/.vscode/settings.json","**/node_modules/**",100),o=n=>{let r=g.default.dirname(n);return g.default.dirname(r)};for(let n of e){let r=await c.workspace.fs.readFile(n),a=Buffer.from(r).toString("utf8");try{let l=JSON.parse(a)["bob-code.walkthrough"];if(typeof l=="string")t.push({id:l,openWorkspace:o(n.path)});else if(Array.isArray(l)&&l.every(p=>typeof p=="string"))for(let p of l)t.push({id:p,openWorkspace:o(n.path)})}catch(i){console.error(`Error parsing JSON in ${n.path}:`,i)}}return t}var Q=process.env.DEVELOPMENT==="yup";async function v(t=!1){let e=c.workspace.workspaceFolders?c.workspace.workspaceFolders[0]:void 0;if(e){try{await c.commands.executeCommand("bob-code.lab.reset")}catch{}if(await c.commands.executeCommand("resetGettingStartedProgress"),!Q){let o=c.window.createTerminal({name:"Workspace reset",cwd:e.uri,hideFromUser:!0});if(o.sendText("git checkout master"),o.sendText("git reset --hard"),o.sendText("git clean -f"),t){let n=`boblab-${Date.now()}`;o.sendText(`git checkout -b ${n}`)}o.sendText("exit"),await new Promise(n=>setTimeout(n,2e3))}}}async function X(t){let e=c.window.createTerminal({name:"Java Lab Cleanup",cwd:t,hideFromUser:!0});return e.sendText("mvn clean"),e.sendText("sdk default java 8.0.462.fx-zulu"),t.split(g.default.sep).at(-1)?.startsWith("java-liberty")&&(e.sendText("mvn install:install-file -Dfile=dependencies/was_public.jar -DpomFile=dependencies/was_public-9.0.0.pom"),e.sendText("mvn install:install-file -Dfile=dependencies/env-config-1.5.jar -DpomFile=dependencies/env-config-1.5.pom"),e.sendText("mvn install:install-file -Dfile=dependencies/env-config-1.6.jar -DpomFile=dependencies/env-config-1.6.pom"),e.sendText("mvn install:install-file -Dfile=dependencies/env-config-1.7.jar -DpomFile=dependencies/env-config-1.7.pom")),e.sendText("exit"),new Promise(o=>{let n=c.window.onDidCloseTerminal(r=>{r===e&&(n.dispose(),o())})})}async function R(t){await v(!0),t.openWorkspace.split(g.default.sep).at(-1)?.startsWith("java-")&&await X(t.openWorkspace);let e=c.Uri.file(t.openWorkspace);await c.commands.executeCommand(E,e,!1)}var O="bob-walkthroughs.openDocument",x="bob-walkthroughs.launchWalkthrough",D="bob-walkthroughs.workspaceReset";function P(t){return s.commands.executeCommand(k("newTask"),{prompt:t})}function Z(t,e){return W(t).filter(o=>e.includes(o.id))}function U(t){return[s.commands.registerCommand(x,async()=>{let e=y();e.length===0&&(e=["learn-ui"]);let o=Z(t,e),n;if(o.length===0)return;if(o.length===1)n=o[0].id;else{let a=await s.window.showQuickPick(o.map(i=>({id:i.id,label:i.title,description:i.description})),{title:"Select lab to start",canPickMany:!1,ignoreFocusOut:!0});a&&(n=a.id)}if(!n)return;let r={category:`IBM.bob-walkthroughs#${n}`,step:0};return s.commands.executeCommand("workbench.action.openWalkthrough",r)}),s.commands.registerCommand(D,async()=>{await s.window.showWarningMessage("Workspace reset",{modal:!0,detail:"Are you sure you want to reset the workspace? This will discard any changes."},"Yes")==="Yes"&&v(!0).then(()=>{s.commands.executeCommand("workbench.action.closeAllEditors").then(()=>{s.commands.executeCommand(x)})})}),s.commands.registerCommand("bob-walkthroughs.chat.startPrompt",e=>{P(e)}),s.commands.registerCommand("bob-walkthroughs.views.focusSidebar",()=>{s.commands.executeCommand(k("SidebarProvider.focus"))}),s.commands.registerCommand("bob-walkthroughs.views.focusHistory",()=>{s.commands.executeCommand(k("historyButtonClicked"))}),s.commands.registerCommand("bob-walkthroughs.views.focusModes",()=>{s.commands.executeCommand(k("promptsButtonClicked"))}),s.commands.registerCommand(O,(e,o,n)=>{console.log(JSON.stringify(e,null,2)),console.log("Range param:",o);let r=s.workspace.workspaceFolders?s.workspace.workspaceFolders[0].uri:void 0;if(!r){console.error("No workspace folder found.");return}let a=I.default.isAbsolute(e)?s.Uri.file(e):s.Uri.joinPath(r,e);console.log("Resolved URI:",a.toString());let i;if(o)if(typeof o=="string")try{let[l,p]=o.split("-").map(f=>parseInt(f,10));!isNaN(l)&&!isNaN(p)&&(i=new s.Range(l-1,0,p-1,1e3))}catch(l){console.error("Failed to parse range:",l)}else i=o;return T(a,n,i)}),s.commands.registerCommand("bob-walkthroughs.chat.javaModernization",()=>{P("/start_java_modernization")})]}var $=w(require("path")),m=require("vscode");function j(t){t.subscriptions.push(m.commands.registerCommand("bob-walkthroughs.tools.generateMarkdownUrl",()=>{let e=m.window.activeTextEditor;if(!e)return;let o=[],n=m.workspace.workspaceFolders;if(!n||n.length===0)return;let r=m.workspace.asRelativePath(e.document.uri);o.push(r);let a=$.default.basename(r);if(!e.selection.isEmpty){let l=e.selection.start.line+1,p=e.selection.end.line+1;o.push(`${l}-${p}`)}let i=`[Open to ${a}](command:${O}?${encodeURIComponent(JSON.stringify(o))})`;m.env.clipboard.writeText(i),m.window.showInformationMessage("Markdown URL copied to clipboard")}))}function ee(t){let e=!1;if(t.subscriptions.push(...U(t)),j(t),F(t),B())d.commands.executeCommand(M),e=!0,v(!1);else{let o=_();if(o){let r=d.window.createStatusBarItem(d.StatusBarAlignment.Left);r.text="$(debug-restart) Open Bob Labs",r.command={title:"Open Bob Labs",command:E,arguments:[d.Uri.file(o),!1]},r.tooltip="Click to see available Bob Labs",r.show(),t.subscriptions.push(r);let a=d.window.createStatusBarItem(d.StatusBarAlignment.Left);a.text="$(rocket) Restart Lab Walkthrough",a.command=D,a.tooltip="Click to restart the current lab walkthrough",a.show(),t.subscriptions.push(a)}let n=y();n.length>0&&(e=!0,n.length>1?d.window.showInformationMessage("Do you want to see the available walkthroughs for this lab?","Yes","No").then(r=>{r==="Yes"&&d.commands.executeCommand(x)}):d.commands.executeCommand("workbench.action.closeAllEditors").then(()=>{d.commands.executeCommand(x)}))}e&&L("conference")}function te(){}0&&(module.exports={activate,deactivate});
