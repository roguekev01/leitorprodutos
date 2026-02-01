// Global State
let productsData = [];
let html5QrcodeScanner = null;

// ID da Planilha
const SHEET_ID = "1yaDHltfBgrRe2iLASRiokXcTpGQb1Uq2Vo3lQ3dVHlw";

// DOM Elements
const elements = {
    searchSection: document.getElementById('searchSection'),
    resultSection: document.getElementById('resultSection'),

    searchInput: document.getElementById('searchInput'),
    btnSearch: document.getElementById('btnSearch'),
    btnCamera: document.getElementById('btnCamera'),

    scannerModal: document.getElementById('scannerModal'),
    btnCloseScanner: document.getElementById('btnCloseScanner'),

    // Status / Errors
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),

    // Product Display
    productName: document.getElementById('productName'),
    productEan: document.getElementById('productEan'),
    productPrice: document.getElementById('productPrice')
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Show Search Setup Immediately
    elements.searchSection.classList.remove('hidden');

    elements.btnSearch.addEventListener('click', performSearch);
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Camera events
    elements.btnCamera.addEventListener('click', startScanning);
    elements.btnCloseScanner.addEventListener('click', stopScanning);

    // Auto-focus input
    elements.searchInput.focus();
});

/**
 * Main Search Function.
 * Triggers a fresh data fetch from Google Sheets every time.
 */
function performSearch() {
    const query = elements.searchInput.value.trim();
    if (!query) return;

    // UI Updates: Loading state
    elements.resultSection.classList.add('hidden');
    elements.errorState.classList.add('hidden');

    showToast("Buscando dados atualizados...", "info"); // Show loading toast

    // Fetch fresh data
    fetchSheetData((data) => {
        // Search logic runs AFTER data is loaded
        const product = data.find(p => p.EAN === query);

        if (product) {
            displayProduct(product);
            hideToast();
        } else {
            showToast("Produto não encontrado.", "error");
        }

        // Select input for next scan
        elements.searchInput.select();
    });
}


/**
 * Fetches data from Google Sheet using JSONP.
 * Bypasses CORS and gets fresh data on every call.
 * @param {Function} callback - Function to run with valid data array
 */
function fetchSheetData(callback) {
    const callbackName = 'googleSheetCallback_' + Date.now(); // Unique callback ID
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}`;

    // Define global callback
    window[callbackName] = function (json) {
        // Clean up
        document.body.removeChild(document.getElementById(callbackName));
        delete window[callbackName];

        if (!json || !json.table || !json.table.rows) {
            showToast("Erro ao ler planilha.", "error");
            return;
        }

        const rows = json.table.rows;
        const freshData = rows.map(row => {
            const cells = row.c;
            if (!cells) return null;

            return {
                NOME: cells[0] ? String(cells[0].v).trim() : "",
                EAN: cells[1] ? String(cells[1].v).trim() : "",
                VENDA: cells[2] ? cells[2].v : 0
            };
        }).filter(item => item !== null && item.EAN !== "");

        callback(freshData);
    };

    // Inject Script
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = url;
    script.onerror = function () {
        showToast("Erro de conexão.", "error");
        document.body.removeChild(script);
    };
    document.body.appendChild(script);
}

function displayProduct(product) {
    elements.productName.innerText = product.NOME || "Sem Nome";
    elements.productEan.innerText = `EAN: ${product.EAN}`;

    let price = product.VENDA || 0;
    if (typeof price === 'string') {
        price = price.replace('R$', '').replace(',', '.').trim();
    }
    const formatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });
    elements.productPrice.innerText = formatter.format(price);

    elements.resultSection.classList.remove('hidden');
}

// --- Camera Logic ---
function startScanning() {
    elements.scannerModal.classList.remove('hidden');
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess
    ).catch(err => {
        showToast("Erro na câmera.", "error");
        stopScanning();
    });
}

function stopScanning() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            elements.scannerModal.classList.add('hidden');
            html5QrcodeScanner.clear();
        }).catch(() => elements.scannerModal.classList.add('hidden'));
    } else {
        elements.scannerModal.classList.add('hidden');
    }
}

function onScanSuccess(decodedText) {
    elements.searchInput.value = decodedText;
    stopScanning();
    performSearch(); // Triggers the real-time fetch
}

// UI Helpers
function showToast(msg, type = "error") {
    elements.errorMessage.innerText = msg;
    elements.errorState.classList.remove('hidden');

    // Simple color change based on type (using css var or direct style)
    if (type === "info") {
        elements.errorState.style.background = "var(--primary)";
        elements.errorState.querySelector('i').className = "fa-solid fa-sync fa-spin";
    } else {
        elements.errorState.style.background = "var(--error)";
        elements.errorState.querySelector('i').className = "fa-solid fa-triangle-exclamation";
    }

    // Auto-hide only if it's an error (info stays until replaced)
    if (type === "error") {
        setTimeout(() => elements.errorState.classList.add('hidden'), 3000);
    }
}
function hideToast() {
    elements.errorState.classList.add('hidden');
}
