// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://transportadoras.onrender.com/api';

const PAGE_SIZE = 50;

let state = {
    transportadoras: [],
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    searchTerm: '',
};

let isOnline = false;
let sessionToken = null;
let currentTab = 0;
let currentViewTab = 0;

const tabs = ['tab-geral', 'tab-contato', 'tab-regioes', 'tab-estados'];
const viewTabs = ['view-tab-geral', 'view-tab-contato', 'view-tab-regioes', 'view-tab-estados'];

console.log('🚀 Transportadoras iniciada');
console.log('📍 API URL:', API_URL);

function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

function setupUpperCaseInputs() {
    const textInputs = document.querySelectorAll('input[type="text"]:not([readonly]):not([type="email"]), textarea');
    textInputs.forEach(input => {
        if (input.type !== 'email' && input.id !== 'modalEmail') {
            input.addEventListener('input', function() {
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = toUpperCase(this.value);
                this.setSelectionRange(start, end);
            });
        }
    });
}

const REGIOES_ESTADOS = {
    'NORTE': ['ACRE', 'AMAPÁ', 'AMAZONAS', 'PARÁ', 'RONDÔNIA', 'RORAIMA', 'TOCANTINS'],
    'NORDESTE': ['ALAGOAS', 'BAHIA', 'CEARÁ', 'MARANHÃO', 'PARAÍBA', 'PERNAMBUCO', 'PIAUÍ', 'RIO GRANDE DO NORTE', 'SERGIPE'],
    'CENTRO-OESTE': ['DISTRITO FEDERAL', 'GOIÁS', 'MATO GROSSO', 'MATO GROSSO DO SUL'],
    'SUDESTE': ['ESPÍRITO SANTO', 'MINAS GERAIS', 'RIO DE JANEIRO', 'SÃO PAULO'],
    'SUL': ['PARANÁ', 'RIO GRANDE DO SUL', 'SANTA CATARINA']
};

const TODOS_ESTADOS = Object.values(REGIOES_ESTADOS).flat();

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ─── AUTENTICAÇÃO ─────────────────────────────────────────────────────────────

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('transportadoraSession', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('transportadoraSession');
    }

    if (!sessionToken) { mostrarTelaAcessoNegado(); return; }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:var(--bg-primary);color:var(--text-primary);text-align:center;padding:2rem;">
            <h1 style="font-size:2.2rem;margin-bottom:1rem;">${mensagem}</h1>
            <p style="color:var(--text-secondary);margin-bottom:2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display:inline-block;background:var(--btn-register);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Ir para o Portal</a>
        </div>`;
}

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────

function inicializarApp() {
    carregarTudo();

    setInterval(async () => {
        const online = await verificarConexao();
        if (online && !isOnline) {
            isOnline = true;
            updateConnectionStatus();
            carregarTudo();
        } else if (!online && isOnline) {
            isOnline = false;
            updateConnectionStatus();
        }
    }, 15000);

    setInterval(() => {
        if (isOnline) loadTransportadoras(state.currentPage, false);
    }, 30000);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getHeaders() {
    const headers = { 'Accept': 'application/json' };
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    return headers;
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal, mode: 'cors' });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

function updateConnectionStatus() {
    const el = document.getElementById('connectionStatus');
    if (el) el.className = isOnline ? 'connection-status online' : 'connection-status offline';
}

async function verificarConexao() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/transportadoras?page=1&limit=1`, {
            method: 'GET', headers: getHeaders()
        });
        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }
        return response.ok;
    } catch { return false; }
}

// ─── CARGA INICIAL ────────────────────────────────────────────────────────────

