// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://transportadoras.onrender.com/api';

let transportadoras = [];
let isOnline = false;
let transportadoraSelecionada = 'TODAS';
let transportadorasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;
let currentTab = 0;
let currentViewTab = 0;

const tabs = ['tab-geral', 'tab-contato', 'tab-regioes', 'tab-estados'];
const viewTabs = ['view-tab-geral', 'view-tab-contato', 'view-tab-regioes', 'view-tab-estados'];

console.log('🚀 Transportadoras iniciada');
console.log('📍 API URL:', API_URL);

// Função auxiliar para converter texto para maiúsculas
function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
}

// Converter input para maiúsculo automaticamente
function setupUpperCaseInputs() {
    const textInputs = document.querySelectorAll('input[type="text"]:not([readonly]):not([type="email"]), textarea');
    textInputs.forEach(input => {
        if (input.type !== 'email' && input.id !== 'modalEmail') {
            input.addEventListener('input', function(e) {
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = toUpperCase(this.value);
                this.setSelectionRange(start, end);
            });
        }
    });
}

// Regiões e Estados do Brasil
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

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); text-align: center; padding: 2rem;">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">${mensagem}</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Somente usuários autenticados podem acessar esta área.</p>
            <a href="${PORTAL_URL}" style="display: inline-block; background: var(--btn-register); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ir para o Portal</a>
        </div>
    `;
}

function inicializarApp() {
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

async function checkServerStatus() {
    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/transportadoras`, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ SERVIDOR ONLINE');
            await loadTransportadoras();
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        console.error('❌ Erro ao verificar servidor:', error.message);
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

function startPolling() {
    loadTransportadoras();
    setInterval(() => {
        if (isOnline) loadTransportadoras();
    }, 10000);
}

async function loadTransportadoras() {
    if (!isOnline) return;

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/transportadoras`, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro ao carregar transportadoras:', response.status);
            return;
        }

        const data = await response.json();
        transportadoras = data;
        
        const newHash = JSON.stringify(transportadoras.map(t => t.id));
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            atualizarTransportadorasDisponiveis();
            renderTransportadorasFilter();
            filterTransportadoras();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Timeout ao carregar transportadoras');
        } else {
            console.error('❌ Erro ao carregar:', error);
        }
    }
}

function atualizarTransportadorasDisponiveis() {
    transportadorasDisponiveis.clear();
    transportadoras.forEach(t => {
        const nome = toUpperCase(t.nome || '').trim();
        if (nome && !transportadorasDisponiveis.has(nome)) {
            transportadorasDisponiveis.add(nome);
        }
    });
    console.log(`📋 ${transportadorasDisponiveis.size} transportadoras disponíveis`);
}

function renderTransportadorasFilter() {
    const container = document.getElementById('transportadorasFilter');
    if (!container) return;

    const transportadorasArray = Array.from(transportadorasDisponiveis).sort();
    
    const buttonsHTML = transportadorasArray.map(nome => 
        `<button class="brand-button ${transportadoraSelecionada === nome ? 'active' : ''}" 
                onclick="selecionarTransportadora('${nome.replace(/'/g, "\\'")}')">${nome}</button>`
    ).join('');

    const todasButton = `<button class="brand-button ${transportadoraSelecionada === 'TODAS' ? 'active' : ''}" 
                                onclick="selecionarTransportadora('TODAS')">TODAS</button>`;

    container.innerHTML = todasButton + buttonsHTML;
}

function selecionarTransportadora(nome) {
    transportadoraSelecionada = nome;
    renderTransportadorasFilter();
    filterTransportadoras();
}

