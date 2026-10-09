// Nexora — configuração do cliente. Altere só aqui.
window.NEXORA_API_URL = 'https://script.google.com/macros/s/AKfycbyvF44VI94Au5ytVCcykCIUl64my4UIJ7lYh8q7KONLpqk3jwj8PN2d6B3dIAblFxmb/exec';

window.NEXORA_CONFIG = {
  pagina: 30,                       // itens por página nas listas paginadas (máx. 200 na API)
  latenciaDemo: [300, 1100],        // ms simulados no modo demonstração (?demo=1&lento=1 usa 1–6 s)
  imagemLado: 200,                  // px do lado maior da miniatura de produto enviada
  imagemMaxChars: 30000,            // limite da API para data URL
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};
