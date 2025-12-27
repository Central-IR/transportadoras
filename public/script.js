// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3003/api'
    : `${window.location.origin}/api`;

let transportadoras = [];
let isOnline = false;
let transportadoraSelecionada = 'TODAS';
let transportadorasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;

// Função auxiliar para converter texto para maiúsculas
function toUpperCase(value) {
    return value ? String(value).toUpperCase() : '';
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

console.log('🚀 Sistema de Transportadoras iniciado');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// MODAL DE CONFIRMAÇÃO
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const existingModal = document.getElementById('confirmModal');
        if (existingModal) existingModal.remove();

        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const overlay = document.createElement('div');
        overlay.id = 'confirmModal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:999999;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#FFFFFF;border-radius:16px;padding:2rem;max-width:450px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

        box.innerHTML = `
            <h3 style="color:#1A1A1A;margin:0 0 1rem 0;font-size:1.25rem;">${title}</h3>
            <p style="color:#6B7280;margin:0 0 2rem 0;">${message}</p>
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                <button id="btnCancel" style="background:#4B5563;color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:0.95rem;font-weight:600;min-width:100px;">${cancelText}</button>
                <button id="btnConfirm" style="background:#e70000;color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:0.95rem;font-weight:600;min-width:100px;">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const btnCancel = document.getElementById('btnCancel');
        const btnConfirm = document.getElementById('btnConfirm');

        btnCancel.onclick = () => { overlay.remove(); resolve(false); };
        btnConfirm.onclick = () => { overlay.remove(); resolve(true); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
}

function showViewModal(id) {
    const transportadora = transportadoras.find(t => t.id === id);
    if (!transportadora) return;

    const telefones = transportadora.telefones && transportadora.telefones.length > 0
        ? transportadora.telefones.map(t => `<p>${toUpperCase(t)}</p>`).join('')
        : '<p class="empty">NENHUM TELEFONE CADASTRADO</p>';

    const celulares = transportadora.celulares && transportadora.celulares.length > 0
        ? transportadora.celulares.map(c => `<p>${toUpperCase(c)}</p>`).join('')
        : '<p class="empty">NENHUM CELULAR CADASTRADO</p>';

    // REGIÕES - Mostrar apenas selecionadas em blocos
    const regioesHTML = transportadora.regioes && transportadora.regioes.length > 0
        ? `<div class="selection-grid view-mode">
            ${transportadora.regioes.map(regiao => 
                `<div class="selection-item-view">${toUpperCase(regiao)}</div>`
            ).join('')}
           </div>`
        : '<p class="empty">NENHUMA REGIÃO SELECIONADA</p>';

    // ESTADOS - Mostrar apenas selecionados em blocos
    const estadosHTML = transportadora.estados && transportadora.estados.length > 0
        ? `<div class="selection-grid view-mode">
            ${transportadora.estados.map(estado => 
                `<div class="selection-item-view">${toUpperCase(estado)}</div>`
            ).join('')}
           </div>`
        : '<p class="empty">NENHUM ESTADO SELECIONADO</p>';

    const email = transportadora.email ? transportadora.email.toLowerCase() : '<span class="empty">NÃO INFORMADO</span>';

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">DETALHES DA TRANSPORTADORA</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchViewTab('view-tab-geral')">GERAL</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-contatos')">CONTATOS</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-regioes')">REGIÕES</button>
                        <button class="tab-btn" onclick="switchViewTab('view-tab-estados')">ESTADOS</button>
                    </div>

                    <div class="modal-form-content">
                        <div class="tab-content active" id="view-tab-geral">
                            <div class="view-section">
                                <h4>NOME</h4>
                                <p>${toUpperCase(transportadora.nome)}</p>
                            </div>
                            
                            <div class="view-section">
                                <h4>E-MAIL</h4>
                                <p style="text-transform: lowercase;">${email}</p>
                            </div>
                        </div>

                        <div class="tab-content" id="view-tab-contatos">
                            <div class="view-section">
                                <h4>TELEFONES</h4>
                                ${telefones}
                            </div>
                            
                            <div class="view-section">
                                <h4>CELULARES</h4>
                                ${celulares}
                            </div>
                        </div>

                        <div class="tab-content" id="view-tab-regioes">
                            <div class="view-section">
                                <h4>REGIÕES DE ATENDIMENTO</h4>
                                ${regioesHTML}
                            </div>
                        </div>

                        <div class="tab-content" id="view-tab-estados">
                            <div class="view-section">
                                <h4>ESTADOS DE ATENDIMENTO</h4>
                                ${estadosHTML}
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="secondary" id="modalCloseBtn">FECHAR</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('viewModal');
    const closeBtn = document.getElementById('modalCloseBtn');

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    };

    closeBtn.addEventListener('click', closeModal);
}

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const transportadora = isEditing ? transportadoras.find(t => t.id === editingId) : null;

    const telefones = transportadora?.telefones || [''];
    const celulares = transportadora?.celulares || [''];
    const regioesSelecionadas = transportadora?.regioes?.map(r => toUpperCase(r)) || [];
    const estadosSelecionados = transportadora?.estados?.map(e => toUpperCase(e)) || [];

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'EDITAR TRANSPORTADORA' : 'CADASTRAR TRANSPORTADORA'}</h3>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-nav">
                        <button class="tab-btn active" onclick="switchTab('tab-geral')">GERAL</button>
                        <button class="tab-btn" onclick="switchTab('tab-regioes')">REGIÕES</button>
                        <button class="tab-btn" onclick="switchTab('tab-estados')">ESTADOS</button>
                    </div>

                    <form id="modalTransportadoraForm">
                        <input type="hidden" id="modalEditId" value="${editingId || ''}">
                        
                        <div class="tab-content active" id="tab-geral">
                            <div class="form-group">
                                <label for="modalNome">NOME DA TRANSPORTADORA *</label>
                                <input type="text" id="modalNome" value="${toUpperCase(transportadora?.nome || '')}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="modalEmail">E-MAIL</label>
                                <input type="email" id="modalEmail" value="${transportadora?.email || ''}" style="text-transform: lowercase;">
                            </div>
                            
                            <div class="form-group">
                                <label>TELEFONES</label>
                                <div id="telefonesContainer">
                                    ${telefones.map((tel, i) => `
                                        <div class="dynamic-field">
                                            <input type="tel" class="telefone-input" value="${toUpperCase(tel)}" placeholder="(00) 0000-0000">
                                            ${i > 0 ? '<button type="button" class="danger small" onclick="removeField(this)">REMOVER</button>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <button type="button" class="add-field-btn small" onclick="addTelefone()">+ ADICIONAR TELEFONE</button>
                            </div>
                            
                            <div class="form-group">
                                <label>CELULARES</label>
                                <div id="celularesContainer">
                                    ${celulares.map((cel, i) => `
                                        <div class="dynamic-field">
                                            <input type="tel" class="celular-input" value="${toUpperCase(cel)}" placeholder="(00) 00000-0000">
                                            ${i > 0 ? '<button type="button" class="danger small" onclick="removeField(this)">REMOVER</button>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <button type="button" class="add-field-btn small" onclick="addCelular()">+ ADICIONAR CELULAR</button>
                            </div>
                        </div>

                        <div class="tab-content" id="tab-regioes">
                            <div class="form-group">
                                <label>REGIÕES DE ATENDIMENTO</label>
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
                                <label>ESTADOS DE ATENDIMENTO</label>
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
                            <button type="button" class="secondary" id="modalCancelFormBtn">CANCELAR</button>
                            <button type="submit" class="save">${isEditing ? 'ATUALIZAR' : 'SALVAR'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('formModal');
    const form = document.getElementById('modalTransportadoraForm');
    const cancelBtn = document.getElementById('modalCancelFormBtn');

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

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

        const editId = document.getElementById('modalEditId').value;

        const tempId = editId || 'temp_' + Date.now();
        const optimisticData = { ...formData, id: tempId, timestamp: new Date().toISOString() };

        if (editId) {
            const index = transportadoras.findIndex(t => t.id === editId);
            if (index !== -1) transportadoras[index] = optimisticData;
            showMessage('ATUALIZADO!', 'success');
        } else {
            transportadoras.push(optimisticData);
            showMessage('CRIADO!', 'success');
        }

        requestAnimationFrame(() => {
            atualizarTransportadorasDisponiveis();
            renderTransportadorasFilter();
            filterTransportadoras();
        });
        
        closeModal();
        syncWithServer(formData, editId, tempId);
    });

    cancelBtn.addEventListener('click', () => {
        showMessage(isEditing ? 'ATUALIZAÇÃO CANCELADA' : 'CADASTRO CANCELADO', 'error');
        closeModal();
    });
    
    setTimeout(() => document.getElementById('modalNome').focus(), 100);
}

// SISTEMA DE ABAS - FORMULÁRIO
window.switchTab = function(tabId) {
    document.querySelectorAll('#formModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#formModal .tab-content').forEach(content => content.classList.remove('active'));
    
    const clickedBtn = event.target;
    if (clickedBtn) clickedBtn.classList.add('active');
    
    document.getElementById(tabId).classList.add('active');
};

// SISTEMA DE ABAS - VISUALIZAÇÃO
window.switchViewTab = function(tabId) {
    document.querySelectorAll('#viewModal .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#viewModal .tab-content').forEach(content => content.classList.remove('active'));
    
    const clickedBtn = event.target;
    if (clickedBtn) clickedBtn.classList.add('active');
    
    document.getElementById(tabId).classList.add('active');
};

// TOGGLE REGIÃO
window.toggleRegiao = function(regiao) {
    const item = document.querySelector(`[data-regiao="${regiao}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
};

// TOGGLE ESTADO
window.toggleEstado = function(estado) {
    const item = document.querySelector(`[data-estado="${estado}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
};

window.addTelefone = function() {
    const container = document.getElementById('telefonesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="telefone-input" placeholder="(00) 0000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">REMOVER</button>
    `;
    container.appendChild(newField);
};

window.addCelular = function() {
    const container = document.getElementById('celularesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="celular-input" placeholder="(00) 00000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">REMOVER</button>
    `;
    container.appendChild(newField);
};

window.removeField = function(button) {
    button.parentElement.remove();
};

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
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
            text-align: center;
            padding: 2rem;
        ">
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">
                ${mensagem}
            </h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
                Somente usuários autenticados podem acessar esta área.
            </p>
            <a href="${PORTAL_URL}" style="
                display: inline-block;
                background: var(--btn-register);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">IR PARA O PORTAL</a>
        </div>
    `;
}

function inicializarApp() {
    checkServerStatus();
    setInterval(checkServerStatus, 15000);
    startPolling();
}

window.toggleForm = function() {
    showFormModal(null);
};

async function checkServerStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/transportadoras`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await loadTransportadoras();
        } else if (!wasOffline && !isOnline) {
            console.log('❌ Servidor OFFLINE');
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        if (isOnline) {
            console.log('❌ Erro de conexão:', error.message);
        }
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

async function loadTransportadoras() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/transportadoras`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const newHash = JSON.stringify(data.map(t => t.id));

        if (newHash !== lastDataHash) {
            transportadoras = data;
            lastDataHash = newHash;
            
            console.log(`📊 ${data.length} transportadoras carregadas`);
            
            requestAnimationFrame(() => {
                atualizarTransportadorasDisponiveis();
                renderTransportadorasFilter();
                filterTransportadoras();
            });
        }
    } catch (error) {
        // Silencioso
    }
}

function startPolling() {
    loadTransportadoras();
    setInterval(() => {
        if (isOnline) loadTransportadoras();
    }, 10000);
}

function atualizarTransportadorasDisponiveis() {
    transportadorasDisponiveis.clear();
    transportadoras.forEach(t => {
        if (t.nome && t.nome.trim()) transportadorasDisponiveis.add(toUpperCase(t.nome.trim()));
    });
}

function renderTransportadorasFilter() {
    const container = document.getElementById('transportadorasFilter');
    if (!container) return;

    const transportadorasArray = Array.from(transportadorasDisponiveis).sort();
    
    const fragment = document.createDocumentFragment();
    
    ['TODAS', ...transportadorasArray].forEach(transportadora => {
        const button = document.createElement('button');
        button.className = `brand-button ${transportadora === transportadoraSelecionada ? 'active' : ''}`;
        button.textContent = transportadora;
        button.onclick = () => window.selecionarTransportadora(transportadora);
        fragment.appendChild(button);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

window.selecionarTransportadora = function(transportadora) {
    transportadoraSelecionada = transportadora;
    renderTransportadorasFilter();
    filterTransportadoras();
};

async function syncWithServer(formData, editId = null, tempId = null) {
    if (!isOnline) return;

    try {
        const url = editId ? `${API_URL}/transportadoras/${editId}` : `${API_URL}/transportadoras`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken }, 
            body: JSON.stringify(formData) 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('transportadoraSession');
            mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
            return;
        }
        
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const savedData = await response.json();

        if (editId) {
            const index = transportadoras.findIndex(t => t.id === editId);
            if (index !== -1) transportadoras[index] = savedData;
        } else {
            const tempIndex = transportadoras.findIndex(t => t.id === tempId);
            if (tempIndex !== -1) transportadoras[tempIndex] = savedData;
        }

        lastDataHash = JSON.stringify(transportadoras.map(t => t.id));
        
        requestAnimationFrame(() => {
            atualizarTransportadorasDisponiveis();
            renderTransportadorasFilter();
            filterTransportadoras();
        });
    } catch (error) {
        if (!editId) {
            transportadoras = transportadoras.filter(t => t.id !== tempId);
            filterTransportadoras();
        }
        showMessage('ERRO AO SALVAR', 'error');
    }
}

window.viewTransportadora = function(id) {
    showViewModal(id);
};

window.editTransportadora = function(id) {
    showFormModal(id);
};

window.deleteTransportadora = async function(id) {
    const confirmed = await showConfirm('TEM CERTEZA QUE DESEJA EXCLUIR ESTA TRANSPORTADORA?', {
        title: 'EXCLUIR TRANSPORTADORA',
        confirmText: 'EXCLUIR',
        cancelText: 'CANCELAR',
        type: 'warning'
    });

    if (!confirmed) return;

    const deletedTransportadora = transportadoras.find(t => t.id === id);
    transportadoras = transportadoras.filter(t => t.id !== id);
    
    requestAnimationFrame(() => {
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        filterTransportadoras();
    });
    
    showMessage('EXCLUÍDO!', 'error');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/transportadoras/${id}`, { 
                method: 'DELETE',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('transportadoraSession');
                mostrarTelaAcessoNegado('SUA SESSÃO EXPIROU');
                return;
            }

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedTransportadora) {
                transportadoras.push(deletedTransportadora);
                requestAnimationFrame(() => {
                    atualizarTransportadorasDisponiveis();
                    renderTransportadorasFilter();
                    filterTransportadoras();
                });
                showMessage('ERRO AO EXCLUIR', 'error');
            }
        }
    }
};

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
    if (!timestamp) return 'SEM DATA';
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds}S`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}MIN`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}H`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}D`;
    return past.toLocaleDateString('pt-BR');
}

function renderTransportadoras(transportadorasToRender) {
    const container = document.getElementById('transportadorasContainer');
    
    if (!transportadorasToRender || transportadorasToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">NENHUMA TRANSPORTADORA ENCONTRADA</div>';
        return;
    }

    const rows = transportadorasToRender.map(t => {
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
                    <button onclick="window.viewTransportadora('${t.id}')" class="action-btn view">VER</button>
                    <button onclick="window.editTransportadora('${t.id}')" class="action-btn edit">EDITAR</button>
                    <button onclick="window.deleteTransportadora('${t.id}')" class="action-btn delete">EXCLUIR</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>NOME</th>
                        <th>TELEFONE</th>
                        <th>CELULAR</th>
                        <th>E-MAIL</th>
                        <th>ALTERAÇÃO</th>
                        <th style="text-align: center;">AÇÕES</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function showMessage(message, type) {
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