async function carregarTudo() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/transportadoras?page=1&limit=${PAGE_SIZE}`, {
            method: 'GET', headers: getHeaders()
        });

        if (response.ok) {
            const result = await response.json();
            if (Array.isArray(result)) {
                state.transportadoras = result;
                state.totalRecords = result.length;
                state.totalPages = 1;
                state.currentPage = 1;
            } else {
                state.transportadoras = result.data || [];
                state.totalRecords = result.total || 0;
                state.totalPages = result.totalPages || 1;
                state.currentPage = result.page || 1;
            }
            isOnline = true;
            updateConnectionStatus();
            renderTransportadoras();
            renderPaginacao();
        }
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
}

// ─── PAGINAÇÃO / DADOS ────────────────────────────────────────────────────────

async function loadTransportadoras(page = 1) {
    state.currentPage = page;

    try {
        const params = new URLSearchParams({ page, limit: PAGE_SIZE });
        if (state.searchTerm) params.set('search', state.searchTerm);

        const response = await fetchWithTimeout(`${API_URL}/transportadoras?${params}`, {
            method: 'GET', headers: getHeaders()
        });

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) { console.error('❌ Erro:', response.status); return; }

        const result = await response.json();

        if (Array.isArray(result)) {
            state.transportadoras = result;
            state.totalRecords = result.length;
            state.totalPages = 1;
            state.currentPage = 1;
        } else {
            state.transportadoras = result.data || [];
            state.totalRecords = result.total || 0;
            state.totalPages = result.totalPages || 1;
            state.currentPage = result.page || page;
        }

        isOnline = true;
        updateConnectionStatus();
        if (!state.searchTerm) state.allTransportadoras = state.transportadoras.slice();
        renderTransportadoras();
        renderPaginacao();

    } catch (error) {
        console.error(error.name === 'AbortError' ? '❌ Timeout' : '❌ Erro:', error);
    }
}

let _searchDebounce = null;
function filterTransportadoras() {
    const termo = document.getElementById('search').value.trim().toLowerCase();
    state.searchTerm = termo;

    if (!termo) {
        // Sem filtro — exibe tudo do cache
        state.transportadoras = state.allTransportadoras.slice();
    } else {
        state.transportadoras = state.allTransportadoras.filter(t => {
            const nome = (t.nome || '').toLowerCase();
            const rep  = (t.representante || '').toLowerCase();
            const mail = (t.email || '').toLowerCase();
            const regs = (t.regioes || []).join(' ').toLowerCase();
            const ests = (t.estados || []).join(' ').toLowerCase();
            return nome.includes(termo) || rep.includes(termo) ||
                   mail.includes(termo) || regs.includes(termo) || ests.includes(termo);
        });
    }
    state.totalRecords = state.transportadoras.length;
    state.totalPages = 1;
    state.currentPage = 1;
    renderTransportadoras();
    renderPaginacao();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────



function renderTransportadoras() {
    const container = document.getElementById('transportadorasContainer');
    if (!container) return;

    if (!state.transportadoras.length) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">Nenhuma transportadora encontrada</td></tr>`;
        return;
    }

    container.innerHTML = state.transportadoras.map(t => {
        const primeiroTelefone = t.telefones && t.telefones.length > 0 ? toUpperCase(t.telefones[0]) : '-';
        const primeiroCelular = t.celulares && t.celulares.length > 0 ? toUpperCase(t.celulares[0]) : '-';
        return `
            <tr>
                <td><strong>${toUpperCase(t.nome)}</strong></td>
                <td>${t.representante ? toUpperCase(t.representante) : '-'}</td>
                <td>${primeiroTelefone}</td>
                <td>${primeiroCelular}</td>
                <td style="text-transform:lowercase;">${t.email || '-'}</td>
                <td class="actions-cell" style="text-align:center;">
                    <button onclick="viewTransportadora('${t.id}')" class="action-btn view">Ver</button>
                    <button onclick="editTransportadora('${t.id}')" class="action-btn edit">Editar</button>
                    <button onclick="deleteTransportadora('${t.id}')" class="action-btn delete">Excluir</button>
                </td>
            </tr>`;
    }).join('');
}