function openFormModal(transportadoraId = null) {
    currentTab = 0;
    let transportadora = null;
    
    if (transportadoraId) {
        transportadora = transportadoras.find(t => String(t.id) === String(transportadoraId));
        if (!transportadora) {
            showToast('Transportadora não encontrada', 'error');
            return;
        }
    }

    const isEdit = !!transportadoraId;
    const titulo = isEdit ? 'Editar Transportadora' : 'Nova Transportadora';

    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">${titulo}</h3>
                    <button class="close-modal" onclick="closeFormModal()">X</button>
                </div>
                
                <form id="transportadoraForm" onsubmit="submitForm(event, ${isEdit ? `'${transportadoraId}'` : 'null'})">
                    <div class="tabs-container">
                        <div class="tabs-nav">
                            <button type="button" class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-contato')">Contato</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-regioes')">Regiões</button>
                            <button type="button" class="tab-btn" onclick="switchTab('tab-estados')">Estados</button>
                        </div>

                        <!-- ABA GERAL -->
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

                        <!-- ABA CONTATO -->
                        <div class="tab-content" id="tab-contato">
                            <div class="form-group">
                                <label for="modalEmail">E-mail</label>
                                <input type="email" id="modalEmail" value="${transportadora && transportadora.email ? transportadora.email : ''}" style="text-transform: none;">
                            </div>

                            <div class="form-group">
                                <label>Telefones</label>
                                <div id="telefonesContainer">
                                    ${transportadora && transportadora.telefones && transportadora.telefones.length > 0 
                                        ? transportadora.telefones.map((tel, idx) => `
                                            <div class="dynamic-field">
                                                <input type="text" value="${toUpperCase(tel)}" placeholder="Telefone">
                                                <button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button>
                                            </div>
                                        `).join('') 
                                        : '<div class="dynamic-field"><input type="text" placeholder="Telefone"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>'
                                    }
                                </div>
                                <button type="button" class="add-field-btn" onclick="addDynamicField('telefonesContainer', 'Telefone')">+ Adicionar Telefone</button>
                            </div>

                            <div class="form-group">
                                <label>Celulares</label>
                                <div id="celularesContainer">
                                    ${transportadora && transportadora.celulares && transportadora.celulares.length > 0 
                                        ? transportadora.celulares.map((cel, idx) => `
                                            <div class="dynamic-field">
                                                <input type="text" value="${toUpperCase(cel)}" placeholder="Celular">
                                                <button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button>
                                            </div>
                                        `).join('') 
                                        : '<div class="dynamic-field"><input type="text" placeholder="Celular"><button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button></div>'
                                    }
                                </div>
                                <button type="button" class="add-field-btn" onclick="addDynamicField('celularesContainer', 'Celular')">+ Adicionar Celular</button>
                            </div>
                        </div>

                        <!-- ABA REGIÕES -->
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

                        <!-- ABA ESTADOS -->
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
                        <button type="button" id="btnPrevious" onclick="previousTab()" class="secondary" style="display: none;">Anterior</button>
                        <button type="button" id="btnNext" onclick="nextTab()" class="secondary">Próximo</button>
                        <button type="submit" id="btnSave" class="save" style="display: none;">${isEdit ? 'Salvar Alterações' : 'Cadastrar'}</button>
                        <button type="button" onclick="closeFormModal()" class="secondary">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        setupUpperCaseInputs();
        updateNavigationButtons();
    }, 100);
}

