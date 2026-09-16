import test from 'node:test';
import assert from 'node:assert/strict';
import {llmChat} from './llm.js';
test('AI runtime is disabled even when provider credentials exist',async()=>{
 const prior=process.env.AI_RUNTIME_ENABLED;delete process.env.AI_RUNTIME_ENABLED;
 try{await assert.rejects(llmChat([{role:'user',content:'test'}]),/ai_runtime_disabled/);}finally{if(prior!==undefined)process.env.AI_RUNTIME_ENABLED=prior;}
});
