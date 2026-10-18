// Only launched by the owned process-tree cancellation regression fixture.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
if(process.argv[2]!=='--grandchild'){
 const child=spawn(process.execPath,[process.argv[1],'--grandchild'],{stdio:'ignore',windowsHide:true});
 writeFileSync(process.argv[2],JSON.stringify({pid:process.pid,grandchildPid:child.pid}),{flag:'wx'});
}
setInterval(()=>{},1000);