function closeFormModal() {
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

function addDynamicField(containerId, placeholder) {
    const container = document.getElementById(containerId);
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="text" placeholder="${placeholder}">
        <button type="button" class="delete" onclick="this.parentElement.remove()">Remover</button>
    `;
    container.appendChild(newField);
    setupUpperCaseInputs();
}

function toggleSelection(element) {
    element.classList.toggle('selected');
}

function switchTab(tabId) {
    currentTab = tabs.indexOf(tabId);
    
    tabs.forEach((id, index) => {
        const tab = document.getElementById(id);
        const btn = document.querySelectorAll('.tabs-nav .tab-btn')[index];
        
        if (id === tabId) {
            tab.classList.add('active');
            btn.classList.add('active');
        } else {
            tab.classList.remove('active');
            btn.classList.remove('active');
        }
    });
    
    updateNavigationButtons();
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        switchTab(tabs[currentTab + 1]);
    }
}

function previousTab() {
    if (currentTab > 0) {
        switchTab(tabs[currentTab - 1]);
    }
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    if (btnPrevious) btnPrevious.style.display = currentTab > 0 ? 'inline-flex' : 'none';
    if (btnNext) btnNext.style.display = currentTab < tabs.length - 1 ? 'inline-flex' : 'none';
    if (btnSave) btnSave.style.display = currentTab === tabs.length - 1 ? 'inline-flex' : 'none';
}

function switchViewTab(tabId) {
    currentViewTab = viewTabs.indexOf(tabId);
    
    viewTabs.forEach((id, index) => {
        const tab = document.getElementById(id);
        const btn = document.querySelectorAll('#viewModal .tabs-nav .tab-btn')[index];
        
        if (tab && btn) {
            if (id === tabId) {
                tab.classList.add('active');
                btn.classList.add('active');
            } else {
                tab.classList.remove('active');
                btn.classList.remove('active');
            }
        }
    });
    
    updateViewNavigationButtons();
}

function nextViewTab() {
    if (currentViewTab < viewTabs.length - 1) {
        switchViewTab(viewTabs[currentViewTab + 1]);
    } else {
        closeViewModal();
    }
}

function previousViewTab() {
    if (currentViewTab > 0) {
        switchViewTab(viewTabs[currentViewTab - 1]);
    }
}

function updateViewNavigationButtons() {
    const btnPrevious = document.getElementById('btnViewPrevious');
    const btnNext = document.getElementById('btnViewNext');
    const btnClose = document.getElementById('btnViewClose');
    
    if (btnPrevious) btnPrevious.style.display = currentViewTab > 0 ? 'inline-flex' : 'none';
    if (btnNext) {
        btnNext.textContent = currentViewTab === viewTabs.length - 1 ? 'Fechar' : 'Próximo';
    }
}

async function submitForm(event, transportadoraId = null) {
    event.preventDefault();

    if (!isOnline) {
        showToast('Sistema offline. Não foi possível salvar.', 'error');
        return;
    }

    const nome = document.getElementById('modalNome').value.trim();
    const representante = document.getElementById('modalRepresentante').value.trim();
    const email = document.getElementById('modalEmail').value.trim();

    if (!nome) {
        showToast('Nome da transportadora é obrigatório', 'error');
        return;
    }

    const telefones = Array.from(document.querySelectorAll('#telefonesContainer input'))
        .map(input => input.value.trim())
        .filter(v => v);

    const celulares = Array.from(document.querySelectorAll('#celularesContainer input'))
        .map(input => input.value.trim())
        .filter(v => v);

    const regioesSelecionadas = Array.from(document.querySelectorAll('#regioesSelection .selection-item.selected'))
        .map(el => el.textContent.trim());

    const estadosSelecionados = Array.from(document.querySelectorAll('#estadosSelection .selection-item.selected'))
        .map(el => el.textContent.trim());

    const data = {
        nome: toUpperCase(nome),
        representante: representante ? toUpperCase(representante) : '',
        telefones,
        celulares,
        email: email.toLowerCase(),
        regioes: regioesSelecionadas,
        estados: estadosSelecionados
    };

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const url = transportadoraId ? `${API_URL}/transportadoras/${transportadoraId}` : `${API_URL}/transportadoras`;
        const method = transportadoraId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(data),
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Erro ao salvar');
        }

        const result = await response.json();

        if (transportadoraId) {
            const index = transportadoras.findIndex(t => String(t.id) === String(transportadoraId));
            if (index !== -1) transportadoras[index] = result;
        } else {
            transportadoras.push(result);
        }

        lastDataHash = JSON.stringify(transportadoras.map(t => t.id));
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        filterTransportadoras();
        
        showToast(transportadoraId ? 'Transportadora atualizada com sucesso!' : 'Transportadora cadastrada com sucesso!', 'success');
        closeFormModal();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao salvar transportadora: ' + error.message, 'error');
        }
    }
}

function viewTransportadora(id) {
    currentViewTab = 0;
    const transportadora = transportadoras.find(t => String(t.id) === String(id));
    
    if (!transportadora) {
        showToast('Transportadora não encontrada', 'error');
        return;
    }

    const telefones = transportadora.telefones && transportadora.telefones.length > 0 
        ? transportadora.telefones.map(t => `<p>${toUpperCase(t)}</p>`).join('') 
        : '<p class="empty">Nenhum telefone cadastrado</p>';

    const celulares = transportadora.celulares && transportadora.celulares.length > 0 
        ? transportadora.celulares.map(c => `<p>${toUpperCase(c)}</p>`).join('') 
        : '<p class="empty">Nenhum celular cadastrado</p>';

    const regioesHTML = transportadora.regioes && transportadora.regioes.length > 0
        ? `<div class="selection-grid view-mode">${transportadora.regioes.map(r => `<div class="selection-item-view">${r}</div>`).join('')}</div>`
        : '<p class="empty">Nenhuma região selecionada</p>';

    const estadosHTML = transportadora.estados && transportadora.estados.length > 0
        ? `<div class="selection-grid view-mode">${transportadora.estados.map(e => `<div class="selection-item-view">${e}</div>`).join('')}</div>`
        : '<p class="empty">Nenhum estado selecionado</p>';

    const email = transportadora.email ? transportadora.email.toLowerCase() : '<span class="empty">Não informado</span>';
    const representante = transportadora.representante ? toUpperCase(transportadora.representante) : '<span class="empty">Não informado</span>';

    const modalHTML = `
        <div class="modal-overlay" id="viewModal" style="display: flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Transportadora</h3>
                    <button class="close-modal" onclick="closeViewModal()">X</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab('view-tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-contato')">Contato</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-regioes')">Regiões</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-estados')">Estados</button>
                    </div>

                    <div class="tab-content active" id="view-tab-geral">
                        <div class="view-section">
                            <h4>Nome da Transportadora</h4>
                            <p>${toUpperCase(transportadora.nome)}</p>
                        </div>
                        
                        <div class="view-section">
                            <h4>Nome do(a) Representante</h4>
                            <p>${representante}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-contato">
                        <div class="view-section">
                            <h4>E-mail</h4>
                            <p style="text-transform: lowercase;">${email}</p>
                        </div>
                        
                        <div class="view-section">
                            <h4>Telefones</h4>
                            ${telefones}
                        </div>
                        
                        <div class="view-section">
                            <h4>Celulares</h4>
                            ${celulares}
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-regioes">
                        <div class="view-section">
                            <h4>Regiões de Atendimento</h4>
                            ${regioesHTML}
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-estados">
                        <div class="view-section">
                            <h4>Estados de Atendimento</h4>
                            ${estadosHTML}
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button type="button" id="btnViewPrevious" onclick="previousViewTab()" class="secondary" style="display: none;">Anterior</button>
                        <button type="button" id="btnViewNext" onclick="nextViewTab()" class="secondary">Próximo</button>
                        <button type="button" id="btnViewClose" onclick="closeViewModal()" class="secondary">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        updateViewNavigationButtons();
    }, 100);
}

