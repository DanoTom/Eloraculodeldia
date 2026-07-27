/**
 * nim.js — Los datos de NVIDIA NIM, en un solo lugar.
 *
 * Los comparten el endpoint de revelación y el de diagnóstico. Si estuvieran
 * duplicados, el health podría decir "todo bien" comprobando un modelo distinto
 * del que después se usa de verdad — el peor tipo de diagnóstico: el que miente
 * tranquilizando.
 */

export const NIM_BASE = 'https://integrate.api.nvidia.com/v1';
export const NIM_CHAT_URL = `${NIM_BASE}/chat/completions`;
export const NIM_MODELS_URL = `${NIM_BASE}/models`;

export const MODEL = 'z-ai/glm-5.2';