function renderPaginacao() {
    const existing = document.getElementById('paginacaoContainer');
    if (existing) existing.remove();

    const tableCard = document.querySelector('.table-card');
    if (!tableCard) return;

    const total = state.totalPages;
    const atual = state.currentPage;
    const inicio = state.totalRecords === 0 ? 0 : (atual - 1) * PAGE_SIZE + 1;
    const fim = Math.min(atual * PAGE_SIZE, state.totalRecords);

    let paginas = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) paginas.push(i);
    } else {
        paginas.push(1);
        if (atual > 3) paginas.push('...');
        for (let i = Math.max(2, atual - 1); i <= Math.min(total - 1, atual + 1); i++) paginas.push(i);
        if (atual < total - 2) paginas.push('...');
        paginas.push(total);
    }

    const botoesHTML = paginas.map(p =>
        p === '...' ? `<span class="pag-ellipsis">…</span>`
            : `<button class="pag-btn ${p === atual ? 'pag-btn-active' : ''}" onclick="loadTransportadoras(${p})">${p}</button>`
    ).join('');

    const div = document.createElement('div');
    div.id = 'paginacaoContainer';
    div.className = 'paginacao-wrapper';
    div.innerHTML = `
        <div class="paginacao-info">
            ${state.totalRecords > 0 ? `Exibindo ${inicio}–${fim} de ${state.totalRecords} registros` : 'Nenhum registro'}
        </div>
        <div class="paginacao-btns">
            <button class="pag-btn pag-nav" onclick="loadTransportadoras(${atual - 1})" ${atual === 1 ? 'disabled' : ''}>‹</button>
            ${botoesHTML}
            <button class="pag-btn pag-nav" onclick="loadTransportadoras(${atual + 1})" ${atual === total ? 'disabled' : ''}>›</button>
        </div>`;
    tableCard.appendChild(div);
}

// ─── FORMULÁRIO ───────────────────────────────────────────────────────────────

