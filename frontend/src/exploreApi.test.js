import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('a warm browser reload restores cache after all bindings initialize',async()=>{
 const source=fs.readFileSync(new URL('./exploreApi.js',import.meta.url),'utf8')
 const saved={at:Date.now(),recap:{slides:[{title:'Source-backed filing'}]},directory:{homePreview:{companies:[],investors:[]},homeLatest:{companies:[],investors:[]},fullCompanies:[],fullInvestors:[]}}
 const storage={getItem:()=>JSON.stringify(saved),setItem:()=>{}}
 const context=vm.createContext({window:{sessionStorage:storage,localStorage:storage},console,setTimeout,clearTimeout})
 const mod=new vm.SourceTextModule(source,{context})
 const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(m=>[m[2],m[1].split(',').map(x=>x.trim()).filter(Boolean)]))
 await mod.link(spec=>new vm.SyntheticModule(imports.get(spec),function(){for(const name of imports.get(spec))this.setExport(name,name==='isExploreNetworkMode'?v=>v!==false:()=>null)},{context}))
 await mod.evaluate()
 assert.equal(mod.namespace.getExploreRecapCache().slides[0].title,'Source-backed filing')
 assert.equal(mod.namespace.peekExploreHomeSnapshot(null).recap.slides.length,1)
 await mod.namespace.waitForExploreHomeReady(null)
})
