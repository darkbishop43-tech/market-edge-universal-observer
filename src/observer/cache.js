export function createCycleCache(){return new Map();}
export async function cached(cache,key,loader){
  if(cache.has(key)) return cache.get(key);
  const value=await loader(); cache.set(key,value); return value;
}
