const { GoogleAICacheManager } = require('@google/generative-ai/server');

let cachedContent = null;
let cacheExpiresAt = null;
let renewTimer = null;

async function initCache(apiKey, systemPrompt, toolDeclarations) {
  const cacheManager = new GoogleAICacheManager(apiKey);
  const ttlSeconds = 3600;

  const createParams = {
    model: 'models/gemini-2.5-flash',
    displayName: 'chatbot-otin-system-prompt',
    systemInstruction: { parts: [{ text: systemPrompt }] },
    ttlSeconds,
  };

  if (toolDeclarations?.length) {
    createParams.tools = [{ functionDeclarations: toolDeclarations }];
    createParams.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }

  const cache = await cacheManager.create(createParams);

  cachedContent = cache;
  cacheExpiresAt = Date.now() + (ttlSeconds - 60) * 1000;

  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = setTimeout(() => {
    initCache(apiKey, systemPrompt, toolDeclarations).catch((err) => {
      console.error('Error renovando Gemini Context Cache:', err.message);
      cachedContent = null;
    });
  }, (ttlSeconds - 300) * 1000);

  console.log(`Gemini Context Cache activo: ${cache.name}`);
  return cache;
}

function getCachedContent() {
  if (cachedContent && cacheExpiresAt && Date.now() < cacheExpiresAt) return cachedContent;
  return null;
}

module.exports = { initCache, getCachedContent };
