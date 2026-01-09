// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://ordem-compra.onrender.com/api';

let transportadoras = [];
let isOnline = false;
let transportadoraSelecionada = 'TODAS';
let transportadorasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;
let currentTab = 0;
let currentViewTab = 0;

const tabs = ['tab-geral', 'tab-regioes', 'tab-estados'];
const viewTabs = ['view-tab-geral', 'view-tab-contatos', 'view-tab-regioes', 'view-tab-estados'];

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
        if (input.type !== 'email') {
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

        const response = await fetch(`${API_URL}/transportadoras`, {
            method: 'GET',
            headers: headers,
            mode: 'cors'
        });

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
        console.error('❌ Erro ao verificar servidor:', error);
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

        const response = await fetch(`${API_URL}/transportadoras`, {
            method: 'GET',
            headers: headers,
            mode: 'cors'
        });

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
        console.error('❌ Erro ao carregar:', error);
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
    
    container.innerHTML = '';
    
    ['TODAS', ...transportadorasArray].forEach(transportadora => {
        const button = document.createElement('button');
        button.className = `brand-button ${transportadora === transportadoraSelecionada ? 'active' : ''}`;
        button.textContent = transportadora;
        button.onclick = () => selecionarTransportadora(transportadora);
        container.appendChild(button);
    });
}

function selecionarTransportadora(transportadora) {
    transportadoraSelecionada = transportadora;
    renderTransportadorasFilter();
    filterTransportadoras();
}

