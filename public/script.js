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

// Regiões e Estados do Brasil
const REGIOES_ESTADOS = {
    'Norte': ['Acre', 'Amapá', 'Amazonas', 'Pará', 'Rondônia', 'Roraima', 'Tocantins'],
    'Nordeste': ['Alagoas', 'Bahia', 'Ceará', 'Maranhão', 'Paraíba', 'Pernambuco', 'Piauí', 'Rio Grande do Norte', 'Sergipe'],
    'Centro-Oeste': ['Distrito Federal', 'Goiás', 'Mato Grosso', 'Mato Grosso do Sul'],
    'Sudeste': ['Espírito Santo', 'Minas Gerais', 'Rio de Janeiro', 'São Paulo'],
    'Sul': ['Paraná', 'Rio Grande do Sul', 'Santa Catarina']
};

const TODOS_ESTADOS = Object.values(REGIOES_ESTADOS).flat();

console.log('🚀 Sistema de Transportadoras iniciado');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { 
                modal.remove(); 
                resolve(result); 
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });

        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `@keyframes fadeOut { to { opacity: 0; } }`;
            document.head.appendChild(style);
        }
    });
}

function showViewModal(id) {
    const transportadora = transportadoras.find(t => t.id === id);
    if (!transportadora) return;

    const telefones = transportadora.telefones && transportadora.telefones.length > 0
        ? transportadora.telefones.map(t => `<p>${t}</p>`).join('')
        : '<p class="empty">Nenhum telefone cadastrado</p>';

    const celulares = transportadora.celulares && transportadora.celulares.length > 0
        ? transportadora.celulares.map(c => `<p>${c}</p>`).join('')
        : '<p class="empty">Nenhum celular cadastrado</p>';

    const regioes = transportadora.regioes && transportadora.regioes.length > 0
        ? transportadora.regioes.join(', ')
        : '<span class="empty">Nenhuma região selecionada</span>';

    const estados = transportadora.estados && transportadora.estados.length > 0
        ? transportadora.estados.join(', ')
        : '<span class="empty">Nenhum estado selecionado</span>';

    const email = transportadora.email || '<span class="empty">Não informado</span>';

    const modalHTML = `
        <div class="modal-overlay" id="viewModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Transportadora</h3>
                </div>
                <div class="modal-form-content">
                    <div class="view-section">
                        <h4>Nome</h4>
                        <p>${transportadora.nome}</p>
                    </div>
                    
                    <div class="view-section">
                        <h4>E-mail</h4>
                        <p>${email}</p>
                    </div>
                    
                    <div class="view-section">
                        <h4>Telefones</h4>
                        ${telefones}
                    </div>
                    
                    <div class="view-section">
                        <h4>Celulares</h4>
                        ${celulares}
                    </div>
                    
                    <div class="view-section">
                        <h4>Regiões de Atendimento</h4>
                        <p>${regioes}</p>
                    </div>
                    
                    <div class="view-section">
                        <h4>Estados de Atendimento</h4>
                        <p>${estados}</p>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="secondary" id="modalCloseBtn">Fechar</button>
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
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const transportadora = isEditing ? transportadoras.find(t => t.id === editingId) : null;

    const telefones = transportadora?.telefones || [''];
    const celulares = transportadora?.celulares || [''];
    const regioesSelecionadas = transportadora?.regioes || [];
    const estadosSelecionados = transportadora?.estados || [];

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar Transportadora' : 'Cadastrar Transportadora'}</h3>
                </div>
                <div class="modal-form-content">
                    <form id="modalTransportadoraForm">
                        <input type="hidden" id="modalEditId" value="${editingId || ''}">
                        
                        <div class="form-group">
                            <label for="modalNome">Nome da Transportadora *</label>
                            <input type="text" id="modalNome" value="${transportadora?.nome || ''}" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="modalEmail">E-mail</label>
                            <input type="email" id="modalEmail" value="${transportadora?.email || ''}">
                        </div>
                        
                        <div class="form-group">
                            <label>Telefones</label>
                            <div id="telefonesContainer">
                                ${telefones.map((tel, i) => `
                                    <div class="dynamic-field">
                                        <input type="tel" class="telefone-input" value="${tel}" placeholder="(00) 0000-0000">
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
                                        <input type="tel" class="celular-input" value="${cel}" placeholder="(00) 00000-0000">
                                        ${i > 0 ? '<button type="button" class="danger small" onclick="removeField(this)">Remover</button>' : ''}
                                    </div>
                                `).join('')}
                            </div>
                            <button type="button" class="add-field-btn small" onclick="addCelular()">+ Adicionar Celular</button>
                        </div>
                        
                        <div class="form-group">
                            <label>Regiões de Atendimento *</label>
                            <div class="checkbox-group" id="regioesGroup">
                                ${Object.keys(REGIOES_ESTADOS).map(regiao => `
                                    <div class="checkbox-item">
                                        <input type="checkbox" id="regiao_${regiao}" value="${regiao}" 
                                            ${regioesSelecionadas.includes(regiao) ? 'checked' : ''}>
                                        <label for="regiao_${regiao}">${regiao}</label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Estados de Atendimento</label>
                            <div class="checkbox-group">
                                ${TODOS_ESTADOS.map(estado => `
                                    <div class="checkbox-item">
                                        <input type="checkbox" id="estado_${estado.replace(/\s/g, '_')}" value="${estado}" 
                                            ${estadosSelecionados.includes(estado) ? 'checked' : ''}>
                                        <label for="estado_${estado.replace(/\s/g, '_')}">${estado}</label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="button" class="secondary" id="modalCancelFormBtn">Cancelar</button>
                            <button type="submit" class="save">${isEditing ? 'Atualizar' : 'Salvar'}</button>
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
            .map(input => input.value.trim())
            .filter(val => val);

        const celulares = Array.from(document.querySelectorAll('.celular-input'))
            .map(input => input.value.trim())
            .filter(val => val);

        const regioes = Array.from(document.querySelectorAll('input[id^="regiao_"]:checked'))
            .map(checkbox => checkbox.value);

        // Validação: pelo menos uma região deve ser selecionada
        if (regioes.length === 0) {
            showMessage('Selecione pelo menos uma região de atendimento', 'error');
            return;
        }

        const estados = Array.from(document.querySelectorAll('input[id^="estado_"]:checked'))
            .map(checkbox => checkbox.value);

        const emailValue = document.getElementById('modalEmail').value.trim();

        const formData = {
            nome: document.getElementById('modalNome').value.trim(),
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
            showMessage('Atualizado!', 'success');
        } else {
            transportadoras.push(optimisticData);
            showMessage('Criado!', 'success');
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
        showMessage(isEditing ? 'Atualização cancelada' : 'Cadastro cancelado', 'error');
        closeModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            showMessage(isEditing ? 'Atualização cancelada' : 'Cadastro cancelado', 'error');
            closeModal();
        }
    });
    
    setTimeout(() => document.getElementById('modalNome').focus(), 100);
}

window.addTelefone = function() {
    const container = document.getElementById('telefonesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="telefone-input" placeholder="(00) 0000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">Remover</button>
    `;
    container.appendChild(newField);
};

window.addCelular = function() {
    const container = document.getElementById('celularesContainer');
    const newField = document.createElement('div');
    newField.className = 'dynamic-field';
    newField.innerHTML = `
        <input type="tel" class="celular-input" placeholder="(00) 00000-0000">
        <button type="button" class="danger small" onclick="removeField(this)">Remover</button>
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
        sessionStorage.setItem('transportadoraSession', sessionToken);
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
            ">Ir para o Portal</a>
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
            mostrarTelaAcessoNegado('Sua sessão expirou');
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
            mostrarTelaAcessoNegado('Sua sessão expirou');
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
        if (t.nome && t.nome.trim()) transportadorasDisponiveis.add(t.nome.trim());
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
            mostrarTelaAcessoNegado('Sua sessão expirou');
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
        showMessage('Erro ao salvar', 'error');
    }
}

window.viewTransportadora = function(id) {
    showViewModal(id);
};

window.editTransportadora = function(id) {
    showFormModal(id);
};

window.deleteTransportadora = async function(id) {
    const confirmed = await showConfirm('Tem certeza que deseja excluir esta transportadora?', {
        title: 'Excluir Transportadora',
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'warning'
    });

    if (!confirmed) {
        console.log('Exclusão cancelada pelo usuário');
        return;
    }

    const deletedTransportadora = transportadoras.find(t => t.id === id);
    transportadoras = transportadoras.filter(t => t.id !== id);
    
    requestAnimationFrame(() => {
        atualizarTransportadorasDisponiveis();
        renderTransportadorasFilter();
        filterTransportadoras();
    });
    
    showMessage('Excluído!', 'error');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/transportadoras/${id}`, { 
                method: 'DELETE',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('transportadoraSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
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
                showMessage('Erro ao excluir', 'error');
            }
        }
    }
};

function filterTransportadoras() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    let filtered = transportadoras;

    if (transportadoraSelecionada !== 'TODAS') {
        filtered = filtered.filter(t => t.nome === transportadoraSelecionada);
    }

    if (searchTerm) {
        filtered = filtered.filter(t => 
            t.nome.toLowerCase().includes(searchTerm) ||
            (t.email && t.email.toLowerCase().includes(searchTerm)) ||
            (t.regioes && t.regioes.some(r => r.toLowerCase().includes(searchTerm))) ||
            (t.estados && t.estados.some(e => e.toLowerCase().includes(searchTerm)))
        );
    }

    filtered.sort((a, b) => a.nome.localeCompare(b.nome));

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
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma transportadora encontrada</div>';
        return;
    }

    const rows = transportadorasToRender.map(t => {
        const primeiroTelefone = t.telefones && t.telefones.length > 0 ? t.telefones[0] : '-';
        const primeiroCelular = t.celulares && t.celulares.length > 0 ? t.celulares[0] : '-';
        const email = t.email || '-';
        
        return `
            <tr>
                <td><strong>${t.nome}</strong></td>
                <td>${primeiroTelefone}</td>
                <td>${primeiroCelular}</td>
                <td>${email}</td>
                <td style="color: var(--text-secondary); font-size: 0.85rem;">${getTimeAgo(t.timestamp)}</td>
                <td class="actions-cell" style="text-align: center;">
                    <button onclick="window.viewTransportadora('${t.id}')" class="action-btn view">Ver</button>
                    <button onclick="window.editTransportadora('${t.id}')" class="action-btn edit">Editar</button>
                    <button onclick="window.deleteTransportadora('${t.id}')" class="action-btn delete">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Telefone</th>
                        <th>Celular</th>
                        <th>E-mail</th>
                        <th>Alteração</th>
                        <th style="text-align: center;">Ações</th>
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