function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

function editTransportadora(id) {
    openFormModal(id);
}

async function deleteTransportadora(id) {
    if (!confirm('Tem certeza que deseja excluir esta transportadora?')) return;

    if (!isOnline) {
        showToast('Sistema offline. Não foi possível excluir.', 'error');
        return;
    }

    try {
        const headers = {
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/transportadoras/${id}`, {
            method: 'DELETE',
            headers: headers,
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        transportadoras = transportadoras.filter(t => String(t.id) !== String(id));
        lastDataHash = JSON.stringify(transportadoras.map(t => t.id));
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        filterTransportadoras();
        showToast('Transportadora excluída com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao deletar:', error);
        if (error.name === 'AbortError') {
            showToast('Timeout: Operação demorou muito', 'error');
        } else {
            showToast('Erro ao excluir transportadora', 'error');
        }
    }
}

function filterTransportadoras() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    let filtered = transportadoras;

    if (transportadoraSelecionada !== 'TODAS') {
        filtered = filtered.filter(t => toUpperCase(t.nome) === transportadoraSelecionada);
    }

    if (searchTerm) {
        filtered = filtered.filter(t => 
            toUpperCase(t.nome).toLowerCase().includes(searchTerm) ||
            (t.representante && toUpperCase(t.representante).toLowerCase().includes(searchTerm)) ||
            (t.email && t.email.toLowerCase().includes(searchTerm)) ||
            (t.regioes && t.regioes.some(r => toUpperCase(r).toLowerCase().includes(searchTerm))) ||
            (t.estados && t.estados.some(e => toUpperCase(e).toLowerCase().includes(searchTerm)))
        );
    }

    filtered.sort((a, b) => toUpperCase(a.nome).localeCompare(toUpperCase(b.nome)));

    renderTransportadoras(filtered);
}

function renderTransportadoras(transportadorasToRender) {
    const container = document.getElementById('transportadorasContainer');
    
    if (!transportadorasToRender || transportadorasToRender.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem;">
                    Nenhuma transportadora encontrada
                </td>
            </tr>
        `;
        return;
    }

    container.innerHTML = transportadorasToRender.map(t => {
        const primeiroTelefone = t.telefones && t.telefones.length > 0 ? toUpperCase(t.telefones[0]) : '-';
        const primeiroCelular = t.celulares && t.celulares.length > 0 ? toUpperCase(t.celulares[0]) : '-';
        const email = t.email || '-';
        const representante = t.representante ? toUpperCase(t.representante) : '-';
        
        return `
            <tr>
                <td><strong>${toUpperCase(t.nome)}</strong></td>
                <td>${representante}</td>
                <td>${primeiroTelefone}</td>
                <td>${primeiroCelular}</td>
                <td style="text-transform: lowercase;">${email}</td>
                <td class="actions-cell" style="text-align: center;">
                    <button onclick="viewTransportadora('${t.id}')" class="action-btn view">Ver</button>
                    <button onclick="editTransportadora('${t.id}')" class="action-btn edit">Editar</button>
                    <button onclick="deleteTransportadora('${t.id}')" class="action-btn delete">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showToast(message, type = 'success') {
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
