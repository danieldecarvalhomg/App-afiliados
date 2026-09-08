import {auditToken} from './cta-audit-fixture';
const response=await fetch('http://127.0.0.1:3107/api/cta/memory',{method:'DELETE',headers:{authorization:`Bearer ${auditToken}`},signal:AbortSignal.timeout(30_000)});
const body=await response.json();
if(!response.ok)throw new Error(`${response.status}:${body.error?.code??'RESET_FAILED'}`);
console.log({reset:true,account:'cta-audit-only'});
