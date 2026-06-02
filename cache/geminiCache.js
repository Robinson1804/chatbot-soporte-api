const { GoogleAICacheManager } = require('@google/generative-ai/server');

let cacheRef = null;
let cacheExpiresAt = null;
let renewTimer = null;

async function initCache(apiKey, systemPrompt) {
  const cacheManager = new GoogleAICacheManager(apiKey);
  const ttlSeconds = 3600;

  const cache = await cacheManager.create({
    model: 'models/gemini-2.5-flash',
    displayName: 'chatbot-otin-system-prompt',
    systemInstruction: { parts: [{ text: systemPrompt }] },
    ttlSeconds,
  });

  cacheRef = cache.name;
  cacheExpiresAt = Date.now() + (ttlSeconds - 60) * 1000;

  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = setTimeout(() => {
    initCache(apiKey, systemPrompt).catch((err) => {
      console.error('Error renovando Gemini Context Cache:', err.message);
      cacheRef = null;
    });
  }, (ttlSeconds - 300) * 1000);

  console.log(`Gemini Context Cache activo: ${cacheRef}`);
  return cacheRef;
}

function getCacheRef() {
  if (cacheRef && cacheExpiresAt && Date.now() < cacheExpiresAt) return cacheRef;
  return null;
}

module.exports = { initCache, getCacheRef };
