import {config} from 'dotenv';
config({quiet:true});
const {GeminiCtaProvider}=await import('../src/backend/cta/GeminiCtaProvider');
const provider=new GeminiCtaProvider(process.env.GEMINI_API_KEY!);
const models=(provider as any).client.models;
const generate=models.generateContent.bind(models);
models.generateContent=async(input:any)=>{if(process.env.CTA_DIAG_SIMPLE_SCHEMA){input.config.responseJsonSchema=JSON.parse(JSON.stringify(input.config.responseJsonSchema,(key,value)=>['maxItems','minItems'].includes(key)?undefined:value));}try{return await generate(input);}catch(error:any){console.log(JSON.stringify({status:error.status,name:error.name,message:error.message}));throw error;}};
try {console.log(await provider.interpretCtaInstruction({message:'Oi! O que você consegue fazer por mim?',profile:{},blueprint:{blocks:[]},rules:[],recentGenerations:[]} as never));}catch(error){console.log(String(error));process.exitCode=1;}