function openFormModal(transportadoraId = null) {
    currentTab = 0;
    let transportadora = null;

    if (transportadoraId) {
        transportadora = state.transportadoras.find(t => String(t.id) === String(transportadoraId));
        if (!transportadora) { showToast('Transportadora não encontrada', 'error'); return; }
    }

    const isEdit = !!transportadoraId;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="formModal" style="display:flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEdit ? toUpperCase(transportadora.nome) : 'Nova Transportadora'}</h3>
                    <button class="close-modal" onclick="closeFormModal()">✕</button>
                </div>
                <form id="transportadoraForm" onsubmit="submitForm(event, ${isEdit ? `'${transportadoraId}'` : 'null'})">
                    <div class="tabs-container">
                        <div class="tabs-nav">
                            <button type="button" class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-contato')">Contato</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-regioes')">Regiões</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-estados')">Estados</button>
                        </div>
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="modalNome">Nome da Transportadora *</label>
                                    <input type="text" id="modalNome" required value="${transportadora ? toUpperCase(transportadora.nome) : ''}">
                                </div>
                                <div class="form-group">
                                    <label for="modalRepresentante">Nome do(a) Representante</label>
                                    <input type="text" id="modalRepresentante" value="${transportadora && transportadora.representante ? toUpperCase(transportadora.representante) : ''}">
                                </div>
                            </div>
                        </div>
                        <div class="tab-content" id="tab-contato">
                            <div class="form-group">
                                <label for="modalEmail">E-mail</label>
                                <input type="email" id="modalEmail" value="${transportadora && transportadora.email ? transportadora.email : ''}" style="text-transform:none;">
                            </div>
                            <div class="form-group">
                                <label>Telefones</label>
                                <div id="telefonesContainer">
                                    ${transportadora && transportadora.telefones && transportadora.telefones.length > 0
                                        ? transportadora.telefones.map(tel => `<div class="dynamic-field"><input type="text" value="${toUpperCase(tel)}" placeholder="Telefone"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>`).join('')
                                        : '<div class="dynamic-field"><input type="text" placeholder="Telefone"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>'}
                                </div>
                                <button type="button" class="add-field-btn" onclick="addDynamicField('telefonesContainer', 'Telefone')">+ Adicionar Telefone</button>
                            </div>
                            <div class="form-group">
                                <label>Celulares</label>
                                <div id="celularesContainer">
                                    ${transportadora && transportadora.celulares && transportadora.celulares.length > 0
                                        ? transportadora.celulares.map(cel => `<div class="dynamic-field"><input type="text" value="${toUpperCase(cel)}" placeholder="Celular"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>`).join('')
                                        : '<div class="dynamic-field"><input type="text" placeholder="Celular"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>'}
                                </div>
                                <button type="button" class="add-field-btn" onclick="addDynamicField('celularesContainer', 'Celular')">+ Adicionar Celular</button>
                            </div>
                        </div>
                        <div class="tab-content" id="tab-regioes">
                            <div class="form-group">
                                <label>Regiões de Atendimento</label>
                                <div class="selection-grid" id="regioesSelection">
                                    ${Object.keys(REGIOES_ESTADOS).map(regiao => {
                                        const isSelected = transportadora && transportadora.regioes && transportadora.regioes.includes(regiao);
                                        return `<div class="selection-item ${isSelected ? 'selected' : ''}" onclick="toggleSelection(this)">${regiao}</div>`;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="tab-content" id="tab-estados">
                            <div class="form-group">
                                <label>Estados de Atendimento</label>
                                <div class="selection-grid" id="estadosSelection">
                                    ${TODOS_ESTADOS.map(estado => {
                                        const isSelected = transportadora && transportadora.estados && transportadora.estados.includes(estado);
                                        return `<div class="selection-item ${isSelected ? 'selected' : ''}" onclick="toggleSelection(this)">${estado}</div>`;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" id="btnPrevious" onclick="previousTab()" class="secondary" style="display:none;">Anterior</button>
                        <button type="button" id="btnNext" onclick="nextTab()" class="secondary">Próximo</button>
                        <button type="submit" id="btnSave" class="save" style="display:none;">${isEdit ? 'Salvar Alterações' : 'Cadastrar'}</button>
                        <button type="button" onclick="closeFormModal()" class="danger">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>`);

    setTimeout(() => { setupUpperCaseInputs(); updateNavigationButtons(); }, 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) { modal.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(() => modal.remove(), 200); }
}

function addDynamicField(containerId, placeholder) {
    const container = document.getElementById(containerId);
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `<input type="text" placeholder="${placeholder}"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button>`;
    container.appendChild(newField);
    setupUpperCaseInputs();
}

function toggleSelection(element) { element.classList.toggle('selected'); }

function switchTab(tabId) {
    currentTab = tabs.indexOf(tabId);
    tabs.forEach((id, index) => {
        const tab = document.getElementById(id);
        const btn = document.querySelectorAll('.tabs-nav .tab-btn')[index];
        if (id === tabId) { tab.classList.add('active'); btn.classList.add('active'); }
        else { tab.classList.remove('active'); btn.classList.remove('active'); }
    });
    updateNavigationButtons();
}

function nextTab() { if (currentTab < tabs.length - 1) switchTab(tabs[currentTab + 1]); }
function previousTab() { if (currentTab > 0) switchTab(tabs[currentTab - 1]); }

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    if (btnPrevious) btnPrevious.style.display = currentTab > 0 ? 'inline-flex' : 'none';
    if (btnNext) btnNext.style.display = currentTab < tabs.length - 1 ? 'inline-flex' : 'none';
    if (btnSave) btnSave.style.display = currentTab === tabs.length - 1 ? 'inline-flex' : 'none';
}

async function submitForm(event, transportadoraId = null) {
    event.preventDefault();
    if (!isOnline) { showToast('Sistema offline. Não foi possível salvar.', 'error'); return; }

    const nome = document.getElementById('modalNome').value.trim();
    const representante = document.getElementById('modalRepresentante').value.trim();
    const email = document.getElementById('modalEmail').value.trim();

    if (!nome) { showToast('Nome da transportadora é obrigatório', 'error'); return; }

    const telefones = Array.from(document.querySelectorAll('#telefonesContainer input')).map(i => i.value.trim()).filter(v => v);
    const celulares = Array.from(document.querySelectorAll('#celularesContainer input')).map(i => i.value.trim()).filter(v => v);
    const regioesSelecionadas = Array.from(document.querySelectorAll('#regioesSelection .selection-item.selected')).map(el => el.textContent.trim());
    const estadosSelecionados = Array.from(document.querySelectorAll('#estadosSelection .selection-item.selected')).map(el => el.textContent.trim());

    const data = {
        nome: toUpperCase(nome),
        representante: representante ? toUpperCase(representante) : '',
        telefones, celulares,
        email: email.toLowerCase(),
        regioes: regioesSelecionadas,
        estados: estadosSelecionados
    };

    try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (sessionToken) headers['X-Session-Token'] = sessionToken;

        const url = transportadoraId ? `${API_URL}/transportadoras/${transportadoraId}` : `${API_URL}/transportadoras`;
        const method = transportadoraId ? 'PUT' : 'POST';

        const response = await fetchWithTimeout(url, { method, headers, body: JSON.stringify(data) }, 15000);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Erro ao salvar');
        }

        closeFormModal();
        showToast(transportadoraId ? 'Transportadora atualizada com sucesso!' : 'Transportadora cadastrada com sucesso!', 'success');
        loadTransportadoras(transportadoraId ? state.currentPage : 1);

    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Timeout: Operação demorou muito' : 'Erro ao salvar: ' + error.message, 'error');
    }
}

// ─── VER / EDITAR / EXCLUIR ───────────────────────────────────────────────────

function viewTransportadora(id) {
    currentViewTab = 0;
    const t = state.transportadoras.find(t => String(t.id) === String(id));
    if (!t) { showToast('Transportadora não encontrada', 'error'); return; }

    const telefones = t.telefones && t.telefones.length > 0
        ? t.telefones.map(v => `<p>${toUpperCase(v)}</p>`).join('')
        : '<p class="empty">Nenhum telefone cadastrado</p>';
    const celulares = t.celulares && t.celulares.length > 0
        ? t.celulares.map(v => `<p>${toUpperCase(v)}</p>`).join('')
        : '<p class="empty">Nenhum celular cadastrado</p>';
    const regioesHTML = t.regioes && t.regioes.length > 0
        ? `<div class="selection-grid view-mode">${t.regioes.map(r => `<div class="selection-item-view">${r}</div>`).join('')}</div>`
        : '<p class="empty">Nenhuma região selecionada</p>';
    const estadosHTML = t.estados && t.estados.length > 0
        ? `<div class="selection-grid view-mode">${t.estados.map(e => `<div class="selection-item-view">${e}</div>`).join('')}</div>`
        : '<p class="empty">Nenhum estado selecionado</p>';
    const email = t.email ? t.email.toLowerCase() : '<span class="empty">Não informado</span>';
    const representante = t.representante ? toUpperCase(t.representante) : '<span class="empty">Não informado</span>';

    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="viewModal" style="display:flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">${toUpperCase(t.nome)}</h3>
                    <button class="close-modal" onclick="closeViewModal()">✕</button>
                </div>
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab('view-tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-contato')">Contato</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-regioes')">Regiões</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-estados')">Estados</button>
                    </div>
                    <div class="tab-content active" id="view-tab-geral">
                        <div class="view-section"><h4>Nome da Transportadora</h4><p>${toUpperCase(t.nome)}</p></div>
                        <div class="view-section"><h4>Nome do(a) Representante</h4><p>${representante}</p></div>
                    </div>
                    <div class="tab-content" id="view-tab-contato">
                        <div class="view-section"><h4>E-mail</h4><p style="text-transform:lowercase;">${email}</p></div>
                        <div class="view-section"><h4>Telefones</h4>${telefones}</div>
                        <div class="view-section"><h4>Celulares</h4>${celulares}</div>
                    </div>
                    <div class="tab-content" id="view-tab-regioes">
                        <div class="view-section"><h4>Regiões de Atendimento</h4>${regioesHTML}</div>
                    </div>
                    <div class="tab-content" id="view-tab-estados">
                        <div class="view-section"><h4>Estados de Atendimento</h4>${estadosHTML}</div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" id="btnViewPrevious" onclick="previousViewTab()" class="secondary" style="display:none;">Anterior</button>
                        <button type="button" id="btnViewNext" onclick="nextViewTab()" class="secondary">Próximo</button>

                    </div>
                </div>
            </div>
        </div>`);

    setTimeout(() => updateViewNavigationButtons(), 100);
}

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) { modal.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(() => modal.remove(), 200); }
}

function switchViewTab(tabId) {
    currentViewTab = viewTabs.indexOf(tabId);
    viewTabs.forEach((id, index) => {
        const tab = document.getElementById(id);
        const btn = document.querySelectorAll('#viewModal .tabs-nav .tab-btn')[index];
        if (tab && btn) {
            if (id === tabId) { tab.classList.add('active'); btn.classList.add('active'); }
            else { tab.classList.remove('active'); btn.classList.remove('active'); }
        }
    });
    updateViewNavigationButtons();
}

function nextViewTab() {
    if (currentViewTab < viewTabs.length - 1) switchViewTab(viewTabs[currentViewTab + 1]);
    else closeViewModal();
}

function previousViewTab() {
    if (currentViewTab > 0) switchViewTab(viewTabs[currentViewTab - 1]);
}

function updateViewNavigationButtons() {
    const btnPrevious = document.getElementById('btnViewPrevious');
    const btnNext = document.getElementById('btnViewNext');
    if (btnPrevious) btnPrevious.style.display = currentViewTab > 0 ? 'inline-flex' : 'none';
    if (btnNext) btnNext.textContent = currentViewTab === viewTabs.length - 1 ? 'Fechar' : 'Próximo';
}

function editTransportadora(id) { openFormModal(id); }
function deleteTransportadora(id) { showDeleteModal(id); }

function showDeleteModal(id) {
    document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay" id="deleteModal" style="display:flex;">
            <div class="modal-content modal-delete">
                <button class="close-modal" onclick="closeDeleteModal()">✕</button>
                <div class="modal-message-delete">Tem certeza que deseja excluir esta transportadora?</div>
                <div class="modal-actions modal-actions-no-border">
                    <button type="button" onclick="confirmDelete('${id}')" class="danger">Sim</button>
                    <button type="button" onclick="closeDeleteModal()" class="secondary">Cancelar</button>
                </div>
            </div>
        </div>`);
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) { modal.style.animation = 'fadeOut 0.2s ease forwards'; setTimeout(() => modal.remove(), 200); }
}

async function confirmDelete(id) {
    closeDeleteModal();
    if (!isOnline) { showToast('Sistema offline. Não foi possível excluir.', 'error'); return; }

    try {
        const response = await fetchWithTimeout(`${API_URL}/transportadoras/${id}`, {
            method: 'DELETE', headers: getHeaders()
        });

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        showToast('Transportadora excluída com sucesso!', 'success');

        const pageToLoad = state.transportadoras.length === 1 && state.currentPage > 1
            ? state.currentPage - 1 : state.currentPage;

        loadTransportadoras(pageToLoad);

    } catch (error) {
        showToast(error.name === 'AbortError' ? 'Timeout: Operação demorou muito' : 'Erro ao excluir transportadora', 'error');
    }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const div = document.createElement('div');
    div.className = `floating-message ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}