function switchTab(tabId) {
    const tabIndex = tabs.indexOf(tabId);
    if (tabIndex !== -1) {
        currentTab = tabIndex;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function showTab(index) {
    const tabButtons = document.querySelectorAll('#formModal .tab-btn');
    const tabContents = document.querySelectorAll('#formModal .tab-content');
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    if (tabButtons[index]) tabButtons[index].classList.add('active');
    if (tabContents[index]) tabContents[index].classList.add('active');
}

function updateNavigationButtons() {
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnSave = document.getElementById('btnSave');
    
    if (!btnPrevious || !btnNext || !btnSave) return;
    
    if (currentTab > 0) {
        btnPrevious.style.display = 'inline-flex';
    } else {
        btnPrevious.style.display = 'none';
    }
    
    if (currentTab < tabs.length - 1) {
        btnNext.style.display = 'inline-flex';
        btnSave.style.display = 'none';
    } else {
        btnNext.style.display = 'none';
        btnSave.style.display = 'inline-flex';
    }
}

function nextTab() {
    if (currentTab < tabs.length - 1) {
        currentTab++;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function previousTab() {
    if (currentTab > 0) {
        currentTab--;
        showTab(currentTab);
        updateNavigationButtons();
    }
}

function switchViewTab(tabId) {
    const viewTabsArray = ['view-tab-geral', 'view-tab-contatos', 'view-tab-regioes', 'view-tab-estados'];
    const currentIndex = viewTabsArray.indexOf(tabId);
    
    if (currentIndex !== -1) {
        currentViewTab = currentIndex;
    }
    
    document.querySelectorAll('#viewModal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('#viewModal .tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const clickedBtn = event?.target?.closest('.tab-btn');
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    } else {
        document.querySelectorAll('#viewModal .tab-btn')[currentIndex]?.classList.add('active');
    }
    document.getElementById(tabId).classList.add('active');
    
    updateViewNavigationButtons();
}

function updateViewNavigationButtons() {
    const btnViewPrevious = document.getElementById('btnViewPrevious');
    const btnViewNext = document.getElementById('btnViewNext');
    const btnViewClose = document.getElementById('btnViewClose');
    
    if (!btnViewPrevious || !btnViewNext || !btnViewClose) return;
    
    const totalTabs = 4;
    
    if (currentViewTab > 0) {
        btnViewPrevious.style.display = 'inline-flex';
    } else {
        btnViewPrevious.style.display = 'none';
    }
    
    if (currentViewTab < totalTabs - 1) {
        btnViewNext.style.display = 'inline-flex';
    } else {
        btnViewNext.style.display = 'none';
    }
    
    btnViewClose.style.display = 'inline-flex';
}

function nextViewTab() {
    const viewTabsArray = ['view-tab-geral', 'view-tab-contatos', 'view-tab-regioes', 'view-tab-estados'];
    if (currentViewTab < viewTabsArray.length - 1) {
        currentViewTab++;
        switchViewTab(viewTabsArray[currentViewTab]);
    }
}

function previousViewTab() {
    const viewTabsArray = ['view-tab-geral', 'view-tab-contatos', 'view-tab-regioes', 'view-tab-estados'];
    if (currentViewTab > 0) {
        currentViewTab--;
        switchViewTab(viewTabsArray[currentViewTab]);
    }
}

function toggleRegiao(regiao) {
    const item = document.querySelector(`[data-regiao="${regiao}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
}

function toggleEstado(estado) {
    const item = document.querySelector(`[data-estado="${estado}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
}

function addTelefone() {
    const container = document.getElementById('telefonesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="telefone-input" placeholder="(00) 0000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">Remover</button>
    `;
    container.appendChild(newField);
    setupUpperCaseInputs();
}

function addCelular() {
    const container = document.getElementById('celularesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="celular-input" placeholder="(00) 00000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">Remover</button>
    `;
    container.appendChild(newField);
    setupUpperCaseInputs();
}

function removeField(button) {
    button.parentElement.remove();
}

function openFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const transportadora = isEditing ? transportadoras.find(t => String(t.id) === String(editingId)) : null;
    
    currentTab = 0;

    const telefones = transportadora?.telefones || [''];
    const celulares = transportadora?.celulares || [''];
    const regioesSelecionadas = transportadora?.regioes?.map(r => toUpperCase(r)) || [];
    const estadosSelecionados = transportadora?.estados?.map(e => toUpperCase(e)) || [];

    const modalHTML = `
        <div class="modal-overlay" id="formModal" style="display: flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Transportadora' : 'Nova Transportadora'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab('tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchTab('tab-regioes')">Regiões</button>
                        <button class="tab-btn" onclick="switchTab('tab-estados')">Estados</button>
                    </div>

                    <form id="modalForm" onsubmit="handleSubmit(event)">
                        <input type="hidden" id="editId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-group">
                                <label for="modalNome">Nome da Transportadora *</label>
                                <input type="text" id="modalNome" value="${toUpperCase(transportadora?.nome || '')}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="modalEmail">E-mail</label>
                                <input type="email" id="modalEmail" value="${transportadora?.email || ''}" style="text-transform: lowercase;">
                            </div>
                            
                            <div class="form-group">
                                <label>Telefones</label>
                                <div id="telefonesContainer">
                                    ${telefones.map((tel, i) => `
                                        <div class="dynamic-field">
                                            <input type="tel" class="telefone-input" value="${toUpperCase(tel)}" placeholder="(00) 0000-0000">
                                            ${i > 0 ? '<button type="button" class="danger small" onclick="removeField(this)">Remover</button>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <button type="button" class="add-field-btn small" onclick="addTelefone()">+ Adicionar Telefone</button>
                            </div>
                            
                            <div class="form-group">
                                <label>Celulares</label>
                                <div id="celularesContainer">
                                    ${celulares.map((cel, i) => `
                                        <div class="dynamic-field">
                                            <input type="tel" class="celular-input" value="${toUpperCase(cel)}" placeholder="(00) 00000-0000">
                                            ${i > 0 ? '<button type="button" class="danger small" onclick="removeField(this)">Remover</button>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <button type="button" class="add-field-btn small" onclick="addCelular()">+ Adicionar Celular</button>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-regioes">
                            <div class="form-group">
                                <label>Regiões de Atendimento</label>
                                <div class="selection-grid" id="regioesGrid">
                                    ${Object.keys(REGIOES_ESTADOS).map(regiao => `
                                        <div class="selection-item ${regioesSelecionadas.includes(regiao) ? 'selected' : ''}" 
                                             data-regiao="${regiao}"
                                             onclick="toggleRegiao('${regiao}')">
                                            ${regiao}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-estados">
                            <div class="form-group">
                                <label>Estados de Atendimento</label>
                                <div class="selection-grid" id="estadosGrid">
                                    ${TODOS_ESTADOS.map(estado => `
                                        <div class="selection-item ${estadosSelecionados.includes(estado) ? 'selected' : ''}" 
                                             data-estado="${estado}"
                                             onclick="toggleEstado('${estado}')">
                                            ${estado}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="button" id="btnPrevious" onclick="previousTab()" class="secondary" style="display: none;">Anterior</button>
                            <button type="button" id="btnNext" onclick="nextTab()" class="secondary">Próximo</button>
                            <button type="submit" id="btnSave" class="save" style="display: none;">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                            <button type="button" onclick="closeFormModal(true)" class="secondary">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    setTimeout(() => {
        setupUpperCaseInputs();
        updateNavigationButtons();
        document.getElementById('modalNome')?.focus();
    }, 100);
}

function closeFormModal(showCancelMessage = false) {
    const modal = document.getElementById('formModal');
    if (modal) {
        const editId = document.getElementById('editId')?.value;
        const isEditing = editId && editId !== '';
        
        if (showCancelMessage) {
            showToast(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        }
        
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    
    const telefones = Array.from(document.querySelectorAll('.telefone-input'))
        .map(input => toUpperCase(input.value.trim()))
        .filter(val => val);

    const celulares = Array.from(document.querySelectorAll('.celular-input'))
        .map(input => toUpperCase(input.value.trim()))
        .filter(val => val);

    const regioes = Array.from(document.querySelectorAll('#regioesGrid .selection-item.selected'))
        .map(item => item.dataset.regiao);

    const estados = Array.from(document.querySelectorAll('#estadosGrid .selection-item.selected'))
        .map(item => item.dataset.estado);

    const emailValue = document.getElementById('modalEmail').value.trim();

    const formData = {
        nome: toUpperCase(document.getElementById('modalNome').value.trim()),
        email: emailValue ? emailValue.toLowerCase() : null,
        telefones,
        celulares,
        regioes,
        estados
    };

    const editId = document.getElementById('editId').value;
    
    if (!isOnline) {
        showToast('Sistema offline. Dados não foram salvos.', 'error');
        closeFormModal();
        return;
    }

    try {
        const url = editId ? `${API_URL}/transportadoras/${editId}` : `${API_URL}/transportadoras`;
        const method = editId ? 'PUT' : 'POST';

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (sessionToken) {
            headers['X-Session-Token'] = sessionToken;
        }

        const response = await fetch(url, {
            method,
            headers: headers,
            body: JSON.stringify(formData),
            mode: 'cors'
        });

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            let errorMessage = 'Erro ao salvar';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const savedData = await response.json();

        if (editId) {
            const index = transportadoras.findIndex(t => String(t.id) === String(editId));
            if (index !== -1) transportadoras[index] = savedData;
            showToast('Transportadora atualizada com sucesso!', 'success');
        } else {
            transportadoras.push(savedData);
            showToast('Transportadora criada com sucesso!', 'success');
        }

        lastDataHash = JSON.stringify(transportadoras.map(t => t.id));
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        filterTransportadoras();
        closeFormModal();
    } catch (error) {
        console.error('Erro completo:', error);
        showToast(`Erro: ${error.message}`, 'error');
    }
}

function viewTransportadora(id) {
    const transportadora = transportadoras.find(t => String(t.id) === String(id));
    if (!transportadora) return;
    
    currentViewTab = 0;

    const telefones = transportadora.telefones && transportadora.telefones.length > 0
        ? transportadora.telefones.map(t => `<p>${toUpperCase(t)}</p>`).join('')
        : '<p class="empty">Nenhum telefone cadastrado</p>';

    const celulares = transportadora.celulares && transportadora.celulares.length > 0
        ? transportadora.celulares.map(c => `<p>${toUpperCase(c)}</p>`).join('')
        : '<p class="empty">Nenhum celular cadastrado</p>';

    const regioesHTML = transportadora.regioes && transportadora.regioes.length > 0
        ? `<div class="selection-grid view-mode">
            ${transportadora.regioes.map(regiao => 
                `<div class="selection-item-view">${toUpperCase(regiao)}</div>`
            ).join('')}
           </div>`
        : '<p class="empty">Nenhuma região selecionada</p>';

    const estadosHTML = transportadora.estados && transportadora.estados.length > 0
        ? `<div class="selection-grid view-mode">
            ${transportadora.estados.map(estado => 
                `<div class="selection-item-view">${toUpperCase(estado)}</div>`
            ).join('')}
           </div>`
        : '<p class="empty">Nenhum estado selecionado</p>';

    const email = transportadora.email ? transportadora.email.toLowerCase() : '<span class="empty">Não informado</span>';

    const modalHTML = `
        <div class="modal-overlay" id="viewModal" style="display: flex;">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Transportadora</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab('view-tab-geral')">Geral</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-contatos')">Contatos</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-regioes')">Regiões</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-estados')">Estados</button>
                    </div>

                    <div class="tab-content active" id="view-tab-geral">
                        <div class="view-section">
                            <h4>Nome</h4>
                            <p>${toUpperCase(transportadora.nome)}</p>
                        </div>
                        
                        <div class="view-section">
                            <h4>E-mail</h4>
                            <p style="text-transform: lowercase;">${email}</p>
                        </div>
                    </div>

                    <div class="tab-content" id="view-tab-contatos">
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

        const response = await fetch(`${API_URL}/transportadoras/${id}`, {
            method: 'DELETE',
            headers: headers,
            mode: 'cors'
        });

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
        showToast('Erro ao excluir transportadora', 'error');
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
            (t.email && t.email.toLowerCase().includes(searchTerm)) ||
            (t.regioes && t.regioes.some(r => toUpperCase(r).toLowerCase().includes(searchTerm))) ||
            (t.estados && t.estados.some(e => toUpperCase(e).toLowerCase().includes(searchTerm)))
        );
    }

    filtered.sort((a, b) => toUpperCase(a.nome).localeCompare(toUpperCase(b.nome)));

    renderTransportadoras(filtered);
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Sem data';
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d`;
    return past.toLocaleDateString('pt-BR');
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
        
        return `
            <tr>
                <td><strong>${toUpperCase(t.nome)}</strong></td>
                <td>${primeiroTelefone}</td>
                <td>${primeiroCelular}</td>
                <td style="text-transform: lowercase;">${email}</td>
                <td style="color: var(--text-secondary); font-size: 0.85rem;">${getTimeAgo(t.timestamp)}</td>
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
